from typing import List
from app.schemas.models import SHAPFeature, NodePrediction


SEVERITY_ACTIONS = {
    "critical": [
        "Immediately scale out Auto Scaling Group by 2× instances",
        "Enable CloudWatch detailed monitoring with 10s intervals",
        "Trigger PagerDuty P1 incident and notify on-call engineer",
        "Activate disaster recovery runbook",
    ],
    "high": [
        "Scale out ASG by 1 instance",
        "Enable RDS Multi-AZ standby promotion",
        "Send SNS notification to CloudOps team",
        "Increase Lambda reserved concurrency",
    ],
    "medium": [
        "Monitor metric trend for next 10 minutes",
        "Increase ELB idle timeout",
        "Review recent deployments via CodeDeploy",
        "Check CloudTrail for unusual API patterns",
    ],
    "low": [
        "Log anomaly for trend analysis",
        "Review resource rightsizing recommendations",
        "Schedule preventive maintenance window",
    ],
}

FEATURE_DISPLAY = {
    "cpu_usage": "CPU Utilization",
    "memory_usage": "Memory Pressure",
    "disk_usage": "Disk I/O Activity",
    "network_in": "Inbound Network Traffic",
    "network_out": "Outbound Network Traffic",
    "error_rate": "Error Rate",
    "latency": "Response Latency",
}

NODE_TYPE_DISPLAY = {
    "ec2": "EC2 Instance",
    "rds": "RDS Database",
    "lambda": "Lambda Function",
    "s3": "S3 Bucket",
    "elb": "Load Balancer",
}


def build_explanation(
    node_id: str,
    node_type: str,
    score: float,
    shap_values: List[SHAPFeature],
    affected_node_ids: List[str],
    severity: str,
) -> str:
    """Generate a natural language explanation string."""
    # Find top contributing features
    sorted_shap = sorted(shap_values, key=lambda x: abs(x.value), reverse=True)
    top_features = sorted_shap[:3]

    top_feature_names = [FEATURE_DISPLAY.get(f.feature, f.feature) for f in top_features]
    type_label = NODE_TYPE_DISPLAY.get(node_type.lower(), "Resource")

    top_str = ", ".join(top_feature_names[:2])
    third = top_feature_names[2] if len(top_feature_names) > 2 else None

    explanation = (
        f"The {type_label} node <strong>{node_id}</strong> has been flagged with a "
        f"{severity.upper()} anomaly score of {score * 100:.1f}%. "
        f"Primary drivers are elevated {top_str}"
    )

    if third:
        explanation += f" and abnormal {third}"

    explanation += "."

    if affected_node_ids:
        explanation += (
            f" GNN subgraph analysis identified {len(affected_node_ids)} "
            f"neighboring node(s) with correlated metric deviations, suggesting "
            f"potential cascading propagation across the resource graph."
        )

    if severity in ("critical", "high"):
        explanation += " Automated remediation has been triggered."

    return explanation


def get_recommended_actions(severity: str) -> List[str]:
    return SEVERITY_ACTIONS.get(severity, SEVERITY_ACTIONS["low"])
