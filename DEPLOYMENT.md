# HomeServices Backend — Deployment

**Project:** `home-services-backend`  
**Location:** `home-services/homeServicesBackend`  
**Runtime:** Node.js + Express + Mongoose (MongoDB Atlas)  
**Document type:** As-implemented deployment inventory + recommended production patterns where the repo has no config yet

---

## Current Deployment

### What exists in the repo

| Artifact | Status |
|----------|--------|
| Local long-lived process | **Primary** — `npm run start` / `npm run dev` → `src/server.js` on `0.0.0.0:PORT` |
| Vercel serverless | **Configured** — `vercel.json` + `api/index.js` exports Express `app` |
| Docker / Compose | **Not present** |
| AWS (ECS/EKS/EC2/Lambda) IaC | **Not present** |
| NGINX configs | **Not present** |
| CI/CD (GitHub Actions, etc.) | **Not present** |
| `engines` in `package.json` | **Not declared** |

### Local / persistent host (recommended for production sockets)

```bash
cd homeServicesBackend
cp .env.example .env   # fill secrets
npm install
npm run start          # PORT=3001 node src/server.js
```

- Binds **`0.0.0.0`** (LAN / emulator friendly).
- Connects MongoDB via `MONGODB_URI` + `MONGODB_DB_NAME`.
- Attaches **Socket.IO** on the same HTTP server (`/socket.io/`).
- Serves disk uploads at **`/uploads`** (`uploads/provider_documents/`).
- Health: `GET /health`, auth smoke: `GET /api/auth/health`.
- Graceful shutdown on `SIGTERM` / `SIGINT` closes Mongo.

Default script port: **3001**. Code fallback if `PORT` unset: **3000**.

### Vercel serverless (HTTP API only)

```
vercel.json  →  builds api/index.js with @vercel/node
             →  routes /(.*) → api/index.js
api/index.js →  module.exports = require('../src/server')
```

When `VERCEL` / `VERCEL_ENV` is set:

- `startServer()` / `listen()` is **skipped**.
- `connectDB()` runs for connection reuse across invocations.
- **Socket.IO long-lived WebSockets do not work** on Vercel serverless.
- **Local disk uploads are ephemeral** — files under `uploads/` do not survive across instances; use object storage for production docs if staying serverless.

Optional bridge: set `WEBSOCKET_SERVER_URL` so HTTP emit can forward to a legacy/persistent websocket host (see `.env.example` comments).

### Topology (as designed)

```
Clients (Customer / Provider / Admin apps)
        │
        ▼
  API host (Node long-lived  ★ preferred)
        │         └── Socket.IO + /uploads + REST
        ▼
  MongoDB Atlas (MONGODB_URI)

  Alternate: Vercel function ──REST only──► Atlas
             └── optional WEBSOCKET_SERVER_URL bridge
```

---

## Docker

**No Dockerfile or docker-compose exists in this repository.** Below is a recommended starting point for a persistent API container (Socket.IO + uploads).

### Example `Dockerfile` (add to repo when adopting containers)

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src
COPY api ./api
RUN mkdir -p uploads/provider_documents
EXPOSE 3001
USER node
CMD ["node", "src/server.js"]
```

Notes:

- Do **not** bake `.env` into the image; inject at runtime.
- Mount a volume for `uploads/` or switch Multer to S3.
- Healthcheck: `wget -qO- http://127.0.0.1:3001/health` (or equivalent).

### Example `docker-compose.yml` (API only; DB on Atlas)

```yaml
services:
  api:
    build: .
    ports:
      - "3001:3001"
    env_file: .env
    volumes:
      - upload_data:/app/uploads
    restart: unless-stopped

volumes:
  upload_data:
```

MongoDB is expected on **Atlas** (`MONGODB_URI`); a local Mongo service is optional for offline/dev only.

---

## AWS

**No AWS templates (CDK/Terraform/CloudFormation) ship with this project.** Suitable patterns for this app:

