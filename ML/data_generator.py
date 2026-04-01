"""
data_generator.py
─────────────────
Generate a synthetic cloud infrastructure graph for GNN training.

Topology:
  - 8 EC2 instances  (web/app tier)
  - 5 Lambda functions
  - 4 RDS databases
  - 3 S3 buckets
  Total: 20 nodes

Features per node:
  cpu           (float, 0–100)
  memory        (float, 0–100)
  latency       (float, 10–500 ms)
  error_rate    (float, 0–1)
  request_count (float, 0–1000)

Anomaly injection (4 nodes):
  cpu > 85, memory > 90, latency > 400

Edges (directed, realistic):
  EC2     → Lambda  (each EC2 fans out to 1–2 Lambdas)
  Lambda  → RDS     (each Lambda writes to 1 RDS)
  Lambda  → S3      (each Lambda stores artefacts in S3)
  RDS[0]  → RDS[1]  (primary → replica replication)

Outputs:
  data/cloud_graph.json  — {nodes, edges, labels} (human-readable)
  data/graph_data.pt     — PyG Data object (used by train_gnn.py)

Usage:
  python data_generator.py
"""

import json
import os
import random
import numpy as np
import torch
from torch_geometric.data import Data
from sklearn.preprocessing import StandardScaler

# ─── Reproducibility ──────────────────────────────────────────────────────────
SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)

# ─── Feature column order (must match graph_builder.py) ───────────────────────
FEATURE_COLS = ["cpu", "memory", "latency", "error_rate", "request_count"]

# ─── Node type counts ─────────────────────────────────────────────────────────
N_EC2    = 8
N_LAMBDA = 5
N_RDS    = 4
N_S3     = 3
N_TOTAL  = N_EC2 + N_LAMBDA + N_RDS + N_S3   # 20

# ─── Anomaly indices (4 nodes — spread across EC2 and Lambda) ─────────────────
ANOMALY_INDICES = {0, 3, 8, 11}   # ec2-0, ec2-3, lambda-3, rds-0


def _normal_features(node_type: str) -> dict:
    """Sample realistic normal-range metrics for a given node type."""
    base = {
        "EC2":    dict(cpu=(10, 55),  memory=(20, 65),  latency=(30,  150), error_rate=(0.001, 0.03), request_count=(100, 700)),
        "Lambda": dict(cpu=( 5, 30),  memory=(15, 50),  latency=(15,   80), error_rate=(0.001, 0.02), request_count=( 50, 400)),
        "RDS":    dict(cpu=(10, 45),  memory=(30, 70),  latency=(20,  120), error_rate=(0.001, 0.01), request_count=(200, 800)),
        "S3":     dict(cpu=( 1,  8),  memory=( 5, 20),  latency=( 5,   40), error_rate=(0.000, 0.005), request_count=(300, 900)),
    }.get(node_type, dict(cpu=(10, 50), memory=(20, 60), latency=(20, 150), error_rate=(0.001, 0.03), request_count=(100, 500)))

    return {
        "cpu":           round(random.uniform(*base["cpu"]), 2),
        "memory":        round(random.uniform(*base["memory"]), 2),
        "latency":       round(random.uniform(*base["latency"]), 2),
        "error_rate":    round(random.uniform(*base["error_rate"]), 4),
        "request_count": round(random.uniform(*base["request_count"]), 1),
    }


def _anomalous_features() -> dict:
    """Sample anomalous metrics: cpu > 85, memory > 90, latency > 400."""
    anomaly_type = random.choice(["cpu_spike", "memory_leak", "latency_surge", "combined"])
    base = _normal_features("EC2")

    if anomaly_type == "cpu_spike":
        base["cpu"]     = round(random.uniform(86, 99), 2)
        base["latency"] = round(random.uniform(200, 480), 2)
    elif anomaly_type == "memory_leak":
        base["memory"]  = round(random.uniform(91, 99), 2)
        base["cpu"]     = round(random.uniform(60, 85), 2)
    elif anomaly_type == "latency_surge":
        base["latency"]    = round(random.uniform(401, 500), 2)
        base["error_rate"] = round(random.uniform(0.08, 0.25), 4)
    else:  # combined
        base["cpu"]        = round(random.uniform(86, 99), 2)
        base["memory"]     = round(random.uniform(91, 99), 2)
        base["latency"]    = round(random.uniform(401, 500), 2)
        base["error_rate"] = round(random.uniform(0.06, 0.20), 4)

    return base


def generate_nodes() -> list:
    """Create 20 node dicts with id, type, and sampled features."""
    nodes = []
    idx = 0

    for t_name, count in [("EC2", N_EC2), ("Lambda", N_LAMBDA), ("RDS", N_RDS), ("S3", N_S3)]:
        for i in range(count):
            node_id = f"{t_name.lower()}-{i}"
            is_anomaly = idx in ANOMALY_INDICES
            feats = _anomalous_features() if is_anomaly else _normal_features(t_name)
            nodes.append({
                "id":           node_id,
                "type":         t_name,
                "label":        1 if is_anomaly else 0,
                **feats,
            })
            idx += 1

    return nodes


