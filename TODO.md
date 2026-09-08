# DanceVault Priority Roadmap

## Current Product Work

1. **Done:** Redesign **All videos** as a vertical, thumbnail-led list that
   scales to larger libraries, and expose the existing video-title editing
   capability in that view.
2. **Done locally:** Add **Main List** as the first/default tab, followed by
   All videos and All segments. Users explicitly add/remove segments and
   reorder them with arrow controls or drag-and-drop. The backend API, focused
   watch-and-order UI, searchable thumbnail picker, persistent membership
   indicators, add-from-All-segments shortcut, conflict handling, and
   mouse/touch/keyboard ordering are implemented and locally verified.
   The ordered, versioned list is stored as one item per user (maximum 500
   segments), so no new DynamoDB index is needed. Deleted references are hidden
   on reads and removed from storage on the next list save. Conflicting saves
   reload the saved list. Deployment remains.
   Practice queue and priority/confidence controls are hidden; their backend
   fields and route remain for compatibility and can be reconsidered later.

## Product Naming

- Reconsider the `DanceVault` name. It is not easy to say and "vault" suggests
  secure storage rather than the app's actual purpose.
- The core product loop is: save a useful dance-video segment, revisit and
  practice it, reassess confidence, and update what deserves attention next.
- Useful naming roots include **Loop**, **Repertoire**, **Practice**,
  **Replay**, **Refine**, and **Review**.
- Current candidates: **DanceLoop**, **PracticeLoop**, **MoveLoop**,
  **DanceReplay**, **MoveReplay**, **DanceRefine**, **Repertoire**,
  **My Repertoire**, **Practice Repertoire**, **DanceReview**,
  **MoveReview**, **PracticeDeck**, and **MoveDeck**.
- **Current leading candidate:** `DanceLoop`. It is easy to say and connects
  video repetition with the recurring practice and reassessment cycle. Its
  weakness is that it does not explicitly communicate a personal saved
  repertoire.
- `DanceLog` remains a possible direction, but it emphasizes recording what
  was learned more than repeated practice, prioritization, and confidence
  updates.

### Rename impact and recommended scope

- A future product rename should initially change only user-facing branding:
  the app title, visible labels, logo, favicon, installed-app icons, and public
  legal and branding documents.
- Keep `DanceVault` as the internal infrastructure codename unless renaming a
  specific resource has a concrete operational benefit. DynamoDB table,
  Lambda, SQS, SNS, IAM role, CloudWatch alarm, Docker volume, and local test
  names do not need to match the public product name.
- Do not rename the DynamoDB table merely for branding. Its physical name
  cannot be changed in place and replacing it would require a deliberate data
  migration. S3 object keys and DynamoDB item keys are already independent of
  the product name, so a user-facing rename requires no user-data migration.
- Defer changing the Cognito `dancevault-dev` login domain until a permanent
  public or custom domain is selected. Changing it requires coordinated
  infrastructure and frontend configuration updates.
- CloudWatch alarm names may remain internal. Renaming them would reset alarm
  resources/history and require updating Gmail filters and operator-facing
  alert expectations.
- Renaming the GitHub repository and local workspace directory is optional and
  independent of the application and AWS resource names. If the repository is
  renamed, update the local Git remote; if the directory is renamed, update
  absolute documentation paths and reopen local tools.
- Therefore, choosing a new name and designing its icon is a small branding
  change, not an AWS or database migration, provided internal resource names
  remain stable.

## 1. Privacy, Security, and Legal Baseline

- Audit the public Git history for credentials and personal data.
- Confirm videos, emails, and user records exist only in AWS, not Git.
- **Done:** Draft a basic privacy policy, terms of use, acceptable-use and copyright
  rules, retention policy, and face-recording consent expectations.
- **Done:** Define account and user-data deletion rights and a private contact
  route for exercising them. Account deletion is currently handled manually.
- Obtain an Israeli privacy lawyer's review before opening public registration.

### Owner setup required before inviting external users

- [x] Use `elad.apps.contact@gmail.com` as the shared private contact for
  privacy, legal, security, account deletion, and product-support requests.
- **Done:** Publish Privacy Notice and Terms of Use links in the hosted app's
  sign-in screen, account menu, upload flow, and public legal routes. Keep the
  security-reporting policy in the public repository.
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

- **Done:** Add service-specific cost monitoring.
- **Done:** Enforce per-file limits using both the client-announced size and the
  storage-verified object size.
- **Done:** Enforce per-user quotas of 10 GB stored or reserved video data,
  100 videos, 1,000 segments, 200 segments per video, and three pending video
  uploads. Store storage-verified video sizes, update counters atomically with
  writes and deletions, and provide guarded local and development reconciliation
  audits for existing data.
- Estimate media-processing costs before introducing transcoding.

## 3. Observability

- **Done:** Add a CloudWatch dashboard and alarms for Lambda errors, API failures,
  DynamoDB throttling, and media-job failures.
- **Done:** Add API Gateway access logs and a dashboard query that identifies
  5xx request IDs, routes, statuses, and integration errors that occur before
  the backend Lambda can log them.
