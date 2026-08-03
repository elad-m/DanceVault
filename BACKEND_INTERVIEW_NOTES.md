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
