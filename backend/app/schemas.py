from __future__ import annotations

import re
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


EventType = Literal["rain", "weekend", "normal"]
PriorityType = Literal["High", "Medium", "Low"]
TIME_PATTERN = re.compile(r"^\d{2}:\d{2}:\d{2}$")


class PredictRequest(BaseModel):
    zone: str = Field(..., description="Zone/area identifier")
    time: str = Field(..., description="Time of day in HH:MM:SS format")
    event: EventType = Field(..., description="Event type")

    @field_validator("time")
    @classmethod
    def validate_time(cls, value: str) -> str:
        if not TIME_PATTERN.fullmatch(value):
            raise ValueError("time must be in HH:MM:SS format")

        hours, minutes, seconds = [int(part) for part in value.split(":")]
        if hours > 23 or minutes > 59 or seconds > 59:
            raise ValueError("time must be a valid 24-hour clock value")
        return value

    @property
    def hour_value(self) -> float:
        hours, minutes, seconds = [int(part) for part in self.time.split(":")]
        return hours + (minutes / 60.0) + (seconds / 3600.0)

    @property
    def minute_value(self) -> int:
        return int(self.time.split(":")[1])

    @property
    def second_value(self) -> int:
        return int(self.time.split(":")[2])


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

