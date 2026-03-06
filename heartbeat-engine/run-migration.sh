#!/bin/bash

# Extract project reference from SUPABASE_URL
SUPABASE_URL="${SUPABASE_URL:-https://vemzupfqycfgkmkruodp.supabase.co}"
PROJECT_REF=$(echo $SUPABASE_URL | sed 's|https://||' | sed 's|.supabase.co||')

echo "🔗 Connecting to Supabase project: $PROJECT_REF"
echo "📝 Running migration SQL..."

# Run the SQL using psql
PGPASSWORD="${SUPABASE_SERVICE_KEY}" psql \
  "postgresql://postgres.${PROJECT_REF}:${SUPABASE_SERVICE_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
  -f supabase-schema-projects.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration completed successfully!"
  echo ""
  echo "🔍 Verifying tables created..."
  PGPASSWORD="${SUPABASE_SERVICE_KEY}" psql \
    "postgresql://postgres.${PROJECT_REF}:${SUPABASE_SERVICE_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
    -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('projects', 'sessions');"
else
  echo "❌ Migration failed!"
  exit 1
fi
