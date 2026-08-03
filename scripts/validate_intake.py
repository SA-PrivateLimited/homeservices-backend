#!/usr/bin/env python3
"""Validate that an agent-context directory has all required intake files."""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

REQUIRED_FILES = [
    "AGENT_KICKOFF.md",
    "agent_brief.md",
    "REUSABLE_INVENTORY.md",
    "BLOCKED.md",
    "PROGRESS.md",
    "SUPPLEMENTARY_CONTEXT.md",
    "intake_meta.json",
]


def validate(slug: str) -> bool:
    context_dir = REPO_ROOT / "agent-context" / slug
    if not context_dir.exists():
        print(f"ERROR: Context directory not found: {context_dir}")
        return False

    ok = True
    print(f"Validating: {context_dir.relative_to(REPO_ROOT)}/\n")

    for fname in REQUIRED_FILES:
        path = context_dir / fname
        if path.exists():
            size = path.stat().st_size
            print(f"  ✓ {fname} ({size} bytes)")
        else:
            print(f"  ✗ {fname} — MISSING")
            ok = False

    meta_path = context_dir / "intake_meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        print(f"\nIntake metadata:")
        for k, v in meta.items():
            print(f"  {k}: {v}")

    figma_dir = context_dir / "figma-specs"
    if figma_dir.exists():
        pngs = list((figma_dir / "images").glob("*.png")) if (figma_dir / "images").exists() else []
        frames = list((figma_dir / "frames").glob("*.json")) if (figma_dir / "frames").exists() else []
        print(f"\nFigma specs: {len(pngs)} PNGs, {len(frames)} frame JSON files")
    else:
        print("\nFigma specs: none (no-figma run)")

    print(f"\n{'✓ Intake valid' if ok else '✗ Intake incomplete — re-run intake'}")
    return ok


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python validate_intake.py <slug-or-ticket>", file=sys.stderr)
        sys.exit(1)

    import re
    slug = re.sub(r"[^a-z0-9]+", "-", sys.argv[1].lower()).strip("-")
    success = validate(slug)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
