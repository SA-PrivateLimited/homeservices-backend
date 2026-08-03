#!/usr/bin/env python3
"""Regenerate AGENT_KICKOFF.md for an existing agent-context directory."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def build_kickoff(ticket_key: str, slug: str) -> str:
    context_dir = f"agent-context/{slug}"
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
| 4 | Implement | `.claude/agents/frontend.md` | Feature code in `src/` |
| 5 | Verify | `.claude/agents/verifier.md` | Tests passing, types clean |
| 6 | Review | `.claude/agents/reviewer.md` | `REVIEW.md` |
| 7 | Report | `.claude/agents/reporter.md` | `COMPLETION_REPORT.md` |

## Read before starting
1. `{context_dir}/agent_brief.md`
2. `{context_dir}/REUSABLE_INVENTORY.md`
3. `{context_dir}/figma-specs/`
4. `baseline.md`
5. `CODEBASE_CONTEXT.md`
6. `AGENTS.md`
7. `{context_dir}/SUPPLEMENTARY_CONTEXT.md` (if exists)

## Rules
- Reconcile Jira + Figma + supplementary context (Stage 1).
- Reuse components from REUSABLE_INVENTORY.md.
- Write failing tests before implementation (Stage 3 before Stage 4).
- Files stay under 250 lines. No single-use abstractions.
- Stay surgical — only change what the plan covers.
- New npm packages → [package-approval] in BLOCKED.md.
- Ambiguous requirements → [clarification-needed] in BLOCKED.md.
- Append progress to {context_dir}/PROGRESS.md after each stage.

## Start
Begin Stage 1. Read `.claude/agents/product-manager.md` and produce `{context_dir}/FEATURE_SPEC.md`.
"""


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python build_kickoff.py <TICKET-KEY>", file=sys.stderr)
        sys.exit(1)

    ticket_key = sys.argv[1]
    slug = slugify(ticket_key)
    context_dir = REPO_ROOT / "agent-context" / slug

    if not context_dir.exists():
        print(f"Context not found: {context_dir}", file=sys.stderr)
        sys.exit(1)

    kickoff = build_kickoff(ticket_key, slug)
    out = context_dir / "AGENT_KICKOFF.md"
    out.write_text(kickoff, encoding="utf-8")
    print(f"Written to {out}")


if __name__ == "__main__":
    main()
