from __future__ import annotations

from dataclasses import dataclass
from math import ceil
from pathlib import Path
from typing import Any, Dict, List, Tuple
import threading

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from xgboost import XGBRegressor

from app.core.config import AppConfig, get_config
from app.core.dataset import ensure_dummy_dataset_csv
from app.schemas import EventType, PredictRequest, PredictResponse, ProductPrediction


@dataclass(frozen=True)
class ModelArtifacts:
    preprocessor: ColumnTransformer
    product_models: Dict[str, Any]
    products: List[str]


class HyperlocalModelService:
    def __init__(
        self,
        cfg: AppConfig | None = None,
        artifacts_dir: Path | None = None,
    ):
        self.cfg = cfg or get_config()
        self.artifacts_dir = artifacts_dir or (Path(__file__).resolve().parent.parent / "artifacts")
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        self.artifact_path = self.artifacts_dir / "model_artifacts.joblib"

        self._lock = threading.Lock()
        self._artifacts: ModelArtifacts | None = None

    def _build_preprocessor(self) -> ColumnTransformer:
        # Keep it simple: one-hot encode categoricals, pass hour through.
        return ColumnTransformer(
            transformers=[
                ("zone", OneHotEncoder(handle_unknown="ignore", sparse_output=False), ["zone"]),
                ("event", OneHotEncoder(handle_unknown="ignore", sparse_output=False), ["event"]),
            ],
            remainder="passthrough",  # hour
        )

    def _train_models(self, df: pd.DataFrame) -> ModelArtifacts:
        preprocessor = self._build_preprocessor()

        feature_cols = ["zone", "hour", "event"]
        X = df[feature_cols]
        preprocessor.fit(X)
        X_encoded = preprocessor.transform(X)

        product_models: Dict[str, Any] = {}
        for product in self.cfg.products:
            y = df[f"demand_{product.lower()}"].astype(float).values

            # Small training budget: fast enough for a demo.
            model = XGBRegressor(
                n_estimators=120,
                max_depth=3,
                learning_rate=0.08,
                subsample=0.9,
                colsample_bytree=0.9,
                objective="reg:squarederror",
                random_state=self.cfg.random_seed,
            )
            model.fit(X_encoded, y)
            product_models[product] = model

        return ModelArtifacts(
            preprocessor=preprocessor,
            product_models=product_models,
            products=list(self.cfg.products),
        )

    def load_or_train(self) -> None:
        with self._lock:
            if self._artifacts is not None:
                return
            if self.artifact_path.exists():
                artifacts = joblib.load(self.artifact_path)
                self._artifacts = artifacts
                return

            dataset_csv = ensure_dummy_dataset_csv()
            df = pd.read_csv(dataset_csv)
            artifacts = self._train_models(df)
            joblib.dump(artifacts, self.artifact_path)
            self._artifacts = artifacts

    def _compute_priority(self, product: str, predicted_demand: float) -> str:
        current = self.cfg.current_stock[product]
        if current <= 0:
            return "High"

        # Predicted demand vs current stock.
        if predicted_demand >= current * 1.25:
            return "High"
        if predicted_demand >= current * 1.05:
            return "Medium"
        return "Low"

    def _compute_recommended_stock(self, product: str, predicted_demand: float, priority: str) -> int:
        current = self.cfg.current_stock[product]
        buffer = self.cfg.safety_margin_for_priority(priority)
        batch = self.cfg.batch_size

        recommended = ceil(predicted_demand * (1.0 + buffer) / batch) * batch
        # If current already exceeds predicted, still recommend a small base to avoid zeroing.
        if recommended <= 0:
            recommended = batch
        return int(recommended)

    def predict(self, req: PredictRequest) -> PredictResponse:
        self.load_or_train()
        assert self._artifacts is not None
        artifacts = self._artifacts

        X_new = pd.DataFrame(
            [
                {
                    "zone": req.zone,
                    "hour": req.time,
                    "event": req.event,
                }
            ],
            columns=["zone", "hour", "event"],
        )
        X_encoded = artifacts.preprocessor.transform(X_new)

        predictions: List[ProductPrediction] = []
        total = 0.0
        for product in artifacts.products:
            model = artifacts.product_models[product]
            y_pred = float(model.predict(X_encoded)[0])
            # Keep within realistic bounds for the demo UI.
            y_pred = float(max(2.0, min(200.0, y_pred)))

            priority = self._compute_priority(product, y_pred)
            recommended = self._compute_recommended_stock(product, y_pred, priority)
            predictions.append(
                ProductPrediction(
                    product=product,
                    predicted_demand=y_pred,
                    stock_recommended=recommended,
                    priority=priority,  # type: ignore[arg-type]
                )
            )
            total += y_pred

        return PredictResponse(
            input=req,
            predictions=predictions,
            total_predicted_demand=total,
        )

