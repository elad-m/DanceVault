# Backend Interview Study Notes

This file records backend problems encountered while building DanceVault that
are worth studying again before interviews.

## CORS Preflight Versus Authentication

**Status:** Revisit in depth before interviews.

### What happened

The frontend at `http://localhost:5173` called the deployed API Gateway on a
different origin. Before sending an authenticated request, the browser sent an
unauthenticated HTTP `OPTIONS` preflight request to ask whether the origin,
method, and headers were allowed.

API Gateway used an authenticated `$default` route, so it initially rejected
the preflight with `401 Unauthorized`. Adding a public `OPTIONS /{proxy+}` route
was not sufficient by itself because that route still forwarded the request to
Fastify, whose authentication hook also rejected it.

### Final request flow

```text
Browser OPTIONS preflight
    -> API Gateway public OPTIONS /{proxy+} route
    -> Fastify skips authentication for OPTIONS
    -> Fastify returns 204 No Content

Browser application request
    -> API Gateway $default route
    -> Cognito JWT authorizer
    -> Lambda
    -> Fastify verifies the access token again
    -> route handler
```

### Principles to study

- CORS is a browser access policy, not authentication or authorization.
- A preflight request normally has no bearer token and must not execute
  business logic.
- Route priority matters: `OPTIONS /{proxy+}` is more specific than `$default`.
- Authentication can exist at multiple boundaries. API Gateway rejects invalid
  tokens early, while the backend independently protects its own contract.
- A response can contain correct CORS headers and still fail CORS if its HTTP
  status is unsuccessful.
- Diagnose the preflight directly instead of relying only on the browser:

```powershell
curl.exe --include --request OPTIONS `
    --header "Origin: http://localhost:5173" `
    --header "Access-Control-Request-Method: GET" `
    --header "Access-Control-Request-Headers: authorization,content-type" `
    "https://API_HOST/videos"
```

### Interview questions to practice

- What is a CORS preflight and when does a browser send one?
- Why should an OPTIONS request usually bypass authentication?
- What is the difference between CORS, authentication, and authorization?
- Why did correct `Access-Control-Allow-*` headers not fix a `401` preflight?
- Where should JWT verification happen, and what are the tradeoffs of checking
  it in both an API gateway and the application?

## CloudFront SPA Route Fallback

**Status:** Revisit before interviews.

### Request flow

```text
1. Browser requests /practice from CloudFront.

2. CloudFront asks the S3 frontend bucket for /practice.

3. S3 has no file named /practice, so it returns 403.

4. CloudFront's custom error rule says:
   "For 403, request /index.html instead."

5. CloudFront asks the same S3 bucket for /index.html.

6. S3 returns index.html.

7. CloudFront sends that file to the browser with status 200.

8. The JavaScript referenced by index.html starts React.

9. React sees that the browser URL is still /practice and renders the Practice
   screen.
```

This fallback is needed because `/practice` is a client-side React route, not
an object stored in S3. If `/index.html` is also missing, CloudFront returns the
error from that failed request; it does not repeatedly apply the fallback.

## Notable Architecture Decisions

### STAR: Reconciling denormalized DynamoDB quota counters

**Status:** Implemented and verified locally and against development data.

**Situation:** DanceVault needed per-user limits for stored video bytes,
videos, segments, and pending uploads. Calculating those totals by scanning
all of a user's DynamoDB records on every request would be inefficient, so the
design introduced one aggregate quota-usage item per user. That denormalized
item could drift from the underlying records if a bug, failed migration, or
incorrect repair changed only one side.

**Task:** Enforce quotas efficiently during normal requests without making the
aggregate counters the only source of truth, and provide a safe way to detect
and repair inconsistencies.

**Action:** Treat video and segment records as the source of truth. Update
their corresponding quota counters in the same DynamoDB transaction during
normal writes. Keep a pure, tested calculation that derives expected usage
from the source records, then use it for initial backfill and a repeatable
audit/reconciliation command. Make repairs explicit and idempotent instead of
silently overwriting counters during request handling.

**Result:** Normal requests now enforce quotas with transactional conditional
writes, while guarded audit and repair commands can verify derived counters
against source records. Existing local and development data reconciled without
issues. This follows the standard pattern of transactional updates plus
periodic or on-demand reconciliation for derived data.

### Quota-enforcement concepts

- Reserve upload bytes before issuing a signed upload URL, then move the
  reservation to stored bytes only after checking the real object size.
- Change source records and aggregate counters in one DynamoDB transaction so
  retries cannot apply only half of an invariant.
- Use strongly consistent reads where a stale quota value could incorrectly
  allow or reject a write; handle concurrent conflicts with bounded retries.
- Make deletion and reconciliation idempotent because workers and operational
  commands may be repeated after partial failure.
- Isolate tests with loopback-only endpoints, a dedicated table, invalid AWS
  credentials, and client-factory guards even when an admin profile is active.

### Derive deterministic storage keys instead of storing them

Segment thumbnail keys can be derived from stable identifiers, for example
`users/{userID}/thumbnails/{segmentID}.jpg`. DanceVault should therefore derive
the key when it needs it rather than also storing `thumbnailKey` in DynamoDB.

This avoids a segment schema migration and removes duplicated state that could
become inconsistent: the database cannot claim one key while the application
writes the thumbnail to another. Store a key only when it contains information
that cannot be reconstructed deterministically or when future key changes must
be preserved per record.

## Other DanceVault Topics To Revisit

### DynamoDB data modeling

- Partition keys and sort keys.
- Global secondary indexes and the access patterns that justify each index.
- Conditional writes and `ConditionalCheckFailedException`.
- Transactions for maintaining parent `segmentCount` invariants.
- Opaque cursor pagination and `ExclusiveStartKey`.
- Schema versions and explicit data migrations in a schemaless database.

### Data and object-storage consistency

- Why a database row and an S3 object cannot be changed in one transaction.
- Orphaned objects, missing objects, storage audits, and reconciliation jobs.
- Why deletion should become retryable and idempotent, eventually using SQS.
- Failure ordering: delete storage first versus delete the database row first.

### Authentication and identity

- OAuth 2.0 authorization-code flow with PKCE.
- Access tokens versus ID tokens and refresh tokens.
- JWT signature, issuer, audience/client ID, expiry, and subject (`sub`).
- Cognito user pools, app clients, hosted login, and callback URLs.
- Why user ownership belongs on records rather than in per-user tables.

### Serverless HTTP architecture

- API Gateway, Lambda proxy events, and adapting them to Fastify.
- Lambda cold starts, stateless execution, and reusing clients across warm
  invocations.
- IAM execution roles and least-privilege resource permissions.
- CloudWatch log retention and request-based cost controls.

### File uploads

- Presigned S3 URLs and why video bytes bypass the backend server.
- Pending-upload and ready lifecycle states.
- Verifying object existence before marking an upload ready.
- Content type, file extension, codec compatibility, and future transcoding.

### API and service design

- HTTP validation versus business validation.
- Routes as HTTP adapters, services as business rules, and data-access
  interfaces hiding database-specific behavior.
- Dependency selection by environment without spreading environment checks
  throughout the application.
- Stable error response codes versus human-readable messages.
- Cursor pagination versus offset pagination.

### Testing strategy

- Unit tests, route tests, database integration tests, storage integration
  tests, infrastructure-template tests, and deployed smoke tests.
- Dependency injection for controlled failures and external services.
- Testing invariants and observable behavior rather than implementation details.
- Why passing local tests does not replace testing the deployed request path.
