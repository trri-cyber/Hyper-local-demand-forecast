from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd

from app.core.config import AppConfig, get_config


@dataclass(frozen=True)
class DummyDatasetConfig:
    rows: int = 360
    noise_std: float = 3.5


def _hour_multiplier(hour: int, event: str) -> float:
    # Simple "realistic" shape: higher demand during evening/morning peaks.
    # Rain increases "comfort" items and also boosts snack/coffee.
    base = 0.75
    if 6 <= hour <= 9:
        base = 1.05
    elif 10 <= hour <= 13:
        base = 0.90
    elif 14 <= hour <= 17:
        base = 0.95
    elif 18 <= hour <= 22:
        base = 1.20
    elif hour >= 23 or hour <= 5:
        base = 0.70

    if event == "rain":
        # Rain tends to increase overall footfall for convenience shopping.
        base *= 1.08
    return base


def _event_multiplier(event: str, product: str) -> float:
    # Encodes domain intuition for the demo.
    if event == "rain":
        if product in {"Snacks", "Coffee", "Bread", "Vegetables"}:
            return 1.18
        if product in {"Water", "Milk"}:
            return 1.06
        return 1.10
    if event == "weekend":
        if product in {"Bread", "Milk", "Eggs", "Fruits"}:
            return 1.20
        if product in {"Vegetables"}:
            return 1.12
        return 1.10
    # normal
    return 1.00


def _zone_multiplier(zone: str, product: str) -> float:
    zone_factor = {
        "Z1": 1.05,
        "Z2": 0.95,
        "Z3": 1.00,
        "Z4": 1.10,
        "Z5": 0.92,
        "Z6": 1.03,
    }.get(zone, 1.0)

    # Product variety by zone.
    product_factor = {
        "Water": 1.0,
        "Bread": 1.05 if zone in {"Z4", "Z1"} else 0.95,
        "Milk": 1.0,
        "Eggs": 1.08 if zone in {"Z3", "Z4"} else 0.95,
        "Snacks": 1.15 if zone in {"Z1", "Z6"} else 0.92,
        "Coffee": 1.12 if zone in {"Z2", "Z6"} else 0.98,
        "Fruits": 1.10 if zone in {"Z5", "Z3"} else 0.95,
        "Vegetables": 1.08 if zone in {"Z4"} else 0.97,
    }.get(product, 1.0)
    return zone_factor * product_factor


def generate_dummy_dataset(
    out_csv: Path,
    cfg: AppConfig,
    ds_cfg: DummyDatasetConfig = DummyDatasetConfig(),
) -> pd.DataFrame:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(cfg.random_seed)

    # Reasonable baselines: average daily-ish demand units.
    base_demand: Dict[str, float] = {
        "Water": 45,
        "Bread": 22,
        "Milk": 28,
        "Eggs": 26,
        "Snacks": 24,
        "Coffee": 20,
        "Fruits": 18,
        "Vegetables": 16,
    }

    rows: List[Dict[str, object]] = []

    # Construct a grid-ish dataset then add noise; deterministic shuffle for variety.
    zones = cfg.zones
    events = cfg.events
    # Use a subset of hours to keep rows small.
    hours = list(range(0, 24))

    # Sample combinations uniformly; keep it small.
    for i in range(ds_cfg.rows):
        zone = zones[i % len(zones)]
        event = events[(i // len(zones)) % len(events)]
        hour = hours[(i * 3) % len(hours)]

        row: Dict[str, object] = {"zone": zone, "hour": hour, "event": event}
        for product in cfg.products:
            mult = (
                _hour_multiplier(hour, event)
                * _event_multiplier(event, product)
                * _zone_multiplier(zone, product)
            )
            noise = rng.normal(0, ds_cfg.noise_std)
            val = base_demand[product] * mult + noise
            # Keep demand positive and "realistic" bounds.
            val = float(max(3.0, min(180.0, val)))
            # Make each row a bit more distinct by applying mild nonlinearity.
            if product in {"Coffee", "Snacks"} and event == "rain":
                val *= 1.02
            row[f"demand_{product.lower()}"] = val
        rows.append(row)

    df = pd.DataFrame(rows)

    # Shuffle deterministically so training doesn't "see" ordering.
    df = df.sample(frac=1.0, random_state=cfg.random_seed).reset_index(drop=True)

    df.to_csv(out_csv, index=False)
    return df


def ensure_dummy_dataset_csv(csv_path: Path | None = None) -> Path:
    cfg = get_config()
    if csv_path is None:
        csv_path = Path(__file__).resolve().parent.parent / "data" / "dummy_dataset.csv"
    csv_path = Path(csv_path)
    if csv_path.exists() and csv_path.stat().st_size > 0:
        return csv_path
    generate_dummy_dataset(csv_path, cfg)
    return csv_path

