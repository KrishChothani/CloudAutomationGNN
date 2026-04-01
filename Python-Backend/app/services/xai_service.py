"""
xai_service.py
──────────────
Explainability service for the GNN anomaly detector.

explain_node(model, data, node_idx) uses:
  1. GNNExplainer  — identifies which feature dims and subgraph edges matter most
  2. SHAP          — KernelSHAP on the isolated node feature vector for feature-level attribution

Returns:
  {
    "feature_importance": {"cpu": 0.67, "memory": 0.21, "latency": 0.08, ...},
    "important_nodes":    [list of node_ids in the influential subgraph],
    "important_edges":    [[src_id, dst_id], ...],
  }
"""

from typing import Dict, List, Any
import logging
import numpy as np
import torch
import shap
from torch_geometric.data import Data
from torch_geometric.explain import Explainer, GNNExplainer, ModelConfig

from app.services.gnn_model import GraphSAGE
from app.services.graph_builder import FEATURE_COLS

logger = logging.getLogger(__name__)

# Feature column names (same order as graph_builder.py)
FEATURES = FEATURE_COLS   # ["cpu", "memory", "latency", "error_rate", "request_count"]

# Thresholds for "important" mask values
EDGE_IMPORTANCE_THRESHOLD = 0.5
NODE_IMPORTANCE_THRESHOLD = 0.3


def explain_node(
    model: GraphSAGE,
    data: Data,
    node_idx: int,
) -> Dict[str, Any]:
    """
    Generate an XAI explanation for a specific node's anomaly prediction.

    Args:
        model    (GraphSAGE): Trained model in eval() mode.
        data     (Data):      PyG Data object — must have .x, .edge_index, .node_ids
        node_idx (int):       Index of the node to explain (0-based row of data.x).

    Returns:
        dict with keys:
            feature_importance (dict[str, float]) — normalised SHAP attribution per feature
            important_nodes    (list[str])         — node IDs in the important subgraph
            important_edges    (list[[str, str]])  — edge pairs in the important subgraph

    Raises:
        IndexError: If node_idx is out of range for data.x.
    """
    n_nodes = data.x.size(0)

    if node_idx < 0 or node_idx >= n_nodes:
        raise IndexError(
            f"node_idx {node_idx} is out of range [0, {n_nodes - 1}]"
        )

    node_ids: List[str] = getattr(data, "node_ids", [str(i) for i in range(n_nodes)])

    model.eval()

    # ── Step 1: GNNExplainer ─────────────────────────────────────────────────
    gnn_feature_mask, important_node_idxs, important_edge_pairs = _run_gnn_explainer(
        model, data, node_idx, node_ids
    )

    # ── Step 2: SHAP KernelExplainer ─────────────────────────────────────────
    shap_importance = _run_shap(model, data, node_idx, gnn_feature_mask)

    # ── Step 3: Map node indices → IDs ───────────────────────────────────────
    important_node_ids = [node_ids[i] for i in important_node_idxs if i < len(node_ids)]

    return {
        "feature_importance": shap_importance,
        "important_nodes":    important_node_ids,
        "important_edges":    important_edge_pairs,
    }


