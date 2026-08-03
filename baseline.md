# baseline.md — API conventions (homeServicesBackend)

## Response shape (preferred)
```json
{ "success": true, "data": {}, "message": "..." }
```
Errors via `errorHandler` middleware with consistent status codes.

## Auth
- JWT Bearer tokens for protected routes
- Role boundaries: customer | provider | admin route trees

## Naming
- Controllers/routes grouped by app: `customer/`, `provider/`, `admin/`, `shared/`
- Models: singular Mongoose model names matching collections

## Docs
- Update `BACKEND_API.md` and Postman collection when adding endpoints
