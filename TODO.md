# DanceVault Priority Roadmap

## 1. Privacy, Security, and Legal Baseline

- Audit the public Git history for credentials and personal data.
- Confirm videos, emails, and user records exist only in AWS, not Git.
- Draft a basic privacy policy, terms of use, acceptable-use and copyright
  rules, retention policy, and face-recording consent expectations.
- Define account and user-data deletion rights.
- Obtain an Israeli privacy lawyer's review before opening public registration.

### Owner setup required before inviting external users

- Create a dedicated private privacy and legal contact address and replace the
  placeholder in `PRIVACY.md` and `TERMS.md`.
- Create a dedicated security contact address or enable GitHub private
  vulnerability reporting, then replace the placeholder in `SECURITY.md`.
- Create a developer/support contact address for account and product-support
  requests.
- Add visible links to `PRIVACY.md`, `TERMS.md`, and `SECURITY.md` from the
  repository README and hosted application.
- Configure a GitHub `noreply` commit email for future commits if the personal
  commit-author email should no longer be published.
- Decide whether the existing Git history should retain the personal
  commit-author email. Rewriting it would require changing commit hashes and a
  force-push, so do not do this accidentally.
- **Current decision:** Do not add a source-code license yet. Revisit this if
  DanceVault's direction becomes clearer or broader reuse is desired. The
  public repository remains subject to GitHub's terms, including GitHub's
  built-in public viewing and forking permissions.

## 2. Cost Controls

- Add service-specific cost monitoring.
- Add upload-size and per-user storage limits.
- Estimate media-processing costs before introducing transcoding.

## 3. Observability

- Add a CloudWatch dashboard and alarms for Lambda errors, API failures,
  DynamoDB throttling, and media-job failures.
- Add structured logs containing request ID, user ID, video ID, and job ID.
- Before deploying observability, choose the private operations-alert email and
  pass it as the `MonitoringAlertEmail` CloudFormation parameter. Confirm the
  SNS subscription from that mailbox after deployment.

### Deferred until self-service registration

- Add registration and email-verification metrics.
- Add signup-abuse monitoring and public-user rate-limit alarms.
- Add per-user usage anomaly alerts and a registration-funnel dashboard.
- Add frontend real-user monitoring after there is meaningful external usage.
- Add media-job failure alarms and `jobId` log fields when asynchronous media
  jobs are introduced.

## 4. Reliable Deletion

- Retry partial S3 and DynamoDB deletion failures.
- Add complete account deletion covering videos, thumbnails, segments,
  DynamoDB records, and the Cognito user.
- Before inviting real users, enable DynamoDB table deletion protection and
  change its CloudFormation removal policy from `DESTROY` to `RETAIN`.

## 5. iPhone MOV Support and Media Normalization

- Accept `video/quicktime` `.mov` uploads.
- Inspect the actual video codec because `.mov` is only a container.
- Convert uploads into one canonical playback format when necessary.
- Diagnose slow playback over mobile data and produce a mobile-friendly
  bitrate or adaptive-streaming output when the original upload is too large
  to stream reliably.
- Preserve original uploads only when there is a clear reason.
- Design normalization together with frame stepping and thumbnails instead of
  only adding `.mov` to the allowed content types.

## 6. Frame-by-Frame Playback

- Run a technical spike using normalized videos.
- Store frame-rate and duration metadata.
- Implement previous-frame and next-frame controls for segments and full
  videos.

## 7. Persistent Thumbnails

- Generate a thumbnail at the segment start time.
- Store it under an S3 key such as
  `users/{userID}/thumbnails/{segmentID}.jpg`.
- Store the thumbnail key on the segment record.
- Generate thumbnails asynchronously through the media-processing pipeline.

## 8. Self-Service User Registration

- Enable Cognito self-registration and email verification.
- Require acceptance of the current legal documents.
- Add per-user quotas, account deletion, password recovery, and abuse
  controls.
- Display the privacy notice and terms during registration.
- Record the accepted policy versions and acceptance timestamp.
- Verify that the privacy, security, and developer/support contact addresses
  are active before registration is opened.

## Deferred Technical Follow-ups

- When adding the `prod` environment, remove the hardcoded `"dev"` value from
  DynamoDB video mapping. The persistence selector should provide the active
  runtime environment when it creates the DynamoDB data-access implementation.
- Automated deployment, a production environment, a custom domain, and a
  broader backup strategy remain deferred.
