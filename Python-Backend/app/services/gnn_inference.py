import time
import torch
import numpy as np
import logging
from typing import List, Tuple
from torch_geometric.data import Data

from app.core.config import get_settings
from app.services.gnn_model import GraphSAGEModel
from app.schemas.models import NodePrediction

logger = logging.getLogger(__name__)
settings = get_settings()


def _score_to_severity(score: float) -> str:
    if score >= 0.85:
        return "critical"
    elif score >= 0.70:
        return "high"
    elif score >= 0.50:
        return "medium"
    else:
        return "low"


def run_inference(
    model: GraphSAGEModel,
    data: Data,
    node_ids: List[str],
    threshold: float = None,
) -> Tuple[List[NodePrediction], float]:
    """
    Run GNN forward pass and return per-node anomaly predictions.

    Args:
        model: Loaded GraphSAGEModel instance
        data: PyG Data object with x and edge_index
        node_ids: Ordered list of node IDs matching data.x rows
        threshold: Anomaly classification threshold (default from settings)

    Returns:
        (predictions, elapsed_ms)
    """
    if threshold is None:
        threshold = settings.ANOMALY_THRESHOLD

    model.eval()
    t0 = time.perf_counter()

    with torch.no_grad():
        # Handle isolated nodes (no edges) — add self-loops
        if data.edge_index.numel() == 0:
            num_nodes = data.x.shape[0]
            self_loops = torch.arange(num_nodes, dtype=torch.long)
            data.edge_index = torch.stack([self_loops, self_loops], dim=0)

        scores: torch.Tensor = model(data.x, data.edge_index)  # [N, 1]
        scores_np: np.ndarray = scores.squeeze(1).cpu().numpy()

    elapsed_ms = (time.perf_counter() - t0) * 1000

    predictions = [
        NodePrediction(
            node_id=node_id,
            anomaly_score=round(float(score), 4),
            is_anomaly=bool(score >= threshold),
            severity=_score_to_severity(float(score)),
        )
        for node_id, score in zip(node_ids, scores_np)
    ]

    anomaly_count = sum(1 for p in predictions if p.is_anomaly)
    logger.info(f"Inference complete — {anomaly_count}/{len(predictions)} anomalies in {elapsed_ms:.1f}ms")

    return predictions, elapsed_ms
