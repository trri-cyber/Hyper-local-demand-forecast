from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.model_service import HyperlocalModelService
from app.db import PredictionStore, DbConfig
from app.schemas import PredictRequest, PredictResponse


router = APIRouter()

_model_service: HyperlocalModelService | None = None
_prediction_store: PredictionStore | None = None


def configure_services(model_service: HyperlocalModelService, prediction_store: PredictionStore | None) -> None:
    global _model_service, _prediction_store
    _model_service = model_service
    _prediction_store = prediction_store


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    if _model_service is None:
        raise HTTPException(status_code=500, detail="Model service not initialized")

    resp = _model_service.predict(req)

    if _prediction_store is not None:
        try:
            _prediction_store.store_prediction(
                input_payload=req.model_dump(),
                output_payload=resp.model_dump(),
            )
        except Exception:
            # Persistence is optional for the hackathon demo.
            pass
    return resp

