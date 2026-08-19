# CLAUDE.md — homeServicesBackend

## What this repo is

`homeServicesBackend` is the Akanso backend API and system of record.

It owns:

- users and roles
- customer and provider access behavior
- jobs and service requests
- partner collaboration
- service categories/questionnaires
- geography
- contact privacy
- branding/client configuration
- auth/session contracts

Stack:

- Node.js
- Express
- MongoDB / Mongoose
- JWT auth

## Repo truths

- The backend is the source of truth for business state.
- Frontend apps should adapt to backend contracts, not invent conflicting state.
- Customer, provider, admin, and shared route splits matter.
- Business rules such as multi-role users, collaboration, and contact privacy are enforced here.

## Important architecture points

- Entry point: `src/server.js`
- Database setup: `src/config/database.js`
- Models: `src/models/`
- Controllers: `src/controllers/`
- Routes: `src/routes/`
- Middleware: `src/middleware/`

## Business rules to preserve

- Do not break JWT/session expectations without an explicit migration plan.
- Partner collaboration is not a second customer job.
- Customer and partner can be the same underlying user.
- Contact privacy must reflect real supported behavior.
- Customer/provider/admin route separation should remain intentional.

## Local guidance files

- Personas: `.claude/agents/`
- Cursor rules: `.cursor/rules/`
- Patterns/docs: `CODEBASE_CONTEXT.md`, `BACKEND_API.md`, `DATABASE_DOCUMENTATION.md`
- Ticket context: `agent-context/[ticket-id]/`

## Non-negotiable rules

- Do not commit `.env` or `agent-context/`.
- Keep route/controller/model responsibilities clear.
- Validate inputs and use existing error handling patterns.
- Preserve backward compatibility unless the task explicitly includes a contract change.
