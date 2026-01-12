# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EventSnap is a NestJS-based event management platform that allows users to generate QR codes for events and enables guests to upload photos linked to those codes. Images are stored in Supabase Storage.

## Development Commands

### Setup and Running
```bash
npm run start:dev          # Development with hot-reload
npm run start              # Build, run migrations, start production
npm run start:debug        # Development with debugging
docker-compose up -d       # Start PostgreSQL and Redis containers
```

### Database Migrations
```bash
npm run migration:generate # Generate new migration (creates src/migrations/migration-<timestamp>.ts)
npm run migration:run      # Apply pending migrations
npm run migration:revert   # Rollback last migration
```

### Testing and Quality
```bash
npm run test               # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:cov           # Run tests with coverage report
npm run lint               # Lint and auto-fix TypeScript files
npm run format             # Format code with Prettier
```

**Test Coverage Requirements**: The project enforces 100% coverage for all service files (`*service.ts`) except health-check. Tests must be written in `__tests__` directories with `.spec.ts` extension.

## Architecture

### Core Data Flow

**User → QrCode → Upload** is the central relationship chain:
- Users create QR codes for events
- Each QR code has a unique token used in the upload URL
- Guests upload images via `/upload/:token` endpoint
- Images are optimized with Sharp (converted to WebP, resized to max 2000px) before upload to Supabase

### Entity Relationships

All entities extend `BaseCollection` (src/common/entity/base.entity.ts) which provides:
- `id` (UUID primary key)
- `createdAt`, `updatedAt` (timestamps)
- `active` (boolean, default true)
- `deletedAt` (soft delete timestamp)

**Key Relationships**:
- `User` → `QrCode`: One user can create many QR codes (OneToMany)
- `QrCode` → `Upload`: One QR code can have many uploads (OneToMany)
- `QrCode.type`: Enum controlling upload limits (FREE: max 10 uploads, PAID/RECURRING: unlimited)

### Authentication Flow

The app uses JWT-based authentication with email verification codes:
1. User signs up → 6-digit code sent via Brevo API (stored in Redis with 10-minute TTL)
2. User confirms code → Account activated
3. Login → JWT token returned (expires based on `EXPIRE_IN` env var, default 7200s)
4. Protected routes use `@UseGuards(JwtAuthGuard)` with JWT strategy

Password reset and email update flows follow the same verification code pattern using Redis with keys: `verification:{purpose}:{email}`

### External Services

**Supabase Storage** (src/config/supabase.config.ts):
- Bucket: `event-snap`
- Upload path structure: `{qrToken}/{timestamp}-{sanitized-filename}.webp`
- Public URLs returned for uploaded files

**Redis** (src/config/redis.config.ts):
- Used exclusively for temporary verification codes
- Keys follow pattern: `verification:{signup|reset|update}:{email}`
- TTL: 600 seconds (10 minutes)

**Email Service** (src/email/email.service.ts):
- Primary: Brevo API (`sendBrevo` method is actively used)
- Fallback: Resend API (`sendEmail` method available but commented out in auth flow)
- Environment variables: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`

### Module Organization

Each feature follows NestJS module pattern:
- `*.module.ts` - Module definition with imports/providers
- `*.controller.ts` - HTTP routes and request handling
- `*.service.ts` - Business logic (must have 100% test coverage)
- `entity/*.entity.ts` - TypeORM entities
- `dto/*.dto.ts` - Data transfer objects with class-validator decorations
- `__tests__/*.spec.ts` - Unit tests
- `__tests__/mocks/*.mock.ts` - Test mocks

## Important Patterns

### Timezone Handling
QR code expiration dates use Brazil timezone (`America/Sao_Paulo`) with `date-fns-tz`. The `resolveExpirationDate` method in qrcode.service.ts:712 converts string dates to UTC using `fromZonedTime` and validates they're in the future.

### TypeORM Configuration
Database synchronize is **disabled** (`synchronize: false` in app.module.ts). Schema changes must use migrations. Configuration is split between:
- Runtime: app.module.ts (async factory with ConfigService)
- CLI: src/config/typeorm.config.ts (for migration commands)

### Soft Deletes
Uploads use soft deletes via `deletedAt` column. The `deleteFiles` method in upload.service.ts sets `deletedAt` timestamp instead of removing records.

### Redis Cache Layer
The application uses Redis for caching to reduce database load and improve performance. The `CacheService` (src/common/services/cache.service.ts) is a global service available to all modules.

**Cached Data**:
- **QR Codes**: Cached by ID and token with dynamic TTL based on expiration date (max 1 hour). Invalidated on create/update.
- **Uploads**: Lists and counts cached for 5 minutes. Invalidated on new upload or delete.
- **Dashboard Stats**: Cached for 5 minutes. Invalidated when users are created.

**Cache Keys Pattern**:
- `qrcode:id:{uuid}`, `qrcode:token:{uuid}`, `qrcode:stats:{ids}`
- `uploads:{token}`, `uploads:count:{qrCodeId}`
- `user:dashboard:{params}`

Cache failures are handled gracefully and never break the application. See `docs/CACHE_IMPLEMENTATION.md` for detailed documentation.

### Swagger Documentation
API docs auto-generated at `http://localhost:3000/api`. All DTOs and entities should use `@ApiProperty()` decorators. Bearer auth is configured globally in main.ts:18.

## Performance Optimizations

Several performance optimizations have been implemented to improve speed and reduce cloud costs:

**Query Optimization**:
- Dashboard uses single query with CASE statements instead of multiple COUNT queries (70% faster)
- Connection pooling: min 5, max 20 connections, 30s idle timeout

**Response Optimization**:
- GZIP compression for responses > 1KB (60-80% size reduction)
- Upload pagination: 20 items per page by default

**Rate Limiting**:
- Global: 100 requests/minute per IP
- Upload endpoint: 10 uploads/minute per IP

**Automatic Cleanup** (Cron Jobs):
- Daily (3 AM): Soft delete QR codes expired >30 days
- Weekly (Sunday 4 AM): Clean orphaned uploads
- Monthly (1st 2 AM): Log statistics

See `docs/OPTIMIZATIONS_SUMMARY.md` and `docs/CACHE_IMPLEMENTATION.md` for detailed documentation.

## Environment Variables

Required variables (see .env.example):
- **Database**: `TYPEORM_HOST`, `TYPEORM_PORT`, `TYPEORM_USERNAME`, `TYPEORM_PASSWORD`, `TYPEORM_DATABASE`
- **Auth**: `AUTH_SECRET`, `EXPIRE_IN`
- **Redis**: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
- **Supabase**: `SUPABASE_URL`, `SUPABASE_KEY`
- **Email (Brevo)**: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`
- **Optional**: `FRONTEND_URL` (defaults to Railway production URL for QR code generation)

## Testing Guidelines

Tests must be created in `__tests__` directories alongside the code being tested. Mock data should be in `__tests__/mocks/` subdirectories. Use the utilities in src/common/utils/test.util.ts for common test setup patterns.

When writing tests, ensure all service methods are covered to meet the 100% coverage requirement enforced by jest.config.js.
