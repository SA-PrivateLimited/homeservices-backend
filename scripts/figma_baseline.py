#!/usr/bin/env python3
"""Extract design tokens from a Figma file and write baseline.md."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

REPO_ROOT = Path(__file__).resolve().parent.parent


def get_file(file_key: str) -> dict:
    token = os.getenv("FIGMA_TOKEN", "")
    if not token:
        raise SystemExit("Set FIGMA_TOKEN in .env.local")
    resp = requests.get(
        f"https://api.figma.com/v1/files/{file_key}",
        headers={"X-Figma-Token": token},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def extract_styles(file_key: str) -> dict:
    token = os.getenv("FIGMA_TOKEN", "")
    resp = requests.get(
        f"https://api.figma.com/v1/files/{file_key}/styles",
        headers={"X-Figma-Token": token},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def rgb_to_hex(r: float, g: float, b: float) -> str:
    return "#{:02X}{:02X}{:02X}".format(int(r * 255), int(g * 255), int(b * 255))


def walk_for_styles(node: dict, colours: list, text_styles: list) -> None:
    fills = node.get("fills", [])
    for fill in fills:
        if fill.get("type") == "SOLID":
            c = fill.get("color", {})
            hex_val = rgb_to_hex(c.get("r", 0), c.get("g", 0), c.get("b", 0))
            name = node.get("name", "")
            if hex_val not in [c["hex"] for c in colours]:
                colours.append({"hex": hex_val, "name": name})

    style = node.get("style", {})
    if style.get("fontSize"):
        text_styles.append({
            "fontSize": style.get("fontSize"),
            "fontWeight": style.get("fontWeight"),
            "name": node.get("name", ""),
        })

    for child in node.get("children", []):
        walk_for_styles(child, colours, text_styles)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python figma_baseline.py <figma-file-key>", file=sys.stderr)
        sys.exit(1)

    file_key = sys.argv[1]
    print(f"Fetching Figma file {file_key}...")
    data = get_file(file_key)
    document = data.get("document", {})

    colours: list[dict] = []
    text_styles: list[dict] = []
    walk_for_styles(document, colours, text_styles)

    lines = ["# baseline.md — Design Tokens (auto-generated from Figma)", ""]
    lines.append("## Colours")
    lines.append("| Name | Hex | CSS Variable |")
    lines.append("|------|-----|-------------|")
    for idx, c in enumerate(colours[:30]):
        var = f"--color-{idx}"
        lines.append(f"| {c['name'] or 'unnamed'} | `{c['hex']}` | `{var}` |")

    lines.append("")
    lines.append("## Typography")
    lines.append("| Name | Size | Weight | CSS Variable |")
    lines.append("|------|------|--------|-------------|")
    seen_sizes: set = set()
    for ts in text_styles[:20]:
        key = (ts["fontSize"], ts["fontWeight"])
        if key in seen_sizes:
            continue
        seen_sizes.add(key)
        var = f"--text-{ts['fontSize']}px"
        lines.append(f"| {ts['name'] or 'unnamed'} | `{ts['fontSize']}px` | `{ts['fontWeight']}` | `{var}` |")

    out = REPO_ROOT / "baseline.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Written to {out}")


if __name__ == "__main__":
    main()
