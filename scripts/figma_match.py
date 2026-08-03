#!/usr/bin/env python3
"""Match Figma frame names to existing source components using fuzzy string matching."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def load_inventory(inventory_path: Path) -> list[dict[str, str]]:
    components: list[dict[str, str]] = []
    if not inventory_path.exists():
        return components
    for line in inventory_path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"- \*\*(.+?)\*\* — `(.+?)`", line)
        if m:
            components.append({"name": m.group(1), "path": m.group(2)})
    return components


def match_score(frame_name: str, component_name: str) -> int:
    f = slugify(frame_name)
    c = slugify(component_name)
    if f == c:
        return 100
    if c in f or f in c:
        return 70
    common = sum(1 for ch in f if ch in c)
    return int(common / max(len(f), len(c), 1) * 50)


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: python figma_match.py <frames.json> <REUSABLE_INVENTORY.md>", file=sys.stderr)
        sys.exit(1)

    frames_path = Path(sys.argv[1])
    inventory_path = Path(sys.argv[2])

    data = json.loads(frames_path.read_text(encoding="utf-8"))
    frames = data.get("frames", [])
    components = load_inventory(inventory_path)

    print("# Figma Frame → Component Matches\n")
    print(f"{'Frame':<40} {'Best match':<40} {'Score'}")
    print("-" * 85)

    for frame in frames:
        name = frame.get("name", "unnamed")
        best_comp = ""
        best_score = 0
        for comp in components:
            score = match_score(name, comp["name"])
            if score > best_score:
                best_score = score
                best_comp = f"{comp['name']} ({comp['path']})"
        flag = "  ✓" if best_score >= 70 else ("  ~" if best_score >= 40 else "")
        print(f"{name:<40} {best_comp:<40} {best_score}{flag}")


if __name__ == "__main__":
    main()
