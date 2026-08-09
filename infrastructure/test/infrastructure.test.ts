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
      UseCognitoProvidedValues: true,
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
      }),
    },
  });

  template.hasResourceProperties("AWS::Logs::LogGroup", {
    LogGroupName:
      "/aws/lambda/DanceVaultDevelopmentBackend",
    RetentionInDays: 7,
  });
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

  template.resourceCountIs("AWS::CloudWatch::Alarm", 4);

  for (const alarmName of [
    "DanceVaultDevelopment-LambdaErrors",
    "DanceVaultDevelopment-LambdaThrottles",
    "DanceVaultDevelopment-APIServerErrors",
    "DanceVaultDevelopment-DynamoDBThrottles",
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

  template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
    DashboardName: "DanceVaultDevelopmentOperations",
  });

  const dashboards = template.findResources(
    "AWS::CloudWatch::Dashboard",
  );
  expect(JSON.stringify(dashboards)).toContain(
    "Recent backend errors",
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
