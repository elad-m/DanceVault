// CDK unit tests synthesize templates only. Invalid credentials make any
// accidental AWS SDK call fail instead of using a developer's active profile.
process.env.AWS_ACCESS_KEY_ID = "tests-must-not-access-aws";
process.env.AWS_SECRET_ACCESS_KEY = "tests-must-not-access-aws";
process.env.AWS_SESSION_TOKEN = "";
process.env.AWS_EC2_METADATA_DISABLED = "true";
