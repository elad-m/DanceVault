# DanceVault Data Inventory

**Scope:** Current invite-only development application.

This document records what DanceVault currently stores and where it flows. It
describes the implementation as it exists; it is not a promise to users or a
replacement for the privacy notice.

## Data Flow

```text
Browser -> Cognito -> access token
Browser -> API Gateway -> Lambda -> DynamoDB
Browser -> signed S3 URL -> private video bucket
Lambda -> CloudWatch Logs
Browser -> CloudFront -> private frontend bucket
```

CloudFront serves the compiled frontend application. It does not currently
serve uploaded videos.

## AWS Data Stores

### Amazon Cognito

**Data:** Email address, Cognito user ID, password-verification information,
account status, email-verification state, and optional MFA configuration.

**Purpose:** Registration by an administrator, sign-in, account recovery, and
issuing access tokens.

**Access:** The account owner through Cognito's hosted authentication pages and
the DanceVault AWS administrator. The backend receives the stable Cognito user
ID from a verified access token; it does not receive the user's password.

**Current retention and deletion:** The account remains until an administrator
deletes it. DanceVault does not yet provide self-service account deletion or a
backend operation that deletes the Cognito account.

### Amazon DynamoDB

**Video data:** Cognito user ID, video ID, title, original filename, S3 storage
key, storage-provider name, upload status, segment count, creation timestamp,
entity type, schema version, and internal query keys.

**Segment data:** Cognito user ID, video ID, segment ID, name, optional
description, start and end timestamps, tags, difficulty, confidence, practice
priority, creation timestamp, entity type, schema version, and internal query
keys.

**Purpose:** Store and query the user's video index, segment index, and practice
queue data.

**Access:** The deployed backend Lambda through its IAM role and the DanceVault
AWS administrator. Application queries are scoped by the Cognito user ID.

**Current retention and deletion:** Segment deletion removes its DynamoDB item.
Video deletion removes the video's segment items and video item through the
application deletion flow. There is no complete account-wide deletion command
yet.

### Amazon S3 Video Bucket

**Data:** Uploaded MP4 video bytes. Object keys include the Cognito user ID and
an application-generated upload ID.

**Purpose:** Store original uploaded lesson videos and provide temporary signed
upload and playback URLs.

**Access:** The bucket blocks public access. The backend Lambda can read, write,
and delete video objects. An authenticated user receives time-limited signed
URLs for an object owned by that user. The DanceVault AWS administrator can
access the bucket.

**Current retention and deletion:** A successful application video deletion
removes the S3 object. Incomplete multipart uploads expire after one day. A
partial failure between S3 and DynamoDB is not yet retried automatically.

### Amazon CloudWatch Logs

**Data:** Lambda execution logs, Fastify request metadata, generated request
IDs, error details, route paths, status codes, and execution timing. Logs may
contain user IDs, video IDs, or segment IDs when included in an error context.
Access tokens and video contents are not intentionally logged.

**Purpose:** Diagnose backend requests and failures.

**Access:** The DanceVault AWS administrator and the Lambda execution system.

**Current retention and deletion:** The backend log group automatically retains
logs for seven days. Individual users cannot currently request selective log
deletion through the application.

### Frontend S3 Bucket and Amazon CloudFront

**Data:** Compiled HTML, CSS, and JavaScript application files. CloudFront also
processes ordinary delivery metadata such as IP address, requested path, and
browser/network headers as part of serving the site.

**Purpose:** Host and deliver the DanceVault web application over HTTPS.

**Access:** The frontend bucket is private and readable by CloudFront through
origin access control. The compiled frontend is publicly accessible through the
CloudFront URL.

**Current retention and deletion:** Deployments replace old frontend assets in
the bucket and invalidate the CloudFront cache. DanceVault has not enabled
application analytics or advertising trackers.

## Public GitHub Repository

**Data:** Source code, infrastructure definitions, tests, documentation, public
AWS resource identifiers required by the browser client, and Git commit-author
metadata.

**Purpose:** Version control and public presentation of the engineering
project.

**Access:** Public internet access.

**Excluded data:** AWS credentials, local `.env` files, logs, database files,
raw videos, and private keys are excluded by repository ignore rules. The
tracked `frontend/.env.dev` contains public client configuration, not a secret.

## Local Development Stores

Local DynamoDB, MinIO, environment files, and backend logs can contain copies of
development video data and metadata. They remain on the developer's computer
or in local Docker volumes until manually deleted. They are excluded from Git.

## Data Sensitivity

- **High sensitivity:** Uploaded videos containing identifiable people, faces,
  voices, locations, or private activities.
- **Personal data:** Email address, Cognito user ID, original filename, video
  and segment titles, descriptions, tags, practice data, and associated logs.
- **Public technical data:** Source code, CloudFront URL, API URL, Cognito user
  pool ID, Cognito public client ID, and Cognito domain.

## Known Gaps

- No user-facing privacy notice or terms of use yet.
- No self-service registration or account deletion.
- No single operation deletes all data associated with one user.
- Storage deletion failures are not retried automatically.
- No explicit user-facing retention period for videos and metadata.
- No persistent thumbnails or media-processing derivatives yet.
- No formal incident-response procedure yet.
