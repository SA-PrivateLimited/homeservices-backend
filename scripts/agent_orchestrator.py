#!/usr/bin/env python3
"""FE Agent orchestrator — intake stage pulls Jira + Figma and prepares agent context."""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import requests
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(REPO_ROOT / ".env.local")

STAGES = ["spec", "plan", "test", "implement", "verify", "review", "report"]


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def parse_figma_url(url: str) -> dict[str, str]:
    parsed = urlparse(url)
    parts = [p for p in parsed.path.split("/") if p]
    file_key = ""
    if "design" in parts:
        idx = parts.index("design")
        if idx + 1 < len(parts):
            file_key = parts[idx + 1]
    elif "file" in parts:
        idx = parts.index("file")
        if idx + 1 < len(parts):
            file_key = parts[idx + 1]

    node_id = ""
    query = parse_qs(parsed.query)
    if "node-id" in query:
        node_id = query["node-id"][0].replace("-", ":")
    elif parsed.fragment:
        frag = parse_qs(parsed.fragment.lstrip("#"))
        if "node-id" in frag:
            node_id = frag["node-id"][0].replace("-", ":")

    return {"file_key": file_key, "node_id": node_id}


class JiraClient:
    def __init__(self) -> None:
        self.email = os.getenv("JIRA_EMAIL", "")
        self.token = os.getenv("JIRA_TOKEN", "")
        self.base_url = os.getenv("JIRA_BASE_URL", "").rstrip("/")
        if not all([self.email, self.token, self.base_url]):
            raise RuntimeError(
                "Missing Jira config. Set JIRA_EMAIL, JIRA_TOKEN, JIRA_BASE_URL in .env.local"
            )

    def fetch_issue(self, ticket_key: str) -> dict[str, Any]:
        url = f"{self.base_url}/rest/api/3/issue/{ticket_key}"
        resp = requests.get(
            url,
            auth=(self.email, self.token),
            headers={"Accept": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        fields = data.get("fields", {})
        description = fields.get("description")
        return {
            "key": data.get("key", ticket_key),
            "summary": fields.get("summary", ""),
            "description": adf_to_text(description) if description else "",
            "status": fields.get("status", {}).get("name", ""),
            "issue_type": fields.get("issuetype", {}).get("name", ""),
            "acceptance_criteria": extract_acceptance_criteria(description),
            "raw": data,
        }


class FigmaClient:
    def __init__(self) -> None:
        self.token = os.getenv("FIGMA_TOKEN", "")
        if not self.token:
            raise RuntimeError("Missing FIGMA_TOKEN in .env.local")

    def _headers(self) -> dict[str, str]:
        return {"X-Figma-Token": self.token}

    def get_file(self, file_key: str) -> dict[str, Any]:
        resp = requests.get(
            f"https://api.figma.com/v1/files/{file_key}",
            headers=self._headers(),
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()

    def get_nodes(self, file_key: str, node_ids: list[str]) -> dict[str, Any]:
        ids = ",".join(node_ids)
        resp = requests.get(
            f"https://api.figma.com/v1/files/{file_key}/nodes",
            params={"ids": ids},
            headers=self._headers(),
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()

    def export_images(self, file_key: str, node_ids: list[str], fmt: str = "png") -> dict[str, str]:
        ids = ",".join(node_ids)
        resp = requests.get(
            f"https://api.figma.com/v1/images/{file_key}",
            params={"ids": ids, "format": fmt, "scale": 2},
            headers=self._headers(),
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json().get("images", {})


def adf_to_text(node: Any) -> str:
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return "".join(adf_to_text(n) for n in node)
    if not isinstance(node, dict):
        return str(node)

    node_type = node.get("type", "")
    if node_type == "text":
        return node.get("text", "")
    if node_type == "hardBreak":
        return "\n"

    parts = [adf_to_text(node.get("text", ""))]
    for child in node.get("content", []):
        parts.append(adf_to_text(child))
    text = "".join(parts)
    if node_type in ("paragraph", "heading", "listItem", "bulletList", "orderedList"):
        text += "\n"
    return text


def extract_acceptance_criteria(description: Any) -> list[str]:
    text = adf_to_text(description)
    criteria: list[str] = []
    in_ac = False
    for line in text.splitlines():
        stripped = line.strip()
        lower = stripped.lower()
        if lower.startswith("acceptance criteria") or lower.startswith("ac:"):
            in_ac = True
            continue
        if in_ac and stripped.startswith(("-", "*", "•")):
            criteria.append(stripped.lstrip("-*• ").strip())
        elif in_ac and re.match(r"^\d+\.", stripped):
            criteria.append(re.sub(r"^\d+\.\s*", "", stripped))
        elif in_ac and not stripped:
            continue
        elif in_ac and stripped.endswith(":"):
            break
    return criteria


def find_page_node(document: dict[str, Any], page_name: str) -> dict[str, Any] | None:
    for child in document.get("children", []):
        if child.get("type") == "CANVAS" and child.get("name", "").lower() == page_name.lower():
            return child
    return None


def collect_frames(node: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    frames: list[dict[str, Any]] = []

    def walk(n: dict[str, Any]) -> None:
        if len(frames) >= limit:
            return
        if n.get("type") in ("FRAME", "COMPONENT", "INSTANCE"):
            frames.append(n)
        for child in n.get("children", []):
            walk(child)

    walk(node)
    return frames[:limit]


def search_frames(document: dict[str, Any], query: str, page_filter: str | None = None) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    query_lower = query.lower()

    def walk(n: dict[str, Any], on_page: bool) -> None:
        if n.get("type") == "CANVAS":
            on_page = not page_filter or n.get("name", "").lower() == page_filter.lower()
        if on_page and n.get("type") in ("FRAME", "COMPONENT", "INSTANCE"):
            name = n.get("name", "").lower()
            if query_lower in name:
                matches.append(n)
        for child in n.get("children", []):
            walk(child, on_page)

    walk(document, page_filter is None)
    return matches


def scan_reusable_components(repo_root: Path) -> list[dict[str, str]]:
    components: list[dict[str, str]] = []
    search_dirs = [
        repo_root / "src" / "middleware",
        repo_root / "src" / "utils",
        repo_root / "src" / "models",
        repo_root / "src" / "controllers",
    ]
    patterns = ["*.js", "*.ts"]
    seen: set[str] = set()

    for base in search_dirs:
        if not base.exists():
            continue
        for pattern in patterns:
            for path in base.rglob(pattern):
                if path.name.startswith("_") or "__tests__" in path.parts:
                    continue
                name = path.stem
                if name in ("index", "server"):
                    continue
                if name in seen:
                    continue
                seen.add(name)
                rel = path.relative_to(repo_root).as_posix()
                components.append({"name": name, "path": rel})

    return sorted(components, key=lambda c: c["name"].lower())



def load_baseline(repo_root: Path) -> str:
    baseline_path = repo_root / "baseline.md"
    if baseline_path.exists():
        return baseline_path.read_text(encoding="utf-8")
    return "(No baseline.md found — create one with design tokens or rely on Figma.)"


def download_figma_pngs(
    figma: FigmaClient,
    file_key: str,
    frames: list[dict[str, Any]],
    images_dir: Path,
    frames_dir: Path,
) -> list[dict[str, Any]]:
    images_dir.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)
    specs: list[dict[str, Any]] = []

    node_ids = [f["id"] for f in frames if f.get("id")]
    if not node_ids:
        return specs

    image_urls = figma.export_images(file_key, node_ids)
    for frame in frames:
        node_id = frame.get("id", "")
        name = slugify(frame.get("name", "frame"))
        spec = {
            "id": node_id,
            "name": frame.get("name", ""),
            "type": frame.get("type", ""),
            "image": None,
            "json": f"{name}.json",
        }
        frame_path = frames_dir / f"{name}.json"
        frame_path.write_text(json.dumps(frame, indent=2), encoding="utf-8")

        url = image_urls.get(node_id)
        if url:
            img_resp = requests.get(url, timeout=60)
            img_resp.raise_for_status()
            img_path = images_dir / f"{name}.png"
            img_path.write_bytes(img_resp.content)
            spec["image"] = img_path.name
        specs.append(spec)

    return specs


def copy_local_figma_images(repo_root: Path, dest_dir: Path) -> list[str]:
    src = repo_root / "figma-specs" / "images"
    dest_dir.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    if not src.exists():
        return copied
    for png in sorted(src.glob("*.png")):
        target = dest_dir / png.name
        if not target.exists() or target.stat().st_mtime < png.stat().st_mtime:
            target.write_bytes(png.read_bytes())
        copied.append(png.name)
    return copied


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def build_agent_brief(ticket: dict[str, Any] | None, prompt: str | None, name: str) -> str:
    if ticket:
        ac_lines = "\n".join(f"- {ac}" for ac in ticket.get("acceptance_criteria", [])) or "- (Extract from description)"
        return f"""# Agent Brief — {ticket['key']}

## Summary
{ticket.get('summary', '')}

## Status
{ticket.get('status', '')} ({ticket.get('issue_type', '')})

## Description
{ticket.get('description', '').strip() or '(No description)'}

## Acceptance Criteria
{ac_lines}
"""
    return f"""# Agent Brief — {name}

## Prompt-only run (no Jira ticket)

{prompt or '(No prompt provided)'}
"""


def build_reusable_inventory(components: list[dict[str, str]]) -> str:
    if not components:
        return """# Reusable Component Inventory

No components found under `src/components/`. Scan ran at intake time.
Add paths manually if your project uses a different structure.
"""
    lines = ["# Reusable Component Inventory", "", "Reuse these before building new components:", ""]
    for comp in components:
        lines.append(f"- **{comp['name']}** — `{comp['path']}`")
    return "\n".join(lines)


def build_kickoff(ticket_key: str, slug: str, context_dir: str) -> str:
    return f"""# AGENT_KICKOFF — {ticket_key}

> Read this file first. Execute all 7 stages in order. Do not skip stages.
> Each stage must pass its gate before proceeding. Escalate blockers to `BLOCKED.md`.

## Ticket
- **Key:** {ticket_key}
- **Context dir:** `{context_dir}/`

## Pipeline (execute in order)

| # | Stage | Persona file | Output |
|---|-------|--------------|--------|
| 1 | Spec | `.claude/agents/product-manager.md` | `FEATURE_SPEC.md` |
| 2 | Plan | `.claude/agents/planner.md` | `IMPLEMENTATION_PLAN.md` |
| 3 | Test | `.claude/agents/tester.md` | Tests in `src/` (TDD) |
| 4 | Implement | `.claude/agents/backend.md` | API code in `src/` |
| 5 | Verify | `.claude/agents/verifier.md` | Tests passing, types clean |
| 6 | Review | `.claude/agents/reviewer.md` | `REVIEW.md` |
| 7 | Report | `.claude/agents/reporter.md` | `COMPLETION_REPORT.md` |

## Read before starting
1. `{context_dir}/agent_brief.md` — Jira ticket / prompt
2. `{context_dir}/REUSABLE_INVENTORY.md` — existing components to reuse
3. `{context_dir}/figma-specs/` — design frames and PNGs (if any)
4. `baseline.md` — design tokens when Figma is missing
5. `CODEBASE_CONTEXT.md` — global patterns
6. `AGENTS.md` — persona index
7. `{context_dir}/SUPPLEMENTARY_CONTEXT.md` — optional user PRD (if exists)

## Rules
- Reconcile Jira + Figma + supplementary context into one source of truth (Stage 1).
- Reuse components from `REUSABLE_INVENTORY.md`; do not rebuild existing UI.
- Write failing tests before implementation (Stage 3 before Stage 4).
- Keep files under 250 lines; avoid single-use abstractions.
- Stay surgical — only change what the plan covers.
- New npm packages require approval — write `[package-approval]` to `BLOCKED.md`.
- Ambiguous requirements → `[clarification-needed]` in `BLOCKED.md`, stop and wait.
- After each stage, append progress to `{context_dir}/PROGRESS.md`.

## Blocker format (`BLOCKED.md`)
```
## [blocker-type] Title
- Context: ...
- Question: ...
- RESOLVED: (user fills this in)
```

Blocker types: `clarification-needed`, `simplicity-violation`, `surgical-violation`, `package-approval`, `test-failure`, `duplicate-feature`

## Re-run a stage (terminal)
```bash
python scripts/agent_orchestrator.py {ticket_key} --stage <stage> --context {slug}
```

## Start
Begin Stage 1 (Spec). Read `.claude/agents/product-manager.md` and produce `{context_dir}/FEATURE_SPEC.md`.
"""


def build_blocked_template() -> str:
    return """# BLOCKED — Action Items

No blockers yet. The agent writes here when it cannot proceed.

## Blocker types
- `[clarification-needed]` — ambiguous requirement
- `[simplicity-violation]` — file >250 lines or unnecessary abstraction
- `[surgical-violation]` — change outside the plan
- `[package-approval]` — new dependency needed
- `[test-failure]` — test the agent could not fix
- `[duplicate-feature]` — feature may already exist

---
"""


def build_progress_template(ticket_key: str) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return f"""# PROGRESS — {ticket_key}

## Intake complete — {ts}
- Context gathered. Ready for Stage 1 (Spec).

---
"""


def build_figma_summary(specs: list[dict[str, Any]], local_images: list[str]) -> str:
    lines = ["# Figma Design Specs", ""]
    if specs:
        lines.append("## Exported frames")
        for spec in specs:
            img = spec.get("image") or "(no image)"
            lines.append(f"- **{spec.get('name')}** — `{spec.get('json')}` — image: `{img}`")
    if local_images:
        lines.append("")
        lines.append("## Local reference images (figma-specs/images/)")
        for img in local_images:
            lines.append(f"- `{img}`")
    if not specs and not local_images:
        lines.append("No Figma frames exported. Agent will use `baseline.md` and Jira description.")
    return "\n".join(lines)


def run_intake(args: argparse.Namespace) -> Path:
    repo_root = REPO_ROOT
    ticket_key = args.ticket or args.name or "PROMPT"
    slug = slugify(args.name) if args.prompt and not args.ticket else slugify(ticket_key)
    context_dir = repo_root / "agent-context" / slug
    context_dir.mkdir(parents=True, exist_ok=True)

    ticket: dict[str, Any] | None = None
    if args.ticket and not args.prompt_only:
        jira = JiraClient()
        ticket = jira.fetch_issue(args.ticket)
        slug = slugify(ticket["key"])
        context_dir = repo_root / "agent-context" / slug
        context_dir.mkdir(parents=True, exist_ok=True)

    components = scan_reusable_components(repo_root)
    baseline = load_baseline(repo_root)

    figma_specs: list[dict[str, Any]] = []
    local_images = copy_local_figma_images(repo_root, context_dir / "figma-specs" / "images")

    if not args.no_figma and not args.prompt_only:
        try:
            figma = FigmaClient()
            frames: list[dict[str, Any]] = []

            if args.figma_url:
                parsed = parse_figma_url(args.figma_url)
                file_key = parsed["file_key"]
                if not file_key:
                    raise RuntimeError(f"Could not parse Figma file key from URL: {args.figma_url}")

                if args.figma_page_extract:
                    file_data = figma.get_file(file_key)
                    page = find_page_node(file_data.get("document", {}), args.figma_page_extract)
                    if not page:
                        raise RuntimeError(f"Figma page not found: {args.figma_page_extract}")
                    frames = collect_frames(page, args.figma_limit)
                elif parsed["node_id"]:
                    nodes = figma.get_nodes(file_key, [parsed["node_id"]])
                    node = nodes.get("nodes", {}).get(parsed["node_id"], {}).get("document")
                    if node:
                        frames = [node]
                else:
                    file_data = figma.get_file(file_key)
                    frames = collect_frames(file_data.get("document", {}), args.figma_limit)

            elif args.figma_query:
                if not args.figma_url:
                    raise RuntimeError("--figma-query requires --figma-url (any URL from the file)")
                parsed = parse_figma_url(args.figma_url)
                file_data = figma.get_file(parsed["file_key"])
                frames = search_frames(
                    file_data.get("document", {}),
                    args.figma_query,
                    args.figma_page,
                )[: args.figma_limit]

            if frames and args.figma_url:
                parsed = parse_figma_url(args.figma_url)
                figma_specs = download_figma_pngs(
                    figma,
                    parsed["file_key"],
                    frames,
                    context_dir / "figma-specs" / "images",
                    context_dir / "figma-specs" / "frames",
                )
        except RuntimeError as exc:
            print(f"Warning: Figma intake skipped — {exc}", file=sys.stderr)

    write_file(context_dir / "agent_brief.md", build_agent_brief(ticket, args.prompt, slug))
    write_file(context_dir / "REUSABLE_INVENTORY.md", build_reusable_inventory(components))
    write_file(context_dir / "figma-specs" / "README.md", build_figma_summary(figma_specs, local_images))
    write_file(context_dir / "BLOCKED.md", build_blocked_template())
    write_file(context_dir / "PROGRESS.md", build_progress_template(ticket_key))
    write_file(context_dir / "AGENT_KICKOFF.md", build_kickoff(ticket_key, slug, f"agent-context/{slug}"))

    supp_path = context_dir / "SUPPLEMENTARY_CONTEXT.md"
    if not supp_path.exists():
        write_file(
            supp_path,
            "# Supplementary Context\n\nOptional: add PRD detail, scope boundaries, mock-data strategy.\n",
        )

    meta = {
        "ticket": ticket_key,
        "slug": slug,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "figma_frames": len(figma_specs),
        "components_found": len(components),
        "no_figma": args.no_figma,
        "prompt_only": bool(args.prompt),
    }
    write_file(context_dir / "intake_meta.json", json.dumps(meta, indent=2))

    print(f"\n✓ Intake complete → {context_dir.relative_to(repo_root)}/")
    print(f"  Next: open Cursor Agent mode and paste:")
    print(f'  Read agent-context/{slug}/AGENT_KICKOFF.md and implement {ticket_key} by executing the full 7-stage pipeline it describes. Follow each stage\'s persona in .claude/agents/.')
    return context_dir


def run_stage(args: argparse.Namespace) -> None:
    stage = args.stage.lower()
    if stage == "intake":
        run_intake(args)
        return
    if stage not in STAGES:
        raise SystemExit(f"Unknown stage: {stage}. Valid: intake, {', '.join(STAGES)}")

    slug = args.context or slugify(args.ticket or args.name or "")
    context_dir = REPO_ROOT / "agent-context" / slug
    if not context_dir.exists():
        raise SystemExit(f"Context not found: {context_dir}. Run --stage intake first.")

    persona_map = {
        "spec": "product-manager.md",
        "plan": "planner.md",
        "test": "tester.md",
        "implement": "backend.md",
        "verify": "verifier.md",
        "review": "reviewer.md",
        "report": "reporter.md",
    }
    persona = REPO_ROOT / ".claude" / "agents" / persona_map[stage]
    print(f"\nRe-run Stage: {stage}")
    print(f"Context: {context_dir}")
    print(f"Persona: {persona.relative_to(REPO_ROOT)}")
    print(f"\nIn Cursor Agent chat, paste:")
    print(f'Read {persona.relative_to(REPO_ROOT)} and re-run Stage {stage} ({stage}) for {args.ticket or slug}. Context is in agent-context/{slug}/. Update PROGRESS.md when done.')


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="FE Agent orchestrator")
    parser.add_argument("ticket", nargs="?", help="Jira ticket key (e.g. KUR-1234)")
    parser.add_argument("--figma-url", action="append", default=[], help="Figma design URL (repeat for multiple screens)")
    parser.add_argument("--figma-page-extract", help="Extract all frames from a Figma page by name")
    parser.add_argument("--figma-limit", type=int, default=50, help="Max frames to extract (default: 50)")
    parser.add_argument("--figma-query", help="Text search for frames by name")
    parser.add_argument("--figma-page", help="Limit figma-query to a specific page")
    parser.add_argument("--no-figma", action="store_true", help="Skip Figma; use baseline.md tokens")
    parser.add_argument("--prompt", help="Prompt-only run (no Jira)")
    parser.add_argument("--name", help="Slug/name for prompt-only runs")
    parser.add_argument("--stage", default="intake", help="Stage to run: intake, spec, plan, test, implement, verify, review, report")
    parser.add_argument("--context", help="Context slug (for re-running stages)")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.prompt_only = bool(args.prompt and not args.ticket)

    if args.prompt and not args.name:
        args.name = slugify(args.prompt[:40])

    if args.stage == "intake":
        run_intake(args)
    else:
        run_stage(args)


if __name__ == "__main__":
    main()
