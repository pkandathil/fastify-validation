const { Stack, Duration, RemovalPolicy, CfnOutput, SecretValue } = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const iam = require('aws-cdk-lib/aws-iam');
const ecs = require('aws-cdk-lib/aws-ecs');
const ecr = require('aws-cdk-lib/aws-ecr');
const logs = require('aws-cdk-lib/aws-logs');
const elbv2 = require('aws-cdk-lib/aws-elasticloadbalancingv2');
const codepipeline = require('aws-cdk-lib/aws-codepipeline');
const codepipeline_actions = require('aws-cdk-lib/aws-codepipeline-actions');
const codebuild = require('aws-cdk-lib/aws-codebuild');
const ecsPatterns = require('aws-cdk-lib/aws-ecs-patterns');



class PrashantAuctionTest extends Stack {
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

    const ecrRepository = new ecr.Repository(
      this,
      `${this.stackName}-ApiRepository`,
      {
        repositoryName: 'prashant-auction-test-to-delete-3',
        removalPolicy: RemovalPolicy.DESTROY
      }
    )

    const containerName = 'fastify-backend'

    const loadBalancedFargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      cpu: 512,
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(ecrRepository),
        //image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
        containerName,
        containerPort: 3000
      },
      serviceName: "prashant-auction-node-service",
      loadBalancerName: 'prashant-auction-test-lb-name',
    });

    // const loadBalancedFargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "MyFargateService", {
    //   cluster: cluster, // Required
    //   cpu: 512, // Default is 256
    //   desiredCount: 6, // Default is 1
    //   taskImageOptions: { image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample") },
    //   memoryLimitMiB: 1024, // Default is 512
    //   publicLoadBalancer: true // Default is true
    // });


    /** PIPELINE SETUP */
    // SOURCE STAGE
    const sourceOutput = new codepipeline.Artifact()
    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'Github_Source',
      output: sourceOutput,
      owner: 'pkandathil',
      repo: 'fastify-validation',
      branch: 'feat/cdk',
      oauthToken: SecretValue.secretsManager('prashant/github/token', {
        jsonField: 'prashant-github-token'
      }),
      trigger: codepipeline_actions.GitHubTrigger.WEBHOOK
    })

    // BUILD STAGE
    const buildProject = new codebuild.PipelineProject(
      this,
      `${this.stackName}-BuildImage`,
      {
        vpc,
        projectName: `${this.stackName}-BuildImage`,
        description: `${this.stackName}: Build app`,
        environmentVariables: {
          REPOSITORY_URI: { value: `${ecrRepository.repositoryUri}` },
          REGION: { value: 'us-east-1' },
          CONTAINER_NAME: { value: containerName },
        },
        environment: {
          buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
          privileged: true
        },
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
            pre_build: {
              commands: [
                'echo "Logging in to Amazon ECR registry and piping the output to Docker log in..."',
                'aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REPOSITORY_URI',
                'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
                'IMAGE_TAG=${COMMIT_HASH:=latest}'
              ]
            },
            build: {
              commands: [
                'echo Build started on `date`',
                'echo "Building Docker image..."',
                'echo $REPOSITORY_URI',
                'docker build -f Dockerfile -t $REPOSITORY_URI:latest .',
                'docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG'
              ]
            },
            post_build: {
              commands: [
                'echo Build completed on `date`',
                'echo "Pushing Docker image..."',
                'echo $REPOSITORY_URI:latest',
                'echo $REPOSITORY_URI:$IMAGE_TAG',
                'docker push $REPOSITORY_URI:latest',
                'docker push $REPOSITORY_URI:$IMAGE_TAG',
                'echo "Creating imageDetail.json"',
                `printf '[{\"name\":\"%s\",\"imageUri\":\"%s\"}]' "$CONTAINER_NAME" "$REPOSITORY_URI:latest" > imageDetail.json`,
                'pwd; ls -al; cat imageDetail.json'
              ]
            }
          },
          artifacts: {
            files: ['imageDetail.json']
          }
        })
      }
    )
    // add policy to push and pull to ECR
    const policy = new iam.PolicyStatement({
      actions: [
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'ecr:BatchCheckLayerAvailability',
        'ecr:InitiateLayerUpload',
        'ecr:CompleteLayerUpload',
        'ecr:GetAuthorizationToken',
        'ecr:PutImage',
        'ecr:UploadLayerPart'
      ],
      resources: ['*']
    })
    buildProject.addToRolePolicy(policy)

    const buildOutput = new codepipeline.Artifact('buildOutput')

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput]
    })

    // DEPLOY STAGE
    const deployAction = new codepipeline_actions.EcsDeployAction({
      actionName: 'DeployAction',
      service: loadBalancedFargateService.service,
      imageFile: new codepipeline.ArtifactPath(buildOutput, 'imageDetail.json'),
      deploymentTimeout: Duration.minutes(20)
    })

    // CREATE PIPELINE
    new codepipeline.Pipeline(this, `${this.stackName}-Pipeline`, {
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction]
        },
        {
          stageName: 'Build',
          actions: [buildAction]
        },
        {
          stageName: 'Deploy',
          actions: [deployAction]
        }
      ]
    })
  }
}

module.exports = { PrashantAuctionTest }
