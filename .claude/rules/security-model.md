# Security Model

## API Key Authentication

**All standard API endpoints** require an `api_key` header:

```http
GET /items HTTP/1.1
Host: api.example.com
api_key: your-api-key-here
```

**Implementation Details**:
- Location: `api/middleware/auth.py`
- Validation: Constant-time comparison using `secrets.compare_digest()`
- Prevents timing attacks on API key validation
- Error Response: 401 Unauthorized

**Configuration**:
- Source: Environment variable `API_KEY` or macOS Keychain fallback

## Public Route Authentication

Routes with `/public/` in their path are public routes. These require a **session token** instead of an API key.

```http
GET /public/items HTTP/1.1
Host: api.example.com
Authorization: Bearer <session-token>
```

**Implementation Details**:
- Auth middleware detects `/public/` in the request path and switches to session token validation
- Session token is passed via `Authorization: Bearer <token>` header
- Error Response: 401 Unauthorized if session token is missing or invalid

## Documentation Authentication

**Documentation endpoints** (`/docs`, `/redoc`, `/openapi.json`) use HTTP Basic Authentication:

- Username: `DOCS_USER` environment variable (default: `"user"`)
- Password: `DOCS_SECRET` from environment variable or Keychain

Protects API documentation from unauthorized access while allowing authenticated developers to explore the API.

## Database Security

- SSL/TLS support for encrypted database connections
- Connection strings and credentials stored securely in environment variables or Keychain

## Configuration Security

**Secret Management Strategy**:
1. **Production**: Environment variables (set by deployment system)
2. **Local Development**: macOS Keychain fallback
   - Secrets stored securely in system keychain
   - Command: `security add-generic-password -a "account" -s "service" -w "value"`

**Standard Secrets**:
- `API_KEY`: API authentication key
- `DB_CONNECTION_STRING`: Database connection string
- `DOCS_SECRET`: Documentation password
