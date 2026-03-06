# Supabase Setup Guide - BLOOM Projects

This guide walks you through setting up the Projects system in Supabase. This is the **correct multi-tenant architecture** for BLOOM - all client data lives in Supabase, while Railway Postgres handles individual Bloomie working memory.

## Architecture Decision

**Why Supabase for Projects?**
- ✅ Multi-tenant: Supports millions of clients with isolated data
- ✅ Centralized: All Bloomie-created files, BLOOMSHIELD hashes, and client data in one place
- ✅ Row Level Security: Automatic data isolation per user
- ✅ Scalable: Built for growth from day one
- ✅ Real-time: Can add real-time features later

**Railway Postgres vs Supabase:**
```
┌─────────────────────────────────────────┐
│  SUPABASE (Corporate Office)            │
│  ├─ Projects (all clients)              │
│  ├─ Conversations (all clients)         │
│  ├─ Files & Deliverables (all clients)  │
│  ├─ BLOOMSHIELD hashes                  │
│  └─ User accounts                       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  RAILWAY POSTGRES (Bloomie Memory)      │
│  ├─ Active agent state                  │
│  ├─ Current task execution              │
│  ├─ Temporary processing data           │
│  └─ Heartbeat logs                      │
└─────────────────────────────────────────┘
```

## Step 1: Access Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar (or go to `https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql`)
3. Click **+ New query** button (top right)

## Step 2: Run the Migration

Copy and paste the entire contents of `supabase-schema-projects.sql` into the SQL Editor and click **RUN** (or press Ctrl/Cmd + Enter).

**What this creates:**
- `projects` table - Stores all client projects
- `sessions` table - Stores conversations with project associations
- Indexes for fast lookups
- Row Level Security (RLS) policies for data isolation
- Auto-updating `updated_at` triggers

## Step 3: Verify the Tables

After running the migration, verify everything was created:

### Check Tables Exist

Run this query in SQL Editor:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('projects', 'sessions');
```

You should see both tables listed.

### Check RLS is Enabled

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('projects', 'sessions');
```

Both should show `rowsecurity = true`.

### Check Policies Exist

```sql
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('projects', 'sessions');
```

You should see 8 policies total:
- 4 for `projects` (view, create, update, delete)
- 4 for `sessions` (view, create, update, delete)

## Step 4: Test with Sample Data

Create a test project to verify everything works:

```sql
-- Insert a test project (replace the UUID with your user_id when auth is implemented)
INSERT INTO projects (user_id, name, description)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Test Project',
  'Testing the projects system'
)
RETURNING *;
```

If this returns a row with an ID, timestamps, etc., you're all set! ✅

## Step 5: Clean Up Test Data (Optional)

```sql
DELETE FROM projects WHERE name = 'Test Project';
```

## Environment Variables

Make sure these are set in Railway:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

**Where to find these:**
1. Supabase Dashboard → Settings → API
2. **URL:** Copy "Project URL"
3. **Service Key:** Copy "service_role" key (NOT the "anon" key - we need full access)

⚠️ **IMPORTANT:** Keep `SUPABASE_SERVICE_KEY` secret! This bypasses RLS and has full database access.

## Understanding Row Level Security (RLS)

RLS ensures each user can only see their own data. Here's how it works:

```sql
-- Users can only see their own projects
SELECT * FROM projects;  -- Automatically filtered by auth.uid() = user_id

-- Users can only create projects for themselves
INSERT INTO projects (user_id, name) 
VALUES (auth.uid(), 'My Project');  -- ✅ Works

INSERT INTO projects (user_id, name) 
VALUES ('another-user-id', 'Not My Project');  -- ❌ Blocked by RLS
```

## Schema Reference

### Projects Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| user_id | UUID | Owner of the project |
| name | VARCHAR(255) | Project name |
| description | TEXT | Optional project description |
| created_at | TIMESTAMPTZ | When project was created |
| updated_at | TIMESTAMPTZ | Last update time (auto-updated) |

