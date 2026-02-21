# API Endpoint Conventions

## Route Types

### Protected Routes (API Key)
Standard API routes requiring an `api_key` header. This is the default for all routes unless otherwise specified.

### Public Routes (Session Token)
Routes with `/public/` in their path. These require a session token via `Authorization: Bearer <token>` header instead of an API key.

### Documentation Routes (HTTP Basic)
`/docs`, `/redoc`, `/openapi.json` — protected by HTTP Basic Authentication.

## Health Check Endpoints

Every service must expose these three health endpoints (API key required):

### `GET /health`
Basic health check.

**Response**:
```json
{
  "status": "healthy",
  "service": "<service-name>",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "0.1.0"
}
```

### `GET /health/live`
Liveness probe — verifies the application process is running.

### `GET /health/ready`
Readiness probe — verifies the service can accept traffic (checks database connectivity and other dependencies).

Returns `503 Service Unavailable` with `"status": "not_ready"` when dependencies are down.

## Standard Pagination

All list endpoints must support pagination with a consistent envelope:

**Query Parameters**:
- `limit`: Maximum number of items (1-1000, default: 100)
- `skip`: Number of items to skip (default: 0)

**Response Envelope**:
```json
{
  "items": [],
  "total": 500,
  "limit": 100,
  "skip": 0,
  "count": 50
}
```

- `items`: Array of results
- `total`: Total matching records
- `limit`: Requested limit
- `skip`: Requested offset
- `count`: Number of items actually returned

## Standard Error Responses

All error responses follow this structure:

```json
{
  "detail": "Human-readable error message"
}
```

**Standard Status Codes**:
- `400 Bad Request`: Invalid input or malformed request
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Authenticated but insufficient permissions
- `404 Not Found`: Resource does not exist
- `422 Unprocessable Entity`: Validation error (FastAPI default)
- `500 Internal Server Error`: Unexpected server failure
- `503 Service Unavailable`: Service not ready (dependency down)

## Documentation Endpoints

Every service must expose auto-generated API docs:

- `GET /docs` — Swagger UI
- `GET /redoc` — ReDoc
- `GET /openapi.json` — OpenAPI schema
