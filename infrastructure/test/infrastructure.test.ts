import { expect, test } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { Match, Template } from 'aws-cdk-lib/assertions';

test('creates a private encrypted development video bucket', () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::S3::Bucket", 2);

  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        {
          ServerSideEncryptionByDefault: {
            SSEAlgorithm: 'AES256',
          },
        },
      ],
    },
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    LifecycleConfiguration: {
      Rules: [
        {
          AbortIncompleteMultipartUpload: {
            DaysAfterInitiation: 1,
          },
          Status: 'Enabled',
        },
      ],
    },
    CorsConfiguration: {
      CorsRules: [
        Match.objectLike({
          AllowedOrigins: [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://192.168.68.59:5173",
            "https://d3m4f87b9e10ko.cloudfront.net",
          ],
        }),
      ],
    },
  });

  template.hasResource('AWS::S3::Bucket', {
    DeletionPolicy: 'Delete',
    UpdateReplacePolicy: 'Delete',
  });
});

test("creates a private encrypted frontend bucket", () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, "TestStack");
  const template = Template.fromStack(stack);

  const buckets =
    template.findResources("AWS::S3::Bucket");

  const frontendBucketEntry =
    Object.entries(buckets).find(
      ([logicalID]) =>
        logicalID.startsWith("FrontendBucket"),
    );

  if (!frontendBucketEntry) {
    throw new Error("Frontend bucket was not found");
  }

  const [, frontendBucket] = frontendBucketEntry;

  expect(frontendBucket.Properties).toMatchObject({
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        {
          ServerSideEncryptionByDefault: {
            SSEAlgorithm: "AES256",
          },
        },
      ],
    },
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });

  expect(frontendBucket.DeletionPolicy).toBe("Delete");
  expect(frontendBucket.UpdateReplacePolicy).toBe(
    "Delete",
  );
});

test('creates a least-privilege role for the local backend', () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  const roles = template.findResources('AWS::IAM::Role');

  const localBackendRoleEntry = Object.entries(roles).find(
    ([, resource]) =>
      resource.Properties?.RoleName ===
      "DanceVaultLocalBackendRole",
  );

  if (!localBackendRoleEntry) {
    throw new Error("Local backend role was not found");
  }

  const [localBackendRoleLogicalID, localBackendRole] =
    localBackendRoleEntry;

  expect(JSON.stringify(localBackendRole)).toContain(
    "dancevault-admin",
  );

  const policies = template.findResources("AWS::IAM::Policy");

  const policy = Object.values(policies).find((resource) =>
    JSON.stringify(resource.Properties?.Roles).includes(
      localBackendRoleLogicalID,
    ),
  );

  if (!policy) {
    throw new Error("Local backend policy was not found");
  }
  const statements = policy.Properties.PolicyDocument.Statement;

  expect(statements).toEqual(expect.arrayContaining([
    expect.objectContaining({
      Action: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
      ],
      Effect: 'Allow',
    }),
    expect.objectContaining({
      Action: 's3:ListBucket',
      Effect: 'Allow',
    }),
    expect.objectContaining({
      Action: [
        'dynamodb:GetItem',
        'dynamodb:ConditionCheckItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:BatchWriteItem',
        'dynamodb:TransactWriteItems',
      ],
      Effect: 'Allow',
    }),
  ]));
});

test('creates Cognito authentication for the development web app', () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::Cognito::UserPool', 1);
  template.hasResourceProperties('AWS::Cognito::UserPool', {
    AdminCreateUserConfig: {
      AllowAdminCreateUserOnly: true,
    },
    AutoVerifiedAttributes: ['email'],
    MfaConfiguration: 'OPTIONAL',
    UsernameAttributes: ['email'],
    UserPoolTier: 'ESSENTIALS',
  });

  template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
  template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
    AllowedOAuthFlows: ['code'],
    AllowedOAuthFlowsUserPoolClient: true,
    AllowedOAuthScopes: ['openid', 'email'],
    CallbackURLs: [
      "http://localhost:5173/auth/callback",
      "https://d3m4f87b9e10ko.cloudfront.net/auth/callback",
    ],
    GenerateSecret: false,
    LogoutURLs: [
      "http://localhost:5173/",
      "https://d3m4f87b9e10ko.cloudfront.net/",
    ],
    PreventUserExistenceErrors: 'ENABLED',
    AuthSessionValidity: 15,
  });

  template.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);
  template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
    Domain: 'dancevault-dev',
    ManagedLoginVersion: 2,
  });
  template.resourceCountIs(
    'AWS::Cognito::ManagedLoginBranding',
    1,
  );
  template.hasResourceProperties(
    'AWS::Cognito::ManagedLoginBranding',
    {
      UseCognitoProvidedValues: false,
      Settings: Match.objectLike({
        categories: Match.objectLike({
          global: Match.objectLike({
            colorSchemeMode: "DARK",
          }),
        }),
        components: Match.objectLike({
          pageBackground: Match.objectLike({
            darkMode: {
              color: "171714ff",
            },
          }),
          primaryButton: Match.objectLike({
            darkMode: Match.objectLike({
              defaults: {
                backgroundColor: "ffef00ff",
                textColor: "11110fff",
              },
            }),
          }),
        }),
      }),
    },
  );
});

