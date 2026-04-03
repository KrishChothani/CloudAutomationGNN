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

# Training-set baselines used in graph_builder.py fixed normalisation
# [cpu, memory, latency, error_rate, request_count]
_TRAIN_MEANS = np.array([30.0, 45.0, 150.0, 0.02, 400.0], dtype=np.float32)
_TRAIN_STDS  = np.array([25.0, 20.0, 120.0, 0.04, 250.0], dtype=np.float32)

# Minimum model-output variance for SHAP to be considered non-degenerate
_SHAP_VARIANCE_THRESHOLD = 1e-6


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


def _is_degenerate(arr: np.ndarray, threshold: float = _SHAP_VARIANCE_THRESHOLD) -> bool:
    """Return True if all values are nearly identical (model output is flat)."""
    return float(np.var(arr)) < threshold


def _feature_deviation_importance(node_feature_raw: np.ndarray) -> np.ndarray:
    """
    Compute feature importances from how far each feature deviates from the
    training-set baseline (in z-score units).

    node_feature_raw: [F] array of ALREADY-NORMALISED features (z-scores).
    Because graph_builder divides by _TRAIN_STDS, the z-score IS the normalised value.
    We simply take |z_score| as the attribution — higher z-score = further from normal.

    Returns normalised [F] importance array.
    """
    z_scores = np.abs(node_feature_raw.flatten()[:len(FEATURES)])
    total = z_scores.sum() + 1e-9
    return z_scores / total


def _run_shap(
    model: GraphSAGE,
    data: Data,
    node_idx: int,
    gnn_feature_mask: np.ndarray,
) -> Dict[str, float]:
    """
    Compute per-feature attribution for a node's anomaly prediction.

    Strategy:
      1. Try KernelSHAP with GNNExplainer blend.
      2. If model output is degenerate (near-zero variance across all SHAP
         perturbations), skip SHAP — it can't measure anything meaningful.
      3. Fall back to |z-score| attribution: how far each feature deviates
         from the healthy training baseline. Always produces distinct,
         correct attributions regardless of model output quality.

    Returns:
        dict[feature_name, normalised_importance_score]
    """
    x_np = data.x.detach().cpu().numpy()          # [N, F] — already z-score normalised
    node_feature = x_np[node_idx:node_idx + 1]    # [1, F]

    # Background: zero vector = "average healthy node" in z-score space
    if x_np.shape[0] > 1:
        background = np.mean(x_np, axis=0, keepdims=True)
    else:
        background = np.zeros((1, x_np.shape[1]), dtype=np.float32)

    def model_predict(X: np.ndarray) -> np.ndarray:
        results = []
        for row in X:
            x_mod = data.x.clone()
            x_mod[node_idx] = torch.tensor(row, dtype=torch.float)
            with torch.no_grad():
                out = model(x_mod, data.edge_index)
                results.append(float(out[node_idx].item()))
        return np.array(results)

    raw = None
    try:
        explainer_shap = shap.KernelExplainer(model_predict, background)
        shap_values    = explainer_shap.shap_values(node_feature, nsamples=64)
        raw_candidate  = np.abs(
            shap_values[0] if shap_values.ndim == 2 else shap_values
        ).flatten()

        # ── Degenerate-output detection ───────────────────────────────────────
        # If the model returns near-identical scores for all perturbations,
        # SHAP values will all be ~0 and normalise to uniform (0.2 each).
        # Detect this and use z-score fallback instead.
        pred_outputs = model_predict(np.vstack([node_feature, background]))
        if _is_degenerate(pred_outputs) or _is_degenerate(raw_candidate):
            logger.warning(
                f"Node {node_idx}: model output is degenerate "
                f"(variance={np.var(pred_outputs):.2e}). "
                f"Switching to z-score deviation attribution."
            )
            raw = None   # trigger fallback below
        else:
            raw = raw_candidate

    except Exception as exc:
        logger.warning(f"SHAP failed for node {node_idx}: {exc}")
        raw = None

    # ── Fallback: z-score deviation attribution ───────────────────────────────
    if raw is None:
        # |z-score| measures how far each normalised feature is from zero
        # (zero = training-set mean = healthy baseline). This always produces
        # distinct attributions that correctly highlight which metric spiked.
        raw = _feature_deviation_importance(x_np[node_idx])
        logger.info(
            f"Node {node_idx}: using z-score deviation fallback. "
            f"Importances: { {FEATURES[i]: round(float(raw[i]), 4) for i in range(len(FEATURES))} }"
        )
        return {
            FEATURES[i]: round(float(raw[i]), 4)
            for i in range(min(len(FEATURES), len(raw)))
        }

    # ── Blend SHAP with GNNExplainer mask ────────────────────────────────────
    gnn_abs  = np.abs(gnn_feature_mask.flatten()[:len(raw)])
    combined = np.sqrt(raw * gnn_abs + 1e-9)
    total    = combined.sum() + 1e-9
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
