#!/usr/bin/env python3
"""Standalone Jira ticket fetcher. Used by agent_orchestrator.py."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")


def fetch_issue(ticket_key: str) -> dict:
    email = os.getenv("JIRA_EMAIL", "")
    token = os.getenv("JIRA_TOKEN", "")
    base_url = os.getenv("JIRA_BASE_URL", "").rstrip("/")

    if not all([email, token, base_url]):
        raise SystemExit("Set JIRA_EMAIL, JIRA_TOKEN, JIRA_BASE_URL in .env.local")

    resp = requests.get(
        f"{base_url}/rest/api/3/issue/{ticket_key}",
        auth=(email, token),
        headers={"Accept": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python jira_fetch.py <TICKET-KEY>", file=sys.stderr)
        sys.exit(1)
    data = fetch_issue(sys.argv[1])
    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
