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

## 7. UI Improvements

1. **Done:** Show the signed-in user's email in the top-left account area. Replace or
   supplement it with a display name or nickname when user profiles exist.
2. **Done:** Hide segment description, tags, and difficulty from the create and edit
   interfaces for now. Keep the underlying data until a separate decision is
   made about removing it.
3. **Done:** Make the new-segment editor collapsible instead of keeping it permanently
   visible while watching a video.
4. **Done:** Keep a stable player box for videos of every aspect ratio, and ensure
   fullscreen centers and contains the complete video instead of focusing on
   its top.
5. **Done:** Keep the practice-list edit and delete icon buttons beside each other on
   one row at every supported viewport width.
6. **Done:** Add an All segments view so every saved segment remains accessible,
   including segments excluded from the practice queue. Keep the existing
   segment terminology until the product has a clearer user-facing name for
   the concept.
7. **Done:** Evaluate a black-and-bright-yellow visual direction inspired by the dance
   club reference, including accessibility, contrast, and whether it fits the
   working application rather than only the club logo.
8. Allow users to correct a segment's start and end timestamps after creation.
   Validate the new range and preserve chronological segment ordering in
   DynamoDB.
9. **Done:** Improve the mobile practice view so the player and practice list remain
    conveniently accessible without excessive scrolling or losing the
    selected movement.
10. **Done:** Improve video-title entry during upload. Label the field "Video title"
    and, after a file is selected, prefill it with the filename without its
    extension as selected text. Preserve a title the user has already edited.
11. Replace the technical name "Practice queue" with a clearer user-facing
    name. Keep the current wording until a final choice is made.

### Practice queue naming candidates

- **Practice List:** Clearest and least technical.
- **Practice Set:** Compact; suggests a selected group of movements.
- **Practice Plan:** Implies intentional organization.
- **Practice Playlist:** Works especially well with sequential video playback.
- **Practice Lineup:** Casual and ordered.
- **Practice Rotation:** Suggests recurring items.
- **Rehearsal List:** More dance-oriented.
- **Rehearsal Set:** Concise and domain-specific.
- **Training Set:** Slightly athletic.
- **Review List:** Emphasizes revisiting material.
- **Movement Set:** Focuses on the dance content itself.
- **Movement Playlist:** Expressive and clearly video-oriented.
- **Session Plan:** Suggests what the user will practice now.
- **Today's Practice:** Friendly, but implies daily scheduling.
- **Up Next:** Strong as an interface label, but not a complete feature name.

## 8. Persistent Thumbnails

- Generate a thumbnail at the segment start time.
- Store it under an S3 key such as
  `users/{userID}/thumbnails/{segmentID}.jpg`.
- Store the thumbnail key on the segment record.
- Generate thumbnails asynchronously through the media-processing pipeline.

## 9. Self-Service User Registration

- Enable Cognito self-registration and email verification.
- Add Sign in with Google and Sign in with Apple through Cognito federation,
  including provider setup, callback configuration, and account-linking rules
  for users who previously registered with the same email address.
- Require acceptance of the current legal documents.
- Add per-user quotas, account deletion, password recovery, and abuse
  controls.
- Display the privacy notice and terms during registration.
- Record the accepted policy versions and acceptance timestamp.
- Verify that the privacy, security, and developer/support contact addresses
  are active before registration is opened.

## Deferred Technical Follow-ups

### Manual AWS Deployment Process

- **Understand the targets:** uploaded videos remain in the video S3 bucket,
  application records remain in DynamoDB, the backend runs in Lambda behind
  API Gateway, and the built frontend is stored in a separate S3 bucket and
  served through CloudFront.
- **Build:** run the frontend build to create `frontend/dist`. CDK bundles the
  backend Lambda code automatically during synthesis and deployment.
- **Verify:** run the relevant frontend, backend, and infrastructure tests
  before changing AWS resources.
- **Preview:** run `npx cdk diff --profile dancevault-admin` from
  `infrastructure` and confirm that the reported changes match the intended
  application or infrastructure change.
- **Deploy:** run `npx cdk deploy --profile dancevault-admin`. CDK synthesizes
  the stack, uploads changed assets, and asks CloudFormation to update only
  resources whose definitions or asset hashes changed.
- **Confirm:** test the CloudFront application, authenticated backend requests,
  and any workflow affected by the deployment. Check CloudWatch when a backend
  or background-worker change is involved.
- **Future improvement:** automate these build, test, diff, deployment, and
  smoke-test stages through a controlled deployment pipeline.

- When adding the `prod` environment, remove the hardcoded `"dev"` value from
  DynamoDB video mapping. The persistence selector should provide the active
  runtime environment when it creates the DynamoDB data-access implementation.
- Automated deployment, a production environment, a custom domain, and a
  broader backup strategy remain deferred.
