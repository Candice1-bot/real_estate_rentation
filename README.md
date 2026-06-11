# [Real Estate Rental App](https://main.d1ulictba92089.amplifyapp.com/)

A full-stack rental platform for browsing properties, applying online, and managing rental workflows from both the tenant and property-manager sides.

The project is organised as a split client/server application:

- **`client/`**: Next.js 15 + React 19 frontend
- **`server/`**: Express + Prisma backend
- **Database**: PostgreSQL with **PostGIS** for geospatial property data

## Overview

This application is designed around three user experiences:

1. **Public users / prospective tenants** can browse listings, search by location, view properties on a map, open a detailed property page, and submit rental applications.
2. **Tenants** can sign in, save favorites, track applications, and view their current residences.
3. **Managers** can sign in, create new property listings, review incoming applications, and manage their property portfolio.

## Features

### Public property discovery
- Landing page with a marketing-style homepage and call-to-action sections
- Search page with:
  - location search
  - price filters
  - beds / baths filters
  - property type filters
  - square-footage filters
  - amenities filters
  - grid / list toggle
  - interactive map view using Mapbox
- Property detail page with overview, details, location, image preview, and application entry point

### Authentication and roles
- AWS Amplify / Cognito-based sign-in and sign-up flow
- User role selection during sign-up (**Tenant** or **Manager**)
- Route-level role gating for tenant and manager API routes

### Tenant dashboard
- Favorite properties
- Rental applications with status display
- Current residences
- Settings management

### Manager dashboard
- View manager-owned properties
- Create new property listings
- Review applications by status
- Approve or deny applications
- Settings management

### Backend rental workflow
- Property CRUD foundation with property creation currently implemented for managers
- Multi-criteria property filtering on the backend
- Geospatial querying using PostGIS coordinates
- Address geocoding during property creation
- Image upload pipeline to Amazon S3
- Lease and payment domain models
- Application creation and status updates

## Tech stack

### Frontend
- Next.js 15
- React 19
- TypeScript
- Redux Toolkit + RTK Query
- Tailwind CSS
- Radix UI
- React Hook Form + Zod
- Framer Motion
- Mapbox GL JS
- AWS Amplify UI

### Backend
- Node.js
- Express 5
- TypeScript
- Prisma ORM
- PostgreSQL
- PostGIS
- Multer
- AWS SDK for S3 uploads
- JSON Web Token decoding for role-based route checks

## Architecture

### Frontend
The frontend uses the App Router and is separated into:

- **`(nondashboard)`** for public pages such as the landing page and property search
- **`(dashboard)`** for tenant and manager dashboards
- **`(auth)`** for Cognito-based authentication setup

Global search and UI state is managed with Redux, while data fetching is handled through RTK Query.

### Backend
The backend exposes resource-based routes for:

- `properties`
- `applications`
- `leases`
- `tenants`
- `managers`

Manager and tenant routes are protected with role-aware middleware, while manager-only property creation is enforced at the route level.

### Data model
The Prisma schema models the main rental entities:

- `Property`
- `Location`
- `Manager`
- `Tenant`
- `Application`
- `Lease`
- `Payment`

It also supports:

- many-to-many favorites between tenants and properties
- many-to-many tenant/property occupancy relationships
- geographic coordinates stored as `geography(Point, 4326)`

## Notable implementation details

### Search and map experience
The search UI pushes filter state into the URL, syncs it with Redux state, and requests filtered property data from the API. On the backend, the property query supports filtering by favorites, price range, beds, baths, property type, square footage, amenities, availability, and coordinates. Map markers are rendered from the returned property location data.

### Property creation flow
Managers create a property through a multipart form. The backend:

1. receives uploaded images,
2. uploads them to S3,
3. geocodes the address,
4. stores the location with PostGIS coordinates,
5. creates the property record and links it to the manager.

### Application workflow
A tenant can submit an application from a property detail page. The backend creates the application and associated lease data, and managers can later approve or deny applications from their dashboard.

## Project structure

```text
real_estate_rentation/
├── client/
│   ├── src/app/
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   │   ├── managers/
│   │   │   └── tenants/
│   │   └── (nondashboard)/
│   │       ├── landing/
│   │       └── search/
│   └── package.json
├── server/
│   ├── prisma/
│   │   ├── migrations/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── index.ts
│   └── package.json
└── package.json
```

## Local setup

### Prerequisites
- Node.js
- npm
- PostgreSQL
- PostGIS extension enabled in the target database
- AWS Cognito configuration
- Mapbox access token
- Amazon S3 bucket for uploaded property images

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd real_estate_rentation
```

### 2. Install dependencies
Install separately for the frontend and backend:

```bash
cd client
npm install

cd ../server
npm install
```

### 3. Configure environment variables
Create environment files for both apps.

#### Client
Based on the frontend code, the client needs values for:

```env
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_AWS_COGNITO_USER_POOL_ID=
NEXT_PUBLIC_AWS_COGNITO_USER_POOL_CLIENT_ID=
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
```

#### Server
Based on the backend code, the server needs values for:

```env
DATABASE_URL=
PORT=3002
AWS_REGION=
S3_BUCKET_NAME=
```

> Depending on your AWS / auth setup, you may also need additional credentials or deployment-specific variables that are not committed to the repository.

### 4. Generate Prisma client and run the database
```bash
cd server
npx prisma generate
npx prisma migrate dev
npm run seed
```

### 5. Start the backend
```bash
cd server
npm run dev
```

### 6. Start the frontend
```bash
cd client
npm run dev
```

## Available scripts

### Client
```bash
npm run dev
npm run build
npm run start
npm run lint
```

### Server
```bash
npm run build
npm run start
npm run dev
npm run seed
npm run prisma:generate
```

## Current strengths
- Clear separation between frontend and backend
- Real-world domain modelling for rentals, applications, leases, and payments
- PostGIS-backed location handling
- Role-based tenant/manager user journeys
- Map-based property exploration
- File upload and cloud storage integration

## Suggested next improvements
- Add a root-level `.gitignore` cleanup if `node_modules` or generated files are committed
- Add API documentation for backend endpoints
- Add screenshots or a short demo GIF
- Add automated tests for filtering, auth middleware, and application workflows
- Tighten token verification in the auth middleware if this moves toward production use
- Add deployment instructions for the frontend and backend

## Notes
This README is written from the current repository structure and implementation. If you continue building the project, the most valuable next upgrade for GitHub presentation would be adding:

1. screenshots,
2. a short architecture diagram,
3. a deployed demo link,
4. seed/demo credentials for reviewer access.

