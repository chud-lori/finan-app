# Finance Management API - Integration Tests

This directory contains comprehensive integration tests for the Finance Management API.

## Test Structure

### Test Files

- **`setup.js`** - Test setup with in-memory MongoDB
- **`auth.integration.test.js`** - Authentication endpoint tests
- **`transaction.integration.test.js`** - Transaction management tests
- **`goal.integration.test.js`** - Financial goal management tests
- **`app.integration.test.js`** - General app functionality tests
- **`end-to-end.test.js`** - Complete user journey tests

### Test Categories

#### 1. Authentication Tests (`auth.integration.test.js`)
- User registration with validation
- User login with credentials
- JWT token validation
- Error handling for invalid credentials
- Duplicate user prevention

#### 2. Transaction Tests (`transaction.integration.test.js`)
- Create transactions (income/outcome)
- Balance updates
- Transaction retrieval with filters
- Category management
- Transaction deletion
- Budget recommendations
- Date range queries

#### 3. Goal Tests (`goal.integration.test.js`)
- Create financial goals
- Goal retrieval
- Savings calculations
- Goal progress tracking
- Multiple goals per user

#### 4. End-to-End Tests (`end-to-end.test.js`)
- Complete user journey
- Multi-user scenarios
- Error recovery
- Data isolation between users

#### 5. App Tests (`app.integration.test.js`)
- Basic app functionality
- Swagger documentation
- Error handling
- Security headers
- CORS configuration

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
# Authentication tests
npm run test:auth

# Transaction tests
npm run test:transaction

# Goal tests
npm run test:goal

# End-to-end tests
npm run test:e2e

# App tests
npm run test:app
```

## Test Environment

- **Database**: In-memory MongoDB using `mongodb-memory-server`
- **Framework**: Mocha with Chai assertions
- **HTTP Client**: Chai HTTP for API testing
- **Isolation**: Each test runs in isolation with clean database state

## Test Data

Tests use realistic test data:
- User credentials
- Transaction amounts in IDR
- Timezone handling (Asia/Jakarta)
- Category names
- Goal descriptions and prices

## Coverage

The tests cover:
- ✅ All API endpoints
- ✅ Request/response validation
- ✅ Authentication and authorization
- ✅ Business logic (balance calculations, savings)
- ✅ Error scenarios
- ✅ Data isolation
- ✅ DTO validation
- ✅ Database operations

## Dependencies

- `mocha` - Test framework
- `chai` - Assertion library
- `chai-http` - HTTP testing
- `mongodb-memory-server` - In-memory MongoDB

## Notes

- Tests use the same DTOs as the main application
- All tests are independent and can run in parallel
- Database is cleaned between tests
- JWT tokens are generated and validated
- Realistic test scenarios with proper error handling

