# DanceVault Follow-ups

- When adding the `prod` environment, remove the hardcoded `"dev"` value from
  DynamoDB video mapping. The persistence selector should provide the active
  runtime environment when it creates the DynamoDB data-access implementation.
- Add iPhone video compatibility by accepting QuickTime `.mov` uploads in
  addition to `.mp4`, preserving the correct content type and extension. Verify
  browser playback support for the video's codec before deciding whether
  transcoding is necessary.
