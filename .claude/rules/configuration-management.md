# Configuration Management

## ConfigFactory Pattern

The application uses a **Singleton ConfigFactory** pattern for centralized configuration:

**Location**: `config.py`

**Key Features**:
- Single instance across the application
- Environment variable support with defaults
- Keychain fallback for local development
- Type-safe configuration access

## Configuration Categories

1. **Primary Database (MongoDB)**:
   - `db_name`: Database name
   - `db_connection_string`: Connection string (required)

2. **API Security**:
   - `api_key`: API key for endpoint authentication (required)
   - `docs_user`: Documentation username (default: `"user"`)
   - `docs_secret`: Documentation password (required)

3. **External Database** (if applicable):
   - `<prefix>_db_host`: Database host
   - `<prefix>_db_port`: Database port
   - `<prefix>_db_database`: Database name
   - `<prefix>_db_user`: Database user
   - `<prefix>_db_password`: Database password (required)
   - `<prefix>_db_ssl_ca`: SSL certificate path (optional)

## Usage Pattern

```python
from config import config

db_name = config.db_name
connection_string = config.db_connection_string
```

## Reset for Testing

```python
ConfigFactory.reset()  # Clears singleton instance
```
