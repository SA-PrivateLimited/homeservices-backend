# .claude/agents — Persona Index

Each file defines the role, inputs, outputs, and rules for one stage of the 7-stage pipeline.

| File | Stage | Role |
|------|-------|------|
| `product-manager.md` | 1 — Spec | Reconciles Jira + Figma into `FEATURE_SPEC.md` |
| `planner.md` | 2 — Plan | Turns spec into surgical `IMPLEMENTATION_PLAN.md` |
| `tester.md` | 3 — Test | Writes failing tests (TDD) before implementation |
| `frontend.md` | 4 — Implement | Writes feature code; makes tests pass |
| `verifier.md` | 5 — Verify | Runs tests, TypeScript, AC trace, boundary checks |
| `reviewer.md` | 6 — Review | Full code review → `REVIEW.md` |
| `reporter.md` | 7 — Report | Final scorecard → `COMPLETION_REPORT.md` |

## How the pipeline is started

In Cursor Agent mode, paste:

```
Read agent-context/[ticket-id]/AGENT_KICKOFF.md and implement [ticket-id] by executing the full 7-stage pipeline it describes. Follow each stage's persona in .claude/agents/.
```

The `AGENT_KICKOFF.md` file drives the rest. Do not run stages manually.

## _unused/
Archived personas that are no longer active. Do not reference these in the pipeline.
