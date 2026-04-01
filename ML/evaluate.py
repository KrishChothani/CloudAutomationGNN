"""
evaluate.py
───────────
Load the trained model and evaluate on the synthetic cloud graph.
Prints accuracy, precision, recall, F1, and a full confusion matrix.
Also plots a heatmap (saved to reports/confusion_matrix.png).

Usage:
    python evaluate.py [--model models/gnn_model.pt] [--threshold 0.5]
"""

import os
import sys
import argparse
import json
import numpy as np
import torch
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv
import torch.nn as nn
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report,
    roc_auc_score,
)

from data_generator import generate_cloud_graph


# ─── Inline model (mirror of train_gnn.py) ────────────────────────────────────
class GraphSAGEModel(nn.Module):
    def __init__(self, in_channels=7, hidden_channels=64, num_layers=3):
        super().__init__()
        self.convs = nn.ModuleList()
        self.bns = nn.ModuleList()
        self.convs.append(SAGEConv(in_channels, hidden_channels))
        self.bns.append(nn.BatchNorm1d(hidden_channels))
        for _ in range(num_layers - 2):
            self.convs.append(SAGEConv(hidden_channels, hidden_channels))
            self.bns.append(nn.BatchNorm1d(hidden_channels))
        self.convs.append(SAGEConv(hidden_channels, hidden_channels // 2))
        self.bns.append(nn.BatchNorm1d(hidden_channels // 2))
        self.classifier = nn.Sequential(
            nn.Linear(hidden_channels // 2, 32),
            nn.ReLU(),
            nn.Dropout(p=0.3),
            nn.Linear(32, 1),
            nn.Sigmoid(),
        )

    def forward(self, x, edge_index):
        for conv, bn in zip(self.convs, self.bns):
            x = conv(x, edge_index)
            x = bn(x)
            x = F.relu(x)
        return self.classifier(x)


def load_model(model_path: str) -> GraphSAGEModel:
    model = GraphSAGEModel()
    state_dict = torch.load(model_path, map_location="cpu")
    model.load_state_dict(state_dict)
    model.eval()
    return model


def print_confusion_matrix(cm: np.ndarray):
    tn, fp, fn, tp = cm.ravel()
    print("\n  Confusion Matrix:")
    print("  ┌─────────────────────────────┐")
    print("  │         Predicted           │")
    print("  │    Normal  │  Anomaly       │")
    print(f"  │ Normal  {tn:4d}   │   {fp:4d}          │")
    print(f"  │ Anomaly {fn:4d}   │   {tp:4d}          │")
    print("  └─────────────────────────────┘")


def plot_confusion_matrix(cm: np.ndarray, save_path: str):
    """Save confusion matrix heatmap using matplotlib."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.colors as mcolors

        fig, ax = plt.subplots(figsize=(5, 4))
        cmap = plt.cm.Blues
        im = ax.imshow(cm, interpolation="nearest", cmap=cmap)
        plt.colorbar(im)

        classes = ["Normal", "Anomaly"]
        tick_marks = np.arange(len(classes))
        ax.set_xticks(tick_marks)
        ax.set_yticks(tick_marks)
        ax.set_xticklabels(classes)
        ax.set_yticklabels(classes)

        thresh = cm.max() / 2.0
        for i in range(cm.shape[0]):
            for j in range(cm.shape[1]):
                ax.text(j, i, str(cm[i, j]),
                        ha="center", va="center",
                        color="white" if cm[i, j] > thresh else "black",
                        fontsize=14, fontweight="bold")

        ax.set_ylabel("True Label")
        ax.set_xlabel("Predicted Label")
        ax.set_title("GNN Anomaly Detection — Confusion Matrix")

        plt.tight_layout()
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        plt.savefig(save_path, dpi=150)
        plt.close()
        print(f"\n  📊 Confusion matrix plot saved to {save_path}")
    except ImportError:
        print("  ⚠️  matplotlib not available — skipping plot")


def plot_roc_curve(y_true: np.ndarray, y_scores: np.ndarray, save_path: str):
    """Save ROC curve."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from sklearn.metrics import roc_curve

        fpr, tpr, _ = roc_curve(y_true, y_scores)
        auc = roc_auc_score(y_true, y_scores)

        fig, ax = plt.subplots(figsize=(5, 4))
        ax.plot(fpr, tpr, color="#6366f1", lw=2, label=f"ROC curve (AUC = {auc:.3f})")
        ax.plot([0, 1], [0, 1], color="#64748b", lw=1, linestyle="--")
        ax.set_xlim([0.0, 1.0])
        ax.set_ylim([0.0, 1.05])
        ax.set_xlabel("False Positive Rate")
        ax.set_ylabel("True Positive Rate")
        ax.set_title("GNN Anomaly Detection — ROC Curve")
        ax.legend(loc="lower right")
        ax.set_facecolor("#0f1629")
        fig.patch.set_facecolor("#0a0e1a")
        ax.tick_params(colors="white")
        ax.xaxis.label.set_color("white")
        ax.yaxis.label.set_color("white")
        ax.title.set_color("white")
        ax.spines[:].set_color("#475569")

        plt.tight_layout()
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        plt.savefig(save_path, dpi=150)
        plt.close()
        print(f"  📈 ROC curve saved to {save_path}")
    except ImportError:
        print("  ⚠️  matplotlib not available — skipping ROC plot")


def main():
    parser = argparse.ArgumentParser(description="Evaluate CloudAutomationGNN")
    parser.add_argument("--model", type=str, default="models/gnn_model.pt")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--nodes", type=int, default=20)
    parser.add_argument("--anomaly-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    print("=" * 60)
    print("  CloudAutomationGNN — Model Evaluation")
    print("=" * 60)

    if not os.path.exists(args.model):
        print(f"\n❌ Model not found at {args.model}")
        print("   Run `python train_gnn.py` first.\n")
        sys.exit(1)

    # Load data
    data, node_meta = generate_cloud_graph(n_nodes=args.nodes, anomaly_ratio=args.anomaly_ratio)

    # Load model
    model = load_model(args.model)
    print(f"\n✅ Model loaded from {args.model}")

    # Run inference
    with torch.no_grad():
        scores = model(data.x, data.edge_index).squeeze(1).numpy()

    y_true = data.y.numpy()
    y_pred = (scores >= args.threshold).astype(int)

    # Metrics
    acc = accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    cm = confusion_matrix(y_true, y_pred)

    try:
        auc = roc_auc_score(y_true, scores)
    except Exception:
        auc = float("nan")

    print(f"\n{'─' * 40}")
    print(f"  Threshold:  {args.threshold}")
    print(f"  Accuracy:   {acc:.4f}  ({acc * 100:.1f}%)")
    print(f"  Precision:  {prec:.4f}")
    print(f"  Recall:     {rec:.4f}")
    print(f"  F1 Score:   {f1:.4f}")
    print(f"  ROC-AUC:    {auc:.4f}")
    print(f"{'─' * 40}")

    print_confusion_matrix(cm)

    print("\n  Classification Report:")
    print(classification_report(y_true, y_pred, target_names=["Normal", "Anomaly"]))

    print("  Per-node anomaly scores:")
    for i, meta in enumerate(node_meta):
        predicted = "ANOMALY" if y_pred[i] == 1 else "normal"
        true_label = "ANOMALY" if meta["is_anomaly"] else "normal"
        match = "✓" if y_pred[i] == y_true[i] else "✗"
        print(f"  {match} {meta['node_id']:15s} score={scores[i]:.4f}  pred={predicted:8s}  true={true_label}")

    # Save plots
    plot_confusion_matrix(cm, "reports/confusion_matrix.png")
    plot_roc_curve(y_true, scores, "reports/roc_curve.png")


if __name__ == "__main__":
    main()
