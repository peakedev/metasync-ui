# Key Design Patterns

## Singleton Pattern

**Used For**:
1. **ConfigFactory**: Single configuration instance
2. **ClientManager**: MongoDB connection management
3. **ConnectionManager**: Database connection pooling

**Benefits**:
- Consistent configuration across application
- Efficient connection reuse
- Thread-safe resource management

## Connection Pooling

**MongoDB**:
- One client instance per connection string
- Thread-safe client reuse
- Automatic connection validation

**SQL Databases**:
- Connection pools per configuration
- Pool name sanitization for compatibility
- Automatic pool validation and cleanup

## Batch Processing

**Pattern**: Process large datasets in small batches with configurable delays.

**Parameters**:
- `batch_size`: Number of items per batch (default: 100)
- `wait_time`: Seconds to wait between batches (default: 1)

**Use Case**: Protecting external databases from overload during bulk operations.

## Change Detection

**Pattern**: Hash-based change detection for efficient syncing.

**Implementation**:
1. Generate SHA256 hash of record content
2. Store hash with document in MongoDB
3. Compare hashes on sync
4. Update only if hash differs

**Benefits**:
- Avoids unnecessary database writes
- Tracks which records have changed
- Enables efficient incremental updates

## Retry Logic

**Pattern**: Exponential backoff with configurable retries.

**MongoDB**:
- Handles rate limits (429 errors)
- Respects `RetryAfterMs` from response
- Default: 5 retries

**SQL Databases**:
- Handles connection errors
- Exponential backoff: `retry_delay * (2 ** attempt)`
- Default: 5 retries, 1 second initial delay

## Soft Delete Pattern

**Pattern**: Metadata-based deletion instead of physical deletion.

**Metadata Fields**:
- `_metadata.isDeleted`: Boolean flag
- `_metadata.deletedAt`: Timestamp
- `_metadata.deletedBy`: User information

**Benefits**:
- Data recovery capability
- Audit trail
- Query filtering (excludes deleted by default)
