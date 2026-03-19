from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_config
from app.core.model_service import HyperlocalModelService
from app.db import DbConfig, PredictionStore
from app.routes.meta import router as meta_router
from app.routes.predict import configure_services, router as predict_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="Hyperlocal Demand Forecasting System",
        version="0.1.0"
    )

    # CORS setup
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ✅ Root endpoint (FIXED)
    @app.get("/")
    def root():
        return {"message": "Hyperlocal Demand Forecasting API is running 🚀"}

    # Routers
    # Frontend calls use /api/* (via Vite proxy), so we mount our routers under /api.
    app.include_router(meta_router, prefix="/api")
    app.include_router(predict_router, prefix="/api")

    # Startup logic
    @app.on_event("startup")
    def _startup() -> None:
        cfg = get_config()

        model_service = HyperlocalModelService(cfg=cfg)
        model_service.load_or_train()

        db_url = os.environ.get("DATABASE_URL")
        prediction_store = PredictionStore(DbConfig(database_url=db_url))
        prediction_store.init_schema()

        configure_services(
            model_service=model_service,
            prediction_store=prediction_store
        )

    return app


app = create_app()