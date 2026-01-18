# HomeServicesBackend Structure

## 📁 Project Organization

The backend is organized by app (HomeServicesCustomer, HomeServicesProvider, HomeServicesAdmin) with shared components:

```
homeServicesBackend/
├── src/
│   ├── config/
│   │   └── database.js           # Mongoose connection
│   ├── models/                   # Mongoose schemas
│   │   ├── User.js
│   │   ├── Provider.js
│   │   ├── JobCard.js
│   │   ├── Review.js
│   │   └── ServiceCategory.js
│   ├── controllers/              # Organized by app
│   │   ├── customer/             # Customer app controllers
│   │   │   └── jobCardsController.js
│   │   ├── provider/             # Provider app controllers
│   │   │   └── jobCardsController.js
│   │   ├── admin/                # Admin app controllers
│   │   │   └── jobCardsController.js
│   │   ├── shared/               # Shared controllers (all apps)
│   │   │   ├── reviewsController.js
│   │   │   ├── providersController.js
│   │   │   └── serviceCategoriesController.js
│   │   └── usersController.js    # Shared user operations
│   ├── routes/                   # Organized by app
│   │   ├── customer/             # Customer app routes
│   │   │   └── jobCards.js       # /api/customer/jobCards
│   │   ├── provider/             # Provider app routes
│   │   │   └── jobCards.js       # /api/provider/jobCards
│   │   ├── admin/                # Admin app routes
│   │   │   └── jobCards.js       # /api/admin/jobCards
│   │   ├── shared/               # Shared routes
│   │   │   ├── reviews.js        # /api/reviews
│   │   │   ├── providers.js      # /api/providers
│   │   │   └── serviceCategories.js # /api/serviceCategories
│   │   └── users.js              # /api/users (shared)
│   ├── middleware/
│   │   ├── auth.js               # Firebase Auth verification
│   │   └── errorHandler.js       # Error handling
│   └── server.js                 # Express app entry point
└── package.json
```

## 🔌 Database Connection (Mongoose)

The backend uses **Mongoose** for MongoDB operations:

```javascript
// src/config/database.js
const mongoose = require('mongoose');
await mongoose.connect(MONGODB_URI);
```

## 📊 Mongoose Models

All models use custom `_id` (string) instead of ObjectId to maintain compatibility with Firebase document IDs:

### Models:
- **User** - User profiles (customers, providers, admins)
- **Provider** - Service provider profiles
- **JobCard** - Job/service cards
- **Review** - Customer reviews
- **ServiceCategory** - Service types (plumber, electrician, etc.)

## 🛣️ API Routes Organization

### Customer App Routes (`/api/customer/*`)
- `GET /api/customer/jobCards` - Get customer's job cards
- `GET /api/customer/jobCards/:jobCardId` - Get customer's job card
- `PUT /api/customer/jobCards/:jobCardId/cancel` - Cancel job card

### Provider App Routes (`/api/provider/*`)
- `GET /api/provider/jobCards` - Get provider's job cards
- `GET /api/provider/jobCards/:jobCardId` - Get provider's job card
- `POST /api/provider/jobCards` - Create job card
- `PUT /api/provider/jobCards/:jobCardId/status` - Update job card status

### Admin App Routes (`/api/admin/*`)
- `GET /api/admin/jobCards` - Get all job cards
- `GET /api/admin/jobCards/:jobCardId` - Get any job card
- `PUT /api/admin/jobCards/:jobCardId` - Update any job card
- `DELETE /api/admin/jobCards/:jobCardId` - Delete job card

### Shared Routes (All Apps)
- `/api/users/*` - User operations
- `/api/providers/*` - Provider browsing and management
- `/api/reviews/*` - Review operations
- `/api/serviceCategories/*` - Service category operations

## 🎯 Controller Organization

Controllers are separated by app to handle app-specific business logic:

### Customer Controllers
- Job card viewing and cancellation

### Provider Controllers
- Job card creation and status updates

### Admin Controllers
- Full CRUD operations on all resources

### Shared Controllers
- Common operations used by multiple apps

## 🔐 Authentication

All routes use Firebase Authentication:
- Token verification via `verifyAuth` middleware
- Role-based access via `requireRole` middleware

## 📝 Usage Example

```javascript
// Customer app: Get my job cards
GET /api/customer/jobCards
Authorization: Bearer <firebase-token>

// Provider app: Create job card
POST /api/provider/jobCards
Authorization: Bearer <firebase-token>
Body: { customerId, serviceType, ... }

// Admin app: Get all job cards
GET /api/admin/jobCards?status=completed
Authorization: Bearer <admin-firebase-token>
```