| Pattern | Fit | Notes |
|---------|-----|--------|
| **ECS Fargate** + ALB | Best default | Long-lived Node task; sticky sessions or single task for Socket.IO; EFS or S3 for uploads |
| **EC2** + systemd / PM2 | Simple | Same as local `npm start`; pair with NGINX |
| **Elastic Beanstalk** (Docker/Node) | Moderate | Easy env vars; configure WebSocket idle timeouts on load balancer |
| **Lambda + API Gateway** | Poor fit as sole host | Same limits as Vercel: no durable WS, cold starts, ephemeral disk |
| **App Runner** | Possible for REST | Confirm WebSocket support before relying on Socket.IO |

### Suggested AWS building blocks

1. **Compute:** ECS service running the Docker image; desired count ≥ 1; health check path `/health`.
2. **Load balancer:** Application Load Balancer, HTTPS listener (ACM cert), target group port `3001`.
3. **WebSockets:** Enable stickiness on the target group **or** run Socket.IO with a Redis adapter (not in code today — single instance / sticky sessions required).
4. **Data:** MongoDB Atlas in a VPC peering / IP allowlist matching NAT / task egress.
5. **Files:** Move provider documents to **S3** + CloudFront; today’s Multer disk path is not multi-AZ safe.
6. **Secrets:** AWS Secrets Manager or SSM Parameter Store → task definition env (see [Secrets](#secrets)).
7. **Logs:** CloudWatch Logs from container stdout (`morgan` + console).

Legacy note in `.env.example`: a separate **Cloud Run** websocket server may still be referenced via `WEBSOCKET_SERVER_URL` until retired.

---

## NGINX

**No NGINX config is in the repo.** Use NGINX (or ALB) as TLS terminator and reverse proxy in front of Node.

### Example site config

```nginx
upstream homeservices_api {
    server 127.0.0.1:3001;
    keepalive 32;
}

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    # ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    client_max_body_size 10m;   # uploads allow ~8MB in Multer

    location / {
        proxy_pass http://homeservices_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 60s;
    }

    location /socket.io/ {
        proxy_pass http://homeservices_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /uploads/ {
        proxy_pass http://homeservices_api;
        proxy_set_header Host $host;
    }
}
```

HTTP → HTTPS redirect and `limit_req` for `/api/auth/` are recommended but not provided by the app itself.

---

## Environment Variables

### Required for any real environment

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | **Yes** | Atlas (or Mongo) connection string |
| `MONGODB_DB_NAME` | No | Default `home-services` |
| `JWT_SECRET` or `HMAC_JWT_SECRET` | **Yes** | ≥ 32 chars; HS256 signing |
| `TOKEN_ENCRYPTION_KEY` or `ENCRYPTION_KEY` | **Yes** for sessions/MFA/PIN encrypt | Prefer `openssl rand -hex 32` |

### Core runtime

| Variable | Default / notes |
|----------|-----------------|
| `PORT` | Scripts use `3001`; code default `3000` |
| `NODE_ENV` | `development` shows error stacks; use `production` live |
| `CORS_ORIGIN` | Default `*` — set explicit origins in production |
| `VERCEL` / `VERCEL_ENV` | Set by Vercel; skips `listen()` |

### Auth & admin

| Variable | Notes |
|----------|--------|
| `JWT_EXPIRES_IN` | Default `30d` |
| `MFA_TOKEN_EXPIRES_IN` | Default `10m` |
| `SUPER_ADMIN_TOKEN_EXPIRES_IN` | Default `2h` |
| `ADMIN_REGISTRATION_SECRET` | Min 8 chars to allow `role: admin` register |
| `SUPER_ADMIN_PIN` | Seeds Super Admin key if DB empty (default code path also has `7509`) |
| `MFA_ISSUER` | TOTP label (default `Home Services Admin`) |

### Twilio OTP

| Variable | Notes |
|----------|--------|
| `TWILIO_ACCOUNT_SID` | Production SMS |
| `TWILIO_AUTH_TOKEN` | Secret |
| `TWILIO_VERIFY_SERVICE_SID` | Verify service |
| `TWILIO_DEV_MODE` | **Must be `false` in production** |
| `TWILIO_DEV_OTP` | In `.env.example` only; **not read** by current `twilioVerify.js` |

### Optional integrations

| Variable | Notes |
|----------|--------|
| `WEBSOCKET_SERVER_URL` | Remote emit bridge when local Socket.IO unavailable |
| `ENABLE_FIREBASE` | `true` to mint Firebase custom tokens on login |
| `SERVICE_ACCOUNT_KEY_PATH` | Firebase JSON file path |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase JSON string |

Copy template: `.env.example`. Never commit `.env` (listed in `.gitignore`).

---

## CI/CD

**No pipeline files** (`.github/workflows`, GitLab CI, etc.) exist today.

`package.json` scripts:

| Script | Purpose |
|--------|---------|
| `npm run start` | Production-style local start |
| `npm run dev` | Nodemon |
| `npm run check:api` | Smoke against `API_BASE` (default `http://127.0.0.1:3001`) |
| `npm test` | Placeholder — exits 1 (“no test specified”) |

### Recommended minimal GitHub Actions shape

1. **On PR:** `npm ci` → lint (when added) → `npm test` (when real tests exist).
2. **On main:** build Docker image → push to ECR → deploy ECS service **or** `vercel deploy --prod` for serverless API-only.
3. Inject secrets from GitHub Environments / OIDC to AWS — never store production secrets in the repo.
4. Post-deploy: `curl -f https://api.example.com/health` and optionally `npm run check:api` with `API_BASE` set.

Until that exists, deploys are **manual** (`git pull` + restart, or Vercel CLI/dashboard).

---

## Secrets

### Classification

| Secret | Where used | Handling |
|--------|------------|----------|
| `MONGODB_URI` | DB | Atlas user with least privilege; IP allowlist / VPC |
| `JWT_SECRET` / `HMAC_JWT_SECRET` | Token sign/verify | Rotate invalidates all access/MFA/Super Admin JWTs |
| `TOKEN_ENCRYPTION_KEY` | PIN / JWT / TOTP ciphertext | Losing it = cannot decrypt stored fields |
| `ADMIN_REGISTRATION_SECRET` | Admin signup gate | Rotate after provisioning first admins |
| `SUPER_ADMIN_PIN` | Initial Super Admin key seed | Change via `PUT /api/superadmin/key` after elevate; do not leave default |
| Twilio SID/token/service | SMS OTP | Twilio console; restrict Verify service |
| Firebase service account | Optional FCM/custom token | File or JSON env; never in git |

### Practice

- Store production values in **Vercel Environment Variables**, **AWS Secrets Manager / SSM**, or host env — not in source.
- `.env` is gitignored; audit that CI logs never print OTP codes (`TWILIO_DEV_MODE` logs `[OTP DEV]`).
- Prefer separate secrets per environment (dev / staging / prod).
- After JWT or encryption key rotation, plan forced re-login and possible re-enrollment of admin TOTP if ciphertext becomes unreadable.

---

## Production Checklist

### Before go-live

- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGIN` set to real web app origins (not `*`) if browsers send credentials
- [ ] `JWT_SECRET` ≥ 32 random chars; unique per environment
- [ ] `TOKEN_ENCRYPTION_KEY` set (`openssl rand -hex 32`)
- [ ] `MONGODB_URI` points to production Atlas DB; backups enabled
- [ ] `TWILIO_DEV_MODE=false`; Twilio Verify configured and tested
- [ ] `ADMIN_REGISTRATION_SECRET` set; disable or rotate after bootstrap
- [ ] Super Admin key changed from default / env seed
- [ ] Admin accounts use TOTP MFA
- [ ] HTTPS via NGINX, ALB, or platform TLS
- [ ] `/health` monitored; alerting on 5xx / Mongo disconnects
- [ ] Host is **long-lived** if Socket.IO is required (not Vercel-only)
- [ ] Upload strategy: persistent volume or S3 (not ephemeral serverless disk)
- [ ] Clients’ API base URL and `SOCKET_URL` point at production host (no `/api` on socket URL)
- [ ] Error stacks not exposed (`NODE_ENV≠development`)
- [ ] Rate limiting at edge (NGINX/WAF) for `/api/auth/*` — app has little brute-force protection
- [ ] Confirm no production use of `register-pin` without OTP if SMS proof is required

### After deploy

- [ ] `GET /health` → 200
- [ ] `GET /api/auth/health` → routes listed
- [ ] Customer PIN login + provider login
- [ ] Admin password + MFA
- [ ] Create service request → provider accept (if sockets: realtime event)
- [ ] Provider document upload persists and is reachable under `/uploads/...`
- [ ] Atlas metrics: connections within tier limits (`maxPoolSize: 10` per process)

### Rollback

- Redeploy previous image/commit; keep Mongo compatible (no destructive migrations in-repo today).
- JWT secret rollback restores old tokens only if the previous secret is restored.

---

## Scaling Strategy

### Current constraints (as implemented)

| Constraint | Impact |
|------------|--------|
| In-memory OTP store (`TWILIO_DEV_MODE`) | Breaks under multi-instance; use real Twilio in prod |
| In-memory Super Admin elevate rate limit | Per-process only |
| Socket.IO without Redis adapter | Multi-instance WS needs sticky sessions or single writer |
| Multer local disk | Not shared across replicas |
| Mongoose `maxPoolSize: 10` | Each Node process opens its own pool — watch Atlas connection caps |
| Stateless JWT (no denylist) | Horizontal scale of API is easy; revocation is not |
| Serverless (Vercel) | Scales HTTP; not WS; cold starts + many short-lived DB connections |

### Phase 1 — Vertical / single durable host

Run one Node process (or one container) behind NGINX/ALB. Sufficient for early production with Socket.IO and disk uploads on a mounted volume.

### Phase 2 — Horizontal API, careful realtime

1. Scale REST replicas behind ALB.
2. Keep Socket.IO on sticky sessions **or** extract realtime to one dedicated service (`WEBSOCKET_SERVER_URL` pattern).
3. Move uploads to **S3**; store URLs on `Provider.documents`.
4. Ensure Twilio Verify (not in-memory OTP).
5. Cap Atlas connections: `instances × maxPoolSize` under cluster limit; consider serverless-friendly pooling if returning to Vercel.

### Phase 3 — Hardening at scale

1. Add Redis (or equivalent) for Socket.IO adapter + rate limits + optional JWT denylist.
2. CDN for static branding assets; CloudFront for document downloads.
3. Read replicas / aggregation offload for admin overview heavy `$group` queries.
4. CI/CD with canary or blue-green on ECS.
5. WAF + auth endpoint throttling; shorter `JWT_EXPIRES_IN` + refresh tokens (not built yet — see `AUTHENTICATION.md`).

### Capacity heuristics

| Signal | Action |
|--------|--------|
| Atlas connection spikes | Reduce replicas, lower pool size, or use Atlas private endpoint |
| Socket disconnect storms | Sticky sessions / dedicated WS host / adapter |
| Upload 404s after deploy | Ephemeral disk — migrate to object storage |
| Admin overview slow | Pre-aggregate or cache stats (see `DATABASE_DOCUMENTATION.md`) |

---

## Quick commands

```bash
# Local
npm run dev
npm run start
API_BASE=http://127.0.0.1:3001 npm run check:api

# Vercel (if CLI installed; project linked)
vercel --prod

# Health
curl -sS https://api.example.com/health
```

---

## Related docs

- `BACKEND_ARCHITECTURE.md` — runtime layout, Socket.IO, env inventory  
- `AUTHENTICATION.md` — JWT / OTP / roles  
- `DATABASE_DOCUMENTATION.md` — Atlas collections & scaling notes  
- `API_DOCUMENTATION.md` — endpoint contract  
- `.env.example` — starter env template  

---

*As-implemented: local Node + optional Vercel. Docker, AWS, NGINX, and CI/CD sections describe recommended production patterns not yet checked into this repository.*
