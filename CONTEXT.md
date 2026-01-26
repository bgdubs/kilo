# iOS Inventory App

## Project Purpose
A web-based inventory management app designed for iOS devices, allowing users to create containers and items using camera photos, and generate spreadsheets of their inventory.

## Key Features
- **Container Creation**: Take photos to create containers (e.g., boxes, shelves)
- **Item Management**: Add items to containers with photos
- **Photo Storage**: Images stored as base64 in SQLite database
- **Inventory Export**: Download CSV spreadsheet of all containers and items
- **Mobile Optimized**: Uses camera API for iOS Safari

## Architecture
- **Frontend**: Next.js 16 with React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes
- **Database**: SQLite with Drizzle ORM
- **Deployment**: Web app accessible via iOS browser

## Database Schema
- **Containers**: id, name, imageData, createdAt
- **Items**: id, containerId, name, imageData, createdAt

## API Endpoints
- `GET/POST /api/containers` - Manage containers
- `GET/POST /api/items` - Manage items (with optional containerId filter)

## Technical Decisions
- Base64 image storage for simplicity (no external file storage needed)
- Client-side image processing for immediate feedback
- CSV export for spreadsheet functionality
- Responsive design for mobile devices

## Recent Changes
- Initial implementation with full CRUD for containers and items
- Camera integration using HTML5 file input with capture
- CSV export functionality
- Mobile-first UI design