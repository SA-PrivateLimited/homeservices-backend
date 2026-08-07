# Home Services Backend — API Documentation

**Project:** `home-services-backend`  
**Base path:** `/api` (except `/health` and Socket.IO emit helpers)  
**Protocol:** REST over HTTP/JSON  
**Auth:** JWT Bearer (`HS256`), unless noted  

This document describes **every HTTP endpoint** as implemented. GraphQL is not part of this API.

---

## Table of contents

1. [Conventions](#conventions)
2. [GraphQL](#graphql)
3. [REST — System & Realtime HTTP](#rest--system--realtime-http)
4. [REST — Auth](#rest--auth-apiauth)
5. [REST — Super Admin](#rest--super-admin-apisuperadmin)
6. [REST — Users](#rest--users-apiusers)
7. [REST — Providers](#rest--providers-apiproviders)
8. [REST — Reviews](#rest--reviews-apireviews)
9. [REST — Service Categories](#rest--service-categories-apiservicecategories)
10. [REST — Contact Recommendations](#rest--contact-recommendations-apicontactrecommendations)
11. [REST — Branding & Geography](#rest--branding--geography)
12. [REST — Customer](#rest--customer)
13. [REST — Provider app](#rest--provider-app)
14. [REST — Admin](#rest--admin)
15. [Endpoint index](#endpoint-index)

---

## Conventions

### Authorization types

| Label | Meaning |
|-------|---------|
| **None** | No `Authorization` header |
| **Bearer JWT** | `Authorization: Bearer <access_token>` (`verifyAuth`) |
| **Bearer JWT + role** | JWT + MongoDB user `role` must match (`requireRole`) |
| **optionalAuth** | JWT optional; ignored if missing/invalid |
| **Super Admin** | After admin JWT: header `X-Super-Admin-Token` (or body `superAdminToken`) from `POST /api/superadmin/elevate` |

### Typical success envelope

```json
{
  "success": true,
  "data": {},
  "message": "optional human message",
  "count": 0,
  "total": 0,
  "limit": 20,
  "offset": 0
}
```

### Typical error envelope

```json
{
  "success": false,
  "error": "Unauthorized | Forbidden | Not Found | Bad Request | Conflict | ...",
  "message": "Human-readable detail"
}
```

### Common HTTP statuses

| Status | Meaning |
|--------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Validation / bad input |
| 401 | Missing/invalid/expired token or credentials |
| 403 | Authenticated but not allowed (role / ownership / Super Admin) |
| 404 | Resource not found |
| 409 | Conflict (duplicate email, phone, PIN, etc.) |
| 429 | Rate limited (Super Admin elevate) |
| 500 / 503 | Server / dependency unavailable (e.g. Twilio, encryption key) |

### Session payload (auth success)

```json
{
  "success": true,
  "data": {
    "user": { "_id": "...", "role": "customer", "phoneNumber": "+91...", "hasPin": true },
    "token": "<JWT access token>",
    "expiresIn": "30d",
    "pin": "123456"
  },
  "message": "optional"
}
```

`pin` is returned only on create/reset PIN paths. Secrets (`passwordHash`, `pinHash`, etc.) are never returned.

---

## GraphQL

### Every GraphQL Query

**None.** This backend does not expose GraphQL.

### Every GraphQL Mutation

**None.**

### Every GraphQL Subscription

**None.**

Realtime updates use **Socket.IO** (`/socket.io/`) and optional FCM push, not GraphQL subscriptions.

---

## REST — System & Realtime HTTP

### `GET /health`

| Field | Detail |
|-------|--------|
| **Authorization** | None |
| **Request** | No body / query |
| **Response** | `{ success: true, message: "Home Services API is running", timestamp: ISO-8601 }` |
| **Possible errors** | Unlikely; process down → connection failure |
| **Business logic** | Liveness check only |
| **Execution flow** | `server.js` inline handler |
| **Dependencies** | None |

---

### `POST /emit-booking`

| Field | Detail |
|-------|--------|
| **Authorization** | None |
| **Request** | Body: `bookingData` (required object); `providerId` or `doctorId` and/or `customerId` (at least one room target) |
| **Response** | `{ success: true, emitted: true/false, message }` |
| **Possible errors** | `400` missing fields; `500` emit failure |
| **Business logic** | HTTP bridge for Socket.IO: emit `new-booking` to provider room and/or status to customer room |
| **Execution flow** | `mountEmitHttpRoutes` → `emitBooking` |
| **Dependencies** | Socket.IO (`realtime/socket.js`); optional `WEBSOCKET_SERVER_URL` |

---

### `POST /emit-service-completed`

| Field | Detail |
|-------|--------|
| **Authorization** | None |
| **Request** | Body: `customerId` (required); optional `jobCardId`, `consultationId`, `providerName`, `serviceType` |
| **Response** | `{ success: true, emitted, message }` |
| **Possible errors** | `500` |
| **Business logic** | Emit `service-completed` to `customer-{customerId}` |
| **Execution flow** | `mountEmitHttpRoutes` → `notifyServiceCompleted` |
| **Dependencies** | Socket.IO |

---

## REST — Auth (`/api/auth`)

### `GET /api/auth/health`

| Field | Detail |
|-------|--------|
| **Authorization** | None |
| **Request** | — |
| **Response** | `{ success: true, message: "Auth routes active", routes: [string] }` |
| **Possible errors** | — |
| **Business logic** | Confirms auth router is mounted |
| **Execution flow** | Inline |
| **Dependencies** | None |

---

### `POST /api/auth/register`

| Field | Detail |
|-------|--------|
| **Authorization** | None. Admin role requires `adminSecret` body or `X-Admin-Registration-Secret` matching `ADMIN_REGISTRATION_SECRET` |
| **Request** | **Required:** `email`, `password` (≥8), `fullName`/`name`, `phoneNumber`/`phone`. **Optional:** `role` (`customer`\|`provider`\|`admin`), `adminSecret` |
| **Response** | `201` `{ success, data: { user, token, expiresIn } }` |
| **Possible errors** | `400` missing/weak password/invalid role; `403` admin secret; `409` email/phone exists; `500` encryption/JWT misconfig |
| **Business logic** | Create User with bcrypt `passwordHash`; issue JWT; store AES-encrypted JWT on user |
| **Execution flow** | `register` → User.create → `signAccessToken` → `encryptToken` → save `encryptedAuthToken` |
| **Dependencies** | `User`, `bcryptjs`, `jwtAuth`, `tokenEncryption`, `phone` utils |

---

### `POST /api/auth/login`

| Field | Detail |
|-------|--------|
| **Authorization** | None |
| **Request** | **Required:** `password` + (`email` **or** `phoneNumber`/`phone`) |
| **Response** | Session `{ success, data: { user, token, expiresIn } }` **or** MFA: `{ requiresMfa: true, mfaToken, email }` **or** setup: `{ requiresMfaSetup: true, mfaToken, secret, otpauthUrl, qrCodeDataUrl, email }` |
| **Possible errors** | `400` missing fields; `401` invalid credentials; `403` deactivated; `500` MFA encrypt |
| **Business logic** | Verify password. Non-admin → session. Admin without TOTP → enroll setup. Admin with TOTP → require MFA verify |
| **Execution flow** | `login` → User (+passwordHash) → bcrypt → (totp path \| `issueSessionForUser`) |
| **Dependencies** | `User`, `Provider` (provider enrichment), `totp`, `jwtAuth`, `tokenEncryption` |

---

### `POST /api/auth/logout`

| Field | Detail |
|-------|--------|
| **Authorization** | optionalAuth |
| **Request** | — |
| **Response** | `{ success: true, data: { loggedOut: true }, message }` |
| **Possible errors** | — |
| **Business logic** | Stateless acknowledgement; client discards JWT |
| **Execution flow** | `optionalAuth` → `logRequest` → `logout` |
| **Dependencies** | Auth middleware, logger |

---

### `POST /api/auth/mfa/enable`

| Field | Detail |
|-------|--------|
| **Authorization** | None (uses `mfaToken` from login setup) |
| **Request** | **Required:** `mfaToken`, `code` (TOTP) |
| **Response** | `{ success, data: session, message }` |
| **Possible errors** | `400`; `401` bad token/code; `500` decrypt |
| **Business logic** | Confirm first authenticator code; set `totpEnabled: true`; issue access JWT |
| **Execution flow** | `verifyMfaToken(mfa_setup)` → decrypt secret → `verifyTotpCode` → `issueSessionForUser` |
| **Dependencies** | `jwtAuth`, `totp`, `tokenEncryption`, `User` |

---

### `POST /api/auth/mfa/verify`

| Field | Detail |
|-------|--------|
| **Authorization** | None (`mfaToken` purpose `mfa_verify`) |
| **Request** | **Required:** `mfaToken`, `code` |
| **Response** | `{ success, data: session }` |
| **Possible errors** | `400`; `401` |
| **Business logic** | Verify ongoing admin TOTP then issue session |
| **Execution flow** | `verifyMfaToken` → TOTP verify → `issueSessionForUser` |
| **Dependencies** | Same as enable |

---

### `POST /api/auth/phone/lookup`

| Field | Detail |
|-------|--------|
| **Authorization** | None |
| **Request** | **Required:** `phoneNumber`/`phone`. **Optional:** `role` (`customer`\|`provider`) |
| **Response** | `{ success, data: { phoneNumber, localPhone, exists, hasPin, role, roleMatch, requestedRole } }` |
| **Possible errors** | `400` invalid 10-digit |
| **Business logic** | Normalize phone; check User existence and PIN; role match for app gate |
| **Execution flow** | phone normalize → User.find |
| **Dependencies** | `User`, `phone` utils |

---

### `POST /api/auth/phone/register-pin`

| Field | Detail |
|-------|--------|
| **Authorization** | None |
| **Request** | **Required:** phone. **Optional:** `pin` (6 digits; auto-generated if omitted), `fullName`/`name` |
| **Response** | `201` session (+ one-time `pin` in data) |
| **Possible errors** | `400` PIN format; `409` PIN already set / global PIN clash; `503` allocate failure |
| **Business logic** | Create/update customer with unique global PIN (`pinHash` + `pinKey`); issue JWT |
| **Execution flow** | validate → bcrypt/HMAC PIN → User → `issueSessionForUser` |
| **Dependencies** | `User`, `jwtAuth`, crypto/HMAC secret |

---

### `POST /api/auth/phone/register-with-otp`

| Field | Detail |
|-------|--------|
| **Authorization** | None |
| **Request** | **Required:** phone, `code`/`otp`, `pin`. **Optional:** `fullName`, `role` |
| **Response** | `201` session (+ `pin`) |
| **Possible errors** | `400`; `401` bad OTP; `409` exists/role clash; `503` Twilio not configured |
| **Business logic** | Verify OTP → set PIN + role → ensure Provider profile if provider → session |
| **Execution flow** | `twilioVerify.checkVerification` → User upsert → `issueSessionForUser` |
| **Dependencies** | `twilioVerify`, `User`, `Provider`, `jwtAuth` |

---

### `POST /api/auth/phone/login-pin`

| Field | Detail |
|-------|--------|
| **Authorization** | None |
| **Request** | **Required:** phone, `pin`. **Optional:** `role` |
| **Response** | `{ success, data: session, message }` |
| **Possible errors** | `400`; `401` wrong PIN; `403` role mismatch / deactivated |
| **Business logic** | bcrypt PIN compare; set `phoneVerified`; ensure Provider if needed; session |
| **Execution flow** | User.find → bcrypt → `ensureProviderProfile?` → `issueSessionForUser` |
| **Dependencies** | `User`, `Provider`, `jwtAuth` |

---

### `POST /api/auth/phone/reset-pin`

| Field | Detail |
|-------|--------|
| **Authorization** | None |
| **Request** | **Required:** phone, `code`, `pin` |
| **Response** | session (+ new `pin`) |
| **Possible errors** | `400`; `401`; `404` user missing; `503` |
| **Business logic** | OTP verify → replace PIN hashes → session |
| **Execution flow** | Twilio check → User update → session |
| **Dependencies** | `twilioVerify`, `User`, `jwtAuth` |

---

### `POST /api/auth/phone/send-otp`

| Field | Detail |
|-------|--------|
| **Authorization** | None |
| **Request** | **Required:** `phoneNumber`/`phone` (E.164 preferred) |
| **Response** | `{ success, data: { phoneNumber, status, channel, dev?, otp?, expiresAt?, expiresInSeconds? } }` |
| **Possible errors** | `400`; `503` Twilio not configured; Twilio upstream errors |
| **Business logic** | Start SMS verification (or in-memory OTP when `TWILIO_DEV_MODE`) |
| **Execution flow** | normalize → `twilioVerify.sendVerification` |
| **Dependencies** | `twilioVerify`, Twilio REST (or in-memory Map) |

---

### `POST /api/auth/phone/verify-otp`

| Field | Detail |
|-------|--------|
| **Authorization** | None |
| **Request** | **Required:** phone, `code`. **Optional:** `fullName` |
| **Response** | session + “Phone verified…” |
| **Possible errors** | `400`; `401`; `503` |
| **Business logic** | Verify OTP; create/update customer; issue session without requiring PIN |
| **Execution flow** | check OTP → User → session |
| **Dependencies** | `twilioVerify`, `User`, `jwtAuth` |

---

## REST — Super Admin (`/api/superadmin`)

### `POST /api/superadmin/elevate`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + role **admin** |
| **Request** | **Required:** `code` (4-digit Super Admin PIN) |
| **Response** | `{ success, data: { superAdminToken, expiresIn }, message }` |
| **Possible errors** | `401` invalid PIN; `429` rate limit; `401`/`403`/`404` from `requireRole` |
| **Business logic** | Verify Super Admin PIN against `SystemConfig`; issue elevated JWT (`purpose: superadmin`) |
| **Execution flow** | `requireRole('admin')` → `logRequest` → `elevate` → `verifySuperAdminPin` → `signSuperAdminToken` |
| **Dependencies** | `jwtAuth`, `superAdmin` utils, `SystemConfig` |

---

### `PUT /api/superadmin/key`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin + **Super Admin** token |
| **Request** | **Required:** `currentCode`/`code`, `newCode` |
| **Response** | `{ success, data: { updated: true }, message }` |
| **Possible errors** | `400`/`401` from PIN update; `403` missing elevation |
| **Business logic** | Rotate Super Admin PIN hash |
| **Execution flow** | `requireRole` → `requireSuperAdmin` → `updateSuperAdminPin` |
| **Dependencies** | `superAdmin` utils |

---

## REST — Users (`/api/users`)

### `GET /api/users/me`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT |
| **Request** | — |
| **Response** | `{ success, data: user }` (`fcmToken` stripped) |
| **Possible errors** | `401`; `404` |
| **Business logic** | Return authenticated user profile |
| **Execution flow** | `verifyAuth` → `getMe` |
| **Dependencies** | `User` |

---

### `POST /api/users/me`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT |
| **Request** | Optional profile: `name`, `email`, `phone`/`phoneNumber`, `fcmToken`, `phoneVerified`, `location`, `role` (create or customer→provider) |
| **Response** | `200`/`201` `{ success, data, message, created }` |
| **Possible errors** | `400`; `401`; `409` |
| **Business logic** | Upsert current user profile |
| **Execution flow** | `verifyAuth` → upsert User |
| **Dependencies** | `User`, `Provider` (if role upgrade) |

---

### `PUT /api/users/me`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT |
| **Request** | Profile fields (role typically stripped for self-update) including addresses (`homeAddress`, `officeAddress`, `serviceAddresses`, etc.) |
| **Response** | `{ success, data, message }` |
| **Possible errors** | `401`; `404` |
| **Business logic** | Patch own profile |
| **Execution flow** | `verifyAuth` → `updateMe` |
| **Dependencies** | `User` |

---

### `GET /api/users/:userId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT |
| **Request** | Path: `userId` |
| **Response** | `{ success, data }` (non-admin non-self may get contact fields stripped) |
| **Possible errors** | `400` bad id; `401`; `404` |
| **Business logic** | Fetch user by id with visibility rules |
| **Execution flow** | `verifyAuth` → validate id → `getUserById` |
| **Dependencies** | `User` |

---

### `PUT /api/users/:userId/fcmToken`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT (must be self) |
| **Request** | Path `userId`; body **required** `fcmToken` |
| **Response** | `{ success, data/message }` |
| **Possible errors** | `400`; `403` not self; `401` |
| **Business logic** | Store device push token |
| **Execution flow** | `verifyAuth` → update User |
| **Dependencies** | `User` |

---

### `GET /api/users/:userId/pin`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + **admin**; **Super Admin** if target is admin |
| **Request** | Path `userId` |
| **Response** | `{ success, data: { _id, hasPin, loginPin, recoverable } }` |
| **Possible errors** | `401`/`403`; `404` |
| **Business logic** | Admin recovery view of encrypted PIN when recoverable |
| **Execution flow** | `requireRole('admin')` → decrypt `encryptedPin` |
| **Dependencies** | `User`, `tokenEncryption`, Super Admin gate |

---

### `PUT /api/users/:userId/pin`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin (+ Super Admin for admin targets) |
| **Request** | Optional `pin` (auto-generate if omitted) |
| **Response** | `{ success, data: { _id, loginPin, hasPin, role, phone }, message }` |
| **Possible errors** | `400` admin MFA accounts; `409` PIN clash; `503` |
| **Business logic** | Admin set/reset login PIN |
| **Execution flow** | admin auth → update pinHash/pinKey/encryptedPin |
| **Dependencies** | `User`, crypto helpers |

---

### `POST /api/users/:userId/mfa/reset`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin + **Super Admin** |
| **Request** | Path `userId` |
| **Response** | `{ success, data: { _id, totpEnabled: false, email }, message }` |
| **Possible errors** | `400` non-admin target; `401`/`403` |
| **Business logic** | Clear admin TOTP enrollment |
| **Execution flow** | elevate → clear totp fields |
| **Dependencies** | `User` |

---

### `PUT /api/users/:userId/password`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin (+ Super Admin for admin targets) |
| **Request** | **Required:** `password` (≥8) |
| **Response** | `{ success, data: { _id, email }, message }` |
| **Possible errors** | `400`; `401`/`403`; `404` |
| **Business logic** | Admin set password hash |
| **Execution flow** | bcrypt → User.update |
| **Dependencies** | `User`, `bcryptjs` |

---

### `PUT /api/users/:userId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin (+ Super Admin when changing admin role) |
| **Request** | Optional: `role`, `name`, `displayName`, `email`, `phoneVerified`, phones, location |
| **Response** | `{ success, data, message }` |
| **Possible errors** | `400` no fields / bad role; `404` |
| **Business logic** | Admin patch any user |
| **Execution flow** | `requireRole('admin')` → update |
| **Dependencies** | `User`, possibly `RoleChangeLog` |

---

### `GET /api/users`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin (+ Super Admin if filtering only admins) |
| **Request** | Query: `role`, `roles`, `limit`, `offset`, `includeInactive`, `state`, `district`, `stateId`, `districtId` |
| **Response** | `{ success, data, count, total, limit, offset }` |
| **Possible errors** | `401`/`403` |
| **Business logic** | Paginated admin user list with geo filters |
| **Execution flow** | admin auth → User.find |
| **Dependencies** | `User` |

---

### `POST /api/users`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin (+ Super Admin if creating admin) |
| **Request** | `role`; phone for customer/provider; email/phone + `password` for admin; optional name, location, provider fields (`serviceType`, `experience`, `rating`, `approvalStatus`) |
| **Response** | `201` user (+ Provider created when role=provider) |
| **Possible errors** | `400`; `409` |
| **Business logic** | Admin create user (and Provider document when needed) |
| **Execution flow** | validate → User.create → Provider.create? |
| **Dependencies** | `User`, `Provider` |

---

### `POST /api/users/:userId/deactivate`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin (+ Super Admin for admin targets) |
| **Request** | **Required:** `reason` |
| **Response** | `{ success, data, message }` |
| **Possible errors** | `400` self-deactivate / missing reason; `404` |
| **Business logic** | Soft-deactivate account (`isActive: false`) |
| **Execution flow** | admin → User update |
| **Dependencies** | `User` |

---

### `POST /api/users/:userId/restore`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin (+ Super Admin for admins) |
| **Request** | Path `userId` |
| **Response** | `{ success, data, message: "Account restored" }` |
| **Possible errors** | `401`/`403`; `404` |
| **Business logic** | Re-activate deactivated user |
| **Execution flow** | admin → User update |
| **Dependencies** | `User` |

---

### `DELETE /api/users/:userId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin (+ Super Admin for admins) |
| **Request** | Path `userId` |
| **Response** | `{ success, message }` |
| **Possible errors** | `400` self-delete; `404` |
| **Business logic** | Hard delete user; also delete Provider if provider |
| **Execution flow** | admin → User.delete → Provider.delete? |
| **Dependencies** | `User`, `Provider` |

---

## REST — Providers (`/api/providers`)

### `GET /api/providers`

| Field | Detail |
|-------|--------|
| **Authorization** | optionalAuth |
| **Request** | Query: `serviceType`, `city`, `state`, `district`, `stateId`, `districtId`, `pincode`, `isOnline`, `minRating`, `approvalStatus`, `includeInactive`, `limit`, `offset` |
| **Response** | `{ success, data, count, total, limit, offset }` |
| **Possible errors** | `400` pagination |
| **Business logic** | Non-admins forced to approved providers; admins can see pending/rejected and PIN flags |
| **Execution flow** | `optionalAuth` → Provider query filters |
| **Dependencies** | `Provider`, `User`, `connectDB` |

---

### `GET /api/providers/me`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + **provider** |
| **Request** | — |
| **Response** | `{ success, data: provider }` |
| **Possible errors** | `401`/`403`; `404` |
| **Business logic** | Current provider profile (`_id` = user id) |
| **Execution flow** | `requireRole('provider')` → Provider.findById |
| **Dependencies** | `Provider` |

---

### `PUT /api/providers/me`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + provider |
| **Request** | Profile fields; syncs location/address; strips `approvalStatus`/`role` |
| **Response** | `{ success, data, message }` |
| **Possible errors** | `401`/`403`; `404` |
| **Business logic** | Provider self-update |
| **Execution flow** | provider auth → Provider + User sync |
| **Dependencies** | `Provider`, `User` |

---

### `PUT /api/providers/me/status`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + provider |
| **Request** | Optional: `isOnline`, `isAvailable`, `currentLocation` |
| **Response** | `{ success, message }` |
| **Possible errors** | `401`/`403`; `503` transient Mongo on location-only updates |
| **Business logic** | Presence / availability for job matching |
| **Execution flow** | provider auth → Provider update |
| **Dependencies** | `Provider` |

---

### `GET /api/providers/:providerId`

| Field | Detail |
|-------|--------|
| **Authorization** | optionalAuth |
| **Request** | Path `providerId` |
| **Response** | Provider document (+ optional live location; admin enrichment) |
| **Possible errors** | `404` |
| **Business logic** | Public/admin provider detail |
| **Execution flow** | optionalAuth → Provider.find |
| **Dependencies** | `Provider`, `User`, optional Firebase |

---

### `PUT /api/providers/:providerId/approval`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + **admin** |
| **Request** | **Required:** `approvalStatus` (`pending`\|`approved`\|`rejected`); optional `rejectionReason` |
| **Response** | `{ success, data, message }` |
| **Possible errors** | `400`; `401`/`403`; `404` |
| **Business logic** | Admin approve/reject provider for accepting jobs |
| **Execution flow** | admin → Provider.update |
| **Dependencies** | `Provider` |

---

### `POST /api/providers/:providerId/documents/:docKey`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | Path: `providerId`, `docKey` ∈ `idProof`\|`addressProof`\|`certificate`. Multipart field **`file`** |
| **Response** | `{ success, data: { url, documents, provider }, message }` |
| **Possible errors** | `400` multer/MIME/docKey; `401`/`403`; `404` |
| **Business logic** | Store document under `/uploads/provider_documents/`; reset verify flags |
| **Execution flow** | admin → multer → save file → Provider.documents update |
| **Dependencies** | `multer` (`upload.js`), `Provider`, static `/uploads` |

---

### `PUT /api/providers/:providerId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | Any provider fields (+ phone sync) |
| **Response** | `{ success, data, message }` |
| **Possible errors** | `401`/`403`; `404` |
| **Business logic** | Admin full update |
| **Execution flow** | admin → Provider.update |
| **Dependencies** | `Provider`, `User` |

---

## REST — Reviews (`/api/reviews`)

### `GET /api/reviews`

| Field | Detail |
|-------|--------|
| **Authorization** | optionalAuth |
| **Request** | Query: `providerId`, `customerId`, `jobCardId`, `limit`, `offset` |
| **Response** | `{ success, data, count }` |
| **Possible errors** | `400` pagination |
| **Business logic** | List reviews with filters |
| **Execution flow** | optionalAuth → Review.find |
| **Dependencies** | `Review` |

---

### `GET /api/reviews/:reviewId`

| Field | Detail |
|-------|--------|
| **Authorization** | optionalAuth |
| **Request** | Path `reviewId` |
| **Response** | `{ success, data }` |
| **Possible errors** | `404` |
| **Business logic** | Fetch one review |
| **Execution flow** | Review.findById |
| **Dependencies** | `Review` |

---

### `POST /api/reviews`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + **customer** |
| **Request** | **Required:** `providerId`, `jobCardId`, `rating` (1–5); optional `comment` |
| **Response** | `201` review; provider aggregate rating updated |
| **Possible errors** | `400` duplicate / job not completed; `403`; `404` |
| **Business logic** | Customer reviews completed job; unique `(jobCardId, customerId)` |
| **Execution flow** | `requireRole('customer')` → validate → `checkJobCardCompleted` → create → update Provider rating |
| **Dependencies** | `Review`, `JobCard`, `Provider`, permissions |

---

### `PUT /api/reviews/:reviewId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + customer + ownership |
| **Request** | Optional `comment` (rating not updated in current controller) |
| **Response** | `{ success, data, message }` |
| **Possible errors** | `401`/`403`; `404` |
| **Business logic** | Owner edits comment |
| **Execution flow** | ownership middleware → update |
| **Dependencies** | `Review`, permissions |

---

### `DELETE /api/reviews/:reviewId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + ownership (admin or owner) |
| **Request** | Path `reviewId` |
| **Response** | `{ success, message }` |
| **Possible errors** | `401`/`403`; `404` |
| **Business logic** | Delete review |
| **Execution flow** | ownership → delete |
| **Dependencies** | `Review` |

---

## REST — Service Categories (`/api/serviceCategories`)

### `GET /api/serviceCategories`

| Field | Detail |
|-------|--------|
| **Authorization** | optionalAuth |
| **Request** | Query: `includeInactive=true` to include inactive |
| **Response** | `{ success, data, count }` |
| **Possible errors** | — |
| **Business logic** | Catalog for request/browse UIs |
| **Execution flow** | ServiceCategory.find |
| **Dependencies** | `ServiceCategory` |

---

### `GET /api/serviceCategories/:categoryId`

| Field | Detail |
|-------|--------|
| **Authorization** | optionalAuth |
| **Response** | `{ success, data }` / `404` |
| **Business logic** | Single category (+ questionnaire) |
| **Dependencies** | `ServiceCategory` |

---

### `POST /api/serviceCategories`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | Category fields (`name`, `description`, `icon`, `color`, `order`, `questionnaire`, …); auto `_id` |
| **Response** | `201` |
| **Possible errors** | `400`; `401`/`403` |
| **Business logic** | Admin create catalog entry |
| **Dependencies** | `ServiceCategory` |

---

### `PUT /api/serviceCategories/:categoryId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | Patch fields |
| **Response** | `{ success, data }` / `404` |
| **Dependencies** | `ServiceCategory` |

---

### `DELETE /api/serviceCategories/:categoryId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Response** | `{ success, message }` / `404` |
| **Dependencies** | `ServiceCategory` |

---

## REST — Contact Recommendations (`/api/contactRecommendations`)

### `POST /api/contactRecommendations`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT (customer or provider) |
| **Request** | **Required:** `recommendedProviderName`, `recommendedProviderPhone`, `serviceType`; optional `address` |
| **Response** | `201` `{ success, data, message, pointsAwarded }` (+5 points for customers) |
| **Possible errors** | `400`; `401`/`403` |
| **Business logic** | Refer a provider; award customer points |
| **Execution flow** | auth → create ContactRecommendation → bump User.points |
| **Dependencies** | `ContactRecommendation`, `User` |

---

### `GET /api/contactRecommendations`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | Query: `status`, `serviceType`, `limit`, `offset` |
| **Response** | `{ success, data, count, total, limit, offset }` |
| **Dependencies** | `ContactRecommendation` |

---

### `GET /api/contactRecommendations/me`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT |
| **Response** | `{ success, data, count }` own recommendations |
| **Dependencies** | `ContactRecommendation` |

---

### `PUT /api/contactRecommendations/:id`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | Optional name/phone/serviceType/address/status/adminNotes |
| **Response** | `{ success, data }` |
| **Dependencies** | `ContactRecommendation` |

---

### `PUT /api/contactRecommendations/:id/status`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | **Required:** `status` ∈ `pending`\|`contacted`\|`registered`\|`rejected`; optional `adminNotes` |
| **Response** | `{ success, data }` |
| **Dependencies** | `ContactRecommendation` |

---

## REST — Branding & Geography

### `GET /api/branding`

| Field | Detail |
|-------|--------|
| **Authorization** | None |
| **Response** | `{ success, data: { clientId, clientName, themeColors } }` |
| **Business logic** | Active client theme from `SystemConfig.activeClientId` |
| **Execution flow** | `logRequest` → load Client / defaults |
| **Dependencies** | `Client`, `SystemConfig`, `clients` util |

---

### `GET /api/geography/meta`

| Field | Detail |
|-------|--------|
| **Authorization** | optionalAuth |
| **Response** | `{ success, data: { states, districts } }` (cached/seeded) |
| **Business logic** | Public state/district meta for address pickers |
| **Execution flow** | optionalAuth → geography seed/meta |
| **Dependencies** | `State`, `District`, `geographySeed` |

---

## REST — Customer

### Job cards — `/api/customer/jobCards`

#### `GET /api/customer/jobCards`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT (customer ownership implied) |
| **Request** | Query: `status`, `limit`, `offset` |
| **Response** | `{ success, data, count }` |
| **Possible errors** | `401` |
| **Business logic** | List job cards for current customer |
| **Execution flow** | `detectLanguage` → `verifyAuth` → pagination → controller |
| **Dependencies** | `JobCard`, i18n helpers |

#### `GET /api/customer/jobCards/:jobCardId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + `checkJobCardCustomer` |
| **Response** | `{ success, data }` / `404` |
| **Dependencies** | `JobCard`, permissions |

#### `PUT /api/customer/jobCards/:jobCardId/cancel`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + customer ownership |
| **Request** | **Required:** `cancellationReason` |
| **Response** | `{ success, data, message }` |
| **Possible errors** | `400` already cancelled/completed; `403`; `404` |
| **Business logic** | Cancel job card; may cancel linked ServiceRequest |
| **Dependencies** | `JobCard`, `ServiceRequest` |

#### `POST /api/customer/jobCards/:jobCardId/comments`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + ownership |
| **Request** | **Required:** `text` |
| **Response** | `{ success, data: jobCard, message: "Comment added" }` |
| **Dependencies** | `jobCardComments` util |

---

### Service requests — `/api/customer/serviceRequests`

#### `GET /api/customer/serviceRequests`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT |
| **Request** | Query: `status`, `limit`, `offset` |
| **Response** | `{ success, data, count }` |
| **Business logic** | Customer’s bookings (ServiceRequests) |
| **Dependencies** | `ServiceRequest` |

#### `POST /api/customer/serviceRequests`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT |
| **Request** | **Required:** `customerAddress.address`, `customerAddress.pincode`, `serviceType`. **Optional:** `providerId` (targeted), `requestAdminHelp`, `problem`, `customerName`/`customerPhone`, `secondaryPhone`, `questionnaireAnswers`, `photos`, geo fields, `urgency`, etc. |
| **Response** | `201` `{ success, data: serviceRequest }` |
| **Possible errors** | `400` missing address/type; `401` |
| **Business logic** | Create `pending` booking; notify providers (Socket + FCM); admin notify; if no providers / admin help → flags and possibly `JobCard` `unassigned` |
| **Execution flow** | auth → validate → create SR → `findProvidersInArea` → notify → optional JobCard |
| **Dependencies** | `ServiceRequest`, `Provider`, `JobCard`, `findProvidersInArea`, `notify`, Socket.IO |

#### `POST /api/customer/serviceRequests/request-area-providers`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT |
| **Request** | **Required:** `serviceType`; pincode via `customerAddress.pincode` or `pincode`; optional address/name/phone |
| **Response** | `{ success, data: { serviceType, pincode, demandId, status }, message }` |
| **Business logic** | Upsert `AreaProviderDemand` for admin sourcing |
| **Dependencies** | `AreaProviderDemand`, `notifyAdmins` |

#### `GET /api/customer/serviceRequests/:serviceRequestId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT (own only) |
| **Response** | `{ success, data }` / `404` |
| **Dependencies** | `ServiceRequest` |

#### `PUT /api/customer/serviceRequests/:serviceRequestId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT (own) |
| **Request** | Arbitrary mergeable fields (including `photos`) |
| **Response** | `{ success, data }` |
| **Business logic** | Generic customer update of own request |
| **Dependencies** | `ServiceRequest` |

#### `PUT /api/customer/serviceRequests/:serviceRequestId/cancel`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT |
| **Request** | Cancellation reason (validated) |
| **Response** | `{ success, data }` status `cancelled` |
| **Possible errors** | `400` already cancelled; `404` |
| **Dependencies** | `ServiceRequest` |

---

## REST — Provider app

### Job cards — `/api/provider/jobCards`

#### `GET /api/provider/jobCards`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + **provider** |
| **Request** | Query: `status`, `limit`, `offset` |
| **Response** | `{ success, data, count }` |
| **Dependencies** | `JobCard` |

#### `GET /api/provider/jobCards/:jobCardId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + provider + ownership |
| **Response** | `{ success, data }` / `404` |
| **Dependencies** | `JobCard`, permissions |

#### `POST /api/provider/jobCards`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + provider |
| **Request** | **Required:** `customerId`, `serviceType` (+ other JobCard fields as validated) |
| **Response** | `201` job card with status forced `accepted` |
| **Dependencies** | `JobCard`, validators |

#### `PUT /api/provider/jobCards/:jobCardId/status`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + provider + ownership |
| **Request** | Optional: `status` (`pending`\|`accepted`\|`in-progress`\|`completed`\|`cancelled`), `taskPIN`, `serviceAmount`, `materialsUsed`, `jobCardPdfUrl`, `completedAt`, cancellation fields |
| **Response** | `{ success, data, message }` |
| **Business logic** | Drive job lifecycle; FCM customer when entering `in-progress` |
| **Dependencies** | `JobCard`, `notify` |

#### `POST /api/provider/jobCards/:jobCardId/comments`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + provider ownership |
| **Request** | **Required:** `text` |
| **Response** | `{ success, data, message }` |
| **Dependencies** | `jobCardComments` |

---

### Service requests — `/api/provider/serviceRequests`

#### `GET /api/provider/serviceRequests/pending`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + provider |
| **Request** | Query: `limit` (default 20) |
| **Response** | Pending SRs assigned to self |
| **Dependencies** | `ServiceRequest` |

#### `GET /api/provider/serviceRequests/nearby-pending`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + provider |
| **Response** | Open pending requests in provider’s area (empty if offline/no profile) |
| **Business logic** | Match district/pincode + service type |
| **Dependencies** | `findNearbyOpenPendingForProvider`, `Provider` |

#### `GET /api/provider/serviceRequests/:serviceRequestId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + provider |
| **Response** | SR via flexible ID find / `404` |
| **Dependencies** | `ServiceRequest`, `findServiceRequestFlexible` |

#### `PUT /api/provider/serviceRequests/:serviceRequestId/accept`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + provider |
| **Request** | Optional denormalized provider display fields |
| **Response** | `{ success, data }` status `accepted` |
| **Possible errors** | `400` bad status / offline; `403` not approved; `409` assigned elsewhere; `404` |
| **Business logic** | Accept pending request; notify customer + admins |
| **Dependencies** | `ServiceRequest`, `Provider`, Socket/FCM |

#### `PUT /api/provider/serviceRequests/:serviceRequestId/reject`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + provider |
| **Request** | Optional `rejectionReason` |
| **Response** | Updated SR |
| **Business logic** | Open broadcast → append `declinedProviders`, stay `pending`. Targeted → `rejected` |
| **Dependencies** | `ServiceRequest` |

---

## REST — Admin

### Job cards — `/api/admin/jobCards`

#### `GET /api/admin/jobCards`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + **admin** |
| **Request** | Query: `status`, `customerId`, `providerId`, `unassigned`, `needsAdminAssignment`, geo filters, `limit`, `offset` |
| **Response** | `{ success, data, count, total, limit, offset }` (may include virtual `sr_*` rows from pending ServiceRequests) |
| **Dependencies** | `JobCard`, `ServiceRequest` |

#### `GET /api/admin/jobCards/:jobCardId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | Path supports real id or `sr_<serviceRequestId>` |
| **Response** | `{ success, data }` / `404` |
| **Dependencies** | `JobCard`, `ServiceRequest` |

#### `POST /api/admin/jobCards/:jobCardId/assign`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | **Required:** `providerId`; optional `status` (default `accepted`) |
| **Response** | jobCard + `customerNotified`, `reassigned?` |
| **Possible errors** | `400` unapproved provider; `404` |
| **Business logic** | Assign provider; may materialize JobCard from SR; notify customer |
| **Dependencies** | `JobCard`, `ServiceRequest`, `Provider`, notify/socket |

#### `POST /api/admin/jobCards/:jobCardId/unassign`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Response** | Unassigned job (errors on virtual `sr_*`) |
| **Dependencies** | `JobCard` |

#### `POST /api/admin/jobCards/:jobCardId/comments`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | **Required:** `text` |
| **Response** | `{ success, data }` (400 for `sr_*`) |
| **Dependencies** | `jobCardComments` |

#### `PUT /api/admin/jobCards/:jobCardId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | Arbitrary fields + validated `status` if present |
| **Response** | `{ success, data }` |
| **Dependencies** | `JobCard` |

#### `DELETE /api/admin/jobCards/:jobCardId`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Response** | `{ success, message }` (400 for `sr_*`) |
| **Dependencies** | `JobCard` |

---

### Clients — `/api/admin/clients` (admin + Super Admin)

#### `GET /api/admin/clients`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin + Super Admin |
| **Response** | `{ success, data: { activeClientId, clients }, count }` |
| **Dependencies** | `Client`, `SystemConfig` |

#### `POST /api/admin/clients`

| Field | Detail |
|-------|--------|
| **Authorization** | admin + Super Admin |
| **Request** | **Required:** `name`; optional `_id`, `themeColors` |
| **Response** | `201` / `409` |
| **Dependencies** | `Client` |

#### `PUT /api/admin/clients/:clientId`

| Field | Detail |
|-------|--------|
| **Authorization** | admin + Super Admin |
| **Request** | Optional `name`, `themeColors` |
| **Response** | `{ success, data }` |
| **Dependencies** | `Client` |

#### `PUT /api/admin/clients/:clientId/activate`

| Field | Detail |
|-------|--------|
| **Authorization** | admin + Super Admin |
| **Response** | Active branding payload; sets `SystemConfig.activeClientId` |
| **Dependencies** | `Client`, `SystemConfig` |

#### `DELETE /api/admin/clients/:clientId`

| Field | Detail |
|-------|--------|
| **Authorization** | admin + Super Admin |
| **Possible errors** | `400` active or last client; `404` |
| **Dependencies** | `Client` |

---

### Geography — `/api/admin/geography`

#### `GET /api/admin/geography/meta`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Response** | `{ states, districts }` |
| **Dependencies** | `State`, `District`, seed |

#### `GET /api/admin/geography/states`

| Field | Detail |
|-------|--------|
| **Authorization** | admin |
| **Response** | States with providerCount, avgRating, jobStats |
| **Dependencies** | `State`, aggregations |

#### `GET /api/admin/geography/states/:stateId/districts`

| Field | Detail |
|-------|--------|
| **Authorization** | admin |
| **Response** | `{ data: { districts, state }, count }` / `404` |
| **Dependencies** | `District`, `State` |

#### `GET /api/admin/geography/districts/:districtId/providers`

| Field | Detail |
|-------|--------|
| **Authorization** | admin |
| **Response** | `{ data: { providers, district }, count }` |
| **Dependencies** | `Provider`, `District` |

#### `POST /api/admin/geography/districts/:districtId/providers`

| Field | Detail |
|-------|--------|
| **Authorization** | admin |
| **Request** | Either `{ providerId, address?, pincode? }` (assign) **or** `{ name, phone, serviceType?, ... }` (create approved provider) |
| **Response** | `200` assign / `201` create |
| **Dependencies** | `Provider`, `User`, `District` |

---

### Overview — `/api/admin/overview`

#### `GET /api/admin/overview/stats`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | Query: `stateId?`, `days?` (7–90, default 30) |
| **Response** | `{ success, data: { providers, customers, jobs, byState, byDistrict, byService, trend, selectedStateId } }` |
| **Business logic** | Dashboard aggregates |
| **Dependencies** | `State`, `District`, `Provider`, `JobCard`, `User`, geography seed |

---

### Area provider demands — `/api/admin/area-provider-demands`

#### `GET /api/admin/area-provider-demands`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | Query: `status` (default `open`; `all` = no filter), `limit`, `offset` |
| **Response** | `{ success, data, count, total }` |
| **Dependencies** | `AreaProviderDemand` |

#### `PUT /api/admin/area-provider-demands/:id`

| Field | Detail |
|-------|--------|
| **Authorization** | Bearer JWT + admin |
| **Request** | Optional: `status`, `adminNotes` |
| **Response** | `{ success, data }` / `404` |
| **Dependencies** | `AreaProviderDemand` |

---

## Endpoint index

| # | Method | Path | Auth |
|---|--------|------|------|
| 1 | GET | `/health` | None |
| 2 | POST | `/emit-booking` | None |
| 3 | POST | `/emit-service-completed` | None |
| 4 | GET | `/api/auth/health` | None |
| 5 | POST | `/api/auth/register` | None* |
| 6 | POST | `/api/auth/login` | None |
| 7 | POST | `/api/auth/logout` | optionalAuth |
| 8 | POST | `/api/auth/mfa/enable` | mfaToken |
| 9 | POST | `/api/auth/mfa/verify` | mfaToken |
| 10 | POST | `/api/auth/phone/lookup` | None |
| 11 | POST | `/api/auth/phone/register-pin` | None |
| 12 | POST | `/api/auth/phone/register-with-otp` | None |
| 13 | POST | `/api/auth/phone/login-pin` | None |
| 14 | POST | `/api/auth/phone/reset-pin` | None |
| 15 | POST | `/api/auth/phone/send-otp` | None |
| 16 | POST | `/api/auth/phone/verify-otp` | None |
| 17 | POST | `/api/superadmin/elevate` | JWT admin |
| 18 | PUT | `/api/superadmin/key` | JWT admin + Super Admin |
| 19–33 | * | `/api/users…` | JWT / admin / Super Admin (see § Users) |
| 34–41 | * | `/api/providers…` | optional / provider / admin |
| 42–46 | * | `/api/reviews…` | optional / customer |
| 47–51 | * | `/api/serviceCategories…` | optional / admin |
| 52–56 | * | `/api/contactRecommendations…` | JWT / admin |
| 57 | GET | `/api/branding` | None |
| 58 | GET | `/api/geography/meta` | optionalAuth |
| 59–62 | * | `/api/customer/jobCards…` | JWT |
| 63–68 | * | `/api/customer/serviceRequests…` | JWT |
| 69–73 | * | `/api/provider/jobCards…` | JWT provider |
| 74–78 | * | `/api/provider/serviceRequests…` | JWT provider |
| 79–85 | * | `/api/admin/jobCards…` | JWT admin |
| 86–90 | * | `/api/admin/clients…` | JWT admin + Super Admin |
| 91–95 | * | `/api/admin/geography…` | JWT admin |
| 96 | GET | `/api/admin/overview/stats` | JWT admin |
| 97–98 | * | `/api/admin/area-provider-demands…` | JWT admin |

\*Admin registration on `POST /api/auth/register` also requires `ADMIN_REGISTRATION_SECRET`.

**Total REST endpoints documented:** **98** (including health and emit helpers).

---

## Cross-cutting dependencies

| Layer | Modules |
|-------|---------|
| Framework | Express |
| Auth | `middleware/auth.js`, `utils/jwtAuth.js`, `utils/tokenEncryption.js`, `bcryptjs` |
| OTP | `services/twilioVerify.js`, Twilio Verify API |
| MFA | `utils/totp.js`, `otplib`, `qrcode` |
| Data | Mongoose models under `src/models/` |
| Realtime | `realtime/socket.js`, Socket.IO, optional FCM via `utils/notify.js` |
| Uploads | `middleware/upload.js` (multer), disk `uploads/` |
| Validation | `middleware/validate.js`, `express-validator` |
| Errors | `middleware/errorHandler.js` |

---

*As-built API documentation for `homeServicesBackend`. GraphQL sections intentionally empty — the API is REST-only.*
