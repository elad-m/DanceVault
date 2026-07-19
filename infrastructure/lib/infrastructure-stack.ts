import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('Project', 'DanceVault');
    cdk.Tags.of(this).add('Environment', 'Development');

    const dataTable = new dynamodb.Table(
      this,
      'DataTable',
      {
        tableName: 'DanceVaultDevelopmentData',
        partitionKey: {
          name: 'PK',
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: 'SK',
          type: dynamodb.AttributeType.STRING,
        },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        encryption: dynamodb.TableEncryption.AWS_MANAGED,
        deletionProtection: false,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
    );

    dataTable.addGlobalSecondaryIndex({
      indexName: 'SegmentsByVideo',
      partitionKey: {
        name: 'VideoPK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'VideoSK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    dataTable.addGlobalSecondaryIndex({
      indexName: 'UserContentByCreationTime',
      partitionKey: {
        name: 'UserContentPK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'UserContentSK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    new cdk.CfnOutput(this, 'DataTableName', {
      value: dataTable.tableName,
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'DanceVaultDevelopmentUsers',
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('WebClient', {
      userPoolClientName: 'DanceVaultDevelopmentWeb',
      generateSecret: false,
      preventUserExistenceErrors: true,
      authSessionValidity: cdk.Duration.minutes(15),
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
        ],
        callbackUrls: [
          'http://localhost:5173/auth/callback',
        ],
        logoutUrls: [
          'http://localhost:5173/',
        ],
      },
    });

    const userPoolDomain = userPool.addDomain('Domain', {
      cognitoDomain: {
        domainPrefix: 'dancevault-dev',
      },
      managedLoginVersion:
        cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    new cognito.CfnManagedLoginBranding(
      this,
      'ManagedLoginBranding',
      {
        userPoolId: userPool.userPoolId,
        clientId: userPoolClient.userPoolClientId,
        useCognitoProvidedValues: true,
      },
    );

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: userPoolDomain.baseUrl(),
    });

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

    localBackendRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [videoBucket.bucketArn],
      }),
    );

    localBackendRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:BatchWriteItem',
          'dynamodb:TransactWriteItems',
        ],
        resources: [
          dataTable.tableArn,
          `${dataTable.tableArn}/index/*`,
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
