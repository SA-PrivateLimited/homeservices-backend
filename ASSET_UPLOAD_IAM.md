# Akanso Backend — Asset upload (IAM role + CloudFront)

How Akanso uploads photos and documents to S3 using an **EC2 instance IAM role**, with a private bucket and canonical CDN URLs on `assets.akanso.in`.

---

## Production AWS (source of truth)

| Resource | Value |
|----------|--------|
| S3 bucket | `akanso-assets` (private, Block Public Access ON) |
| Region | `eu-north-1` |
| CloudFront distribution | `E358TLQK8ZSI5K` |
| Distribution hostname | `dpyk9otyl50r.cloudfront.net` |
| **Canonical CDN** | `assets.akanso.in` → that distribution |

App-generated URLs must always be:

```text
https://assets.akanso.in/<object-key>
```

Never persist raw S3 URLs. Prefer never persisting `*.cloudfront.net` either — use the custom domain only.

S3 origin access: CloudFront **OAC** (bucket stays private). Do not add `Principal: "*"`.

---

## Summary

| Concern | Approach |
|---------|----------|
| **Runtime credentials** | EC2 **instance IAM role** via SDK default chain (IMDS) |
| **Primary upload path** | Browser → **presigned S3 PUT** (API only signs the URL) |
| **Public URLs** | `https://assets.akanso.in/<key>` via `AWS_CLOUDFRONT_DOMAIN` |
| **Static keys** | **Forbidden in production** (hard error). Env keys override IMDS in the SDK — do not set them. |
| **Deploy-time IAM** | GitHub OIDC → `AkansoApiDeployRole` (CI only, not uploads) |

---

## Two IAM roles (do not confuse)

```text
GitHub Actions  --OIDC-->  AkansoApiDeployRole   (deploy / CORS / SSM)
API on EC2      --IMDS-->  EC2 instance IAM role (presign / PutObject / Delete)
```

Runtime S3 permissions used by the API (scope to `akanso-assets`):

- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`
- `s3:HeadObject`

Avoid `s3:ListBucket` unless a future feature needs it.

---

## Primary flow: browser → S3 (presigned PUT)

```text
Browser  --JWT-->  POST /api/assets/upload-url
API (instance role) signs PutObject
Browser  --PUT-->  S3 (presigned URL, Content-Type only)
Browser saves https://assets.akanso.in/<key> on domain APIs
```

- TTL default **900s** (clamped 60–3600)
- Client never chooses the object key
- S3 PUT does **not** carry the user JWT

Frontend helpers: `assetsApi.ts` in CustomerWeb / ProviderWeb.

---

## Secondary: API → S3 (multipart proxy)

Still supported for admin/legacy:

- `POST /api/admin/clients/:clientId/logo`
- `POST /api/providers/:providerId/documents/:docKey`
- `POST /api/users/me/profile-image`
- `POST /api/providers/me/profile-image`

Same instance IAM role via `s3.uploadFile()`.

---

## Local / dev

`NODE_ENV !== production` and `AWS_S3_LOCAL_FALLBACK=true` → local `PUT /api/assets/direct-upload/<token>`.

Otherwise use `AWS_PROFILE` / SSO. Production must never enable local fallback.

---

## Object keys

Allowed roots: `admin`, `bookings`, `categories`, `customers`, `providers`, `services`, `temp`.

Examples:

```text
customers/{uid}/service-requests/pending/{uuid}.jpg
providers/{uid}/showcase/{uuid}.webp
providers/{uid}/documents/{docKey}/{uuid}.pdf
services/branding/{clientId}/logo/{uuid}.png
```

Ownership: `customers/{uid}/…`, `providers/{uid}/…` (admins: any allowed prefix).

---

## Sensitive vs public assets (important)

**API authorization** already strips `documents` from public provider browse payloads (`PUBLIC_PROVIDER_STRIP_FIELDS` in `contactAccess.js`).

**Remaining risk:** KYC / document objects still receive a normal `https://assets.akanso.in/...` URL after upload. Anyone who obtains that URL can fetch the object if CloudFront serves the whole bucket publicly (typical with OAC + open distribution behaviors).

| Class | Examples | Current behavior |
|-------|----------|------------------|
| Normal CDN | showcase, profile, categories, branding | Canonical CloudFront URL OK when product allows |
| Sensitive | `…/documents/…`, `bookings/…` | Marked `sensitive: true` on upload-url; **still stored as CDN URLs** |

**Recommendation (not yet implemented):** authenticated API download or CloudFront signed URLs / separate private distribution for `providers/*/documents/*` and booking docs. Do not “fix” privacy by making the S3 bucket public.

Helper: `isSensitiveObjectKey()` in `src/utils/s3Keys.js`.

---

## CORS

Source: `ops/s3-bucket-cors.json` (applied by deploy workflow).

Includes production origins for `akanso.in`, `customer.akanso.in`, `partner.akanso.in`, `provider.akanso.in`, `admin.akanso.in`, plus local Vite ports. No `AllowOrigin: "*"`.

Re-apply to the bucket after changing the file (deploy job or console).

---

## Checksums

```js
new S3Client({
  region,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
```

Required so browser presigned PUTs are not broken by empty-body CRC signing.

---

## Env vars

| Variable | Role |
|----------|------|
| `AWS_REGION` | `eu-north-1` |
| `AWS_S3_BUCKET` | `akanso-assets` |
| `AWS_CLOUDFRONT_DOMAIN` | `assets.akanso.in` (canonical; never `*.cloudfront.net`) |
| `AWS_CLOUDFRONT_DISTRIBUTION_HOSTNAME` | Optional; parse legacy distribution URLs only |
| `AWS_S3_LOCAL_FALLBACK` | Dev-only local disk |
| `AWS_PROFILE` | Local SSO |
| `MAX_IMAGE_SIZE_MB` / `MAX_DOCUMENT_SIZE_MB` | Defaults 5 / 8 |
| `UPLOAD_TOKEN_SECRET` | Local direct-upload HMAC |

**Do not set in production:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

**CI only:** `AWS_ROLE_ARN` / `AWS_API_DEPLOY_ROLE_ARN`.

---

## Key source files

| File | Role |
|------|------|
| `src/services/s3.service.js` | S3 client, IAM rules, presign, PutObject, CDN URLs |
| `src/controllers/assetsController.js` | upload-url, direct-upload, delete, purpose authz |
| `src/routes/assets.js` | `/api/assets/*` |
| `src/utils/s3Keys.js` | Keys, ownership, sensitive detection |
| `src/utils/assetValidation.js` | MIME / size / magic bytes |
| `src/utils/normalizeAssetPhotos.js` | Persist canonical CDN URLs |
| `ops/s3-bucket-cors.json` | Browser PUT CORS |

---

## Operator checklist

1. EC2 instance profile has S3 permissions on `akanso-assets` only.
2. No static AWS keys in production env (API fails closed if present).
3. Bucket private + Block Public Access ON; CloudFront OAC only.
4. DNS: `assets.akanso.in` → distribution `E358TLQK8ZSI5K`.
5. `AWS_CLOUDFRONT_DOMAIN=assets.akanso.in`.
6. CORS matches `ops/s3-bucket-cors.json`.
7. Plan signed/authenticated access for KYC documents (see Sensitive section).