def _run_gnn_explainer(
    model: GraphSAGE,
    data: Data,
    node_idx: int,
    node_ids: List[str],
):
    """
    Run GNNExplainer to get node and edge masks for the target node.

    Returns:
        (feature_mask, important_node_idxs, important_edge_pairs)
    """
    try:
        explainer = Explainer(
            model=model,
            algorithm=GNNExplainer(epochs=200),
            explanation_type="model",
            node_mask_type="attributes",
            edge_mask_type="object",
            model_config=ModelConfig(
                mode="binary_classification",
                task_level="node",
                return_type="probs",
            ),
        )

        explanation = explainer(data.x, data.edge_index, index=node_idx)

        # ── Feature mask ─────────────────────────────────────────────────────
        # node_mask: [N, F] or [F] — take the target node's row
        if explanation.node_mask is not None:
            node_mask = explanation.node_mask
            if node_mask.ndim == 2:
                feature_mask = node_mask[node_idx].detach().cpu().numpy()
            else:
                feature_mask = node_mask.detach().cpu().numpy()
        else:
            feature_mask = np.ones(data.x.size(1), dtype=np.float32)

        # ── Edge mask → important subgraph ───────────────────────────────────
        important_node_idxs = set()
        important_edge_pairs = []

        if explanation.edge_mask is not None:
            edge_mask_np = explanation.edge_mask.detach().cpu().numpy()
            ei = data.edge_index.cpu().numpy()   # [2, E]

            for eidx, mask_val in enumerate(edge_mask_np):
                if mask_val >= EDGE_IMPORTANCE_THRESHOLD:
                    src_i = int(ei[0, eidx])
                    dst_i = int(ei[1, eidx])
                    important_node_idxs.add(src_i)
                    important_node_idxs.add(dst_i)
                    src_id = node_ids[src_i] if src_i < len(node_ids) else str(src_i)
                    dst_id = node_ids[dst_i] if dst_i < len(node_ids) else str(dst_i)
                    important_edge_pairs.append([src_id, dst_id])

        # Always include the target node itself
        important_node_idxs.add(node_idx)

        return feature_mask, list(important_node_idxs), important_edge_pairs

    except Exception as exc:
        logger.warning(
            f"GNNExplainer failed for node {node_idx}: {exc}. "
            f"Falling back to gradient × input attribution."
        )
        feature_mask = _gradient_times_input(model, data, node_idx)
        return feature_mask, [node_idx], []


def _run_shap(
    model: GraphSAGE,
    data: Data,
    node_idx: int,
    gnn_feature_mask: np.ndarray,
) -> Dict[str, float]:
    """
    Run SHAP KernelExplainer on the node feature vector.

    We isolate the target node (treated as a single-row tabular sample)
    and use the model's output for that node as the prediction function.

    The GNNExplainer mask is used as a multiplicative prior to blend the
    graph-structural importance back in, giving a combined attribution.

    Returns:
        dict[feature_name, normalised_importance_score]
    """
    x_np = data.x.detach().cpu().numpy()          # [N, F]
    node_feature = x_np[node_idx:node_idx + 1]    # [1, F]

    # Background: mean feature values across all nodes (KernelSHAP baseline)
    background = np.mean(x_np, axis=0, keepdims=True)   # [1, F]

    def model_predict(X: np.ndarray) -> np.ndarray:
        """
        Wrapper that runs the GNN on the full graph but replaces the
        target node's features with the perturbed input X (one row at a time).
        """
        results = []
        for row in X:
            x_mod = data.x.clone()
            x_mod[node_idx] = torch.tensor(row, dtype=torch.float)

            with torch.no_grad():
                out = model(x_mod, data.edge_index)   # [N, 1]
                score = float(out[node_idx].item())

            results.append(score)
        return np.array(results)

    try:
        explainer_shap = shap.KernelExplainer(model_predict, background)
        shap_values    = explainer_shap.shap_values(node_feature, nsamples=64)
        # shap_values: [1, F] → squeeze to [F]
        raw = np.abs(shap_values[0] if shap_values.ndim == 2 else shap_values).flatten()

    except Exception as exc:
        logger.warning(f"SHAP failed: {exc}. Falling back to GNNExplainer mask.")
        raw = np.abs(gnn_feature_mask)

    # Blend with GNN feature mask (geometric mean gives combined attribution)
    gnn_abs = np.abs(gnn_feature_mask.flatten()[:len(raw)])
    combined = np.sqrt(raw * gnn_abs + 1e-9)

    # Normalise to sum = 1
    total = combined.sum() + 1e-9
    normalised = combined / total

    return {
        FEATURES[i]: round(float(normalised[i]), 4)
        for i in range(min(len(FEATURES), len(normalised)))
    }


def _gradient_times_input(
    model: GraphSAGE,
    data: Data,
    node_idx: int,
) -> np.ndarray:
    """
    Gradient × Input attribution fallback (no GNNExplainer).

    Returns:
        np.ndarray [F] — per-feature attribution values.
    """
    x = data.x.clone().requires_grad_(True)
    out = model(x, data.edge_index)
    score = out[node_idx]
    score.backward()
    grad = x.grad[node_idx].detach().cpu().numpy()
    input_val = data.x[node_idx].detach().cpu().numpy()
    return np.abs(grad * input_val)
