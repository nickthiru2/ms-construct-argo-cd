export interface ArgoCDConstructProps {
  // Match the Terraform module parameters from the book example
  readonly kubernetes_cluster_id: string;
  readonly kubernetes_cluster_name: string;
  readonly kubernetes_cluster_cert_data: string;
  readonly kubernetes_cluster_endpoint: string;
  readonly eks_nodegroup_id: string;
  readonly envName?: string;
}
