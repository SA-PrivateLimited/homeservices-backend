#!/usr/bin/env python3
"""Build REUSABLE_INVENTORY.md — scans src/components/ and shared/ for reusable components."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
IGNORE_DIRS = {"node_modules", "__tests__", ".git", "dist", "build"}
COMPONENT_DIRS = ["src/components", "src/shared", "components"]


def extract_props_interface(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
        m = re.search(r"(interface\s+\w*Props\s*\{[^}]*\})", text, re.DOTALL)
        if m:
            props_text = m.group(1)
            props_text = re.sub(r"\s+", " ", props_text)
            if len(props_text) > 120:
                props_text = props_text[:120] + "…}"
            return props_text
    except OSError:
        pass
    return ""


def scan_components(repo_root: Path) -> list[dict[str, str]]:
    components: list[dict[str, str]] = []
    seen: set[str] = set()

    for rel_dir in COMPONENT_DIRS:
        base = repo_root / rel_dir
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.tsx")):
            if any(d in path.parts for d in IGNORE_DIRS):
                continue
            if path.name.startswith("_") or path.stem in ("index", "types", "utils"):
                continue
            name = path.stem
            if name in seen:
                continue
            seen.add(name)
            rel = path.relative_to(repo_root).as_posix()
            props = extract_props_interface(path)
            components.append({"name": name, "path": rel, "props": props})

    return sorted(components, key=lambda c: c["name"].lower())


def build_inventory(components: list[dict[str, str]]) -> str:
    lines = [
        "# Reusable Component Inventory",
        "",
        "> Auto-generated. Do not edit manually — run `python scripts/build_reusable_inventory.py` to refresh.",
        "",
        "Reuse these before building new components.",
        "",
    ]
    for comp in components:
        lines.append(f"- **{comp['name']}** — `{comp['path']}`")
        if comp["props"]:
            lines.append(f"  ```typescript")
            lines.append(f"  {comp['props']}")
            lines.append(f"  ```")
    if not components:
        lines.append("No components found. Add components to `src/components/` or `src/shared/`.")
    return "\n".join(lines)


def main() -> None:
    output_path = REPO_ROOT / "agent-context" / "REUSABLE_INVENTORY.md"
    if len(sys.argv) >= 2:
        output_path = Path(sys.argv[1])

    components = scan_components(REPO_ROOT)
    inventory = build_inventory(components)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(inventory + "\n", encoding="utf-8")
    print(f"Found {len(components)} components → {output_path}")


if __name__ == "__main__":
    main()
