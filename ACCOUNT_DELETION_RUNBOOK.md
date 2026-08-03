# Manual Account-Data Deletion Runbook

**Scope:** Current invite-only development application.

Use this procedure until DanceVault has one tested account-deletion operation.
This is an administrator runbook, not a user-facing feature.

## Safety Rules

- Verify the requester's identity before deleting anything.
- Work on only one Cognito user ID at a time.
- Never delete the DynamoDB table, S3 bucket, Cognito user pool, or an entire
  shared environment to remove one user.
- Do not copy private videos, tokens, or personal information into GitHub
  issues, commits, or public notes.
- Record which resources were checked and whether deletion succeeded, but do
  not create an unnecessary copy of the deleted personal data.

## 1. Record and Verify the Request

Record privately:

- Request date and source.
- User email address.
- How the user's identity was verified.
- Administrator performing the deletion.
- Reason for urgent disabling, if applicable.

For an ordinary deletion request, keep the account enabled until its application
data is removed. For a compromised or abusive account, disable Cognito access
immediately and follow `SECURITY.md` before continuing.

## 2. Find the Stable Cognito User ID

1. Open the AWS console in `il-central-1`.
2. Open **Amazon Cognito**.
3. Open the `DanceVaultDevelopmentUsers` user pool.
4. Find the user by their verified email address.
5. Record the Cognito `sub` attribute privately as `userID`.
6. Also record Cognito's internal **Username**, because Cognito account deletion
   uses that value.

The DynamoDB partition key and S3 object prefix use the Cognito `sub`, not the
email address.

## 3. Delete the User's S3 Objects

Delete video bytes before metadata. This avoids leaving private video objects
behind if a later database operation fails.

1. Open **Amazon S3** in the AWS console.
2. Open the bucket named by the CloudFormation output `VideoBucketName`.
3. Navigate to the prefix `users/{userID}/`.
4. Review the objects to ensure the prefix belongs to the intended user.
5. Delete every object under that prefix.
6. Refresh the prefix and verify that no objects remain.

This prefix currently contains videos. It should also contain that user's
future thumbnails and other media derivatives, allowing the same procedure to
remove them.

Do not continue silently if deletion fails. Record the failure and resolve the
S3 permission or service error before marking the request complete.

## 4. Delete the User's DynamoDB Items

All current video and segment items for one user share this partition key:

```text
PK = USER#{userID}
```

1. Open **Amazon DynamoDB** in `il-central-1`.
2. Open the `DanceVaultDevelopmentData` table.
3. Choose **Explore table items**.
4. Query the partition key `PK` using the exact value `USER#{userID}`.
5. Confirm that every result belongs to the intended user.
6. Delete every returned video and segment item.
7. Run the same partition-key query again and verify that it returns zero
   items.

The current invite-only dataset is small enough for console deletion. Replace
this manual process with a tested paginated and batched backend operation before
public registration.

## 5. Delete the Cognito Account

Delete the identity only after S3 and DynamoDB are confirmed empty. Keeping it
until last preserves the link between the email, Cognito `sub`, and application
data while cleanup is being verified.

1. Return to the user in the Cognito user pool.
2. Confirm that the Cognito `sub` matches the `userID` used above.
3. Delete the Cognito user.
4. Search for the email address again and verify that the account no longer
   exists.

## 6. Remove Local Development Copies

If the user's data was used during local development:

1. Query local DynamoDB for `PK = USER#{userID}` and delete every returned item.
2. Delete all MinIO objects under `users/{userID}/`.
3. Delete exported request files, screenshots, or temporary video copies that
   were created for debugging.
4. Do not delete unrelated Docker volumes or another user's local data.

## 7. Logs and Temporary Technical Data

The deployed backend CloudWatch log group expires records automatically after
seven days. Logs are not currently indexed for selective account deletion.

For an ordinary request, record that relevant backend logs will age out under
the seven-day retention policy. For an urgent legal or security incident,
obtain advice before deleting evidence or changing log retention.

Signed S3 URLs expire automatically. Deleting the underlying object makes an
existing signed URL unable to return that video.

## 8. Final Verification

Before marking deletion complete, verify all of the following:

- No S3 objects remain under `users/{userID}/`.
- The DynamoDB query for `PK = USER#{userID}` returns zero items.
- The Cognito account no longer exists.
- Relevant local DynamoDB and MinIO data has been removed when applicable.
- Any failures and follow-up actions are recorded privately.
- The requester receives confirmation through a verified private channel.

Do not state that deletion is complete until every applicable check passes.
