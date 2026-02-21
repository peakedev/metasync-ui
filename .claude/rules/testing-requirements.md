# Testing Requirements

## Bruno Tests Are Mandatory

**All API endpoints MUST have corresponding Bruno tests.**

### Directory Structure

```
tests/bruno/
├── bruno.json              # Collection configuration
├── environments/
│   ├── dev.bru             # Development environment
│   └── local.bru           # Local environment
├── health/
│   └── 01-Health-Check.bru
└── <resource>/
    ├── 01-Create-Item.bru
    ├── 02-List-Items.bru
    └── 03-Get-Item-By-ID.bru
```

### Requirements

1. **Every new endpoint requires a Bruno test file**
   - Location: `tests/bruno/{category}/{test-name}.bru`
   - Name files descriptively with sequential numbering (e.g., `01-Create-Item.bru`)

2. **Test coverage must include**:
   - Success cases (200/201 responses)
   - Error cases (400, 401, 404, 500, etc.)
   - Request validation (missing required fields, invalid types)
   - Response structure validation
   - Business logic validation

3. **Test organization**:
   - Group tests by endpoint category (e.g., `health/`, `items/`)
   - Use sequential numbering for execution order (`01-`, `02-`)
   - Include descriptive test names in the `meta` section

4. **Test assertions**:
   - HTTP status code validation
   - Response structure validation (required fields present)
   - Data type checks
   - Field presence checks
   - Business logic validation
   - Error message validation for error cases

5. **Environment configuration**:
   - Tests must work with both `dev.bru` and `local.bru` environments
   - Use environment variables for `baseUrl` and `apiKey`
   - Never hardcode URLs or credentials in test files

### Example Test

```bru
meta {
  name: Create Item
  type: http
  seq: 1
}

post {
  url: {{baseUrl}}/items
  body: json
  auth: none
}

headers {
  Content-Type: application/json
  api_key: {{apiKey}}
}

body:json {
  {
    "name": "Example item",
    "value": 100
  }
}

tests {
  test("Status code is 200", function() {
    expect(res.getStatus()).to.equal(200);
  });

  test("Response has required fields", function() {
    expect(res.getBody()).to.have.property('id');
    expect(res.getBody()).to.have.property('name');
  });
}
```

### No Exceptions

- **No endpoint is exempt** from Bruno testing requirements
- **No PR should be merged** without corresponding Bruno tests
- **Tests must pass** before code is considered complete

### Running Tests

1. Start the API server locally or ensure dev environment is running
2. Open Bruno collection in VS Code or Bruno CLI
3. Select appropriate environment (`local.bru` or `dev.bru`)
4. Run individual tests or entire collection
5. All tests must pass before deployment
