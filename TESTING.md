# Test Data Safety

Automated tests must never connect to AWS or use development data. This is a
hard invariant, including when an individual test file is run directly with
`npx vitest run`.

## Test targets

- DynamoDB tests use `http://127.0.0.1:8000` and only the
  `DanceVaultTestData` table.
- Video-storage tests use MinIO at `http://127.0.0.1:9000`.
- Cognito and SQS are replaced with test fakes.
- Vitest supplies invalid AWS credentials so an accidental AWS request cannot
  authenticate through a developer's active profile.
- CDK Jest tests also receive invalid AWS credentials and only synthesize
  CloudFormation templates.

The test runner configuration applies these values even when `.env`, the
terminal, or an AWS login contains valid development credentials. Runtime
client factories reject AWS resources while Vitest is running. Destructive
DynamoDB cleanup has an additional unconditional guard requiring both a
loopback endpoint and the exact test-table name.

## Commands

Start the local services before database or storage tests:

```powershell
cd C:\Users\musba\Documents\DanceVault\backend
docker compose up -d dynamodb-local minio
```

Run normal backend tests:

```powershell
npm test
```

Run all local integration tests:

```powershell
npm run test:integration
```

An AWS integration check must never be added to a Vitest or Jest suite. Put
explicit, narrowly scoped AWS smoke checks in a separately named script,
avoid destructive operations, and require deliberate command-line opt-in.