test('creates an encrypted on-demand DanceVault data table', () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::DynamoDB::Table', 1);

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'DanceVaultDevelopmentData',
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: Match.arrayWith([
      {
        AttributeName: 'PK',
        AttributeType: 'S',
      },
      {
        AttributeName: 'SK',
        AttributeType: 'S',
      },
    ]),
    KeySchema: [
      {
        AttributeName: 'PK',
        KeyType: 'HASH',
      },
      {
        AttributeName: 'SK',
        KeyType: 'RANGE',
      },
    ],
    SSESpecification: {
      SSEEnabled: true,
    },
    PointInTimeRecoverySpecification: {
      PointInTimeRecoveryEnabled: true,
      RecoveryPeriodInDays: 35,
    },
  });

  template.hasResource('AWS::DynamoDB::Table', {
    DeletionPolicy: 'Delete',
    UpdateReplacePolicy: 'Delete',
  });
});

test('indexes segments by video and user content by creation time', () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    GlobalSecondaryIndexes: Match.arrayWith([
      Match.objectLike({
        IndexName: 'SegmentsByVideo',
        KeySchema: [
          {
            AttributeName: 'VideoPK',
            KeyType: 'HASH',
          },
          {
            AttributeName: 'VideoSK',
            KeyType: 'RANGE',
          },
        ],
        Projection: {
          ProjectionType: 'ALL',
        },
      }),
      Match.objectLike({
        IndexName: 'UserContentByCreationTime',
        KeySchema: [
          {
            AttributeName: 'UserContentPK',
            KeyType: 'HASH',
          },
          {
            AttributeName: 'UserContentSK',
            KeyType: 'RANGE',
          },
        ],
        Projection: {
          ProjectionType: 'ALL',
        },
      }),
    ]),
  });
});

test("creates the development backend Lambda", () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, "TestStack");
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    FunctionName: "DanceVaultDevelopmentBackend",
    Runtime: "nodejs24.x",
    Architectures: ["arm64"],
    Handler: "index.handler",
    MemorySize: 512,
    Timeout: 30,
    Environment: {
      Variables: Match.objectLike({
        APP_ENVIRONMENT: "dev",
        DYNAMODB_TABLE_NAME: {
          Ref: Match.stringLikeRegexp("DataTable"),
        },
        AWS_S3_BUCKET: {
          Ref: Match.stringLikeRegexp("VideoBucket"),
        },
        VIDEO_DELETION_QUEUE_URL: {
          Ref: Match.stringLikeRegexp("VideoDeletionQueue"),
        },
        AWS_SQS_REGION: {
          Ref: "AWS::Region",
        },
      }),
    },
  });

  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Effect: "Allow",
          Action: Match.arrayWith([
            "sqs:SendMessage",
          ]),
          Resource: {
            "Fn::GetAtt": [
              Match.stringLikeRegexp(
                "VideoDeletionQueue",
              ),
              "Arn",
            ],
          },
        }),
      ]),
    },
  });

  template.hasResourceProperties("AWS::Logs::LogGroup", {
    LogGroupName:
      "/aws/lambda/DanceVaultDevelopmentBackend",
    RetentionInDays: 7,
  });
});

