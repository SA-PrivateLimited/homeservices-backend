#!/usr/bin/env python3
"""Build a human-readable context summary from extracted Figma frames."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def frame_summary(frame: dict, depth: int = 0) -> list[str]:
    lines = []
    indent = "  " * depth
    name = frame.get("name", "unnamed")
    ftype = frame.get("type", "")
    bounds = frame.get("absoluteBoundingBox", {})
    w = int(bounds.get("width", 0))
    h = int(bounds.get("height", 0))
    lines.append(f"{indent}- [{ftype}] {name} ({w}×{h}px)")
    for child in frame.get("children", [])[:10]:
        lines.extend(frame_summary(child, depth + 1))
    if len(frame.get("children", [])) > 10:
        lines.append(f"{indent}  ... ({len(frame['children']) - 10} more children)")
    return lines


def build_context(frames_data: dict) -> str:
    frames = frames_data.get("frames", [])
    file_key = frames_data.get("file_key", "unknown")
    lines = [
        f"# Figma Context",
        f"",
        f"File key: `{file_key}`",
        f"Frames extracted: {len(frames)}",
        f"",
        f"## Frame Structure",
        f"",
    ]
    for frame in frames:
        lines.extend(frame_summary(frame))
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python figma_context.py <frames.json> [output.md]", file=sys.stderr)
        sys.exit(1)

    frames_path = Path(sys.argv[1])
    data = json.loads(frames_path.read_text(encoding="utf-8"))
    context = build_context(data)

    if len(sys.argv) >= 3:
        out = Path(sys.argv[2])
        out.write_text(context, encoding="utf-8")
        print(f"Written to {out}")
    else:
        print(context)


if __name__ == "__main__":
    main()
