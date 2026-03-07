# Database Setup Guide

## Prerequisites
- PostgreSQL instance running
- POSTGRES_URL environment variable set in `.env.local`

## Setup Steps

### 1. Install Dependencies
Already done! Dependencies installed: `better-auth`, `drizzle-orm`, `postgres`, `drizzle-kit`

### 2. Configure Environment Variables
Add to your `.env.local`:
```env
POSTGRES_URL=postgresql://user:password@host:port/database
NEXT_PUBLIC_APP_URL=http://localhost:3000
BETTER_AUTH_SECRET=your_secret_key_here
```

Generate a secret key:
```bash
openssl rand -base64 32
```

### 3. Push Database Schema
Run this command to create all tables in your PostgreSQL database:
```bash
npm run db:push
```

This will create the following tables:
- `users` - User profiles with name, email, phone number
- `sessions` - User sessions for authentication
- `accounts` - OAuth provider accounts
- `verification_tokens` - Email verification and password reset tokens
- `projects` - User projects
- `documents` - Document metadata (dimensions, versions)
- `document_versions` - HTML versions for each document
- `chat_messages` - Chat history for each project

### 4. Optional: View Database
To open Drizzle Studio and view your database:
```bash
npm run db:studio
```

## Database Schema

### Users Table
- `id` (UUID, primary key)
- `name` (text, required)
- `email` (text, unique, required)
- `email_verified` (timestamp)
- `image` (text)
- `phone_number` (text)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### Projects Table
- `id` (UUID, primary key)
- `user_id` (UUID, foreign key to users)
- `name` (text)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### Documents Table
- `id` (UUID, primary key)
- `project_id` (UUID, foreign key to projects)
- `width` (integer)
- `height` (integer)
- `current_version` (integer)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### Document Versions Table
- `id` (UUID, primary key)
- `document_id` (UUID, foreign key to documents)
- `version` (integer)
- `html` (text)
- `created_at` (timestamp)

### Chat Messages Table
- `id` (UUID, primary key)
- `project_id` (UUID, foreign key to projects)
- `role` (text: 'user' | 'assistant')
- `content` (jsonb: stores message parts)
- `created_at` (timestamp)

## Authentication

BetterAuth is configured with:
- Email/password authentication
- User profiles with name, email, phone number
- Session management (7-day expiry)
- Secure password hashing

### Auth Endpoints
- `/api/auth/sign-in` - Sign in
- `/api/auth/sign-up` - Sign up
- `/api/auth/sign-out` - Sign out
- `/api/auth/session` - Get current session

### Auth Pages
- `/auth` - Sign in / Sign up page

## Next Steps

1. Run `npm run db:push` to create the database schema
2. Start the dev server: `npm run dev`
3. Visit `/auth` to create an account
4. Update the app to use authentication and database storage
