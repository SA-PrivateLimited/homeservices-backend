# CLAUDE.md — Instructions for Claude Code (homeServicesBackend)

## What this repo is
**homeServicesBackend** — Express + MongoDB API. Agent pipeline wired from `ai-agent-cursor-claude`.

Stack: Node.js + Express + MongoDB/Mongoose + JWT

## How to use this agent
1. Intake: `python scripts/agent_orchestrator.py --prompt "..." --name feature-slug --no-figma --stage intake`
2. Chat: `Read agent-context/<slug>/AGENT_KICKOFF.md and implement by executing the full 7-stage pipeline.`

## File locations
| Purpose | Path |
|---------|------|
| Personas | `.claude/agents/` |
| Cursor rules | `.cursor/rules/` |
| Per-ticket context | `agent-context/[ticket-id]/` |
| Design / API baseline | `baseline.md` |
| Patterns | `CODEBASE_CONTEXT.md` |
| Intake scripts | `scripts/` |

## Non-negotiable rules
- Read the persona for your stage before doing anything.
- Never skip a stage gate.
- Write blockers to `BLOCKED.md`, not only chat.
- Stay surgical — only change what `IMPLEMENTATION_PLAN.md` lists.
- Do not commit `agent-context/` or `.env` / `.env.local`.
- Stage 4 persona: `.claude/agents/backend.md`
