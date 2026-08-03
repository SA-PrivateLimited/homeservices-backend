#!/usr/bin/env python3
"""Generate a COMPLETION_REPORT.md skeleton from FEATURE_SPEC.md and REVIEW.md."""

from __future__ import annotations

import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def extract_acs(spec_path: Path) -> list[str]:
    acs: list[str] = []
    if not spec_path.exists():
        return acs
    in_ac_section = False
    for line in spec_path.read_text(encoding="utf-8").splitlines():
        lower = line.strip().lower()
        if "acceptance criteria" in lower:
            in_ac_section = True
            continue
        if in_ac_section and re.match(r"^#{1,3} ", line):
            in_ac_section = False
        if in_ac_section and re.match(r"^(\d+\.|[-*•])\s+", line.strip()):
            acs.append(re.sub(r"^(\d+\.|[-*•])\s+", "", line.strip()))
    return acs


def extract_verdict(review_path: Path) -> str:
    if not review_path.exists():
        return "NOT YET REVIEWED"
    for line in review_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("## Verdict") or line.startswith("**Verdict"):
            return line.replace("## Verdict", "").replace("**Verdict**", "").strip(" :-")
    return "See REVIEW.md"


def count_blockers(blocked_path: Path) -> int:
    if not blocked_path.exists():
        return 0
    count = 0
    for line in blocked_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("## [") and "RESOLVED:" not in line:
            count += 1
    return count


def build_report(ticket_key: str, slug: str) -> str:
    context_dir = REPO_ROOT / "agent-context" / slug
    spec_path = context_dir / "FEATURE_SPEC.md"
    review_path = context_dir / "REVIEW.md"
    blocked_path = context_dir / "BLOCKED.md"

    acs = extract_acs(spec_path)
    verdict = extract_verdict(review_path)
    open_blockers = count_blockers(blocked_path)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    status = "Done ✓" if open_blockers == 0 and "NEEDS WORK" not in verdict else "Blocked ⚠"

    ac_rows = "\n".join(
        f"| {i + 1} | {ac} | ⬜ pending | — |"
        for i, ac in enumerate(acs)
    ) or "| — | (extract from FEATURE_SPEC.md) | — | — |"

    return f"""# Completion Report — {ticket_key}

Generated: {ts}

## Status
**{status}**

## Summary
(Fill in: what was built, what changed, what was reused.)

## Acceptance Criteria
| # | AC | Status | Test |
|---|----|--------|------|
{ac_rows}

## Components
| Component | Path | New/Reused |
|-----------|------|------------|
| (list here) | | |

## Files changed
| File | Change type |
|------|-------------|
| (list here) | |

## Test coverage
- Files with tests: —
- Overall coverage: —%
- Skipped / pending: —

## Open blockers
{f"See BLOCKED.md — {open_blockers} open item(s)" if open_blockers else "None."}

## Review verdict
{verdict}

## Next steps for developer
1. Resolve any open blockers in BLOCKED.md
2. Run `npm test` and `npx tsc --noEmit`
3. Complete PR checklist in docs/AGENT_SDLC_GUIDE.md
"""


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python completion_report.py <TICKET-KEY>", file=sys.stderr)
        sys.exit(1)

    ticket_key = sys.argv[1]
    slug = re.sub(r"[^a-z0-9]+", "-", ticket_key.lower()).strip("-")
    context_dir = REPO_ROOT / "agent-context" / slug

    if not context_dir.exists():
        print(f"Context not found: {context_dir}", file=sys.stderr)
        sys.exit(1)

    report = build_report(ticket_key, slug)
    out = context_dir / "COMPLETION_REPORT.md"
    out.write_text(report, encoding="utf-8")
    print(f"Written to {out}")


if __name__ == "__main__":
    main()
