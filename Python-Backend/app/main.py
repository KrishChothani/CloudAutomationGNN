import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.endpoints import router
from app.core.config import get_settings
from app.core.model_loader import load_model

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()



@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load GNN model on startup."""
    logger.info("🚀 Starting CloudAutomationGNN Python Service...")
    try:
        load_model()
        logger.info("✅ GNN model ready")
    except Exception as e:
        logger.error(f"❌ Failed to load model: {e}")
    yield
    logger.info("🔻 Shutting down Python service")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="GNN anomaly detection, XAI explanations, and cloud graph inference API",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(router, tags=["GNN Inference"])


@app.get("/health")
async def health():
    return JSONResponse({
        "status": "OK",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
    })
