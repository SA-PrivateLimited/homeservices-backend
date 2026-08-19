# `.claude/agents` — homeServicesBackend Agent Suite

Local personas for the backend repo. Each file is self-sufficient and embeds Akanso backend context.

## Repo context

homeServicesBackend is the Akanso backend API and system of record.

### Main domains
- auth and role handling
- users/customers/providers
- jobs and service requests
- partner collaboration
- service categories/questionnaires
- geography
- client branding
- contact privacy

## Shared assumptions

- the backend is authoritative for business state
- customer/provider/admin/shared route separation matters
- business rules like multi-role users and collaboration are real
- contract changes should be deliberate and backward-compatible where possible

## Personas

| File | Stage | Purpose |
|------|-------|---------|
| `product-manager.md` | 1 — Spec | Turn requests into scoped backend-aware specs |
| `planner.md` | 2 — Plan | Decide what backend files and layers should change |
| `tester.md` | 3 — Test | Write high-value tests for backend changes |
| `backend.md` | 4 — Implement | Implement backend route/controller/model changes |
| `verifier.md` | 5 — Verify | Verify API, build, and contract safety |
| `reviewer.md` | 6 — Review | Review backend changes for regression risk |
| `reporter.md` | 7 — Report | Summarize changes, verification, and remaining risk |

## How to use

Read the persona for your current stage before doing anything. Follow its inputs, outputs, and gate checklist.
