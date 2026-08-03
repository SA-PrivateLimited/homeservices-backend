#!/usr/bin/env python3
"""Simple local telemetry — tracks pipeline runs and stage durations in a JSON log."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LOG_PATH = REPO_ROOT / "agent-context" / "telemetry.json"


def load_log() -> list[dict]:
    if LOG_PATH.exists():
        try:
            return json.loads(LOG_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
    return []


def save_log(entries: list[dict]) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text(json.dumps(entries, indent=2), encoding="utf-8")


def record_event(ticket: str, stage: str, status: str, notes: str = "") -> None:
    entries = load_log()
    entries.append({
        "ticket": ticket,
        "stage": stage,
        "status": status,
        "notes": notes,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    save_log(entries)
    print(f"Recorded: {ticket} / {stage} → {status}")


def show_summary() -> None:
    entries = load_log()
    if not entries:
        print("No telemetry data yet.")
        return

    by_ticket: dict[str, list[dict]] = {}
    for e in entries:
        by_ticket.setdefault(e["ticket"], []).append(e)

    print(f"{'Ticket':<20} {'Stage':<15} {'Status':<10} {'Timestamp'}")
    print("-" * 75)
    for ticket, evts in sorted(by_ticket.items()):
        for ev in evts:
            ts = ev["timestamp"][:16].replace("T", " ")
            print(f"{ev['ticket']:<20} {ev['stage']:<15} {ev['status']:<10} {ts}")


def main() -> None:
    if len(sys.argv) < 2:
        show_summary()
        return

    cmd = sys.argv[1]
    if cmd == "record" and len(sys.argv) >= 5:
        record_event(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] if len(sys.argv) > 5 else "")
    elif cmd == "summary":
        show_summary()
    else:
        print("Usage:")
        print("  python agent_telemetry.py                          # show summary")
        print("  python agent_telemetry.py record <ticket> <stage> <status> [notes]")
        sys.exit(1)


if __name__ == "__main__":
    main()