test("creates the video deletion worker Lambda", () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(
    app,
    "TestStack",
  );
  const template = Template.fromStack(stack);

  template.hasResourceProperties(
    "AWS::Lambda::Function",
    {
      FunctionName:
        "DanceVaultDevelopmentVideoDeletionWorker",
      Runtime: "nodejs24.x",
      Architectures: ["arm64"],
      Handler: "index.handler",
      MemorySize: 512,
      Timeout: 60,
      Environment: {
        Variables: Match.objectLike({
          APP_ENVIRONMENT: "dev",
          AWS_DYNAMODB_REGION: {
            Ref: "AWS::Region",
          },
          DYNAMODB_TABLE_NAME: {
            Ref: Match.stringLikeRegexp(
              "DataTable",
            ),
          },
          AWS_S3_REGION: {
            Ref: "AWS::Region",
          },
          AWS_S3_BUCKET: {
            Ref: Match.stringLikeRegexp(
              "VideoBucket",
            ),
          },
        }),
      },
    },
  );

  template.hasResourceProperties(
    "AWS::Lambda::EventSourceMapping",
    {
      BatchSize: 1,
      EventSourceArn: {
        "Fn::GetAtt": [
          Match.stringLikeRegexp(
            "VideoDeletionQueue",
          ),
          "Arn",
        ],
      },
      FunctionName: {
        Ref: Match.stringLikeRegexp(
          "VideoDeletionWorkerFunction",
        ),
      },
    },
  );

  template.hasResourceProperties(
    "AWS::Logs::LogGroup",
    {
      LogGroupName:
        "/aws/lambda/DanceVaultDevelopmentVideoDeletionWorker",
      RetentionInDays: 7,
    },
  );

  const functions = template.findResources(
    "AWS::Lambda::Function",
  );
  const workerFunction = Object.values(functions).find(
    (resource) =>
      resource.Properties?.FunctionName ===
      "DanceVaultDevelopmentVideoDeletionWorker",
  );

  if (!workerFunction) {
    throw new Error(
      "Video deletion worker Lambda was not found",
    );
  }

  const workerRoleLogicalID =
    workerFunction.Properties.Role["Fn::GetAtt"][0];
  const policies = template.findResources(
    "AWS::IAM::Policy",
  );
  const workerPolicy = Object.values(policies).find(
    (resource) =>
      JSON.stringify(resource.Properties?.Roles).includes(
        workerRoleLogicalID,
      ),
  );

  if (!workerPolicy) {
    throw new Error(
      "Video deletion worker IAM policy was not found",
    );
  }

  const statements =
    workerPolicy.Properties.PolicyDocument.Statement;

  expect(statements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        Effect: "Allow",
        Action: expect.arrayContaining([
          "sqs:ReceiveMessage",
          "sqs:ChangeMessageVisibility",
          "sqs:GetQueueUrl",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ]),
      }),
      expect.objectContaining({
        Effect: "Allow",
        Action: expect.arrayContaining([
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:ConditionCheckItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
        ]),
      }),
      expect.objectContaining({
        Effect: "Allow",
        Action: "dynamodb:TransactWriteItems",
      }),
      expect.objectContaining({
        Effect: "Allow",
        Action: "s3:DeleteObject*",
      }),
    ]),
  );

});

test("creates an HTTP API connected to the backend Lambda", () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, "TestStack");
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
    Name: "DanceVaultDevelopmentAPI",
    ProtocolType: "HTTP",
    CorsConfiguration: {
      AllowOrigins: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://d3m4f87b9e10ko.cloudfront.net",
      ],
      AllowHeaders: [
        "authorization",
        "content-type",
      ],
      AllowMethods: [
        "GET",
        "POST",
        "PATCH",
        "DELETE",
      ],
      MaxAge: 3600,
    },
  });

  template.hasResourceProperties(
    "AWS::ApiGatewayV2::Integration",
    {
      IntegrationType: "AWS_PROXY",
      PayloadFormatVersion: "2.0",
    },
  );

  template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
    RouteKey: "$default",
    AuthorizationType: "JWT",
  });

  template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
    RouteKey: "OPTIONS /{proxy+}",
    AuthorizationType: "NONE",
  });

  template.hasResourceProperties(
    "AWS::ApiGatewayV2::Authorizer",
    {
      Name: "BackendAuthorizer",
      AuthorizerType: "JWT",
      IdentitySource: [
        "$request.header.Authorization",
      ],
      JwtConfiguration: {
        Audience: [
          {
            Ref: Match.stringLikeRegexp(
              "UserPoolWebClient",
            ),
          },
        ],
        Issuer: {
          "Fn::GetAtt": [
            Match.stringLikeRegexp("UserPool"),
            "ProviderURL",
          ],
        },
      },
    },
  );

  template.hasResourceProperties("AWS::Logs::LogGroup", {
    LogGroupName:
      "/aws/apigateway/DanceVaultDevelopmentAPI",
    RetentionInDays: 7,
  });

  template.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
    StageName: "$default",
    AccessLogSettings: {
      DestinationArn: {
        "Fn::GetAtt": [
          Match.stringLikeRegexp("BackendAPIAccessLogGroup"),
          "Arn",
        ],
      },
      Format: Match.stringLikeRegexp(
        ".*\\$context\\.requestId.*\\$context\\.status.*\\$context\\.integrationErrorMessage.*",
      ),
    },
  });

  template.hasOutput("BackendAPIURL", {});
});

