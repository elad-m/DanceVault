# DanceVault Security Policy

## Current Scope

DanceVault is an invite-only development service. Security reports are welcome,
but there is currently no bug-bounty program or guaranteed response time.

The deployed development application and the code on the `master` branch are
the currently supported versions.

## Reporting a Vulnerability

Do not report a vulnerability through a public GitHub issue when the report
contains or could reveal:

- Credentials, access tokens, cookies, or authentication codes.
- Private video URLs, uploaded videos, or screenshots of private content.
- Email addresses, Cognito user IDs, or other personal information.
- Instructions that would allow another person to access a user's data.

**Private security contact:** A dedicated private contact address or GitHub
private-vulnerability-reporting channel must be established before external
users are invited.

Until that channel is established, do not send real credentials or personal
data. A report can initially describe the affected component and general impact
through the repository owner's private GitHub profile contact method.

A useful report should include:

- The affected URL, route, AWS service, or source file.
- The security impact.
- Reproduction steps using non-sensitive test data.
- Whether real user data or credentials may have been exposed.
- Any immediate containment action already taken.

## Current Security Measures

- Cognito authentication and verified access tokens protect backend routes.
- DynamoDB access is scoped by the authenticated Cognito user ID.
- Uploaded videos are stored in a private S3 bucket.
- Upload and playback access uses time-limited signed URLs.
- The deployed Lambda uses an access-limited IAM role.
- AWS storage uses encryption at rest and HTTPS in transit.
- Backend CloudWatch logs expire after seven days.
- Local secrets, private keys, logs, database files, and raw videos are excluded
  from Git by default.

## Incident Response Checklist

### 1. Contain the incident

- Disable the affected account, route, deployment, or AWS permission when doing
  so reduces ongoing exposure.
- Stop sharing affected signed URLs and remove an exposed S3 object when
  necessary.
- Do not delete logs or other evidence needed to understand what happened.

### 2. Revoke and rotate credentials

- Revoke exposed AWS credentials before attempting to remove them from Git
  history.
- End affected Cognito sessions, disable the affected user, or require a
  password reset when account access may be compromised.
- Replace any leaked secret in every environment where it was used.

Removing a credential from source code does not make that credential safe; it
must be revoked or rotated first.

### 3. Determine the scope

- Identify the first known exposure time and the affected users, videos, and
  services.
- Review relevant CloudWatch logs, Cognito events, AWS activity, S3 objects,
  DynamoDB items, and Git history.
- Determine whether the issue exposed only public identifiers or actual
  credentials or personal information.

### 4. Preserve evidence

- Record timestamps, request IDs, affected resource IDs, relevant log entries,
  and remediation actions in a private incident record.
- Do not copy private videos, tokens, or personal information into public
  issues, commits, or chat messages.

### 5. Remove exposure and remediate

- Correct the vulnerable code, IAM policy, bucket policy, authentication rule,
  or deployment configuration.
- Delete exposed personal data from unauthorized locations.
- Add a regression test or automated safeguard where practical.
- Redeploy and verify the correction using non-sensitive test data.

### 6. Assess notification duties

- Determine whether affected users need to be notified.
- Determine whether the incident requires reporting to a regulator or another
  authority under applicable law.
- Obtain legal advice when real personal information, private videos, or a
  material security incident is involved.

### 7. Document lessons and follow-up work

- Write a concise private incident summary describing cause, impact,
  containment, and prevention.
- Add remaining remediation work to `TODO.md` and assign a priority.
- Update `DATA_INVENTORY.md`, `PRIVACY.md`, or this policy if the incident shows
  that they are inaccurate.

## Specific Exposure Guidance

### Secret committed to Git

1. Revoke or rotate the secret.
2. Review use of the secret for unauthorized activity.
3. Remove the secret from the current tree.
4. Decide whether Git-history rewriting is necessary.
5. Add an ignore rule, secret-scanning rule, or test that prevents recurrence.

### Uploaded video exposed

1. Remove or restrict access to the S3 object.
2. Determine how the object URL or permission became available.
3. Identify who could access it and for how long.
4. Notify the owner and other affected people when appropriate or required.
5. Correct the authorization, signed-URL, CORS, or bucket-policy issue.

### User account compromised

1. Disable the account or end its sessions.
2. Require credential recovery or a password reset.
3. Review changes to videos, segments, and account data.
4. Restore or delete affected data as appropriate.
5. Notify the account owner through a verified private channel.

## Known Limitations

- No dedicated private security contact is configured yet.
- No automated security-alert or incident-management workflow exists yet.
- Video and DynamoDB deletion failures are not retried automatically.
- Account-wide data deletion is manual.
- Formal penetration testing and legal review have not been performed.
