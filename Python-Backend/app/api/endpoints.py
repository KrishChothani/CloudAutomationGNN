import time
import logging
from typing import Dict, List, Any
from fastapi import APIRouter, HTTPException, Depends

from app.core.model_loader import get_model
from app.services.gnn_model import GraphSAGE
from app.services.graph_builder import build_graph, FEATURE_COLS
from app.services.gnn_inference import run_inference
from app.services.xai_service import explain_node
from app.services.explanation_builder import build_explanation, get_recommended_actions
from app.schemas.models import (
    GraphInput,
    SingleNodeInput,
    PredictResponse,
    ExplainResponse,
    GraphTopologyResponse,
    GraphTopologyNode,
    GraphTopologyEdge,
    NodeFeatures,
    EdgeDefinition,
    SHAPFeature,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Local helpers ─────────────────────────────────────────────────────────────

def _node_features_to_dict(n: NodeFeatures) -> Dict[str, Any]:
    """
    Convert a NodeFeatures schema object into the flat dict that build_graph expects.
    graph_builder FEATURE_COLS = ["cpu", "memory", "latency", "error_rate", "request_count"]
    NodeFeatures fields  = cpu_usage, memory_usage, latency, error_rate, network_in+network_out
    """
    return {
        "id":            n.node_id,
        "cpu":           n.cpu_usage,
        "memory":        n.memory_usage,
        "latency":       n.latency,
        "error_rate":    n.error_rate / 100.0,           # schema is 0-100, model expects 0-1
        "request_count": n.network_in + n.network_out,   # proxy for request volume
    }


def _metrics_to_node_dict(resource_id: str, metrics: Dict[str, float]) -> Dict[str, Any]:
    """
    Convert a SingleNodeInput metrics dict into the flat dict build_graph expects.
    Accepts keys: cpu / cpu_usage, memory / memory_usage, latency, error_rate, request_count.
    """
    def _get(*keys, default=0.0):
        for k in keys:
            if k in metrics:
                return float(metrics[k])
        return default

    return {
        "id":            resource_id,
        "cpu":           _get("cpu", "cpu_usage"),
        "memory":        _get("memory", "memory_usage"),
        "latency":       _get("latency"),
        "error_rate":    _get("error_rate"),
        "request_count": _get("request_count", "network_in"),
    }


# ─── POST /predict ─────────────────────────────────────────────────────────────
@router.post("/predict", response_model=PredictResponse)
async def predict(
    payload: GraphInput,
    model: GraphSAGE = Depends(get_model),
):
    """Run GNN inference over a full graph payload."""
    if not payload.nodes:
        raise HTTPException(status_code=400, detail="nodes list cannot be empty")

    nodes_dicts = [_node_features_to_dict(n) for n in payload.nodes]
    edges_lists  = [[e.source, e.target] for e in payload.edges]
    data = build_graph(nodes_dicts, edges_lists)
    node_ids = [n.node_id for n in payload.nodes]

    predictions, elapsed_ms = run_inference(model, data, node_ids)
    anomaly_count = sum(1 for p in predictions if p.is_anomaly)

    return PredictResponse(
        graph_id=payload.graph_id,
        predictions=predictions,
        anomaly_count=anomaly_count,
        processing_time_ms=round(elapsed_ms, 2),
    )


# ─── POST /predict/single ──────────────────────────────────────────────────────
@router.post("/predict/single")
async def predict_single(
    payload: SingleNodeInput,
    model: GraphSAGE = Depends(get_model),
):
    """Predict anomaly for a single node (no graph context — uses self-loop)."""
    node = _metrics_to_node_dict(payload.resource_id, payload.metrics)
    data = build_graph([node], [])  # No edges → self-loop added in build_graph
    predictions, elapsed_ms = run_inference(model, data, [payload.resource_id])

    pred = predictions[0]
    return {
        "event_id":           payload.event_id,
        "node_id":            pred.node_id,
        "anomaly_score":      pred.anomaly_score,
        "is_anomaly":         pred.is_anomaly,
        "severity":           pred.severity,
        "processing_time_ms": round(elapsed_ms, 2),
    }


# ─── POST /explain ─────────────────────────────────────────────────────────────
@router.post("/explain", response_model=ExplainResponse)
async def explain(
    payload: GraphInput,
    model: GraphSAGE = Depends(get_model),
):
    """Generate XAI explanation for the highest-scoring anomaly node."""
    if not payload.nodes:
        raise HTTPException(status_code=400, detail="nodes list cannot be empty")

    nodes_dicts = [_node_features_to_dict(n) for n in payload.nodes]
    edges_lists  = [[e.source, e.target] for e in payload.edges]
    data = build_graph(nodes_dicts, edges_lists)
    node_ids = [n.node_id for n in payload.nodes]

    predictions, _ = run_inference(model, data, node_ids)

    # Find node with highest anomaly score
    top_pred = max(predictions, key=lambda p: p.anomaly_score)
    node_idx = node_ids.index(top_pred.node_id)
    target_node = payload.nodes[node_idx]

    xai_result = explain_node(model, data, node_idx)
    shap_values = [
        SHAPFeature(feature=k, value=v)
        for k, v in xai_result["feature_importance"].items()
    ]
    affected_node_ids = xai_result["important_nodes"]

    explanation_text = build_explanation(
        node_id=top_pred.node_id,
        node_type=target_node.node_type,
        score=top_pred.anomaly_score,
        shap_values=shap_values,
        affected_node_ids=affected_node_ids,
        severity=top_pred.severity,
    )
    recommended_actions = get_recommended_actions(top_pred.severity)

    return ExplainResponse(
        anomaly_id=payload.graph_id,
        node_id=top_pred.node_id,
        anomaly_score=top_pred.anomaly_score,
        shap_values=shap_values,
        affected_nodes=affected_node_ids,
        explanation=explanation_text,
        recommended_actions=recommended_actions,
    )


# ─── GET /graph ────────────────────────────────────────────────────────────────
@router.get("/graph", response_model=GraphTopologyResponse)
async def get_graph_topology(model: GraphSAGE = Depends(get_model)):
    """Return the current cloud graph topology with anomaly scores for live visualization."""
    # Synthetic demo topology — replace with DB fetch in production
    nodes_raw = [
        NodeFeatures(node_id="ec2-1",    node_type="ec2",    cpu_usage=85, memory_usage=72, disk_usage=45, network_in=120, network_out=80,  error_rate=2.1, latency=210),
        NodeFeatures(node_id="ec2-2",    node_type="ec2",    cpu_usage=42, memory_usage=55, disk_usage=30, network_in=60,  network_out=40,  error_rate=0.5, latency=85),
        NodeFeatures(node_id="rds-1",    node_type="rds",    cpu_usage=91, memory_usage=88, disk_usage=65, network_in=200, network_out=150, error_rate=3.2, latency=450),
        NodeFeatures(node_id="lambda-1", node_type="lambda", cpu_usage=18, memory_usage=30, disk_usage=5,  network_in=20,  network_out=15,  error_rate=0.1, latency=45),
        NodeFeatures(node_id="lambda-2", node_type="lambda", cpu_usage=95, memory_usage=78, disk_usage=10, network_in=300, network_out=250, error_rate=8.5, latency=900),
        NodeFeatures(node_id="elb-1",    node_type="elb",    cpu_usage=60, memory_usage=45, disk_usage=20, network_in=500, network_out=480, error_rate=1.2, latency=120),
    ]
    edges_raw = [
        EdgeDefinition(source="elb-1",  target="ec2-1"),
        EdgeDefinition(source="elb-1",  target="ec2-2"),
        EdgeDefinition(source="ec2-1",  target="rds-1"),
        EdgeDefinition(source="ec2-2",  target="rds-1"),
        EdgeDefinition(source="ec2-1",  target="lambda-1"),
        EdgeDefinition(source="ec2-2",  target="lambda-2"),
    ]

    nodes_dicts = [_node_features_to_dict(n) for n in nodes_raw]
    edges_lists  = [[e.source, e.target] for e in edges_raw]
    data = build_graph(nodes_dicts, edges_lists)
    node_ids = [n.node_id for n in nodes_raw]
    predictions, _ = run_inference(model, data, node_ids)
    pred_map = {p.node_id: p for p in predictions}

    topology_nodes = [
        GraphTopologyNode(
            id=n.node_id,
            label=f"{n.node_type.upper()}-{n.node_id.split('-')[1]}",
            node_type=n.node_type,
            cpu_usage=n.cpu_usage,
            is_anomaly=pred_map[n.node_id].is_anomaly,
            anomaly_score=pred_map[n.node_id].anomaly_score,
        )
        for n in nodes_raw
    ]

    topology_edges = [GraphTopologyEdge(source=e.source, target=e.target) for e in edges_raw]

    return GraphTopologyResponse(nodes=topology_nodes, edges=topology_edges)