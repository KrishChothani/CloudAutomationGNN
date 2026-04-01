"""
gnn_model.py
────────────
GraphSAGE model for node-level binary anomaly detection.

Architecture:
    Input (5 features) → SAGEConv(64) → ReLU → Dropout(0.3)
                       → SAGEConv(32) → ReLU → Dropout(0.3)
                       → SAGEConv(1)  → Sigmoid

Output: per-node anomaly probability in [0, 1].
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv
import os


class GraphSAGE(nn.Module):
    """
    3-layer GraphSAGE for binary node-level anomaly detection.

    Args:
        input_dim (int):  Number of input node features (default 5).
        dropout   (float): Dropout probability between layers (default 0.3).
    """

    def __init__(self, input_dim: int = 5, dropout: float = 0.3):
        super().__init__()
        self.dropout = dropout

        # Layer 1: input_dim → 64
        self.conv1 = SAGEConv(input_dim, 64)

        # Layer 2: 64 → 32
        self.conv2 = SAGEConv(64, 32)

        # Layer 3: 32 → 1  (anomaly logit)
        self.conv3 = SAGEConv(32, 1)

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        """
        Forward pass — returns per-node anomaly probability.

        Args:
            x          (Tensor): Node feature matrix [N, input_dim]
            edge_index (Tensor): Graph connectivity    [2, E]

        Returns:
            Tensor: Anomaly probabilities [N, 1] in range (0, 1)
        """
        # ── Layer 1 ──────────────────────────────────────────────────────────
        x = self.conv1(x, edge_index)          # [N, 64]
        x = F.relu(x)
        x = F.dropout(x, p=self.dropout, training=self.training)

        # ── Layer 2 ──────────────────────────────────────────────────────────
        x = self.conv2(x, edge_index)          # [N, 32]
        x = F.relu(x)
        x = F.dropout(x, p=self.dropout, training=self.training)

        # ── Layer 3 + sigmoid ─────────────────────────────────────────────────
        x = self.conv3(x, edge_index)          # [N, 1]
        x = torch.sigmoid(x)                   # anomaly probability [0, 1]

        return x                               # shape: [N, 1]


# ─── Helper: load a saved model from disk ─────────────────────────────────────
def load_model(path: str, input_dim: int = 5, dropout: float = 0.3) -> GraphSAGE:
    """
    Load a trained GraphSAGE model from a state-dict file.

    Args:
        path      (str): Path to the .pt / .pth state dict file.
        input_dim (int): Must match the input_dim used during training.
        dropout   (float): Must match the dropout used during training.

    Returns:
        GraphSAGE: Model loaded in eval() mode, ready for inference.

    Raises:
        FileNotFoundError: If the model file does not exist.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Model file not found: '{path}'. "
            f"Run `python ML/train_gnn.py` first to generate it."
        )

    model = GraphSAGE(input_dim=input_dim, dropout=dropout)
    state_dict = torch.load(path, map_location=torch.device("cpu"))
    model.load_state_dict(state_dict)
    model.eval()
    return model


# ─── Quick sanity check ───────────────────────────────────────────────────────
if __name__ == "__main__":
    import torch

    N, E = 20, 30
    x          = torch.randn(N, 5)
    edge_index = torch.randint(0, N, (2, E))

    model = GraphSAGE(input_dim=5)
    out   = model(x, edge_index)

    print(f"Input shape:  {x.shape}")
    print(f"Output shape: {out.shape}")
    print(f"Score range:  [{out.min().item():.4f}, {out.max().item():.4f}]")
    print("✅ GraphSAGE forward pass OK")
