import { expect, test } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { InfrastructureStack } from '../lib/infrastructure-stack';

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
  ]));
});
