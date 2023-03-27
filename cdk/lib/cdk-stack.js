const { Stack, Duration, RemovalPolicy, CfnOutput } = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const iam = require('aws-cdk-lib/aws-iam');
const ecs = require('aws-cdk-lib/aws-ecs');
const ecr = require('aws-cdk-lib/aws-ecr');
const logs = require('aws-cdk-lib/aws-logs');
const elbv2 = require('aws-cdk-lib/aws-elasticloadbalancingv2');
const codepipeline = require('aws-cdk-lib/aws-codepipeline');
const codepipeline_actions = require('aws-cdk-lib/aws-codepipeline-actions');
const codebuild = require('aws-cdk-lib/aws-codebuild');



class CdkStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);
    const vpc = new ec2.Vpc(this, `${this.stackName}-VPC`)

    // ECS CLUSTER
    const cluster = new ecs.Cluster(this, `${this.stackName}-Cluster`, {
      clusterName: `${this.stackName}-Cluster`,
      vpc
    })

    // TASK EXECUTION IAM ROLE
    const ecsTaskExecutionRole = new iam.Role(this, `${this.stackName}-Role`, {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description:
        'ECS task to pull container imgaes and publish container logs to Amazon CloudWatch'
    })
    ecsTaskExecutionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AmazonECSTaskExecutionRolePolicy'
      )
    )

    // FARGATE TASK DEFINITION
    const fargateTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      `${this.stackName}-Cluster-TaskDefintion`,
      {
        memoryLimitMiB: 1024,
        cpu: 512,
        taskRole: ecsTaskExecutionRole
      }
    )

    // ECR REPOSITORY
    const ecrRepository = new ecr.Repository(
      this,
      `${this.stackName}-ApiRepository`,
      {
        repositoryName: 'prashant-auction-test-to-delete',
        removalPolicy: RemovalPolicy.DESTROY
      }
    )

    // CLOUDWATCH LOG GROUP
    const logGroup = new logs.LogGroup(this, `${this.stackName}-TaskLogGroup`, {
      logGroupName: '/prashant-auction-test/tasks',
      removalPolicy: RemovalPolicy.DESTROY
    })
    const serviceLogDriver = new ecs.AwsLogDriver({
      logGroup,
      streamPrefix: 'prashant-auction-test'
    })

    const container = fargateTaskDefinition.addContainer(
      `${this.stackName}-Container`,
      {
        //image: ecs.ContainerImage.fromEcrRepository(ecrRepository),
        image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
        environment: {
        },
        logging: serviceLogDriver,
        healthCheck: {
          command: [
            'CMD-SHELL',
            'curl -f http://localhost:3000/status || exit 1'
          ],
          interval: Duration.seconds(30),
          retries: 5,
          startPeriod: Duration.seconds(30),
          timeout: Duration.seconds(30)
        }
      }
    )
    container.addPortMappings({ containerPort: 3000 })

    // FARGATE SERVICE
    const serviceSecurityGroup = new ec2.SecurityGroup(
      this,
      `${this.stackName}-ServiceSecurityGroup`,
      {
        allowAllOutbound: true,
        securityGroupName: `${this.stackName}-ServiceSecurityGroup`,
        vpc
      }
    )
    serviceSecurityGroup.connections.allowFromAnyIpv4(ec2.Port.tcp(3000))


    const service = new ecs.FargateService(this, `${this.stackName}-Service`, {
      cluster,
      taskDefinition: fargateTaskDefinition,
      desiredCount: 1,
      securityGroups: [serviceSecurityGroup]
    })
    const scaling = service.autoScaleTaskCount({ maxCapacity: 2 })
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 50,
      scaleInCooldown: Duration.seconds(60),
      scaleOutCooldown: Duration.seconds(60)
    })

    /** LOAD BALANCER SETUP */
    const loadBalancerSecurityGroup = new ec2.SecurityGroup(
      this,
      `${this.stackName}-LoadBalancerSecurityGroup`,
      {
        securityGroupName: `${this.stackName}-LoadBalancerSecurityGroup`,
        vpc,
        allowAllOutbound: true
      }
    )
    loadBalancerSecurityGroup.connections.allowFromAnyIpv4(ec2.Port.tcp(80))

    const httpALB = new elbv2.ApplicationLoadBalancer(
      this,
      `${this.stackName}-AppLoadBalancer`,
      {
        vpc: vpc,
        internetFacing: true,
        securityGroup: loadBalancerSecurityGroup
      }
    )

    // Add listener - to redirect traffic from http to https
    const httpsApiListner = httpALB.addListener(
      `${this.stackName}-AppLoadBalancer-Listener`,
      {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.fixedResponse(200)
      }
    )

    httpsApiListner.addTargets(
      `${this.stackName}-AppLoadBalancer-Listener-Target2`,
      {
        port: 4000,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targets: [service],
        healthCheck: {
          path: '/status'
        }
      }
    )

    new CfnOutput(this, 'HTTP API endpoint: ', {
      value: httpALB.loadBalancerDnsName
    })

    /** PIPELINE SETUP */
    // SOURCE STAGE
    const sourceOutput = new codepipeline.Artifact()
    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'Github_Source',
      output: sourceOutput,
      owner: 'Four-Nine-Digital',
      repo: 'starter-kit-api',
      branch: 'main',
      oauthToken: SecretValue.secretsManager('prashant/github/token', {
        jsonField: 'prashant-github-token'
      }),
      trigger: codepipeline_actions.GitHubTrigger.WEBHOOK
    })

    const testDBPassword = SecretValue.secretsManager('dev/test-database/pw', {
      jsonField: 'password'
    })



  }
}

module.exports = { CdkStack }
