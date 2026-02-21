# Logging and Observability

## Structured Logging

The application uses **structlog** for structured, JSON-formatted logging:

**Configuration**: `api/core/logging.py`

**Features**:
- JSON output for easy parsing by log aggregation systems
- ISO timestamp format
- Logger name and log level included
- Stack traces for exceptions
- Unicode-safe decoding

## Logger Types

### RequestLogger
- Logs HTTP requests and responses
- Includes: method, path, status code, correlation ID

### DatabaseLogger
- Logs database operations
- Includes: operation type, collection/table, success/failure
- Tracks retry attempts and wait times

### BusinessLogger
- For business logic operations

## Correlation IDs

**Middleware**: `CorrelationIDMiddleware` in `main_app.py`

**Behavior**:
- Generates UUID if not provided in `X-Correlation-ID` header
- Adds correlation ID to request state
- Includes correlation ID in response headers
- Logs correlation ID with all request/response events

**Benefits**:
- Trace requests across service boundaries
- Correlate logs from different components
- Debug issues by following correlation ID through logs

## Log Output Example

```json
{
  "event": "HTTP request received",
  "method": "POST",
  "path": "/items",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
  "client_ip": "192.168.1.1",
  "timestamp": "2024-01-15T10:30:00Z",
  "logger": "api.request",
  "level": "info"
}
```
