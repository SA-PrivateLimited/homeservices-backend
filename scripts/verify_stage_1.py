#!/usr/bin/env python3
"""Verify Stage 1 (Spec) output — checks FEATURE_SPEC.md for required sections."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

REQUIRED_SECTIONS = [
    "Overview",
    "Acceptance Criteria",
    "Scope",
    "UI Behaviour",
    "Data",
    "i18n",
]


def check_spec(spec_path: Path) -> tuple[bool, list[str]]:
    if not spec_path.exists():
        return False, [f"FEATURE_SPEC.md not found: {spec_path}"]

    text = spec_path.read_text(encoding="utf-8")
    headings = re.findall(r"^#{1,3}\s+(.+)$", text, re.MULTILINE)
    heading_lower = [h.lower() for h in headings]

    issues: list[str] = []
    for section in REQUIRED_SECTIONS:
        if not any(section.lower() in h for h in heading_lower):
            issues.append(f"Missing section: {section}")

    acs = []
    in_ac = False
    for line in text.splitlines():
        if "acceptance criteria" in line.lower():
            in_ac = True
            continue
        if in_ac and re.match(r"^#{1,3} ", line):
            in_ac = False
        if in_ac and re.match(r"^(\d+\.|[-*•])\s+", line.strip()):
            acs.append(line.strip())

    if not acs:
        issues.append("No acceptance criteria items found (numbered or bulleted list expected)")

    if len(text) < 200:
        issues.append("Spec seems too short (< 200 chars) — likely incomplete")

    lines = text.splitlines()
    if len(lines) > 400:
        issues.append(f"Spec is very long ({len(lines)} lines) — consider splitting the scope")

    return len(issues) == 0, issues


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python verify_stage_1.py <slug-or-ticket>", file=sys.stderr)
        sys.exit(1)

    slug = re.sub(r"[^a-z0-9]+", "-", sys.argv[1].lower()).strip("-")
    context_dir = REPO_ROOT / "agent-context" / slug
    spec_path = context_dir / "FEATURE_SPEC.md"

    print(f"Verifying Stage 1 (Spec): {spec_path.relative_to(REPO_ROOT)}\n")
    ok, issues = check_spec(spec_path)

    if ok:
        print("✓ FEATURE_SPEC.md looks good — Stage 1 gate passed.")
    else:
        print("✗ Issues found:")
        for issue in issues:
            print(f"  - {issue}")
        print("\nFix these issues before proceeding to Stage 2.")
        sys.exit(1)


if __name__ == "__main__":
    main()
