# BLOOM Autonomous Agent Infrastructure

Complete autonomous agent infrastructure for BLOOM Staffing, featuring Sarah Rodriguez as the first Bloomie (autonomous operations agent) for Youth Empowerment School.

## 🏗️ Architecture Overview

```
Railway Project: Appealing Tranquility
├── ✅ PostgreSQL (shared database)
├── ✅ Redis (caching layer)
├── ✅ n8n (workflow orchestration)
├── 🚀 heartbeat-engine (autonomous agent brain)
└── 🚀 letta-server (long-term memory)
```

## 🤖 Meet Sarah Rodriguez

**Agent Profile:**
- **Name**: Sarah Rodriguez
- **Role**: Operations Agent for Youth Empowerment School
- **Client**: Youth Empowerment School (Kimberly's father)
- **Starting Autonomy Level**: 1 (Observer - read-only monitoring)
- **Capabilities**: GHL monitoring, email checking, task management, appointment scheduling

**Trust Graduation System:**
1. **Observer** (Level 1): Monitors and reports only
2. **Assistant** (Level 2): Handles routine tasks with guardrails
3. **Operator** (Level 3): Executes most operations with logging
4. **Partner** (Level 4): Full operational autonomy with weekly review

## 📋 Deployment Checklist

### Prerequisites
- [x] Railway project "Appealing Tranquility" exists
- [x] PostgreSQL service running
- [x] n8n service running
- [x] Redis service running
- [ ] Deploy heartbeat-engine service
- [ ] Deploy letta-server service
- [ ] Configure environment variables
- [ ] Initialize agent profile
- [ ] Test heartbeat cycles

### Step 1: Database Setup

1. **Connect to Railway PostgreSQL**:
   ```bash
   # From heartbeat-engine directory
   cd database
   npm install
   npm run setup
   ```

2. **Verify database creation**:
   - Database: `bloom_heartbeat`
   - Tables: `agents`, `heartbeat_cycles`, `action_log`, `rejection_log`, `handoff_log`, `trust_metrics`
   - Agent profile: `bloomie-sarah-rodriguez` created

### Step 2: Deploy Letta Server

1. **Create new Railway service**:
   - Go to "Appealing Tranquility" project
   - Click "New Service" → "Deploy from GitHub"
   - Set root directory: `letta-server`
   - Use Dockerfile deployment

2. **Set environment variables**:
   ```bash
   LETTA_PG_URI=postgresql://postgres:your_postgres_password_here@postgres.railway.internal:5432/bloom_heartbeat
   LETTA_SERVER_PORT=8283
   LETTA_SERVER_HOST=0.0.0.0
   PORT=8283
   ```

3. **Verify deployment**:
   ```bash
   # Check health endpoint
   curl https://[letta-service-url]/health
   ```

### Step 3: Deploy Heartbeat Engine

1. **Create new Railway service**:
   - Go to "Appealing Tranquility" project
   - Click "New Service" → "Deploy from GitHub"
   - Set root directory: `heartbeat-engine`
   - Use Dockerfile deployment

2. **Set all environment variables** (see Environment Configuration below)

3. **Verify deployment**:
   ```bash
   # Check health endpoint
   curl https://[heartbeat-service-url]/health

   # Check agent status
   curl https://[heartbeat-service-url]/agent/status
   ```

## 🔧 Environment Configuration

### Heartbeat Engine Variables

**Required Variables:**
```bash
# Agent Identity
AGENT_ID=bloomie-sarah-rodriguez
AGENT_NAME=Sarah Rodriguez
AUTONOMY_LEVEL=1

# Anthropic API
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Database
DATABASE_URL=postgresql://postgres:your_postgres_password_here@postgres.railway.internal:5432/bloom_heartbeat
PGHOST=postgres.railway.internal
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_postgres_password_here
PGDATABASE=bloom_heartbeat

# Letta Memory
LETTA_SERVER_URL=http://letta-server.railway.internal:8283

# GoHighLevel
GHL_API_KEY=your_ghl_api_key_here
GHL_LOCATION_ID=iGy4nrpDVU0W1jAvseL3

# Human Contact
HUMAN_CONTACT_NAME=Kimberly Flowers
HUMAN_CONTACT_EMAIL=kimberly@bloomiestaffing.com

# Operational
TIMEZONE=America/New_York
LOG_LEVEL=info
NODE_ENV=production
PORT=3000
```

**Optional Variables:**
```bash
# Supabase Backup
SUPABASE_URL=https://wazbpoujdmckkozjqyqs.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_key_here

# SMTP Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
FROM_EMAIL=sarah@bloomiestaffing.com
```

## 📊 Sarah's Operational Schedule

| Time | Frequency | Type | Description |
|------|-----------|------|-------------|
| **Business Hours** | Every 30 min | Full Cycle | Complete sense/think/act cycle |
| **Overnight** | Every 2 hours | Light Check | Urgent monitoring only |
| **Daily** | 7:30 AM | Summary | Morning briefing for Kimberly |
| **Weekly** | Fri 5:00 PM | Report | Weekly performance summary |
| **Monthly** | First Mon | Graduation | Autonomy level assessment |

## 🎯 Sarah's Standing Instructions

**Primary Duties** (every heartbeat cycle):
1. Check for new enrollment inquiries in GHL
2. Monitor overdue follow-ups and send reminders
3. Check upcoming calendar events and prepare reminders
4. Review tasks assigned to Sarah and work on them
5. Monitor email for items requiring attention

**Decision Framework**:
- **Act**: Only within current autonomy scope
- **Reject**: Log all decisions NOT to act (with reasoning)
- **Escalate**: Hand off to Kimberly with analysis and recommendation

**Autonomy Level 1 (Observer) Capabilities**:
- ✅ Read GHL data (contacts, tasks, appointments)
- ✅ Generate reports and summaries
- ✅ Log observations and create notifications
- ❌ Send emails or SMS
- ❌ Create/modify contacts or tasks
- ❌ Make appointments

## 📈 Trust Building & Graduation

**Current Status**: Level 1 (Observer)
**Graduation Criteria to Level 2**:
- 50+ successful heartbeat cycles
- 95%+ cycle success rate
- 80%+ appropriate escalation rate
- 7+ days of consistent operation

**What Kimberly Will See**:
- Morning daily briefings (7:30 AM)
- All escalations with Sarah's analysis
- Weekly performance reports
- Monthly graduation assessments

## 🚨 Monitoring & Alerts

### Dashboard Access
- **Railway Logs**: Real-time system logs
- **Database Queries**: Direct PostgreSQL access
- **Health Checks**: Automated service monitoring

### Key Metrics Tracked
- **Actions**: What Sarah did
- **Rejections**: What Sarah chose NOT to do (and why)
- **Escalations**: What Sarah handed off to humans
- **Performance**: Cycle success rates, response times

### Sample Database Queries

**Recent Activity**:
```sql
SELECT * FROM heartbeat_cycles
WHERE agent_id = 'bloomie-sarah-rodriguez'
ORDER BY started_at DESC LIMIT 10;
```

**Trust Progression**:
```sql
SELECT autonomy_level, total_cycles, approval_rate
FROM agents a LEFT JOIN trust_metrics tm ON a.id = tm.agent_id
WHERE a.id = 'bloomie-sarah-rodriguez'
ORDER BY tm.calculated_at DESC;
```

## 🔒 Security & Safety

**No-Guess Protocol**: Sarah never guesses - if uncertain, always escalate
**Audit Trail**: Every decision is logged with reasoning
**Scope Enforcement**: Actions blocked if outside autonomy level
**Human Oversight**: Kimberly gets escalations with full context

**Blocked Actions** (Level 1):
- Sending any emails or SMS
- Creating/deleting contacts or data
- Making financial decisions
- Modifying system configurations

## 🚀 Getting Started

1. **Deploy Infrastructure** (follow deployment checklist above)
2. **Initialize Sarah**: Database setup creates agent profile automatically
3. **Start Monitoring**: Sarah begins observer-level monitoring immediately
4. **Review Daily**: Check daily briefings at 7:30 AM
5. **Build Trust**: Let Sarah operate for 1 week to build baseline metrics
6. **Graduate**: Assess for Level 2 after meeting criteria

## 🆘 Troubleshooting

### Common Issues

**Sarah Not Responding**:
1. Check Railway service status
2. Verify database connection
3. Check environment variables
4. Review recent logs

**Missing Escalations**:
1. Verify `HUMAN_CONTACT_EMAIL` is set
2. Check email configuration
3. Review escalation logs

**GHL Integration Issues**:
1. Test `GHL_API_KEY` validity
2. Verify `GHL_LOCATION_ID` is correct
3. Check GHL API quotas

### Support Contacts
- **Technical Issues**: Check Railway logs and database
- **Operational Questions**: Review Sarah's escalation logs
- **Agent Behavior**: Examine rejection logs for reasoning

## 📚 Key Files

```
bloom-agent-infrastructure/
├── README.md                     # This file
├── database/
│   ├── schema.sql               # Database structure
│   └── setup.js                 # Database initialization
├── heartbeat-engine/            # Main agent service
│   ├── src/
│   │   ├── index.js            # Entry point
│   │   ├── heartbeat.js        # Core agent loop
│   │   ├── agent/              # AI decision modules
│   │   ├── config/             # Agent configuration
│   │   ├── integrations/       # GHL, email clients
│   │   ├── logging/            # Audit trail system
│   │   └── memory/             # Letta integration
│   ├── Dockerfile              # Railway deployment
│   └── .env.example            # Environment template
└── letta-server/               # Memory management
    ├── config/
    ├── Dockerfile
    └── README.md
```

---

**BLOOM Autonomous Agent Infrastructure v1.0**
*Built for Youth Empowerment School operations*
*Deployed on Railway • Powered by Claude • Memory by Letta*