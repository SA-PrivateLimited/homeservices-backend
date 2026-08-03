#!/usr/bin/env python3
"""Scan the codebase and emit a summary for agent context."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
IGNORE_DIRS = {
    "node_modules", ".git", "dist", "build", "coverage", "agent-context",
    "figma-specs", "__pycache__", ".next", ".cache",
}


def count_lines(path: Path) -> int:
    try:
        return sum(1 for _ in path.open(encoding="utf-8", errors="ignore"))
    except OSError:
        return 0


def scan_src(src_dir: Path) -> dict:
    pages: list[dict] = []
    components: list[dict] = []
    utils: list[dict] = []
    other: list[dict] = []

    if not src_dir.exists():
        return {"pages": pages, "components": components, "utils": utils, "other": other}

    for f in sorted(src_dir.rglob("*.tsx")):
        if any(part in IGNORE_DIRS for part in f.parts):
            continue
        rel = f.relative_to(src_dir).as_posix()
        lines = count_lines(f)
        entry = {"path": rel, "lines": lines}
        if rel.startswith("pages/"):
            pages.append(entry)
        elif rel.startswith("components/"):
            components.append(entry)
        elif rel.startswith("utils/") or rel.startswith("shared/"):
            utils.append(entry)
        else:
            other.append(entry)

    return {"pages": pages, "components": components, "utils": utils, "other": other}


def extract_exports(path: Path) -> list[str]:
    exports: list[str] = []
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r"export\s+(?:default\s+)?(?:function|class|const|interface|type)\s+(\w+)", text):
            exports.append(m.group(1))
    except OSError:
        pass
    return exports


def build_summary(src_dir: Path) -> str:
    scan = scan_src(src_dir)
    lines = [
        "# Codebase Scan Summary",
        "",
        f"Source root: `{src_dir.relative_to(REPO_ROOT)}`",
        "",
    ]

    def section(title: str, entries: list[dict]) -> None:
        lines.append(f"## {title} ({len(entries)} files)")
        lines.append("")
        for e in entries[:50]:
            lines.append(f"- `{e['path']}` ({e['lines']} lines)")
        if len(entries) > 50:
            lines.append(f"  ... {len(entries) - 50} more")
        lines.append("")

    section("Pages", scan["pages"])
    section("Shared Components", scan["components"])
    section("Utils / Shared", scan["utils"])
    section("Other", scan["other"])

    return "\n".join(lines)


def main() -> None:
    src_dir = REPO_ROOT / "src"
    if len(sys.argv) >= 2:
        src_dir = Path(sys.argv[1])

    summary = build_summary(src_dir)
    out_path = REPO_ROOT / "agent-context" / "codebase_scan.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(summary, encoding="utf-8")
    print(f"Written to {out_path}")


if __name__ == "__main__":
    main()
