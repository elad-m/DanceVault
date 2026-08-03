# DanceVault Privacy Notice

**Effective date:** August 3, 2026  
**Status:** Development draft for the invite-only DanceVault service

DanceVault helps users upload dance lesson videos, identify timestamped
segments, and organize practice. This notice explains what information the
current development service processes and why.

## Information DanceVault Processes

### Account information

DanceVault uses Amazon Cognito for authentication. Cognito processes the user's
email address, account identifier, account status, email-verification state,
password-verification information, and optional multi-factor authentication
configuration. DanceVault does not receive the user's password.

### Uploaded videos

DanceVault stores videos that users choose to upload. Videos can contain faces,
voices, movements, locations, and other information about the user or other
identifiable people.

Users should upload a video only when they have the right to use it and any
permission reasonably required from identifiable people shown or heard in it.

### Video and practice information

DanceVault stores information associated with uploaded videos, including:

- Video and segment identifiers.
- Video titles and original filenames.
- Segment names, descriptions, timestamps, and tags.
- Difficulty, confidence, and practice-priority selections.
- Upload status, creation timestamps, and technical storage information.
- The Cognito account identifier used to keep one user's data separate from
  another user's data.

### Technical information

The service processes technical request and delivery information needed to run
and secure the application. This can include IP address, requested path,
browser and network headers, generated request identifiers, response status,
execution timing, and error details.

DanceVault does not currently use advertising trackers or product analytics.
Cognito and the application use browser storage or cookies that are necessary
for authentication and operation.

## How Information Is Used

DanceVault uses this information to:

- Authenticate users and recover accounts.
- Store, play, organize, and delete uploaded videos.
- Create and manage timestamped dance segments and practice queues.
- Keep each user's content separate from other users' content.
- Diagnose failures, protect the service, and improve reliability.
- Respond to privacy, security, and deletion requests.

DanceVault does not sell personal information or use uploaded videos for
advertising.

## Service Providers and Data Locations

DanceVault uses Amazon Web Services, including Cognito, DynamoDB, S3, Lambda,
API Gateway, CloudWatch, and CloudFront. Development application resources are
configured primarily in AWS's Israel region where the service supports that
configuration. CloudFront is a global content-delivery service and can process
technical delivery information outside that region.

AWS processes information as a service provider needed to operate DanceVault.
The public GitHub repository contains source code and public technical
configuration, not uploaded videos, account records, or AWS credentials.

## Access and Sharing

Uploaded videos and account data are not intentionally made public. Access is
limited to:

- The authenticated user who owns the content.
- DanceVault's backend services acting for that user.
- The DanceVault AWS administrator when needed to operate, secure, or support
  the service.
- AWS systems that provide the infrastructure described above.
- A legal authority or other party when disclosure is required by applicable
  law.

## Retention and Deletion

- Uploaded videos and their metadata remain until the user deletes the video or
  requests account-data deletion.
- Deleting a video through the application is intended to delete its stored
  video object and associated video and segment records.
- Backend application logs are configured to expire after seven days.
- Cognito account information remains until an administrator deletes the
  account.
- Local development copies remain on the developer's computer until manually
  deleted.

DanceVault does not yet provide automated account deletion. During the
invite-only development period, account deletion requests are handled manually.

## User Requests

A user may request:

- Information about the personal data associated with their account.
- Correction of inaccurate account information where supported.
- Deletion of their account and associated DanceVault content.

**Privacy contact:** A dedicated private contact address must be added before
external users are invited. Do not include personal information in a public
GitHub issue.

## Security

DanceVault uses authentication, encrypted AWS storage, private S3 buckets,
time-limited signed video URLs, and access-limited AWS roles. No internet
service can guarantee absolute security. Suspected exposure of an account,
video, or credential should be reported through the private security contact
defined in `SECURITY.md` once that contact is established.

## Changes to This Notice

DanceVault is under active development. This notice may change when the service
adds registration, media processing, thumbnails, analytics, new service
providers, or materially different data uses. The effective date will be
updated when the notice changes.

## Current Availability

DanceVault is currently an invite-only development service and is not open for
public registration.
