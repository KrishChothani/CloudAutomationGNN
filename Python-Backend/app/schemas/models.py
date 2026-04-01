from pydantic import BaseModel, Field
from typing import Optional, List, Dict


class NodeFeatures(BaseModel):
    node_id: str
    node_type: str  # ec2, rds, lambda, s3, elb
    cpu_usage: float = Field(ge=0, le=100)
    memory_usage: float = Field(ge=0, le=100)
    disk_usage: float = Field(ge=0, le=100)
    network_in: float = Field(ge=0)     # MB/s
    network_out: float = Field(ge=0)    # MB/s
    error_rate: float = Field(ge=0, le=100)
    latency: float = Field(ge=0)        # ms


class EdgeDefinition(BaseModel):
    source: str  # node_id
    target: str  # node_id


class GraphInput(BaseModel):
    graph_id: Optional[str] = None
    nodes: List[NodeFeatures]
    edges: List[EdgeDefinition]


class SingleNodeInput(BaseModel):
    event_id: Optional[str] = None
    resource_id: str
    resource_type: str
    metrics: Dict[str, float]


class NodePrediction(BaseModel):
    node_id: str
    anomaly_score: float
    is_anomaly: bool
    severity: str  # critical, high, medium, low


class PredictResponse(BaseModel):
    graph_id: Optional[str]
    predictions: List[NodePrediction]
    anomaly_count: int
    processing_time_ms: float


class SHAPFeature(BaseModel):
    feature: str
    value: float


class ExplainResponse(BaseModel):
    anomaly_id: Optional[str]
    node_id: str
    anomaly_score: float
    shap_values: List[SHAPFeature]
    affected_nodes: List[str]
    explanation: str
    recommended_actions: List[str]


class GraphTopologyNode(BaseModel):
    id: str
    label: str
    node_type: str
    cpu_usage: float
    is_anomaly: bool
    anomaly_score: float


class GraphTopologyEdge(BaseModel):
    source: str
    target: str


class GraphTopologyResponse(BaseModel):
    nodes: List[GraphTopologyNode]
    edges: List[GraphTopologyEdge]