test("monitors development backend failures and emails operations alerts", () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, "TestStack");
  const template = Template.fromStack(stack);

  template.hasParameter("MonitoringAlertEmail", {
    Type: "String",
    AllowedPattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
  });

  template.hasResourceProperties("AWS::SNS::Topic", {
    TopicName: "DanceVaultDevelopmentOperationsAlerts",
  });

  template.hasResourceProperties("AWS::SNS::Subscription", {
    Protocol: "email",
    Endpoint: {
      Ref: "MonitoringAlertEmail",
    },
  });

  template.resourceCountIs("AWS::CloudWatch::Alarm", 5);

  for (const alarmName of [
    "DanceVaultDevelopment-LambdaErrors",
    "DanceVaultDevelopment-LambdaThrottles",
    "DanceVaultDevelopment-APIServerErrors",
    "DanceVaultDevelopment-DynamoDBThrottles",
    "DanceVaultDevelopment-VideoDeletionDeadLetters",
  ]) {
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      AlarmName: alarmName,
      Threshold: 1,
      EvaluationPeriods: 1,
      DatapointsToAlarm: 1,
      ComparisonOperator: "GreaterThanOrEqualToThreshold",
      TreatMissingData: "notBreaching",
      AlarmActions: Match.arrayWith([
        {
          Ref: Match.stringLikeRegexp("OperationsAlertTopic"),
        },
      ]),
    });
  }

  template.hasResourceProperties("AWS::CloudWatch::Alarm", {
    AlarmName: "DanceVaultDevelopment-LambdaErrors",
    Namespace: "AWS/Lambda",
    MetricName: "Errors",
  });

  template.hasResourceProperties("AWS::CloudWatch::Alarm", {
    AlarmName: "DanceVaultDevelopment-APIServerErrors",
    Namespace: "AWS/ApiGateway",
    MetricName: "5xx",
  });

  template.hasResourceProperties("AWS::CloudWatch::Alarm", {
    AlarmName:
      "DanceVaultDevelopment-VideoDeletionDeadLetters",
    Namespace: "AWS/SQS",
    MetricName:
      "ApproximateNumberOfMessagesVisible",
    Statistic: "Maximum",
    Dimensions: Match.arrayWith([
      Match.objectLike({
        Name: "QueueName",
        Value: {
          "Fn::GetAtt": [
            Match.stringLikeRegexp(
              "VideoDeletionDeadLetterQueue",
            ),
            "QueueName",
          ],
        },
      }),
    ]),
  });

  template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
    DashboardName: "DanceVaultDevelopmentOperations",
  });

  const dashboards = template.findResources(
    "AWS::CloudWatch::Dashboard",
  );
  expect(JSON.stringify(dashboards)).toContain(
    "Recent backend errors",
  );
  expect(JSON.stringify(dashboards)).toContain(
    "Recent API failures",
  );
  expect(JSON.stringify(dashboards)).toContain(
    "Failed video deletion jobs",
  );
});

test("hosts the frontend through CloudFront", () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, "TestStack");
  const template = Template.fromStack(stack);

  template.hasResourceProperties(
    "AWS::CloudFront::Distribution",
    {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: "index.html",
        Enabled: true,
        PriceClass: "PriceClass_100",
        DefaultCacheBehavior: Match.objectLike({
          AllowedMethods: [
            "GET",
            "HEAD",
            "OPTIONS",
          ],
          CachedMethods: [
            "GET",
            "HEAD",
            "OPTIONS",
          ],
          Compress: true,
          ViewerProtocolPolicy:
            "redirect-to-https",
        }),
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: "/index.html",
          }),
          Match.objectLike({
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: "/index.html",
          }),
        ]),
      }),
    },
  );

  template.resourceCountIs(
    "AWS::CloudFront::OriginAccessControl",
    1,
  );

  template.hasOutput("FrontendURL", {});

  template.hasResourceProperties(
    "Custom::CDKBucketDeployment",
    {
      DestinationBucketName: {
        Ref: Match.stringLikeRegexp(
          "FrontendBucket",
        ),
      },
      DistributionId: {
        Ref: Match.stringLikeRegexp(
          "FrontendDistribution",
        ),
      },
      DistributionPaths: ["/*"],
      Prune: true,
    },
  );
});

test("creates retryable video deletion queues", () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, "TestStack");
  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::SQS::Queue", 2);

  template.hasResourceProperties("AWS::SQS::Queue", {
    QueueName:
      "DanceVaultDevelopmentVideoDeletionDeadLetters",
    MessageRetentionPeriod: 1_209_600,
    SqsManagedSseEnabled: true,
  });

  template.hasResourceProperties("AWS::SQS::Queue", {
    QueueName: "DanceVaultDevelopmentVideoDeletionJobs",
    MessageRetentionPeriod: 345_600,
    VisibilityTimeout: 360,
    SqsManagedSseEnabled: true,
    RedrivePolicy: {
      deadLetterTargetArn: {
        "Fn::GetAtt": [
          Match.stringLikeRegexp(
            "VideoDeletionDeadLetterQueue",
          ),
          "Arn",
        ],
      },
      maxReceiveCount: 5,
    },
  });
});