- **Done:** Load only visible segment thumbnails and limit signed-thumbnail URL
  requests to three concurrent calls so list rendering does not create a
  Lambda request burst.
- Add structured logs containing request ID, user ID, video ID, and job ID.
- **Done:** Before deploying observability, choose the private operations-alert
  email and pass it as the `MonitoringAlertEmail` CloudFormation parameter.
  Confirm the SNS subscription from that mailbox after deployment.
- Keep the current one-failure alarm thresholds while usage is private and
  small. Review alarm history after the bounded thumbnail loader is deployed
  before deciding whether notification aggregation is necessary.
- Monitor the reduced new-account Lambda concurrency quota after deploying the
  bounded thumbnail loader. AWS may raise the current limit of 10 automatically
  as the account establishes normal usage. If legitimate requests continue to
  be throttled, contact AWS Support and ask for a limit of 50; Service Quotas
  cannot directly request a value below its standard default of 1,000.

### Deferred until self-service registration

- Add registration and email-verification metrics.
- Add signup-abuse monitoring and public-user rate-limit alarms.
- Add per-user usage anomaly alerts and a registration-funnel dashboard.
- Add frontend real-user monitoring after there is meaningful external usage.
- Add media-job failure alarms and `jobId` log fields when asynchronous media
  jobs are introduced.

## 4. Reliable Deletion

- **Done:** Retry partial S3 and DynamoDB video-deletion failures through SQS,
  with a dead-letter queue for repeatedly failing jobs.
- Add complete account deletion covering videos, thumbnails, segments,
  DynamoDB records, and the Cognito user.
- Before inviting real users, enable DynamoDB table deletion protection and
  change its CloudFormation removal policy from `DESTROY` to `RETAIN`.

## 5. iPhone MOV Support and Media Normalization

- **Done:** Accept `video/quicktime` `.mov` uploads and confirm direct playback,
  seeking, segment creation, and practice playback for both tested iPhone MOV
  formats without conversion.
- Inspect the actual video codec because `.mov` is only a container.
- Convert uploads into one canonical playback format when necessary.
- Diagnose slow playback over mobile data and produce a mobile-friendly
  bitrate or adaptive-streaming output when the original upload is too large
  to stream reliably.
- Preserve original uploads only when there is a clear reason.
- Design normalization together with frame stepping and thumbnails instead of
  only adding `.mov` to the allowed content types.

## 6. Frame-by-Frame Playback

- **Done:** Complete a MediaBunny/WebCodecs technical spike against existing MP4
  and MOV uploads without requiring normalized videos first.
- Store frame-rate and duration metadata.
- **Done:** Implement previous-frame and next-frame controls for segment
  playback, with a normal-player fallback when the browser cannot decode the
  video through WebCodecs.

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
12. **Done:** Redesign **All videos** as a vertical list with persistent video
    thumbnails and inline title editing.
13. Replace the current practice ordering formula with either explicit
    priority/confidence sort controls or persistent drag-and-drop manual order.

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

- **Done:** Generate a thumbnail at the segment start time in the browser.
- **Done:** Store it under an S3 key such as
  `users/{userID}/thumbnails/segments/{segmentID}.jpg`.
- **Done:** Derive the deterministic thumbnail key from the segment ID and
  persist the image in MinIO or AWS S3 without adding another database field.
- **Done:** Generate and persist video thumbnails under
  `users/{userID}/thumbnails/videos/{videoID}.jpg`, repair thumbnails lazily for
  existing videos, and limit browser repair work to visible video rows with two
  concurrent requests.
- **Done:** Lazily move legacy segment thumbnails from `thumbnails/{segmentID}`
  to `thumbnails/segments/{segmentID}` when they are first requested, while
  deletion cleans up both locations during the migration period.
- Generate thumbnails asynchronously through a media-processing pipeline only
  if browser capture proves insufficient for future formats or workflows.

## 9. Self-Service User Registration

- Enable Cognito self-registration and email verification.
- Add Sign in with Google and Sign in with Apple through Cognito federation,
  including provider setup, callback configuration, and account-linking rules
  for users who previously registered with the same email address.
- Require acceptance of the current legal documents.
- Add account deletion, password recovery, and abuse controls.
- Display the privacy notice and terms during registration.
- Record the accepted policy versions and acceptance timestamp.
- Verify that the privacy, security, and developer/support contact addresses
  are active before registration is opened.

## Deferred Technical Follow-ups

- Update the frontend's existing transitive Browserslist dependency and rerun
  the build/audit: npm reports GHSA-c83g-rgw3-j3cx and GHSA-73wf-gq98-2v4g
  for versions through 4.28.6. This is separate from the Main List dependencies.

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
- After auditing storage to confirm no segment thumbnails remain under the
  legacy `thumbnails/{segmentID}` path, remove the lazy migration and dual-path
  deletion compatibility code.
- Automated deployment, a production environment, a custom domain, and a
  broader backup strategy remain deferred.
