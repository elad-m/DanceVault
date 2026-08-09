import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "node:path";
import * as logs from "aws-cdk-lib/aws-logs";
import * as apiGateway from "aws-cdk-lib/aws-apigatewayv2";
import * as apiGatewayIntegrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apiGatewayAuthorizers from
  "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cloudFront from "aws-cdk-lib/aws-cloudfront";
import * as cloudFrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3Deployment from "aws-cdk-lib/aws-s3-deployment";
import * as cloudWatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudWatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('Project', 'DanceVault');
    cdk.Tags.of(this).add('Environment', 'Development');

    const monitoringAlertEmail = new cdk.CfnParameter(
      this,
      "MonitoringAlertEmail",
      {
        type: "String",
        description:
          "Email address that receives DanceVault development operation alarms.",
        allowedPattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
        constraintDescription: "Must be a valid email address.",
      },
    );

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
          "http://localhost:5173/auth/callback",
          "https://d3m4f87b9e10ko.cloudfront.net/auth/callback",
        ],
        logoutUrls: [
          "http://localhost:5173/",
          "https://d3m4f87b9e10ko.cloudfront.net/",
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
            'https://d3m4f87b9e10ko.cloudfront.net',
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

    const frontendBucket = new s3.Bucket(
      this,
      "FrontendBucket",
      {
        blockPublicAccess:
          s3.BlockPublicAccess.BLOCK_ALL,
        encryption:
          s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        versioned: false,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      },
    );

    const frontendDistribution =
      new cloudFront.Distribution(
        this,
        "FrontendDistribution",
        {
          defaultRootObject: "index.html",
          defaultBehavior: {
            origin:
              cloudFrontOrigins.S3BucketOrigin
                .withOriginAccessControl(
                  frontendBucket,
                ),
            viewerProtocolPolicy:
              cloudFront.ViewerProtocolPolicy
                .REDIRECT_TO_HTTPS,
            allowedMethods:
              cloudFront.AllowedMethods
                .ALLOW_GET_HEAD_OPTIONS,
            cachedMethods:
              cloudFront.CachedMethods
                .CACHE_GET_HEAD_OPTIONS,
            cachePolicy:
              cloudFront.CachePolicy
                .CACHING_OPTIMIZED,
            compress: true,
          },
          errorResponses: [
            {
              httpStatus: 403,
              responseHttpStatus: 200,
              responsePagePath: "/index.html",
              ttl: cdk.Duration.minutes(5),
            },
            {
              httpStatus: 404,
              responseHttpStatus: 200,
              responsePagePath: "/index.html",
              ttl: cdk.Duration.minutes(5),
            },
          ],
          priceClass:
            cloudFront.PriceClass.PRICE_CLASS_100,
        },
      );

    new s3Deployment.BucketDeployment(
      this,
      "FrontendDeployment",
      {
        sources: [
          s3Deployment.Source.asset(
            path.join(
              __dirname,
              "../../frontend/dist",
            ),
          ),
        ],
        destinationBucket: frontendBucket,
        distribution: frontendDistribution,
        distributionPaths: ["/*"],
        prune: true,
      },
    );

    new cdk.CfnOutput(this, "FrontendURL", {
      value:
        `https://${frontendDistribution.distributionDomainName}`,
    });

    const backendFunctionName =
      "DanceVaultDevelopmentBackend";

    const backendLogGroup = new logs.LogGroup(
      this,
      "BackendLogGroup",
      {
        logGroupName: `/aws/lambda/${backendFunctionName}`,
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
    );

    const backendFunction = new lambdaNodejs.NodejsFunction(
      this,
      "BackendFunction",
      {
        functionName: backendFunctionName,
        logGroup: backendLogGroup,
        entry: path.join(
          __dirname,
          "../../backend/src/lambdaHandler.ts",
        ),
        projectRoot: path.join(
          __dirname,
          "../../backend",
        ),
        depsLockFilePath: path.join(
          __dirname,
          "../../backend/package-lock.json",
        ),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: cdk.Duration.seconds(30),
        bundling: {
          bundleAwsSDK: true,
          sourceMap: true,
        },
        environment: {
          APP_ENVIRONMENT: "dev",
          AWS_DYNAMODB_REGION: this.region,
          DYNAMODB_TABLE_NAME: dataTable.tableName,
          AWS_S3_REGION: this.region,
          AWS_S3_BUCKET: videoBucket.bucketName,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
          COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        },
      },
    );

    const backendIntegration =
      new apiGatewayIntegrations.HttpLambdaIntegration(
        "BackendIntegration",
        backendFunction,
      );

    const backendAuthorizer =
      new apiGatewayAuthorizers.HttpJwtAuthorizer(
        "BackendAuthorizer",
        userPool.userPoolProviderUrl,
        {
          jwtAudience: [
            userPoolClient.userPoolClientId,
          ],
        },
      );

    const backendAPI = new apiGateway.HttpApi(
      this,
      "BackendAPI",
      {
        apiName: "DanceVaultDevelopmentAPI",
        defaultIntegration: backendIntegration,
        defaultAuthorizer: backendAuthorizer,
        corsPreflight: {
          allowOrigins: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "https://d3m4f87b9e10ko.cloudfront.net",
          ],
          allowHeaders: [
            "authorization",
            "content-type",
          ],
          allowMethods: [
            apiGateway.CorsHttpMethod.GET,
            apiGateway.CorsHttpMethod.POST,
            apiGateway.CorsHttpMethod.PATCH,
            apiGateway.CorsHttpMethod.DELETE,
          ],
          maxAge: cdk.Duration.hours(1),
        },
      },
    );

    backendAPI.addRoutes({
      path: "/{proxy+}",
      methods: [
        apiGateway.HttpMethod.OPTIONS,
      ],
      integration: backendIntegration,
      authorizer:
        new apiGateway.HttpNoneAuthorizer(),
    });

    const monitoringPeriod = cdk.Duration.minutes(5);
    const lambdaInvocations = backendFunction.metricInvocations({
      period: monitoringPeriod,
      statistic: "Sum",
    });
    const lambdaErrors = backendFunction.metricErrors({
      period: monitoringPeriod,
      statistic: "Sum",
    });
    const lambdaThrottles = backendFunction.metricThrottles({
      period: monitoringPeriod,
      statistic: "Sum",
    });
    const lambdaDuration = backendFunction.metricDuration({
      period: monitoringPeriod,
      statistic: "p95",
    });
    const apiRequestCount = backendAPI.metricCount({
      period: monitoringPeriod,
      statistic: "Sum",
    });
    const apiServerErrors = backendAPI.metricServerError({
      period: monitoringPeriod,
      statistic: "Sum",
    });
    const apiLatency = backendAPI.metricLatency({
      period: monitoringPeriod,
      statistic: "p95",
    });
    const dynamoDBReadThrottles = dataTable.metric(
      "ReadThrottleEvents",
      {
        period: monitoringPeriod,
        statistic: "Sum",
      },
    );
    const dynamoDBWriteThrottles = dataTable.metric(
      "WriteThrottleEvents",
      {
        period: monitoringPeriod,
        statistic: "Sum",
      },
    );
    const dynamoDBThrottles = new cloudWatch.MathExpression({
      expression: "readThrottles + writeThrottles",
      usingMetrics: {
        readThrottles: dynamoDBReadThrottles,
        writeThrottles: dynamoDBWriteThrottles,
      },
      period: monitoringPeriod,
      label: "Total throttled requests",
    });
    const dynamoDBSystemErrors =
      dataTable.metricSystemErrorsForOperations({
        period: monitoringPeriod,
        statistic: "Sum",
      });

    const operationsAlertTopic = new sns.Topic(
      this,
      "OperationsAlertTopic",
      {
        topicName: "DanceVaultDevelopmentOperationsAlerts",
        displayName: "DanceVault development operations alerts",
      },
    );

    operationsAlertTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(
        monitoringAlertEmail.valueAsString,
      ),
    );

    const lambdaErrorAlarm = new cloudWatch.Alarm(
      this,
      "LambdaErrorAlarm",
      {
        alarmName: "DanceVaultDevelopment-LambdaErrors",
        alarmDescription:
          "The development backend Lambda returned at least one error.",
        metric: lambdaErrors,
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        comparisonOperator:
          cloudWatch.ComparisonOperator
            .GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudWatch.TreatMissingData.NOT_BREACHING,
      },
    );

    const lambdaThrottleAlarm = new cloudWatch.Alarm(
      this,
      "LambdaThrottleAlarm",
      {
        alarmName: "DanceVaultDevelopment-LambdaThrottles",
        alarmDescription:
          "The development backend Lambda throttled at least one invocation.",
        metric: lambdaThrottles,
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        comparisonOperator:
          cloudWatch.ComparisonOperator
            .GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudWatch.TreatMissingData.NOT_BREACHING,
      },
    );

    const apiServerErrorAlarm = new cloudWatch.Alarm(
      this,
      "APIServerErrorAlarm",
      {
        alarmName: "DanceVaultDevelopment-APIServerErrors",
        alarmDescription:
          "The development API returned at least one 5xx response.",
        metric: apiServerErrors,
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        comparisonOperator:
          cloudWatch.ComparisonOperator
            .GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudWatch.TreatMissingData.NOT_BREACHING,
      },
    );

    const dynamoDBThrottleAlarm = new cloudWatch.Alarm(
      this,
      "DynamoDBThrottleAlarm",
      {
        alarmName: "DanceVaultDevelopment-DynamoDBThrottles",
        alarmDescription:
          "The development DynamoDB table throttled at least one request.",
        metric: dynamoDBThrottles,
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        comparisonOperator:
          cloudWatch.ComparisonOperator
            .GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudWatch.TreatMissingData.NOT_BREACHING,
      },
    );

    for (const alarm of [
      lambdaErrorAlarm,
      lambdaThrottleAlarm,
      apiServerErrorAlarm,
      dynamoDBThrottleAlarm,
    ]) {
      alarm.addAlarmAction(
        new cloudWatchActions.SnsAction(operationsAlertTopic),
      );
    }

    const operationsDashboard = new cloudWatch.Dashboard(
      this,
      "OperationsDashboard",
      {
        dashboardName: "DanceVaultDevelopmentOperations",
      },
    );

    operationsDashboard.addWidgets(
      new cloudWatch.GraphWidget({
        title: "Backend Lambda",
        left: [lambdaInvocations, lambdaErrors, lambdaThrottles],
        right: [lambdaDuration],
        width: 12,
      }),
      new cloudWatch.GraphWidget({
        title: "Backend API",
        left: [apiRequestCount, apiServerErrors],
        right: [apiLatency],
        width: 12,
      }),
      new cloudWatch.GraphWidget({
        title: "DynamoDB",
        left: [dynamoDBThrottles, dynamoDBSystemErrors],
        width: 12,
      }),
      new cloudWatch.LogQueryWidget({
        title: "Recent backend errors",
        logGroupNames: [backendLogGroup.logGroupName],
        queryString: [
          "fields @timestamp, level, event, reqId, userId, videoId, segmentId, msg",
          "| filter level >= 50",
          "| sort @timestamp desc",
          "| limit 50",
        ].join("\n"),
        view: cloudWatch.LogQueryVisualizationType.TABLE,
        width: 12,
      }),
    );

    new cdk.CfnOutput(this, "BackendAPIURL", {
      value: backendAPI.apiEndpoint,
    });

    backendFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:ConditionCheckItem",
          "dynamodb:TransactWriteItems",
        ],
        resources: [
          dataTable.tableArn,
          `${dataTable.tableArn}/index/*`,
        ],
      }),
    );

    backendFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ],
        resources: [videoBucket.arnForObjects("*")],
      }),
    );

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
          'dynamodb:ConditionCheckItem',
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
