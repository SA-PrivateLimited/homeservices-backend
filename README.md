# Home Services Backend API

Backend API service for the Home Services platform, built with Express.js and MongoDB Atlas.

## 📋 Features

- ✅ RESTful API for all database operations
- ✅ Firebase Authentication integration
- ✅ Role-based access control (customer, provider, admin)
- ✅ MongoDB Atlas connection
- ✅ Error handling and validation
- ✅ CORS support for React Native apps
- ✅ Security headers (Helmet)
- ✅ Request logging (Morgan)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

The MongoDB connection is already configured in `src/config/database.js`, but you can override with environment variables.

### 3. Start Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3000` by default.

## 📚 API Endpoints

### Base URL
```
http://localhost:3000/api
```

### Authentication
All endpoints (except public ones) require Firebase Auth token in the header:
```
Authorization: Bearer <firebase-id-token>
```

### Endpoints Overview

#### Users
- `GET /api/users/me` - Get current user profile
- `GET /api/users/:userId` - Get user by ID
- `PUT /api/users/me` - Update current user profile
- `PUT /api/users/:userId/fcmToken` - Update FCM token
- `GET /api/users` - Get all users (admin only)

#### Job Cards
- `GET /api/jobCards` - Get job cards (filtered by role)
- `GET /api/jobCards/:jobCardId` - Get single job card
- `POST /api/jobCards` - Create job card (provider/admin)
- `PUT /api/jobCards/:jobCardId` - Update job card status
- `DELETE /api/jobCards/:jobCardId` - Delete job card (admin)

#### Providers
- `GET /api/providers` - Get all approved providers (public)
- `GET /api/providers/:providerId` - Get provider by ID (public)
- `PUT /api/providers/me` - Update provider profile
- `PUT /api/providers/me/status` - Update online/offline status
- `PUT /api/providers/:providerId/approval` - Approve/reject (admin)

#### Consultations / Service Requests
- `GET /api/consultations` - Get consultations
- `GET /api/consultations/:consultationId` - Get single consultation
- `POST /api/consultations` - Create service request (customer)
- `PUT /api/consultations/:consultationId` - Update consultation

#### Reviews
- `GET /api/reviews` - Get reviews (public, can filter by providerId)
- `GET /api/reviews/:reviewId` - Get single review
- `POST /api/reviews` - Create review (customer)
- `PUT /api/reviews/:reviewId` - Update review (customer)
- `DELETE /api/reviews/:reviewId` - Delete review (admin/customer)

#### Service Categories
- `GET /api/serviceCategories` - Get all categories (public)
- `GET /api/serviceCategories/:categoryId` - Get single category
- `POST /api/serviceCategories` - Create category (admin)
- `PUT /api/serviceCategories/:categoryId` - Update category (admin)
- `DELETE /api/serviceCategories/:categoryId` - Delete category (admin)

## 🔐 Authentication

The API uses Firebase Authentication for verifying user identity.

### Getting Firebase Auth Token

In your React Native apps, get the token:

```javascript
import auth from '@react-native-firebase/auth';

const user = auth().currentUser;
const token = await user.getIdToken();
```

### Using Token in API Requests

```javascript
const response = await fetch('http://localhost:3000/api/users/me', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});
```

## 🛡️ Role-Based Access Control

The API enforces role-based permissions:

- **Customer**: Can manage their own data, create service requests, write reviews
- **Provider**: Can manage their profile, update job cards they own
- **Admin**: Full access to all endpoints and data

## 📦 Response Format

### Success Response
```json
{
  "success": true,
  "data": {...},
  "message": "Optional message"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error Type",
  "message": "Error message"
}
```

## 🔧 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | Pre-configured |
| `MONGODB_DB_NAME` | Database name | `home-services` |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `CORS_ORIGIN` | CORS allowed origin | `*` |

## 🗂️ Project Structure

```
homeServicesBackend/
├── src/
│   ├── config/
│   │   └── database.js          # MongoDB connection
│   ├── middleware/
│   │   ├── auth.js              # Authentication & authorization
│   │   └── errorHandler.js      # Error handling
│   ├── routes/
│   │   ├── users.js             # User routes
│   │   ├── jobCards.js          # Job card routes
│   │   ├── providers.js         # Provider routes
│   │   ├── consultations.js     # Consultation routes
│   │   ├── reviews.js           # Review routes
│   │   └── serviceCategories.js # Category routes
│   └── server.js                # Express app & server
├── .env.example                 # Environment variables template
├── package.json
└── README.md
```

## 🧪 Testing

Health check endpoint:
```bash
curl http://localhost:3000/health
```

Example API request:
```bash
curl -X GET http://localhost:3000/api/serviceCategories \
  -H "Authorization: Bearer <token>"
```

## 📝 Notes

- The API automatically handles both `consultations` and `serviceRequests` collections for backward compatibility
- Provider status updates are synced to both `providers` and `providerStatus` collections
- Job card updates are synced to both `jobCards` and `jobCards_rtdb` collections

## 🔗 Related Documentation

- [MongoDB Migration Guide](../MONGODB_MIGRATION.md)
- [API Architecture](../ARCHITECTURE.md)
