# HomeServices Backend — Database Documentation

**Project:** `home-services-backend`  
**Location:** `home-services/homeServicesBackend`  
**ODM:** Mongoose  
**Database:** MongoDB (`MONGODB_DB_NAME`, default `home-services`)  
**Connection:** `src/config/database.js` (`maxPoolSize: 10`)  
**Document type:** As-implemented inventory from `src/models/*` and controller query usage

---

## Overview

All persistence goes through the backend. Client apps never connect to MongoDB.

| Property | Value |
|----------|--------|
| ID style | Mostly **string** `_id` (Firebase migration legacy). `ServiceRequest._id` is `Mixed`. `ContactRecommendation` and `AreaProviderDemand` use default ObjectIds unless set. |
| Relationships | Almost entirely **soft references** (plain string IDs). Only `RoleChangeLog` declares Mongoose `ref: 'User'` (still string IDs; no populate-heavy design). |
| Timestamps | Mostly manual `createdAt` / `updatedAt`. Exception: `AreaProviderDemand` uses Mongoose `{timestamps: true}`. |
| Geospatial | **No** `2dsphere` / GeoJSON indexes. Matching is district id/name, city, or pincode. |
| TTL indexes | **None** on any collection (see [TTL Collections](#ttl-collections)). |

---

## Collections

Explicit collection names are passed as the third argument to `mongoose.model(...)`.

| Collection | Model file | Purpose |
|------------|------------|---------|
| `users` | `User.js` | Customers, providers (auth profile), admins. Auth secrets (`pinHash`, `pinKey`, `passwordHash`, TOTP, encrypted tokens) live here with `select: false`. |
| `providers` | `Provider.js` | Provider operational profile. Same `_id` as the linked `users` document when role is provider. |
| `serviceRequests` | `ServiceRequest.js` | Customer booking / open request (broadcast or targeted). |
| `jobCards` | `JobCard.js` | Work order after accept / admin assignment. |
| `reviews` | `Review.js` | Post-job ratings; updates denormalized provider `rating` / `totalReviews`. |
| `serviceCategories` | `ServiceCategory.js` | Catalog of service types + optional questionnaire. |
| `clients` | `Client.js` | White-label client name + full `themeColors` palette. |
| `states` | `State.js` | India geography — states. |
| `districts` | `District.js` | Districts under a state (`stateId`). |
| `contactRecommendations` | `ContactRecommendation.js` | User-referred provider leads for admin follow-up. |
| `areaProviderDemands` | `AreaProviderDemand.js` | “No providers in area” demand signals for admin. |
| `systemConfig` | `SystemConfig.js` | Singleton (`_id: "global"`): Super Admin PIN hash, `activeClientId`. |
| `roleChangeLogs` | `RoleChangeLog.js` | Audit trail when an admin changes a user’s role. |

There are **no** separate collections for OTP codes, sessions, FCM queues, or payments. OTP TTL is in-process / Twilio Verify, not MongoDB.

---

## Indexes

Indexes below are declared on schemas (single-field `index: true` and compound `.index(...)`). MongoDB also maintains the default `_id` unique index.

### `users`

| Index | Notes |
|-------|--------|
| `{ pinKey: 1 }` unique sparse | Global PIN uniqueness (HMAC), not used for auth verify |
| `{ isActive: 1 }` | Soft-deactivate filter |
| `{ email: 1 }` | Login / lookup |
| `{ phoneNumber: 1 }` | Primary phone login |
| `{ role: 1 }` | Role filters |

### `providers`

| Index | Notes |
|-------|--------|
| `{ isActive: 1 }` | Soft-deactivate |
| `{ approvalStatus: 1 }` | Admin queues |
| `{ serviceCategories: 1 }` | Multikey array |
| `{ isOnline: 1 }` | Online filter |
| `{ isOnline: 1, approvalStatus: 1 }` | Online + approved matching |
| `{ rating: -1 }` | Sort / ranking |
| `{ 'location.city': 1 }` | Area matching |
| `{ 'location.state': 1 }` | Area matching |
| `{ 'location.pincode': 1 }` | Pincode matching |
| `{ 'location.stateId': 1 }` | Overview / geography |
| `{ 'location.districtId': 1 }` | Primary district match |

**Not indexed (queried in app):** `address.districtId`, `address.pincode`, `address.city` — used in `$or` with `location.*` in `findProvidersInArea`.

### `serviceRequests`

| Index | Notes |
|-------|--------|
| `{ customerId: 1 }` | Ownership lists |
| `{ serviceType: 1 }` | Type filters |
| `{ status: 1 }` | Status filters |
| `{ needsAdminAssignment: 1 }` | Admin attention |
| `{ createdAt: 1 }` | Time sorts |
| `{ customerId: 1, createdAt: -1 }` | Customer history |
| `{ customerId: 1, status: 1 }` | Customer by status |
| `{ status: 1, createdAt: -1 }` | Admin / feed |
| `{ serviceType: 1, status: 1 }` | Open-by-type |

**Not indexed (queried in app):** `customerAddress.districtId`, `customerAddress.pincode`, `providerId`, `declinedProviders.providerId` — used by provider open-request polling.

### `jobCards`

| Index | Notes |
|-------|--------|
| `{ providerId: 1 }` | Provider lists |
| `{ customerId: 1 }` | Customer lists |
| `{ serviceRequestId: 1 }` | Link back to request |
| `{ needsAdminAssignment: 1 }` | Unassigned / admin queue |
| `{ status: 1 }` | Status filters |
| `{ createdAt: 1 }` | Time sorts |
| `{ customerId: 1, createdAt: -1 }` | Customer history |
| `{ providerId: 1, createdAt: -1 }` | Provider history |
| `{ customerId: 1, status: 1 }` | Customer by status |
| `{ providerId: 1, status: 1 }` | Provider by status |
| `{ providerId: 1, status: -1, createdAt: -1 }` | Provider dashboard |
| `{ customerId: 1, status: -1, createdAt: -1 }` | Customer dashboard |
| `{ status: 1, createdAt: -1 }` | Admin lists |

### `reviews`

| Index | Notes |
|-------|--------|
| `{ jobCardId: 1 }` | Lookup by job |
| `{ customerId: 1 }` | Customer reviews |
| `{ providerId: 1 }` | Provider reviews |
| `{ rating: 1 }` | Rating filters |
| `{ createdAt: 1 }` | Time sorts |
| `{ providerId: 1, createdAt: -1 }` | Provider feed |
| `{ customerId: 1, createdAt: -1 }` | Customer feed |
| `{ jobCardId: 1, customerId: 1 }` **unique** | One review per job per customer |

### `serviceCategories`

| Index | Notes |
|-------|--------|
| `{ isActive: 1, name: 1 }` | Active catalog |

### `states`

| Index | Notes |
|-------|--------|
| `{ name: 1 }` | Field + **unique** compound on name |
| `{ isActive: 1 }` | Active filter |
| `{ name: 1 }` unique | Enforce unique state names |

### `districts`

| Index | Notes |
|-------|--------|
| `{ name: 1 }` | Lookup |
| `{ stateId: 1 }` | Children of state |
| `{ isActive: 1 }` | Active filter |
| `{ stateId: 1, name: 1 }` **unique** | Unique district name per state |

### `contactRecommendations`

| Index | Notes |
|-------|--------|
| `{ recommendedBy: 1 }` | Referrer history |
| `{ status: 1 }` | Admin queues |
| `{ serviceType: 1 }` | Type filter |
| `{ createdAt: -1 }` | Newest first |

### `areaProviderDemands`

| Index | Notes |
|-------|--------|
| `{ customerId: 1 }` | Per customer |
| `{ serviceType: 1 }` | Type |
| `{ pincode: 1 }` | Area |
| `{ status: 1 }` | Open / resolved |
| `{ serviceType: 1, pincode: 1, status: 1 }` | Demand clustering |
| `{ createdAt: -1 }` | Newest first |

### `roleChangeLogs`

| Index | Notes |
|-------|--------|
| `{ userId: 1 }` | Subject |
| `{ changedBy: 1 }` | Actor |
| `{ changedAt: 1 }` | Time |
| `{ userId: 1, changedAt: -1 }` | History for user |
| `{ changedBy: 1, changedAt: -1 }` | History by admin |
| `{ changedAt: -1 }` | Global audit |

### `clients` / `systemConfig`

No secondary indexes beyond `_id`. `systemConfig` is a singleton document.

---

## Relationships

Logical ER (soft references unless noted):

```
states 1 ─── * districts          (districts.stateId → states._id)
users  1 ─── 1 providers          (same _id when user.role === 'provider')
users  1 ─── * serviceRequests    (serviceRequests.customerId)
users  1 ─── * jobCards           (jobCards.customerId)
providers 1 ── * serviceRequests  (optional serviceRequests.providerId)
providers 1 ── * jobCards         (jobCards.providerId)
serviceRequests 0..1 ── 0..1 jobCards  (jobCards.serviceRequestId)
jobCards 1 ── 0..1 reviews        (reviews.jobCardId; unique with customerId)
providers 1 ── * reviews          (reviews.providerId)
users 1 ── * reviews              (reviews.customerId)
users 1 ── * contactRecommendations (recommendedBy)
users 1 ── * areaProviderDemands  (customerId)
users 1 ── * roleChangeLogs       (userId, changedBy)  [Mongoose ref: User]
serviceCategories ── referenced by name/string on providers & requests (not FK)
clients ← systemConfig.activeClientId
```

### Cardinality & ownership notes

| Link | Rule in practice |
|------|------------------|
| User ↔ Provider | **1:1 by shared `_id`**. Creating/promoting a provider writes both collections. |
| ServiceRequest → JobCard | Created when a provider accepts or admin assigns; `serviceRequestId` / denormalized customer fields copied. |
| JobCard → Review | At most one review per `(jobCardId, customerId)`. Completing a job does not auto-create a review. |
| Geography | Providers/users store both display names (`state`, `district`) and ids (`stateId`, `districtId`). District docs denormalize `stateName`. |
| Catalog | `serviceType` / `serviceCategories` are **strings**, not ObjectId refs to `serviceCategories`. |

### Denormalization

Heavily denormalized for read speed and Firebase-era payloads:

- Request / job card copy `customerName`, `customerPhone`, address snapshot, and often provider name/phone/rating/image at assign time.
- `districts.stateName` mirrors parent state.
- Provider `rating` / `totalReviews` updated when reviews are written (not computed only via aggregation at read time).

Stale denormalized fields are possible if profile data changes after booking.

---

## Referenced Collections

“Referenced” = another document’s `_id` (or string key) stored as a field. **No cascading deletes** are implemented in schemas.

| From | Field(s) | To | Style |
|------|----------|-----|--------|
| `districts` | `stateId` | `states` | Soft string |
| `providers` | `_id` | `users` | Shared PK |
| `serviceRequests` | `customerId`, `providerId` | `users` / `providers` | Soft string |
| `jobCards` | `customerId`, `providerId`, `serviceRequestId` | `users` / `providers` / `serviceRequests` | Soft string |
| `reviews` | `jobCardId`, `customerId`, `providerId` | `jobCards` / `users` / `providers` | Soft string |
| `contactRecommendations` | `recommendedBy` | `users` | Soft string |
| `areaProviderDemands` | `customerId` | `users` | Soft string |
| `roleChangeLogs` | `userId`, `changedBy` | `users` | Soft string + `ref: 'User'` |
| `systemConfig` | `activeClientId` | `clients` | Soft string |
| `users` / `providers` / addresses | `stateId`, `districtId` | `states` / `districts` | Soft string |
| Requests / providers | `serviceType`, `serviceCategories[]` | `serviceCategories` by **name/id string** | Soft, not enforced |

There is **no** `$lookup`-based join layer in the API; controllers issue separate finds or parallel aggregations.

---

## Embedded Collections

Subdocuments / nested objects stored **inside** parent documents (not separate Mongo collections).

| Parent | Embedded path | Shape / notes |
|--------|---------------|---------------|
| `users` | `location` | Flat geo + address fields |
| `users` | `homeAddress`, `officeAddress` | Structured saved addresses |
| `users` | `serviceAddresses[]` | Extra labeled addresses (`id`, label, geo, timestamps) |
| `providers` | `location`, `address`, `currentLocation` | Service area + live location |
| `providers` | `documents` | URL + verify/reject flags for id/address/certificate |
| `providers` | `photos[]` | String URLs |
| `serviceRequests` | `customerAddress` | Snapshot at booking |
| `serviceRequests` | `providerAddress` | Mixed |
| `serviceRequests` | `declinedProviders[]` | `{ providerId, name, phone, reason, declinedAt }` |
| `serviceRequests` | `questionnaireAnswers`, `photos[]` | Mixed / string array |
| `jobCards` | `customerAddress`, `providerAddress` | Snapshots |
| `jobCards` | `comments[]` | Thread: `{ _id, role, authorId, authorName, text, createdAt }` |
| `jobCards` | `questionnaireAnswers`, `materialsUsed` | Mixed |
| `reviews` | `photos[]` | String URLs |
| `serviceCategories` | `questionnaire` | Array (question defs) |
| `clients` | `themeColors` | Nested schema (`_id: false`), full palette |

These embeds grow unbounded for `comments`, `declinedProviders`, and `serviceAddresses` — see [Future Scaling Concerns](#future-scaling-concerns).

---

## TTL Collections

**No MongoDB TTL indexes** (`expireAfterSeconds`) exist on any schema.

| Concern | How expiry works today |
|---------|------------------------|
| SMS / PIN OTP | In-memory map + Twilio Verify (`OTP_TTL_MS` ≈ 5 minutes) in `src/services/twilioVerify.js` — **not** a collection |
| JWT / MFA / Super Admin tokens | Client-held JWTs with `expiresIn` env vars — **not** stored as session docs (optional `encryptedAuthToken` on user is not TTL-indexed) |
| Soft-deleted users/providers | `isActive: false` + metadata; documents **retained** indefinitely |

If TTL cleanup is needed later (e.g. ephemeral OTPs, audit retention), new collections or indexes would be required; nothing is auto-purged by Mongo today.

---

## Aggregation Pipelines

All `$aggregate` usage is in admin analytics / geography helpers. There are **no** `$lookup` stages in production pipelines.

### 1. Growth trend (daily buckets)

**File:** `src/controllers/admin/overviewController.js` → `buildGrowthTrend`

| Pipeline | Stages | Purpose |
|----------|--------|---------|
| `Provider` | `$match` (`createdAt` range) → `$group` by `$dateToString` day → count | New providers / day |
| `User` | `$match` (`role: customer`, `createdAt` range) → `$group` by day | New customers / day |
| `JobCard` | `$match` (`createdAt` range) → `$group` by day | New jobs / day |

### 2. Overview stats (`GET /api/admin/overview/stats`)

| Pipeline | Stages | Purpose |
|----------|--------|---------|
| `Provider` | `$group` by `approvalStatus` | Pending / approved / rejected counts |
| `JobCard` | `$group` by `status` | Job status histogram |
| `Provider` | `$group` by `serviceType` → `$sort` → `$limit: 20` | Top service types among providers |
| `JobCard` | `$group` by `serviceType` → `$sort` → `$limit: 20` | Top service types among jobs |
| `Provider` | `$match` has `location.stateId` → `$group` by `stateId` | Providers per state |
| `User` | `$match` customer with home/location `stateId` → `$project` preferred sid → `$match` → `$group` | Customers per state |
| `JobCard` | `$match` top-level `stateId` → `$group` by `{ stateId, status }` | Jobs per state/status |

**Schema note:** `JobCard` stores geography under `customerAddress.stateId` / `customerAddress.districtId`, not top-level `stateId`. The overview job-by-state / district pipelines that match top-level `stateId` / `districtId` may return empty until those paths are aligned or data is dual-written.

### 3. District rows (when `stateId` query set)

Same controller: providers grouped by `location.districtId`; customers projected to `homeAddress.districtId` \| `location.districtId`; job cards grouped by `{ districtId, status }` (again top-level path).

### 4. Geography provider job stats

**File:** `src/controllers/admin/geographyController.js` → `jobStatsForProviderIds`

```
JobCard.aggregate([
  { $match: { providerId: { $in: providerIds } } },
  { $group: { _id: '$status', count: { $sum: 1 } } },
])
```

Used to attach per-provider / area job counters without loading all job documents.

---

## Frequently Used Queries

Patterns seen across controllers and `src/utils/findProvidersInArea.js`.

### Auth & identity

| Pattern | Collection | Typical filter |
|---------|------------|----------------|
| Login by phone | `users` | `{ phoneNumber }` (+ `pinHash` / role checks) |
| PIN uniqueness | `users` | `{ pinKey }` (unique sparse) |
| Session user | `users` | `findById(uid)` |
| Provider gate | `providers` | `findById` + `approvalStatus`, `isOnline`, `isActive` |

### Matching providers to a booking

```
providers: approvalStatus=approved, isOnline=true, isAvailable≠false, isActive≠false
  AND service type ∈ {serviceCategories | specialization | serviceType} (case-insensitive)
  AND geo: location|address districtId / district|city name OR pincode
  Fallback pincode also OR _id ∈ users(role=provider, location.pincode)
```

### Customer booking lists

| Pattern | Filter / sort |
|---------|----------------|
| My requests | `{ customerId }` sort `createdAt: -1` |
| My jobs | `{ customerId }` (+ optional `status`) |
| Get one request | Flexible `_id` (string / Mixed) via `findServiceRequestFlexible` |

### Provider work queues

| Pattern | Filter |
|---------|--------|
| My jobs | `{ providerId, status? }` sort `createdAt` |
| Nearby open requests | `serviceRequests`: `status: pending`, empty `providerId`, matching `serviceType` + `customerAddress` geo, exclude `declinedProviders.providerId`, `limit: 10` |

### Admin

| Pattern | Filter |
|---------|--------|
| Pending providers | `{ approvalStatus: 'pending' }` |
| Needs assignment | `jobCards` / `serviceRequests` `{ needsAdminAssignment: true }` |
| Open area demand | `areaProviderDemands` `{ status: 'open' }` (+ serviceType/pincode) |
| Geography tree | `states` active → `districts` by `stateId` → `providers` by `location.districtId` |
| Branding | `systemConfig` `_id: 'global'` → `clients` by `activeClientId` |

### Reviews

| Pattern | Filter |
|---------|--------|
| Create | Insert + unique `(jobCardId, customerId)`; then update provider aggregates |
| List by provider | `{ providerId }` sort `createdAt: -1` |

---

## Future Scaling Concerns

Observations from the current schema and query shape (not a roadmap commitment):

1. **No geospatial index**  
   District/pincode `$or` + regex name matching will degrade as `providers` grows. Consider GeoJSON + `2dsphere`, or strict id-only matching with covering indexes on `address.districtId` / `address.pincode`.

2. **Missing indexes on hot paths**  
   Provider polling hits `customerAddress.districtId` / `pincode` and `declinedProviders.providerId` without dedicated indexes. `address.*` on providers is queried but only `location.*` is indexed.

3. **String / Mixed IDs**  
   Custom string `_id`s and Mixed request ids complicate pagination, sharding keys, and type-safe clients. Prefer consistent ObjectId or ULID going forward for new collections.

4. **Denormalization drift**  
   Names, phones, and ratings copied onto requests/jobs can diverge from `users` / `providers`. High-churn profiles need refresh rules or read-time join for critical fields.

5. **Unbounded embeds**  
   `jobCards.comments`, `serviceRequests.declinedProviders`, and `users.serviceAddresses` can grow without archive. Large documents hurt WiredTiger cache and update cost; consider side collections past a threshold.

6. **Overview aggregations vs schema**  
   Job geography aggregations expecting top-level `stateId` / `districtId` won’t scale correctly until field paths match stored documents (or a migration adds those fields).

7. **Full collection scans for analytics**  
   `$group` without `$match` on approval/status/serviceType runs over all providers/jobs. At scale, pre-aggregated counters or a warehouse/materialized daily rollup is safer than live `$group` on every admin dashboard load.

8. **Connection pool**  
   `maxPoolSize: 10` fits a single Node process; serverless (Vercel) multi-instance cold starts multiply connections to Atlas — watch Atlas connection limits and prefer pooled serverless-friendly drivers/settings.

9. **No TTL / retention**  
   Audit logs, demands, declined-provider history, and deactivated accounts accumulate forever. Define retention for `roleChangeLogs`, resolved `areaProviderDemands`, and soft-deleted users before volume becomes costly.

10. **Service type as free string**  
    Matching relies on regex equality across multiple fields. Catalog renames break historical requests; a stable `categoryId` FK would scale better than name strings.

11. **User + Provider dual write**  
    Shared `_id` across two collections requires transactional or carefully ordered writes; under load, partial creates leave orphan profiles. Multi-document transactions or a single “account” collection with role-specific embeds would reduce inconsistency risk.

12. **Multikey `serviceCategories`**  
    Array index helps, but providers with many categories inflate index size; cap array length and keep category ids short.

---

## Quick reference — model → collection

```
User                  → users
Provider              → providers
ServiceRequest        → serviceRequests
JobCard               → jobCards
Review                → reviews
ServiceCategory       → serviceCategories
Client                → clients
State                 → states
District              → districts
ContactRecommendation → contactRecommendations
AreaProviderDemand    → areaProviderDemands
SystemConfig          → systemConfig
RoleChangeLog         → roleChangeLogs
```

---

*Generated from `src/models/*.js`, `src/config/database.js`, `src/utils/findProvidersInArea.js`, and admin aggregation controllers. Aligns with `BACKEND_ARCHITECTURE.md` and `API_DOCUMENTATION.md`.*
