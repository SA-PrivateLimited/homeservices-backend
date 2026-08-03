#!/usr/bin/env python3
"""Check that REUSABLE_INVENTORY.md components are still valid (files exist, not moved)."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_inventory(path: Path) -> list[dict[str, str]]:
    components: list[dict[str, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"- \*\*(.+?)\*\* — `(.+?)`", line)
        if m:
            components.append({"name": m.group(1), "path": m.group(2)})
    return components


def main() -> None:
    inventory_paths = list(REPO_ROOT.glob("agent-context/*/REUSABLE_INVENTORY.md"))
    if not inventory_paths:
        print("No REUSABLE_INVENTORY.md files found in agent-context/")
        sys.exit(0)

    total = 0
    missing = 0
    for inv_path in inventory_paths:
        components = load_inventory(inv_path)
        total += len(components)
        print(f"\n{inv_path.relative_to(REPO_ROOT)} — {len(components)} components")
        for comp in components:
            full_path = REPO_ROOT / comp["path"]
            if full_path.exists():
                print(f"  ✓ {comp['name']}")
            else:
                print(f"  ✗ {comp['name']} — MISSING: {comp['path']}")
                missing += 1

    print(f"\nTotal: {total} components | Missing: {missing}")
    if missing > 0:
        print("Run `python scripts/build_reusable_inventory.py` to refresh the inventory.")
        sys.exit(1)


if __name__ == "__main__":
    main()
