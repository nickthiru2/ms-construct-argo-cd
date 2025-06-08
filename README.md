# Welcome to your CDK TypeScript Construct Library project

You should explore the contents of this project. It demonstrates a CDK Construct Library that includes a construct (`MsConstructArgoCd`)
which contains an Amazon SQS queue that is subscribed to an Amazon SNS topic.

The construct defines an interface (`MsConstructArgoCdProps`) to configure the visibility timeout of the queue.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests

## Security Considerations and Future Improvements

The following points outline critical security concerns and areas for enhancement that should be addressed to ensure a robust and secure ArgoCD deployment. These were identified during a review and are noted here for future work:

### 1. IAM Permissions for ArgoCD Service Account (Critical)

- **Current Issue**: The IAM policy currently attached to the ArgoCD service account (`argocd-application-controller`) grants overly broad permissions (`actions: ["*"], resources: ["*"]`).
- **Risk**: This poses a significant security vulnerability, effectively giving the service account administrator access to all AWS resources within the account.
- **Recommendation**:
  - Adhere to the principle of least privilege.
  - The IAM role associated with the ArgoCD service account (configured via IRSA) should have minimal, or potentially no, direct AWS permissions if ArgoCD only manages resources within the EKS cluster.
  - Rely on Kubernetes RBAC for controlling ArgoCD's actions _inside_ the cluster.
  - If ArgoCD needs to interact with other AWS services directly (e.g., via Crossplane), grant only the specific IAM permissions required for those actions.

### 2. ArgoCD Admin Password Management (Critical)

- **Current Issue**: The construct attempts to manage the admin password by creating an AWS Secrets Manager secret. However, it also includes a hardcoded Kubernetes secret (`argocd-initial-admin-secret`) with the password "admin". This can lead to confusion and security risks if the hardcoded password is used or if the Helm chart's own initial secret generation is mishandled.
- **Risk**: Exposure of default or weak credentials.
- **Recommendation**:
  - Remove the manually created Kubernetes secret with the hardcoded "admin" password.
  - Allow the official ArgoCD Helm chart to generate the `argocd-initial-admin-secret` Kubernetes secret with a strong, random password.
  - After the Helm chart deployment, implement a mechanism (e.g., using a CDK custom resource or `KubernetesObjectValue`) to retrieve the `password` field from the Helm-generated `argocd-initial-admin-secret` Kubernetes secret.
  - Store this _retrieved_ password in the AWS Secrets Manager secret (`argocd-admin-password-${envName}`).
  - **Long-Term Strategy**: Plan to integrate ArgoCD with an OIDC identity provider (e.g., AWS IAM Identity Center, Okta) for user authentication, reducing reliance on the local `admin` user.

### 3. Disable `server.insecure: true` (Enable HTTPS)

- **Current Issue**: The ArgoCD server is configured with `server.insecure: true` in the Helm chart values, meaning it serves traffic over HTTP.
- **Risk**: Unencrypted communication, exposing sensitive data (including credentials and application manifests) to man-in-the-middle attacks.
- **Recommendation**:
  - Set `server.insecure: false` in the Helm chart values.
  - Implement TLS termination. Options include:
    - Using an AWS Application LoadBalancer (ALB) Ingress Controller and an ACM certificate.
    - Terminating TLS at the LoadBalancer service itself if it directly fronts ArgoCD, configured with an ACM certificate.
    - Configuring ArgoCD with its own TLS certificates (can be more complex to manage).

### 4. Refine ArgoCD Server URL Output

- **Current Issue**: The ArgoCD server URL is constructed manually in the CDK code, which can be fragile and might not accurately reflect the actual accessible endpoint, especially if Ingress or different service types are used.
- **Recommendation**:
  - Dynamically retrieve the LoadBalancer address (e.g., using `cluster.getServiceLoadBalancerAddress()`) or the Ingress endpoint.
  - Ensure the output URL uses `https://` once HTTPS is enabled.

### 5. Review and Enhance ArgoCD RBAC Configuration

- **Current Issue**: The Helm chart values include a default RBAC policy (`policy.csv: g, system:cluster-admins, role:admin`), which grants ArgoCD's internal `admin` role to the Kubernetes `system:cluster-admins` group.
- **Recommendation**:
  - While this might be acceptable for initial setup, plan for more granular RBAC within ArgoCD as the system matures.
  - Utilize ArgoCD Projects to define scopes for applications, repositories, and deployment targets.
  - Customize the `argocd-rbac-cm` ConfigMap to define specific ArgoCD roles (e.g., `developer`, `viewer`, `project-admin`) and map them to users or SSO groups, adhering to the principle of least privilege for actions within ArgoCD.

By systematically addressing these points, the security and robustness of the ArgoCD deployment can be significantly improved, aligning it with best practices for production environments.
