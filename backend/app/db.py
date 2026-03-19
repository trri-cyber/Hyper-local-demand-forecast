from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine


def _default_database_url() -> str | None:
    # If user didn't configure anything, we just disable persistence for the demo.
    return os.environ.get("DATABASE_URL") or None


@dataclass
class DbConfig:
    database_url: str | None


class PredictionStore:
    def __init__(self, cfg: DbConfig):
        self.cfg = cfg
        self.engine: Engine | None = None
        if cfg.database_url:
            self.engine = create_engine(cfg.database_url, pool_pre_ping=True)

    def init_schema(self) -> None:
        if self.engine is None:
            return

        # Keep it minimal: one table that stores input/output JSON for traceability.
        stmt = text(
            """
            CREATE TABLE IF NOT EXISTS predictions (
              id SERIAL PRIMARY KEY,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              input_json JSONB NOT NULL,
              output_json JSONB NOT NULL,
              extra_json JSONB
            );
            """
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def store_prediction(self, input_payload: Dict[str, Any], output_payload: Dict[str, Any]) -> int | None:
        if self.engine is None:
            return None

        stmt = text(
            """
            INSERT INTO predictions (input_json, output_json)
            VALUES (:input_json::jsonb, :output_json::jsonb)
            RETURNING id;
            """
        )
        with self.engine.begin() as conn:
            row = conn.execute(
                stmt,
                {
                    "input_json": json.dumps(input_payload),
                    "output_json": json.dumps(output_payload),
                },
            ).fetchone()
            if not row:
                return None
            return int(row[0])

