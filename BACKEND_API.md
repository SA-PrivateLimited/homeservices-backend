# Home Services Backend — API Reference

Express.js REST API backed by MongoDB (Mongoose). Mobile apps (**Customer**, **Provider**, **Admin**) must use this API only; they do not connect to the database directly.

**Default base path:** `/api`  
**Health check:** `GET /health` (no `/api` prefix)

**Related files**

| File | Purpose |
|------|---------|
| This document | Full route list and behavior |
| `HomeServices-Backend-API.postman_collection.json` | Import into Postman |
| `Postman-Environment-Template.postman_environment.json` | Set `base_url` |
| `scripts/check-api.js` | Smoke tests (`npm run check:api`) |

---

## Table of contents

1. [Quick reference — all routes](#quick-reference--all-routes) — **49 endpoints**
2. [Verify APIs are working](#verify-apis-are-working)
3. [Environment & run](#1-environment--run)
4. [Authentication](#2-authentication)
5. [Pagination & IDs](#3-pagination--ids)
6. [Response shape](#4-response-shape)
7. [Endpoints (detailed)](#5-endpoints)
8. [Role → app mapping](#6-role--app-mapping-typical)
9. [Postman / OpenAPI](#7-postman--openapi)
10. [Security notes](#8-security-notes)

---

## Quick reference — all routes

**Token column:** **`None`** = no header. **`JWT`** = `Authorization: Bearer <access_token>` where the access token is **only** the string returned by `POST /api/auth/login` or `POST /api/auth/register` (signed with `JWT_SECRET`, algorithm **HS256**). It is **not** a Firebase ID token.

| # | Method | Path | Token |
|---|--------|------|--------|
| 1 | `GET` | `/health` | None |
| 2 | `POST` | `/api/auth/register` | None (returns JWT in body) |
| 3 | `POST` | `/api/auth/login` | None (returns JWT in body) |
| 4 | `GET` | `/api/users` | JWT + role **admin** |
| 5 | `GET` | `/api/users/me` | JWT |
| 6 | `POST` | `/api/users/me` | JWT |
| 7 | `PUT` | `/api/users/me` | JWT |
| 8 | `GET` | `/api/users/:userId` | JWT |
| 9 | `PUT` | `/api/users/:userId/fcmToken` | JWT |
| 10 | `GET` | `/api/providers` | JWT optional |
| 11 | `GET` | `/api/providers/me` | JWT + role **provider** |
| 12 | `GET` | `/api/providers/:providerId` | JWT optional |
| 13 | `PUT` | `/api/providers/me` | JWT + role **provider** |
| 14 | `PUT` | `/api/providers/me/status` | JWT + role **provider** |
| 15 | `PUT` | `/api/providers/:providerId/approval` | JWT + role **admin** |
| 16 | `PUT` | `/api/providers/:providerId` | JWT + role **admin** |
| 17 | `GET` | `/api/reviews` | JWT optional |
| 18 | `GET` | `/api/reviews/:reviewId` | JWT optional |
| 19 | `POST` | `/api/reviews` | JWT + role **customer** |
| 20 | `PUT` | `/api/reviews/:reviewId` | JWT + role **customer** |
| 21 | `DELETE` | `/api/reviews/:reviewId` | JWT (ownership rules) |
| 22 | `GET` | `/api/serviceCategories` | JWT optional |
| 23 | `GET` | `/api/serviceCategories/:categoryId` | JWT optional |
| 24 | `POST` | `/api/serviceCategories` | JWT + role **admin** |
| 25 | `PUT` | `/api/serviceCategories/:categoryId` | JWT + role **admin** |
| 26 | `DELETE` | `/api/serviceCategories/:categoryId` | JWT + role **admin** |
| 27 | `POST` | `/api/contactRecommendations` | JWT |
| 28 | `GET` | `/api/contactRecommendations` | JWT + role **admin** |
| 29 | `GET` | `/api/contactRecommendations/me` | JWT |
| 30 | `PUT` | `/api/contactRecommendations/:id/status` | JWT + role **admin** |
| 31 | `GET` | `/api/customer/jobCards` | JWT (customer) |
| 32 | `GET` | `/api/customer/jobCards/:jobCardId` | JWT (customer) |
| 33 | `PUT` | `/api/customer/jobCards/:jobCardId/cancel` | JWT (customer) |
| 34 | `GET` | `/api/customer/serviceRequests` | JWT (customer) |
| 35 | `POST` | `/api/customer/serviceRequests` | JWT (customer) |
| 36 | `GET` | `/api/customer/serviceRequests/:serviceRequestId` | JWT (customer) |
| 37 | `PUT` | `/api/customer/serviceRequests/:serviceRequestId` | JWT (customer) |
| 38 | `PUT` | `/api/customer/serviceRequests/:serviceRequestId/cancel` | JWT (customer) |
| 39 | `GET` | `/api/provider/jobCards` | JWT + role **provider** |
| 40 | `GET` | `/api/provider/jobCards/:jobCardId` | JWT + role **provider** |
| 41 | `POST` | `/api/provider/jobCards` | JWT + role **provider** |
| 42 | `PUT` | `/api/provider/jobCards/:jobCardId/status` | JWT + role **provider** |
| 43 | `GET` | `/api/provider/serviceRequests/:serviceRequestId` | JWT + role **provider** |
| 44 | `PUT` | `/api/provider/serviceRequests/:serviceRequestId/accept` | JWT + role **provider** |
| 45 | `PUT` | `/api/provider/serviceRequests/:serviceRequestId/reject` | JWT + role **provider** |
| 46 | `GET` | `/api/admin/jobCards` | JWT + role **admin** |
| 47 | `GET` | `/api/admin/jobCards/:jobCardId` | JWT + role **admin** |
| 48 | `PUT` | `/api/admin/jobCards/:jobCardId` | JWT + role **admin** |
| 49 | `DELETE` | `/api/admin/jobCards/:jobCardId` | JWT + role **admin** |

**Total: 49 routes** (plus 404 for unknown paths).

**Role enforcement:** The JWT includes a `role` claim, but the server **reloads the user from MongoDB** and enforces **admin** / **provider** / **customer** on `requireRole` routes. Use an account whose `users.role` matches the app (customer app → `customer`, etc.). **Admin users** can be created via `POST /api/auth/register` with `role: "admin"` when `ADMIN_REGISTRATION_SECRET` is configured (see §1).

---

## Verify APIs are working

### A. Automated smoke test (no JWT)

With the server running (`npm run dev`):

```bash
cd homeServicesBackend
npm run check:api
```

Uses `API_BASE` if set (default `http://127.0.0.1:3001`). Checks health, public GETs, and that protected routes return **401** without a JWT.

### B. Manual checks with curl

```bash
BASE=http://127.0.0.1:3001
curl -s "$BASE/health"
curl -s "$BASE/api/providers?limit=2&offset=0"
curl -s "$BASE/api/reviews?limit=2&offset=0"
curl -s "$BASE/api/serviceCategories"
```

### C. Get a JWT, then call protected routes

```bash
# Login (or use register) — returns JSON with data.token
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}' | jq -r '.data.token')

curl -s "$BASE/api/users/me" -H "Authorization: Bearer $TOKEN"
```

Use **Postman** or any client with:

```http
Authorization: Bearer <JWT from /api/auth/login or /api/auth/register>
```

Firebase ID tokens are **not** accepted by the API anymore. Invalid or expired JWT → **401**.

---

## 1. Environment & run

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `MONGODB_DB_NAME` | No | Database name (default: `home-services`) |
| `JWT_SECRET` or `HMAC_JWT_SECRET` | Yes** | At least 32 characters; used to sign access tokens (HS256) |
| `TOKEN_ENCRYPTION_KEY` (or `ENCRYPTION_KEY`) | Yes** | 64 hex chars (`openssl rand -hex 32`) or base64 of 32 bytes; encrypts the JWT before storing in MongoDB |
| `JWT_EXPIRES_IN` | No | Token lifetime (default `7d`) |
| `PORT` | No | Server port (default `3000`; scripts often use `3001`) |
| `CORS_ORIGIN` | No | CORS origin (default `*`) |
| `NODE_ENV` | No | `development` / `production` |
| `ADMIN_REGISTRATION_SECRET` | For admin signup | Min 8 characters; required in `.env` to allow `role: "admin"` on `POST /api/auth/register`; must match `adminSecret` in body or `X-Admin-Registration-Secret` header |
| Firebase Admin | Optional | Only if you use Firebase RTDB / legacy features (`config/firebaseAdmin.js`) |

\*\* Required for `/api/auth/register`, `/api/auth/login`, and JWT auth middleware.

**Encrypted token in MongoDB:** On each successful login/register, the issued JWT is encrypted with **AES-256-GCM** using `TOKEN_ENCRYPTION_KEY` and saved on the user document as `encryptedAuthToken` (not returned in API responses). Server-side decryption: `require('./utils/tokenEncryption').decryptToken(encryptedString)`.

```bash
cd homeServicesBackend
cp .env.example .env   # if present; set MONGODB_URI
npm install
npm run dev             # PORT=3001 nodemon
```

**Local URLs**

- API: `http://localhost:3001/api` (or your `PORT`)
- Android emulator → host: `http://10.0.2.2:3001/api`

---

## 2. Authentication

**All protected routes expect a JWT** issued by this backend (not Firebase):

```http
Authorization: Bearer <jwt_access_token>
```

- Obtain the token from **`POST /api/auth/register`** or **`POST /api/auth/login`** (response body includes `data.token`).
- Algorithm **HS256**, signed with `JWT_SECRET` (or `HMAC_JWT_SECRET`).
- **Firebase ID tokens are not verified** by the API for these routes.

| Middleware | Behavior |
|------------|----------|
| `verifyAuth` | JWT required; verifies signature and expiry; loads user from DB; attaches `req.user` |
| `optionalAuth` | JWT optional; if present and valid, `req.user` is set |
| `requireRole('customer' \| 'provider' \| 'admin')` | JWT required; DB user must have that `role` |

**Typical error (401)**

```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "No authentication token provided"
}
```

---

## 3. Pagination & IDs

- **Pagination** (where `validatePagination` is used): query params typically include `limit` and `offset` (see controller implementations).
- **Object IDs**: MongoDB ObjectId strings in path params (`:userId`, `:jobCardId`, etc.) are validated where noted.

---

## 4. Response shape

Success responses are JSON; structure varies by endpoint. Errors often follow:

```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Human-readable detail"
}
```

**404** (unknown route):

```json
{
  "success": false,
  "error": "Not Found",
  "message": "Route GET /api/unknown not found"
}
```

---

## 5. Endpoints

### 5.0 Auth — `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/auth/health` | None | Confirms auth routes are mounted (if this 404s, restart `npm run dev` or wrong process on `PORT`) |
| `POST` | `/api/auth/register` | None | Register: `role` = `customer` \| `provider` \| `admin`. For **admin**, set `ADMIN_REGISTRATION_SECRET` in `.env` and send the same value as `adminSecret` (JSON) or header `X-Admin-Registration-Secret`; returns `data.token` and `data.user` |
| `POST` | `/api/auth/login` | None | Body: `password` and `email` or `phoneNumber`; returns `data.token` (JWT) and `data.user` |

Use the returned JWT as `Authorization: Bearer <token>` on all other routes that require auth.

**If you see `Route POST /api/auth/register not found`:** The server answering on that port is **not** this codebase’s latest `src/server.js` (auth not mounted). Stop all Node processes, run `cd homeServicesBackend && npm run dev`, then open `GET http://localhost:3001/api/auth/health` — must return JSON with `"Auth routes active"`.

---

### 5.1 Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Liveness; returns `success`, `message`, `timestamp` |

---

### 5.2 Users — `/api/users`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/users/me` | JWT | Current user profile |
| `POST` | `/api/users/me` | JWT | Create or update current user (upsert) |
| `PUT` | `/api/users/me` | JWT | Update current user profile |
| `GET` | `/api/users/:userId` | JWT | User by ID (limited fields for non-admin) |
| `PUT` | `/api/users/:userId/fcmToken` | JWT | Update FCM push token |
| `GET` | `/api/users` | JWT + **admin** | List all users (paginated) |

---

### 5.3 Providers — `/api/providers`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/providers` | JWT optional | List providers (approved; paginated) |
| `GET` | `/api/providers/me` | JWT + **provider** | Current provider profile |
| `GET` | `/api/providers/:providerId` | JWT optional | Provider by ID |
| `PUT` | `/api/providers/me` | JWT + **provider** | Update own profile |
| `PUT` | `/api/providers/me/status` | JWT + **provider** | Online / offline status |
| `PUT` | `/api/providers/:providerId/approval` | JWT + **admin** | Approve / reject provider |
| `PUT` | `/api/providers/:providerId` | JWT + **admin** | Update provider (admin) |

**Note:** Register `/me` and `/me/status` and `/:providerId/approval` before generic `/:providerId` routes (already ordered in code).

---

### 5.4 Reviews — `/api/reviews`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/reviews` | JWT optional | List reviews (paginated) |
| `GET` | `/api/reviews/:reviewId` | JWT optional | Single review |
| `POST` | `/api/reviews` | JWT + **customer** | Create review (`providerId`, `jobCardId`, `rating` 1–5; job must be completed) |
| `PUT` | `/api/reviews/:reviewId` | JWT + **customer** | Update own review |
| `DELETE` | `/api/reviews/:reviewId` | JWT + ownership | Delete review (customer owner or per permission rules) |

---

### 5.5 Service categories — `/api/serviceCategories`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/serviceCategories` | JWT optional | All categories |
| `GET` | `/api/serviceCategories/:categoryId` | JWT optional | Single category |
| `POST` | `/api/serviceCategories` | JWT + **admin** | Create category |
| `PUT` | `/api/serviceCategories/:categoryId` | JWT + **admin** | Update category |
| `DELETE` | `/api/serviceCategories/:categoryId` | JWT + **admin** | Delete category |

---

### 5.6 Contact recommendations — `/api/contactRecommendations`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/contactRecommendations` | JWT | Create recommendation |
| `GET` | `/api/contactRecommendations` | JWT + **admin** | List all |
| `GET` | `/api/contactRecommendations/me` | JWT | Current user’s recommendations |
| `PUT` | `/api/contactRecommendations/:id/status` | JWT + **admin** | Update status |

---

### 5.7 Customer — job cards — `/api/customer/jobCards`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/customer/jobCards` | JWT (customer) | Customer’s job cards (language detection middleware) |
| `GET` | `/api/customer/jobCards/:jobCardId` | JWT (customer) | Single job card (must belong to customer) |
| `PUT` | `/api/customer/jobCards/:jobCardId/cancel` | JWT (customer) | Cancel with `cancellationReason` in body |

---

### 5.8 Customer — service requests — `/api/customer/serviceRequests`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/customer/serviceRequests` | JWT (customer) | Customer’s service requests |
| `POST` | `/api/customer/serviceRequests` | JWT (customer) | Create service request |
| `GET` | `/api/customer/serviceRequests/:serviceRequestId` | JWT (customer) | Single request |
| `PUT` | `/api/customer/serviceRequests/:serviceRequestId` | JWT (customer) | Update request |
| `PUT` | `/api/customer/serviceRequests/:serviceRequestId/cancel` | JWT (customer) | Cancel with `cancellationReason` |

---

### 5.9 Provider — job cards — `/api/provider/jobCards`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/provider/jobCards` | JWT + **provider** | Provider’s job cards |
| `GET` | `/api/provider/jobCards/:jobCardId` | JWT + **provider** | Single job card (must belong to provider) |
| `POST` | `/api/provider/jobCards` | JWT + **provider** | Create job card (`customerId`, `serviceType` required) |
| `PUT` | `/api/provider/jobCards/:jobCardId/status` | JWT + **provider** | Update status (`status` in body) |

**Allowed job card statuses** (for status updates where validated):  
`pending`, `accepted`, `in-progress`, `completed`, `cancelled`

---

### 5.10 Provider — service requests — `/api/provider/serviceRequests`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/provider/serviceRequests/:serviceRequestId` | JWT + **provider** | Get by ID |
| `PUT` | `/api/provider/serviceRequests/:serviceRequestId/accept` | JWT + **provider** | Accept request |
| `PUT` | `/api/provider/serviceRequests/:serviceRequestId/reject` | JWT + **provider** | Reject request |

---

### 5.11 Admin — job cards — `/api/admin/jobCards`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/jobCards` | JWT + **admin** | All job cards (paginated) |
| `GET` | `/api/admin/jobCards/:jobCardId` | JWT + **admin** | Single job card |
| `PUT` | `/api/admin/jobCards/:jobCardId` | JWT + **admin** | Update job card (incl. status) |
| `DELETE` | `/api/admin/jobCards/:jobCardId` | JWT + **admin** | Delete job card |

---

## 6. Role → app mapping (typical)

| Role | Primary mobile app | Main API prefixes |
|------|--------------------|-------------------|
| `customer` | Home Services (Customer) | `/api/customer/*`, `/api/reviews`, `/api/providers`, … |
| `provider` | Home Services Provider | `/api/provider/*`, `/api/providers/me`, … |
| `admin` | Home Services Admin | `/api/admin/*`, `/api/users`, `/api/providers/:id/approval`, … |

Exact authorization is enforced per route in `homeServicesBackend/src/routes/**`.

---

## 7. Postman / OpenAPI

- A Postman collection may exist as `HomeServices-Backend-API.postman_collection.json` in this folder (import into Postman and set `base_url`).
- OpenAPI/Swagger is not generated in-repo; this document is the canonical route list unless you add a generator later.

---

## 8. Security notes

- Use **HTTPS** in production.
- Keep **`JWT_SECRET`** and **`TOKEN_ENCRYPTION_KEY`** secret; rotate if leaked.
- If you use Firebase Admin (RTDB), rotate service account keys and restrict MongoDB network access.
- Do not expose `MONGODB_URI`, JWT secrets, or service account JSON in client apps or public repos.

---

*Generated from route definitions in `src/server.js` and `src/routes/**`. Update this file when routes change.*
