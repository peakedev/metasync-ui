# Deployment

## Docker Containerization

**Dockerfile**: Multi-stage build with Python 3.13 slim base image

**Features**:
- Non-root user execution
- Health check support
- Optimized layer caching

**Base Image**: `python:3.13-slim`

**Default Command**: `uvicorn main_app:app --host 0.0.0.0 --port <port>`

## Docker Compose

**Configuration**:
- Service and container name should match the project name
- Port mapping: `<port>:<port>`
- Restart policy: `unless-stopped`
- Health check: HTTP GET to `/health` every 30 seconds

**Standard Environment Variables**:
- `DB_NAME`: Database name
- `DB_CONNECTION_STRING`: Database connection string
- `DOCS_USER`: Documentation username
- `DOCS_SECRET`: Documentation password
- `API_KEY`: API key for authentication

## Health Checks

**Docker Health Check**:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:<port>/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

**Application Health Endpoints**:
- `/health`: Basic health check
- `/health/live`: Liveness probe
- `/health/ready`: Readiness probe (includes dependency checks)

## Deployment Considerations

1. **Environment Variables**: All secrets must be set in production
2. **Database Connections**: Ensure network access to all required databases
3. **SSL Certificates**: Provide SSL certs for databases requiring encrypted connections
4. **Port Configuration**: Configurable via environment variable
5. **Resource Limits**: Set memory/CPU limits based on expected load
