from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "CloudAutomationGNN Python Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # AWS
    AWS_REGION: str = "ap-south-1"
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None

    # S3 Model Storage
    MODEL_BUCKET: str = "cloud-automation-gnn-models"
    MODEL_KEY: str = "models/gnn_model.pt"
    LOCAL_MODEL_PATH: str = "./models/gnn_model.pt"

    # GNN config
    NODE_FEATURES: int = 7
    HIDDEN_CHANNELS: int = 64
    NUM_LAYERS: int = 3
    ANOMALY_THRESHOLD: float = 0.5

    # Node backend (for callback)
    NODE_BACKEND_URL: str = "http://localhost:5000"

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()