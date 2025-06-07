import { Construct } from "constructs";
import * as eks from "aws-cdk-lib/aws-eks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";
import { ArgoCDConstructProps } from "#types/argo-cd-construct-props";

export class ArgoCDConstruct extends Construct {
  public readonly argoCDAdminPassword: cdk.SecretValue;
  public readonly argoCDAdminPasswordSecret: cdk.aws_secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: ArgoCDConstructProps) {
    super(scope, id);

    const {
      kubernetes_cluster_name,
      kubernetes_cluster_endpoint,
      kubernetes_cluster_cert_data,
      envName = "sandbox",
    } = props;

    // Get the EKS cluster from the provided endpoint and cert data
    const cluster = eks.Cluster.fromClusterAttributes(this, "ImportedCluster", {
      clusterName: kubernetes_cluster_name,
      clusterCertificateAuthorityData: kubernetes_cluster_cert_data,
      clusterEndpoint: kubernetes_cluster_endpoint,
    });

    // Create namespace for ArgoCD
    const argoNamespace = cluster.addManifest("argocd-namespace", {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: "argo",
        labels: {
          name: "argo",
        },
      },
    });

    // Create Service Account for ArgoCD
    const argoCDServiceAccount = cluster.addServiceAccount(
      "argocd-service-account",
      {
        name: "argocd-application-controller",
        namespace: "argo",
      }
    );

    // Add required policies to the service account
    argoCDServiceAccount.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["*"],
        resources: ["*"],
      })
    );

    // Install ArgoCD using Helm Chart
    const argoCDChart = cluster.addHelmChart("ArgoCD", {
      chart: "argo-cd",
      release: "msur",
      repository: "https://argoproj.github.io/argo-helm",
      namespace: "argo",
      values: {
        server: {
          service: {
            type: "LoadBalancer", // This will create a LoadBalancer service
          },
          config: {
            "timeout.reconciliation": "60s",
            "application.resourceTrackingMethod": "annotation",
          },
          rbacConfig: {
            "policy.csv": `
              g, system:cluster-admins, role:admin
            `,
          },
        },
        configs: {
          params: {
            "server.insecure": true, // For testing only, disable in production
          },
        },
      },
    });

    // Add dependency on namespace
    argoCDChart.node.addDependency(argoNamespace);

    // Get the admin password from the secret
    const argoCDAdminSecret = cluster.addManifest("argocd-admin-secret", {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: "argocd-initial-admin-secret",
        namespace: "argo",
      },
      stringData: {
        password: "admin", // In production, use a secure password
      },
    });

    // Add dependency on ArgoCD installation
    argoCDAdminSecret.node.addDependency(argoCDChart);

    // Output ArgoCD server URL
    const argoCDServerURL = `http://${cluster.clusterEndpoint}/api/v1/namespaces/argo/services/msur-argo-cd-server:80/proxy/`;

    new cdk.CfnOutput(scope, "ArgoCDServerURL", {
      value: argoCDServerURL,
      description: "ArgoCD Server URL",
    });

    // Store the admin password in AWS Secrets Manager
    this.argoCDAdminPasswordSecret = new cdk.aws_secretsmanager.Secret(
      scope,
      "ArgoCDAdminPassword",
      {
        secretName: `argocd-admin-password-${envName}`,
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            username: "admin",
          }),
          generateStringKey: "password",
          passwordLength: 16,
          excludePunctuation: true,
        },
      }
    );
    
    // Store the secret value for backward compatibility
    this.argoCDAdminPassword = this.argoCDAdminPasswordSecret.secretValue;

    // Add the admin password to the output
    new cdk.CfnOutput(scope, "ArgoCDAdminPasswordSecret", {
      value: this.argoCDAdminPasswordSecret.secretName,
      description:
        "AWS Secrets Manager secret containing ArgoCD admin password",
    });
  }
}
