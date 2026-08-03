#!/usr/bin/env python3
"""Figma frame extractor. Fetches frames from a Figma file by URL, page, or query."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")


def parse_figma_url(url: str) -> tuple[str, str]:
    """Returns (file_key, node_id)."""
    parsed = urlparse(url)
    parts = [p for p in parsed.path.split("/") if p]
    file_key = ""
    for marker in ("design", "file"):
        if marker in parts:
            idx = parts.index(marker)
            if idx + 1 < len(parts):
                file_key = parts[idx + 1]
                break
    node_id = ""
    query = parse_qs(parsed.query)
    if "node-id" in query:
        node_id = query["node-id"][0].replace("-", ":")
    return file_key, node_id


def get_headers() -> dict[str, str]:
    token = os.getenv("FIGMA_TOKEN", "")
    if not token:
        raise SystemExit("Set FIGMA_TOKEN in .env.local")
    return {"X-Figma-Token": token}


def get_file(file_key: str) -> dict:
    resp = requests.get(
        f"https://api.figma.com/v1/files/{file_key}",
        headers=get_headers(),
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def get_nodes(file_key: str, node_ids: list[str]) -> dict:
    resp = requests.get(
        f"https://api.figma.com/v1/files/{file_key}/nodes",
        params={"ids": ",".join(node_ids)},
        headers=get_headers(),
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def export_images(file_key: str, node_ids: list[str]) -> dict[str, str]:
    resp = requests.get(
        f"https://api.figma.com/v1/images/{file_key}",
        params={"ids": ",".join(node_ids), "format": "png", "scale": 2},
        headers=get_headers(),
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json().get("images", {})


def collect_frames(node: dict, limit: int) -> list[dict]:
    frames: list[dict] = []

    def walk(n: dict) -> None:
        if len(frames) >= limit:
            return
        if n.get("type") in ("FRAME", "COMPONENT", "INSTANCE"):
            frames.append(n)
        for child in n.get("children", []):
            walk(child)

    walk(node)
    return frames[:limit]


def find_page(document: dict, page_name: str) -> dict | None:
    for child in document.get("children", []):
        if child.get("type") == "CANVAS" and child.get("name", "").lower() == page_name.lower():
            return child
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract frames from Figma")
    parser.add_argument("url", help="Figma file or frame URL")
    parser.add_argument("--page", help="Extract all frames from this page name")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--output", help="Output JSON file path")
    args = parser.parse_args()

    file_key, node_id = parse_figma_url(args.url)
    if not file_key:
        print("Could not parse file key from URL", file=sys.stderr)
        sys.exit(1)

    frames: list[dict] = []
    if args.page:
        data = get_file(file_key)
        page = find_page(data.get("document", {}), args.page)
        if not page:
            print(f"Page not found: {args.page}", file=sys.stderr)
            sys.exit(1)
        frames = collect_frames(page, args.limit)
    elif node_id:
        nodes = get_nodes(file_key, [node_id])
        doc = nodes.get("nodes", {}).get(node_id, {}).get("document")
        if doc:
            frames = [doc]
    else:
        data = get_file(file_key)
        frames = collect_frames(data.get("document", {}), args.limit)

    result = {"file_key": file_key, "frames": frames}
    output = json.dumps(result, indent=2)
    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"Written to {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
