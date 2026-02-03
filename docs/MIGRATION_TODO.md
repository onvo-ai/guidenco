# PostgreSQL Migration - Remaining Tasks

## ✅ Completed
1. Database schema created
2. BetterAuth setup with PostgreSQL
3. User authentication working
4. Profile menu with settings modal
5. User update API
6. Project service functions created
7. Project API routes created

## 🔄 In Progress - Need to Complete

### 1. Update Chat API Route (`/app/api/chat/route.ts`)
Replace the in-memory `artworkStates` Map with PostgreSQL:
- Import `createOrUpdateArtwork` and `getProjectArtwork` from `/lib/db/projects-service`
- In `createArtwork` tool: Call `createOrUpdateArtwork` to save to DB
- In `writeHTML` tool: Call `createOrUpdateArtwork` to save new version
- In `getArtworkState` tool: Call `getProjectArtwork` to fetch from DB
- Remove the `artworkStates` Map entirely

### 2. Update Header Component (`/components/header.tsx`)
Replace localStorage with API calls:
- Change `getProjects()` to `fetch('/api/projects')`
- Change `createProject()` to `fetch('/api/projects', { method: 'POST' })`
- Change `deleteProject()` to `fetch('/api/projects/${id}', { method: 'DELETE' })`
- Remove imports from `/lib/projects` (localStorage functions)

### 3. Update Main Page (`/app/page.tsx`)
- Add authentication check - redirect to `/auth` if not logged in
- Fetch projects from API on mount
- Load artwork state from API when project changes

### 4. Optional: Save/Load Chat Messages
- Update chat interface to save messages to DB after each exchange
- Load previous messages when switching projects
- Use `/lib/db/projects-service` functions: `saveMessage` and `getProjectMessages`

### 5. Delete Old localStorage Code
- Remove `/lib/projects.ts` file (no longer needed)
- Clean up any remaining localStorage references

## Quick Implementation Guide

### Step 1: Update `/app/api/chat/route.ts`
```typescript
import { createOrUpdateArtwork, getProjectArtwork } from '@/lib/db/projects-service';

// Remove: const artworkStates = new Map...

// In createArtwork tool execute:
// Just return dimensions, actual creation happens in writeHTML

// In writeHTML tool execute:
const { version, totalVersions } = await createOrUpdateArtwork(
  projectId,
  state.width,
  state.height,
  html
);

// In getArtworkState tool execute:
const artwork = await getProjectArtwork(projectId);
if (!artwork) return { success: false, error: 'No artwork exists' };
```

### Step 2: Update `/components/header.tsx`
```typescript
// Replace getProjects() with:
const response = await fetch('/api/projects');
const projects = await response.json();

// Replace createProject() with:
const response = await fetch('/api/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name }),
});
const project = await response.json();

// Replace deleteProject() with:
await fetch(`/api/projects/${id}`, { method: 'DELETE' });
```

### Step 3: Add Auth Check to `/app/page.tsx`
```typescript
'use client';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/auth');
    }
  }, [session, isPending, router]);

  if (isPending) return <div>Loading...</div>;
  if (!session) return null;

  // ... rest of component
}
```

## Testing Checklist
- [ ] Sign up / Sign in works
- [ ] Profile settings can be updated
- [ ] Projects can be created
- [ ] Projects can be deleted
- [ ] Artworks are saved to database
- [ ] Version history works
- [ ] Chat messages persist (optional)
- [ ] Switching projects loads correct data
- [ ] Sign out works and redirects to auth page