### Sessions Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| user_id | UUID | Owner of the conversation |
| project_id | UUID | Associated project (nullable) |
| title | VARCHAR(500) | Conversation title |
| created_at | TIMESTAMPTZ | When conversation started |
| updated_at | TIMESTAMPTZ | Last update (auto-updated) |
| last_message_at | TIMESTAMPTZ | Last message timestamp |

## API Endpoints

Once deployed, these endpoints will be available:

### GET /api/projects
List all projects for the authenticated user with conversation counts.

**Response:**
```json
{
  "success": true,
  "projects": [
    {
      "id": "uuid-here",
      "name": "BLOOMSHIELD Marketing",
      "description": "Marketing materials and campaigns",
      "conversation_count": 5,
      "created_at": "2026-03-06T10:00:00Z",
      "updated_at": "2026-03-06T15:30:00Z"
    }
  ]
}
```

### POST /api/projects
Create a new project.

**Request:**
```json
{
  "name": "Q2 Planning",
  "description": "Second quarter strategic planning"
}
```

**Response:**
```json
{
  "success": true,
  "project": {
    "id": "new-uuid",
    "name": "Q2 Planning",
    "description": "Second quarter strategic planning",
    "created_at": "2026-03-06T16:00:00Z",
    "updated_at": "2026-03-06T16:00:00Z"
  }
}
```

### PATCH /api/projects/:id
Update an existing project.

**Request:**
```json
{
  "name": "Updated Name",
  "description": "New description"
}
```

### DELETE /api/projects/:id
Delete a project. Associated conversations will have their `project_id` set to NULL.

### PATCH /api/projects/:id/conversations
Add or remove conversations from a project.

**Request:**
```json
{
  "sessionIds": ["uuid-1", "uuid-2", "uuid-3"],
  "action": "add"  // or "remove"
}
```

## Testing the Integration

Once Railway deploys successfully and you've run the Supabase migration:

1. **Test project creation:**
```bash
curl -X POST https://your-railway-url.up.railway.app/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Project", "description": "Testing the API"}'
```

2. **List projects:**
```bash
curl https://your-railway-url.up.railway.app/api/projects
```

3. **Frontend integration:**
The dashboard will need to call these APIs to:
- Load projects on sidebar mount
- Create new projects via "New Project" button
- Associate conversations with projects
- Filter conversations by project

## Troubleshooting

**"Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"**
- Check Railway environment variables are set correctly
- Verify the keys are spelled exactly right (case-sensitive)

**"Project not found" when you know it exists**
- Check the user_id in the API call matches your auth user
- Currently using placeholder UUID `00000000-0000-0000-0000-000000000001`
- Will need real auth integration later

**RLS policy errors**
- Make sure RLS policies were created successfully
- Verify `auth.uid()` is being passed correctly (requires auth integration)
- For testing, you can temporarily disable RLS with:
  ```sql
  ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
  ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
  ```
  ⚠️ **IMPORTANT:** Re-enable RLS before going to production!

**Can't see sessions in projects**
- Verify sessions table has `project_id` column
- Check foreign key constraint exists
- Make sure conversations are being created in Supabase, not Railway

## Next Steps

After setup is complete:

1. **Add Authentication:**
   - Replace placeholder UUID with real user IDs from auth
   - Implement JWT token validation
   - Pass authenticated user context to API

2. **Wire Up Frontend:**
   - Fetch projects on dashboard load
   - Implement project switcher UI
   - Add conversation-project association
   - Filter conversations by selected project

3. **Migrate Existing Data:**
   - If you have conversations in Railway Postgres, migrate them to Supabase
   - Update conversation creation to write to Supabase

4. **Add Real-time (Optional):**
   - Supabase supports real-time subscriptions
   - Can add live project/conversation updates across team members

## Architecture Benefits

This Supabase-based approach gives you:

✅ **Scalability** - Handles millions of clients out of the box  
✅ **Security** - Row Level Security ensures data isolation  
✅ **Performance** - Indexed queries, connection pooling  
✅ **Flexibility** - Easy to add features (tags, sharing, etc.)  
✅ **Reliability** - Automatic backups, point-in-time recovery  
✅ **Cost-effective** - Pay per usage, not per instance

---

**Questions?** Check the [Supabase Documentation](https://supabase.com/docs) or reach out to the BLOOM team.
