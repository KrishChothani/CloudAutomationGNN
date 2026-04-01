"""
graph_builder.py
────────────────
Converts raw node/edge lists into a PyTorch Geometric Data object
ready for GNN inference.

Feature schema per node dict:
  {
    "id":            str,
    "cpu":           float (0–100),
    "memory":        float (0–100),
    "latency":       float (10–500 ms),
    "error_rate":    float (0–1),
    "request_count": float (0–1000)
  }

edges is a list of [source_id, target_id] string pairs.
"""

from typing import List, Dict, Any
import numpy as np
import torch
from torch_geometric.data import Data
from sklearn.preprocessing import StandardScaler

# Ordered feature column names — MUST match this order for consistency
FEATURE_COLS = ["cpu", "memory", "latency", "error_rate", "request_count"]
INPUT_DIM    = len(FEATURE_COLS)   # 5


def build_graph(nodes: List[Dict[str, Any]], edges: List[List[str]]) -> Data:
    """
    Build a PyTorch Geometric Data object from raw node and edge lists.

    Args:
        nodes (list[dict]): List of node dicts, each containing:
                            id, cpu, memory, latency, error_rate, request_count
        edges (list[[str, str]]): List of [source_id, target_id] pairs.

    Returns:
        torch_geometric.data.Data: PyG Data with:
            - data.x          FloatTensor [N, 5]  — StandardScaler-normalised features
            - data.edge_index LongTensor  [2, E]  — COO edge index
            - data.node_ids   list[str]           — ordered node ID list

    Raises:
        ValueError: If a node dict is missing required feature keys,
                    or if an edge references an unknown node ID.
    """
    if not nodes:
        raise ValueError("nodes list must not be empty")

    # ── 1. Validate and extract feature matrix ────────────────────────────────
    node_id_to_idx: Dict[str, int] = {}
    feature_rows: List[List[float]] = []

    for i, node in enumerate(nodes):
        node_id = node.get("id")
        if node_id is None:
            raise ValueError(f"Node at index {i} is missing the 'id' field")

        if node_id in node_id_to_idx:
            raise ValueError(f"Duplicate node id: '{node_id}'")

        # Validate all expected features are present
        missing = [col for col in FEATURE_COLS if col not in node]
        if missing:
            raise ValueError(
                f"Node '{node_id}' is missing features: {missing}. "
                f"Expected: {FEATURE_COLS}"
            )

        node_id_to_idx[node_id] = i
        feature_rows.append([float(node[col]) for col in FEATURE_COLS])

    raw_features = np.array(feature_rows, dtype=np.float32)   # [N, 5]

    # ── 2. StandardScaler normalisation ──────────────────────────────────────
    scaler = StandardScaler()
    normalised = scaler.fit_transform(raw_features)            # [N, 5] z-scores

    x = torch.tensor(normalised, dtype=torch.float)

    # ── 3. Build edge_index ───────────────────────────────────────────────────
    if edges:
        src_list: List[int] = []
        dst_list: List[int] = []

        for pair in edges:
            if len(pair) != 2:
                raise ValueError(
                    f"Each edge must be a [source_id, target_id] pair, got: {pair}"
                )
            src_id, dst_id = str(pair[0]), str(pair[1])

            if src_id not in node_id_to_idx:
                raise ValueError(f"Edge source '{src_id}' not found in nodes list")
            if dst_id not in node_id_to_idx:
                raise ValueError(f"Edge target '{dst_id}' not found in nodes list")

            src_list.append(node_id_to_idx[src_id])
            dst_list.append(node_id_to_idx[dst_id])

        edge_index = torch.tensor([src_list, dst_list], dtype=torch.long)
    else:
        # No edges — create self-loops so SAGEConv doesn't fail on isolated nodes
        n = len(nodes)
        loops = list(range(n))
        edge_index = torch.tensor([loops, loops], dtype=torch.long)

    # ── 4. Package into PyG Data ──────────────────────────────────────────────
    data = Data(x=x, edge_index=edge_index)

    # Attach metadata (not used by GNN, useful for debugging / XAI node mapping)
    data.node_ids    = [node["id"] for node in nodes]
    data.num_nodes   = len(nodes)
    data.scaler      = scaler          # keep for inverse_transform if needed

    return data


# ─── Convenience: build from a single node dict (for /predict/single) ─────────
def build_single_node_graph(node: Dict[str, Any]) -> Data:
    """
    Build a single-node graph with a self-loop for isolated inference.

    Args:
        node (dict): Node dict with id + the 5 feature keys.

    Returns:
        Data: PyG Data object with 1 node and 1 self-loop edge.
    """
    return build_graph([node], [])


# ─── Quick sanity check ───────────────────────────────────────────────────────
if __name__ == "__main__":
    sample_nodes = [
        {"id": "ec2-1",   "cpu": 88.0, "memory": 72.0, "latency": 320.0, "error_rate": 0.05, "request_count": 850.0},
        {"id": "lambda-1","cpu": 18.0, "memory": 30.0, "latency":  45.0, "error_rate": 0.01, "request_count": 200.0},
        {"id": "rds-1",   "cpu": 91.0, "memory": 88.0, "latency": 450.0, "error_rate": 0.12, "request_count": 600.0},
    ]
    sample_edges = [
        ["ec2-1",    "lambda-1"],
        ["lambda-1", "rds-1"],
    ]

    data = build_graph(sample_nodes, sample_edges)

    print(f"x shape:          {data.x.shape}")         # [3, 5]
    print(f"edge_index shape: {data.edge_index.shape}") # [2, 2]
    print(f"node_ids:         {data.node_ids}")
    print(f"x (normalised):\n{data.x}")
    print("✅ graph_builder OK")
