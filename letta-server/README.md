# BLOOM Letta Server

Long-term memory management server for BLOOM autonomous agents using Letta (formerly MemGPT).

## Overview

This service provides persistent memory capabilities for the BLOOM agent infrastructure:
- Stores agent conversations and experiences
- Enables context-aware decision making across heartbeat cycles
- Learns from agent actions and human feedback
- Provides memory search and retrieval for agent thinking

## Railway Deployment

### Prerequisites
- Railway account with access to the "Appealing Tranquility" project
- PostgreSQL service already running in the same project

### Deploy Steps

1. **Add as New Service in Railway Project**
   ```bash
   # In Railway dashboard:
   # 1. Go to "Appealing Tranquility" project
   # 2. Click "New Service"
   # 3. Choose "Deploy from GitHub repo"
   # 4. Select this repository
   # 5. Set root directory to "letta-server"
   ```

2. **Set Environment Variables**
   ```bash
   # In Railway service settings > Variables:
   LETTA_PG_URI=postgresql://postgres:your_postgres_password_here@postgres.railway.internal:5432/bloom_heartbeat
   LETTA_SERVER_PORT=8283
   LETTA_SERVER_HOST=0.0.0.0
   PORT=8283
   ```

3. **Configure Internal Networking**
   ```bash
   # Railway will automatically assign internal URL:
   # letta-server.railway.internal:8283
   ```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `LETTA_PG_URI` | PostgreSQL connection string | Yes | - |
| `LETTA_SERVER_PORT` | Server port | No | 8283 |
| `LETTA_SERVER_HOST` | Server host | No | 0.0.0.0 |
| `LETTA_LOG_LEVEL` | Logging level | No | INFO |

### Health Check

Once deployed, verify the service:

```bash
# Check service health
curl https://[your-railway-domain]/health

# Check from heartbeat-engine (internal)
curl http://letta-server.railway.internal:8283/health
```

### API Endpoints

The Letta server exposes these key endpoints:

- `GET /health` - Health check
- `POST /memory/store` - Store new memory
- `POST /memory/search` - Search memories
- `GET /agent/{id}/memories` - Get agent memories
- `POST /agent/{id}/feedback` - Store human feedback

## Configuration

The server uses the configuration in `config/letta.yaml`:

- **Database**: Uses the same PostgreSQL instance as heartbeat-engine
- **Memory**: Stores agent experiences and learned patterns
- **Security**: Internal network only, no external auth required
- **Performance**: Optimized for Railway's infrastructure

## Integration with Heartbeat Engine

The heartbeat-engine connects to this service for:

1. **Memory Retrieval**: Before each thinking cycle
2. **Memory Storage**: After each action/decision
3. **Feedback Processing**: When humans respond to escalations

Connection details:
```javascript
// In heartbeat-engine
const LETTA_URL = 'http://letta-server.railway.internal:8283';
```

## Monitoring

Monitor the service via Railway dashboard:

- **Logs**: Real-time logs in Railway console
- **Metrics**: Memory usage, response times, error rates
- **Health**: Automatic health checks every 30 seconds

## Troubleshooting

### Service Won't Start
1. Check PostgreSQL connection
2. Verify environment variables
3. Check logs for startup errors

### Memory Issues
1. Check PostgreSQL disk space
2. Review memory archival settings
3. Monitor agent memory growth

### Performance Issues
1. Check database query performance
2. Review cache settings
3. Monitor concurrent connections

## Backup and Recovery

- **Database**: Handled by Railway PostgreSQL backups
- **Configuration**: Stored in git repository
- **Memory Data**: Backed up with database snapshots

## Development

For local development:

```bash
# Clone repository
git clone <repo-url>
cd letta-server

# Copy environment
cp .env.example .env
# Edit .env with local settings

# Run locally (requires Docker)
docker build -t bloom-letta .
docker run -p 8283:8283 --env-file .env bloom-letta
```