def generate_edges(nodes: list) -> list:
    """
    Build realistic directed edges:
      EC2 → Lambda  (each EC2 → 1 random Lambda)
      Lambda → RDS  (each Lambda → 1 random RDS)
      Lambda → S3   (each Lambda → 1 random S3)
      RDS[0] → RDS[1]  (primary → replica)
    Returns list of [source_id, target_id] pairs.
    """
    ec2_ids    = [n["id"] for n in nodes if n["type"] == "EC2"]
    lambda_ids = [n["id"] for n in nodes if n["type"] == "Lambda"]
    rds_ids    = [n["id"] for n in nodes if n["type"] == "RDS"]
    s3_ids     = [n["id"] for n in nodes if n["type"] == "S3"]

    edges = []

    # EC2 → Lambda (each EC2 fans out to 1–2 lambdas)
    for ec2_id in ec2_ids:
        targets = random.sample(lambda_ids, min(2, len(lambda_ids)))
        for t in targets:
            edges.append([ec2_id, t])

    # Lambda → RDS
    for lam_id in lambda_ids:
        rds_target = random.choice(rds_ids)
        edges.append([lam_id, rds_target])

    # Lambda → S3
    for lam_id in lambda_ids:
        s3_target = random.choice(s3_ids)
        edges.append([lam_id, s3_target])

    # RDS primary → replica (first two RDS nodes)
    if len(rds_ids) >= 2:
        edges.append([rds_ids[0], rds_ids[1]])

    # Deduplicate
    seen = set()
    unique_edges = []
    for e in edges:
        key = tuple(e)
        if key not in seen:
            seen.add(key)
            unique_edges.append(e)

    return unique_edges


def build_pyg_data(nodes: list, edges: list) -> Data:
    """
    Build a PyG Data object from the generated node and edge lists.
    Features are StandardScaler-normalised.

    Returns:
        Data with .x, .edge_index, .y, .node_ids
    """
    node_id_to_idx = {n["id"]: i for i, n in enumerate(nodes)}

    # Feature matrix [20, 5]
    raw_features = np.array(
        [[n[col] for col in FEATURE_COLS] for n in nodes],
        dtype=np.float32,
    )

    scaler = StandardScaler()
    normalised = scaler.fit_transform(raw_features)

    x = torch.tensor(normalised, dtype=torch.float)   # [20, 5]
    y = torch.tensor([n["label"] for n in nodes], dtype=torch.long)   # [20]

    # Edge index [2, E]
    src = [node_id_to_idx[e[0]] for e in edges]
    dst = [node_id_to_idx[e[1]] for e in edges]
    edge_index = torch.tensor([src, dst], dtype=torch.long)

    data = Data(x=x, edge_index=edge_index, y=y)
    data.node_ids = [n["id"] for n in nodes]
    data.num_nodes = len(nodes)

    return data


def main():
    print("=" * 60)
    print("  CloudAutomationGNN — Synthetic Data Generator")
    print("=" * 60)

    # ── Generate ──────────────────────────────────────────────────────────────
    nodes = generate_nodes()
    edges = generate_edges(nodes)
    data  = build_pyg_data(nodes, edges)

    n_anomalies = sum(n["label"] for n in nodes)
    print(f"\n✅ Graph generated:")
    print(f"   Nodes : {len(nodes)}  (EC2={N_EC2}, Lambda={N_LAMBDA}, RDS={N_RDS}, S3={N_S3})")
    print(f"   Edges : {len(edges)}")
    print(f"   Labels: {n_anomalies} anomalous / {len(nodes) - n_anomalies} normal")

    # ── Save JSON ─────────────────────────────────────────────────────────────
    os.makedirs("data", exist_ok=True)
    json_path = "data/cloud_graph.json"
    with open(json_path, "w") as f:
        json.dump({"nodes": nodes, "edges": edges, "labels": [n["label"] for n in nodes]}, f, indent=2)
    print(f"\n💾 JSON saved: {json_path}")

    # ── Save PyG Data object ──────────────────────────────────────────────────
    pt_path = "data/graph_data.pt"
    torch.save(data, pt_path)
    print(f"💾 PyG Data saved: {pt_path}")

    # ── Print per-node summary ────────────────────────────────────────────────
    print("\n📊 Per-node summary:")
    print(f"  {'ID':18s} {'Type':8s} {'CPU':>6s} {'Mem':>6s} {'Lat':>7s} {'Err':>6s} {'Label':>6s}")
    print("  " + "-" * 65)
    for n in nodes:
        marker = "🔴 ANOM" if n["label"] else "🟢 OK  "
        print(f"  {n['id']:18s} {n['type']:8s} {n['cpu']:>5.1f}% {n['memory']:>5.1f}%"
              f" {n['latency']:>6.0f}ms {n['error_rate']:>5.3f}  {marker}")


if __name__ == "__main__":
    main()
