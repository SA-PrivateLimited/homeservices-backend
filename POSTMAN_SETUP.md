# Postman Collection Setup Guide

This guide explains how to import and use the Home Services Backend API Postman collection.

## 📦 Files Included

1. **HomeServices-Backend-API.postman_collection.json** - Main Postman collection with all API endpoints
2. **Postman-Environment-Template.postman_environment.json** - Environment template for variables

## 🚀 Quick Start

### Step 1: Import Collection

1. Open Postman
2. Click **Import** button (top left)
3. Select **HomeServices-Backend-API.postman_collection.json**
4. Click **Import**

### Step 2: Import Environment Template (Optional)

1. Click **Import** button
2. Select **Postman-Environment-Template.postman_environment.json**
3. Click **Import**
4. Select the environment from the dropdown (top right)
5. Update `base_url` if needed (default: `http://localhost:3000`)

### Step 3: Set Authentication Token

To use authenticated endpoints:

1. Login via your app (HomeServices, HomeServicesProvider, or HomeServicesAdmin)
2. Get the Firebase Auth token from the app
3. In Postman, set the `auth_token` environment variable:
   - Click on the environment dropdown (top right)
   - Select **Home Services API Environment**
   - Click **Edit** (eye icon)
   - Set `auth_token` value to your Firebase Auth token
   - Click **Save**

Alternatively, you can set it per-request:
- Go to any request
- **Authorization** tab
- Select **Bearer Token**
- Enter your token

## 📋 Collection Structure

The collection is organized into the following folders:

### 1. Health Check
- `GET /health` - Check API server status

### 2. Users
- `GET /api/users/me` - Get current user profile
- `POST /api/users/me` - Create or update user (upsert)
- `PUT /api/users/me` - Update current user profile
- `PUT /api/users/:userId/fcmToken` - Update FCM token
- `GET /api/users/:userId` - Get user by ID
- `GET /api/users` - Get all users (admin only)

### 3. Providers
- `GET /api/providers` - Get all providers (public)
- `GET /api/providers/:providerId` - Get provider by ID (public)
- `PUT /api/providers/me` - Update provider profile (provider only)
- `PUT /api/providers/me/status` - Update provider online/offline status
- `PUT /api/providers/:providerId/approval` - Approve/reject provider (admin only)

### 4. Reviews
- `GET /api/reviews` - Get all reviews (public)
- `GET /api/reviews/:reviewId` - Get review by ID (public)
- `POST /api/reviews` - Create review (customer only)
- `PUT /api/reviews/:reviewId` - Update review (customer only)
- `DELETE /api/reviews/:reviewId` - Delete review (admin or customer)

### 5. Service Categories
- `GET /api/serviceCategories` - Get all categories (public)
- `GET /api/serviceCategories/:categoryId` - Get category by ID (public)
- `POST /api/serviceCategories` - Create category (admin only)
- `PUT /api/serviceCategories/:categoryId` - Update category (admin only)
- `DELETE /api/serviceCategories/:categoryId` - Delete category (admin only)

### 6. Customer Job Cards
- `GET /api/customer/jobCards` - Get customer's job cards
- `GET /api/customer/jobCards/:jobCardId` - Get customer's job card by ID
- `PUT /api/customer/jobCards/:jobCardId/cancel` - Cancel job card

### 7. Provider Job Cards
- `GET /api/provider/jobCards` - Get provider's job cards
- `GET /api/provider/jobCards/:jobCardId` - Get provider's job card by ID
- `POST /api/provider/jobCards` - Create job card (provider only)
- `PUT /api/provider/jobCards/:jobCardId/status` - Update job card status

### 8. Admin Job Cards
- `GET /api/admin/jobCards` - Get all job cards (admin only)
- `GET /api/admin/jobCards/:jobCardId` - Get job card by ID (admin only)
- `PUT /api/admin/jobCards/:jobCardId` - Update job card (admin only)
- `DELETE /api/admin/jobCards/:jobCardId` - Delete job card (admin only)

## 🔐 Authentication

Most endpoints require authentication via Firebase Auth Bearer token:

**Header:**
```
Authorization: Bearer <firebase-auth-token>
```

**Public Endpoints** (no authentication required):
- `GET /health`
- `GET /api/providers`
- `GET /api/providers/:providerId`
- `GET /api/reviews`
- `GET /api/reviews/:reviewId`
- `GET /api/serviceCategories`
- `GET /api/serviceCategories/:categoryId`

## 🔄 Environment Variables

The collection uses these environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `base_url` | API base URL | `http://localhost:3000` |
| `auth_token` | Firebase Auth token | (empty) |

**For Production:**
Set `base_url` to your Vercel deployment URL: `https://your-app.vercel.app`

**For Local Development:**
- Android Emulator: `http://10.0.2.2:3000`
- iOS Simulator: `http://localhost:3000`
- Physical Device: `http://YOUR_IP:3000`

## 📝 Request Examples

### Example 1: Get All Providers (Public)

**Request:**
```
GET {{base_url}}/api/providers?limit=50&offset=0&approvalStatus=approved
```

**No Authorization header required**

### Example 2: Create Job Card (Provider)

**Request:**
```
POST {{base_url}}/api/provider/jobCards
Authorization: Bearer {{auth_token}}
Content-Type: application/json

{
  "customerId": "customer-id-here",
  "customerName": "John Doe",
  "customerPhone": "+919876543210",
  "customerAddress": {
    "address": "123 Main St",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001"
  },
  "serviceType": "Electrician",
  "problem": "Need to fix electrical wiring",
  "status": "pending"
}
```

### Example 3: Update Job Card Status

**Request:**
```
PUT {{base_url}}/api/provider/jobCards/:jobCardId/status
Authorization: Bearer {{auth_token}}
Content-Type: application/json

{
  "status": "in-progress",
  "taskPIN": "1234"
}
```

## 🧪 Testing Tips

1. **Start with Public Endpoints**: Test `GET /health` and public endpoints first
2. **Get Auth Token**: Use your app to login and extract the Firebase Auth token
3. **Check Permissions**: Ensure your user has the correct role (customer, provider, admin)
4. **Validate Responses**: Check response status codes and error messages
5. **Use Environment Variables**: Replace hardcoded IDs with variables for easier testing

## 🐛 Troubleshooting

### 401 Unauthorized
- Check if `auth_token` is set correctly
- Verify the token hasn't expired
- Ensure the endpoint requires authentication

### 403 Forbidden
- Verify user has the required role (customer, provider, admin)
- Check if user owns the resource (for update/delete operations)

### 404 Not Found
- Verify `base_url` is correct
- Check if the resource ID exists
- Ensure the route path is correct

### 422 Validation Error
- Check request body format
- Verify required fields are present
- Ensure data types match expected format

## 📚 Additional Resources

- **Backend API Documentation**: See `README.md` in `homeServicesBackend`
- **API Routes**: See files in `homeServicesBackend/src/routes/`
- **Mongoose Models**: See files in `homeServicesBackend/src/models/`

## 🔄 Updating the Collection

If API routes change:

1. Update the collection JSON file
2. Re-import into Postman (or update manually)
3. Update this documentation

---

**Note:** Remember to replace placeholder values (like `:userId`, `:providerId`, `:jobCardId`) with actual IDs when making requests.
