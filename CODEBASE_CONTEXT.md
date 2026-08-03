# CODEBASE_CONTEXT.md — homeServicesBackend

> Agent reads this before Stage 2 (Plan).

## App role
Express + MongoDB API.

## Tech stack
- **Runtime:** Node.js
- **Framework:** Express 4
- **DB:** MongoDB via Mongoose
- **Auth:** JWT (+ optional Firebase Admin)
- **Validation:** express-validator
- **Security:** helmet, cors, morgan

## Folder conventions
```
src/
  server.js
  config/          ← database, firebaseAdmin, env
  middleware/      ← auth, errorHandler, validation
  models/          ← Mongoose models
  controllers/     ← customer | provider | admin | shared
  routes/          ← mirrors controllers by app role
  utils/
scripts/           ← ops scripts (check-api.js, etc.)
```

## Patterns
- New endpoints: route → controller → model; mirror customer/provider/admin split.
- Validate inputs with express-validator; use central `errorHandler`.
- Do not put business logic only in route files.
- Keep secrets in `.env` — never commit tokens.
- Document new routes in `BACKEND_API.md` when adding public API surface.

## Do not assume (FE agent defaults)
- No React Native screens, no StyleSheet, no i18n JSX.
- Stage 4 uses `.claude/agents/backend.md` (not frontend.md).
- Tests: add focused unit/integration tests if harness exists; otherwise document manual API checks via Postman collection.
