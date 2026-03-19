from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


EventType = Literal["rain", "weekend", "normal"]
PriorityType = Literal["High", "Medium", "Low"]


class PredictRequest(BaseModel):
    zone: str = Field(..., description="Zone/area identifier")
    time: int = Field(..., ge=0, le=23, description="Hour of day (0-23)")
    event: EventType = Field(..., description="Event type")


class ProductPrediction(BaseModel):
    product: str
    predicted_demand: float
    stock_recommended: int
    priority: PriorityType


class PredictResponse(BaseModel):
    input: PredictRequest
    predictions: List[ProductPrediction]
    total_predicted_demand: float


class MetaResponse(BaseModel):
    zones: List[str]
    products: List[str]
    current_stock: Dict[str, int]
    product_descriptions: Dict[str, str]


class StoredPrediction(BaseModel):
    id: int
    input: PredictRequest
    output: PredictResponse
    created_at: str
    extra: Optional[Dict[str, Any]] = None

