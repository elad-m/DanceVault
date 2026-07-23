import { expect, test } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { Match, Template } from 'aws-cdk-lib/assertions';

test('creates a private encrypted development video bucket', () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::S3::Bucket', 1);

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
  });

  template.hasResource('AWS::S3::Bucket', {
    DeletionPolicy: 'Delete',
    UpdateReplacePolicy: 'Delete',
  });
});

test('creates a least-privilege role for the local backend', () => {
  const app = new cdk.App();
  const stack = new InfrastructureStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  const roles = template.findResources('AWS::IAM::Role');

  const localBackendRole = Object.values(roles).find(
    (resource) =>
      resource.Properties?.RoleName === 'DanceVaultLocalBackendRole',
  );

  expect(localBackendRole).toBeDefined();
  expect(JSON.stringify(localBackendRole)).toContain('dancevault-admin');

  const policies = template.findResources('AWS::IAM::Policy');
  const policy = Object.values(policies)[0];
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
    CallbackURLs: ['http://localhost:5173/auth/callback'],
    GenerateSecret: false,
    LogoutURLs: ['http://localhost:5173/'],
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
