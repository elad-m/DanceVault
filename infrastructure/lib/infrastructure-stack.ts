import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('Project', 'DanceVault');
    cdk.Tags.of(this).add('Environment', 'Development');

    const videoBucket = new s3.Bucket(this, 'VideoBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: [
            'http://127.0.0.1:5173',
            'http://localhost:5173',
            'http://192.168.68.59:5173',
          ],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
        },
      ],
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const administratorUser = iam.User.fromUserName(
      this,
      'AdministratorUser',
      'dancevault-admin',
    );

    const localBackendRole = new iam.Role(this, 'LocalBackendRole', {
      roleName: 'DanceVaultLocalBackendRole',
      description: 'Temporary AWS permissions for the local DanceVault backend',
      assumedBy: new iam.ArnPrincipal(administratorUser.userArn),
    });

    localBackendRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
        ],
        resources: [
          videoBucket.arnForObjects('*'),
        ],
      }),
    );

    new cdk.CfnOutput(this, 'LocalBackendRoleArn', {
      value: localBackendRole.roleArn,
    });

    new cdk.CfnOutput(this, 'VideoBucketName', {
      value: videoBucket.bucketName,
    });
  }
}