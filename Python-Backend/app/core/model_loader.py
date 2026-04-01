import os
import logging
import torch
from pathlib import Path
from app.core.config import get_settings
from app.services.gnn_model import GraphSAGE

logger = logging.getLogger(__name__)
settings = get_settings()

_model: GraphSAGE | None = None


def load_model() -> GraphSAGE:
    """Load GNN model — tries local path first, falls back to S3."""
    global _model
    if _model is not None:
        return _model

    local_path = Path(settings.LOCAL_MODEL_PATH)

    if local_path.exists():
        logger.info(f"Loading model from local path: {local_path}")
        _model = _load_from_disk(local_path)
    else:
        logger.info("Local model not found. Downloading from S3...")
        _model = _load_from_s3()

    logger.info("✅ GNN model loaded successfully")
    return _model


def _load_from_disk(path: Path) -> GraphSAGE:
    model = GraphSAGE(
        input_dim=settings.NODE_FEATURES,
    )
    state_dict = torch.load(str(path), map_location="cpu", weights_only=True)
    model.load_state_dict(state_dict)
    model.eval()
    return model


def _load_from_s3() -> GraphSAGE:
    from app.services.s3_service import download_file
    local_path = Path(settings.LOCAL_MODEL_PATH)
    local_path.parent.mkdir(parents=True, exist_ok=True)
    download_file(settings.MODEL_BUCKET, settings.MODEL_KEY, str(local_path))
    return _load_from_disk(local_path)


def get_model() -> GraphSAGE:
    """FastAPI dependency — returns the loaded model."""
    if _model is None:
        return load_model()
    return _model
