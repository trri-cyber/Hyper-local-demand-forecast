from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd

from app.core.config import AppConfig, get_config


RAW_DATASET_FILENAME = "final_dataset_with_weather.csv"
PREPARED_DATASET_FILENAME = "prepared_training_dataset.csv"


@dataclass(frozen=True)
class PreparedDatasetConfig:
    rows_per_city_event: int = 24
    noise_std: float = 0.45


PRODUCT_MATCHERS: Dict[str, tuple[str, ...]] = {
    "Water": ("water", "soft drink", "health drink", "juice"),
    "Bread": ("bread", "cake", "rusk", "bun"),
    "Milk": ("milk", "curd", "lassi", "dairy"),
    "Eggs": ("egg",),
    "Snacks": ("snack", "biscuit", "chocolate", "namkeen", "noodle"),
    "Coffee": ("coffee", "tea"),
    "Fruits": ("fruit",),
    "Vegetables": ("vegetable",),
}


def _normalize_text(value: object) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip().lower()


def _map_product(category: object, sub_category: object) -> str | None:
    combined = f"{_normalize_text(category)} {_normalize_text(sub_category)}"

    for product, keywords in PRODUCT_MATCHERS.items():
        if any(keyword in combined for keyword in keywords):
            return product

    if "bakery" in combined:
        return "Bread"
    if "beverage" in combined:
        return "Coffee"
    if "fruit" in combined:
        return "Fruits"
    if "veggie" in combined or "vegetable" in combined:
        return "Vegetables"
    if "masala" in combined or "flour" in combined or "staple" in combined:
        return "Bread"
    return None


def _normalize_event(order_date: pd.Timestamp, festival: object, weather: object) -> str:
    weather_text = _normalize_text(weather)
    festival_text = _normalize_text(festival)

    if "rain" in weather_text or "storm" in weather_text:
        return "rain"
    if festival_text or order_date.weekday() >= 5:
        return "weekend"
    return "normal"


def _time_multiplier(hour: float, event: str, product: str) -> float:
    base = 0.92
    if 6 <= hour < 10:
        base = 1.04
    elif 10 <= hour < 14:
        base = 0.98
    elif 14 <= hour < 18:
        base = 1.00
    elif 18 <= hour < 22:
        base = 1.08
    elif hour >= 22 or hour < 5:
        base = 0.88

    if event == "rain" and product in {"Snacks", "Coffee", "Bread", "Vegetables"}:
        base *= 1.05
    elif event == "weekend" and product in {"Fruits", "Vegetables", "Milk", "Eggs"}:
        base *= 1.04
    return base


def _minute_second_multiplier(minute: int, second: int, product: str) -> float:
    minute_wave = 1.0 + 0.01 * np.sin((minute / 60.0) * 2 * np.pi)
    second_wave = 1.0 + 0.006 * np.cos((second / 60.0) * 2 * np.pi)

    if product in {"Coffee", "Snacks"} and minute >= 40:
        minute_wave *= 1.01
    if product == "Bread" and second <= 15:
        second_wave *= 1.005
    return float(minute_wave * second_wave)


def _load_raw_dataset(raw_csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(raw_csv_path)
    df.columns = [str(col).strip() for col in df.columns]

    rename_map = {
        "Order Date": "order_date",
        "Category": "category",
        "Sub Category": "sub_category",
        "City": "city",
        "Sales": "sales",
        "Discount": "discount",
        "Profit": "profit",
        "festival_relevance": "festival_relevance",
        "weather_relevance": "weather_relevance",
    }
    df = df.rename(columns=rename_map)

    required = {
        "order_date",
        "category",
        "sub_category",
        "city",
        "sales",
        "discount",
        "profit",
        "festival_relevance",
        "weather_relevance",
    }
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(f"Dataset is missing required columns: {sorted(missing)}")

    df["order_date"] = pd.to_datetime(df["order_date"], format="%d-%m-%Y", errors="coerce")
    df["sales"] = pd.to_numeric(df["sales"], errors="coerce").fillna(0.0)
    df["discount"] = pd.to_numeric(df["discount"], errors="coerce").fillna(0.0)
    df["profit"] = pd.to_numeric(df["profit"], errors="coerce").fillna(0.0)
    df["city"] = df["city"].astype(str).str.strip()

    df = df.dropna(subset=["order_date"])
    df["product"] = [
        _map_product(category, sub_category)
        for category, sub_category in zip(df["category"], df["sub_category"])
    ]
    df = df[df["product"].notna()].copy()
    df["event"] = [
        _normalize_event(order_date, festival, weather)
        for order_date, festival, weather in zip(
            df["order_date"], df["festival_relevance"], df["weather_relevance"]
        )
    ]
    return df


def _aggregate_baselines(df: pd.DataFrame, cfg: AppConfig) -> pd.DataFrame:
    grouped = (
        df.groupby(["city", "event", "product"], as_index=False)
        .agg(
            avg_sales=("sales", "mean"),
            median_sales=("sales", "median"),
            avg_discount=("discount", "mean"),
            avg_profit=("profit", "mean"),
            order_count=("sales", "size"),
        )
    )

    grouped["profit_ratio"] = grouped["avg_profit"] / grouped["avg_sales"].clip(lower=1.0)
    grouped["sales_signal"] = (
        (grouped["avg_sales"] * 0.65) + (grouped["median_sales"] * 0.35)
    ) / 48.0
    grouped["discount_factor"] = 1.0 - grouped["avg_discount"].clip(lower=0.0, upper=0.7) * 0.22
    grouped["profit_factor"] = 1.0 + grouped["profit_ratio"].clip(lower=-0.5, upper=1.5) * 0.12
    grouped["support_factor"] = 0.9 + np.log1p(grouped["order_count"]) * 0.14
    grouped["base_demand"] = (
        grouped["sales_signal"]
        * grouped["discount_factor"]
        * grouped["profit_factor"]
        * grouped["support_factor"]
    )
    grouped["base_demand"] = grouped["base_demand"].clip(lower=4.0, upper=170.0)

    all_cities = sorted(df["city"].dropna().unique().tolist())
    all_events = list(cfg.events)
    all_products = list(cfg.products)
    full_index = pd.MultiIndex.from_product(
        [all_cities, all_events, all_products],
        names=["city", "event", "product"],
    )
    grouped = grouped.set_index(["city", "event", "product"]).reindex(full_index).reset_index()
    grouped["order_count"] = grouped["order_count"].fillna(0).astype(int)

    grouped["base_demand"] = grouped.groupby(["city", "product"])["base_demand"].transform(
        lambda s: s.fillna(s.mean())
    )
    grouped["base_demand"] = grouped.groupby("product")["base_demand"].transform(
        lambda s: s.fillna(s.mean())
    )

    fallback_defaults = {
        "Water": 40.0,
        "Bread": 24.0,
        "Milk": 28.0,
        "Eggs": 22.0,
        "Snacks": 26.0,
        "Coffee": 20.0,
        "Fruits": 18.0,
        "Vegetables": 17.0,
    }
    grouped["base_demand"] = grouped["base_demand"].fillna(grouped["product"].map(fallback_defaults))
    return grouped


def _build_prepared_training_dataset(
    raw_df: pd.DataFrame,
    out_csv: Path,
    cfg: AppConfig,
    ds_cfg: PreparedDatasetConfig = PreparedDatasetConfig(),
) -> pd.DataFrame:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(cfg.random_seed)
    baselines = _aggregate_baselines(raw_df, cfg)

    rows: List[Dict[str, object]] = []
    baseline_lookup = {
        (row.city, row.event, row.product): float(row.base_demand)
        for row in baselines.itertuples()
    }
    support_lookup = {
        (row.city, row.event, row.product): int(row.order_count)
        for row in baselines.itertuples()
    }

    cities = sorted(raw_df["city"].dropna().unique().tolist())
    events = list(cfg.events)

    for city_index, city in enumerate(cities):
        for event_index, event in enumerate(events):
            for step in range(ds_cfg.rows_per_city_event):
                hour = int((step * 3 + city_index) % 24)
                minute = int((step * 7 + event_index * 11) % 60)
                second = int((step * 13 + city_index * 5) % 60)
                hour_float = hour + (minute / 60.0) + (second / 3600.0)

                row: Dict[str, object] = {
                    "zone": city,
                    "hour": hour_float,
                    "minute": minute,
                    "second": second,
                    "event": event,
                }

                for product in cfg.products:
                    base_demand = baseline_lookup[(city, event, product)]
                    demand = (
                        base_demand
                        * _time_multiplier(hour_float, event, product)
                        * _minute_second_multiplier(minute, second, product)
                    )
                    demand += rng.normal(0.0, ds_cfg.noise_std)
                    demand = float(max(3.0, min(190.0, demand)))
                    row[f"baseline_{product.lower()}"] = float(base_demand)
                    row[f"support_{product.lower()}"] = support_lookup[(city, event, product)]
                    row[f"demand_{product.lower()}"] = demand

                rows.append(row)

    prepared = pd.DataFrame(rows)
    prepared = prepared.sample(frac=1.0, random_state=cfg.random_seed).reset_index(drop=True)
    prepared.to_csv(out_csv, index=False)
    return prepared


def get_raw_dataset_path(raw_csv_path: Path | None = None) -> Path:
    if raw_csv_path is not None:
        return Path(raw_csv_path)
    return Path(__file__).resolve().parent.parent / "data" / RAW_DATASET_FILENAME


def get_available_zones(raw_csv_path: Path | None = None) -> List[str]:
    cfg = get_config()
    dataset_path = get_raw_dataset_path(raw_csv_path)
    if not dataset_path.exists():
        return list(cfg.zones)

    try:
        raw_df = _load_raw_dataset(dataset_path)
    except Exception:
        return list(cfg.zones)

    cities = sorted(raw_df["city"].dropna().unique().tolist())
    return cities if cities else list(cfg.zones)


def ensure_training_dataset_csv(prepared_csv_path: Path | None = None, raw_csv_path: Path | None = None) -> Path:
    cfg = get_config()
    raw_path = get_raw_dataset_path(raw_csv_path)
    if prepared_csv_path is None:
        prepared_csv_path = Path(__file__).resolve().parent.parent / "data" / PREPARED_DATASET_FILENAME

    prepared_csv_path = Path(prepared_csv_path)
    if not raw_path.exists():
        raise FileNotFoundError(
            f"Training dataset not found at {raw_path}. Replace that file with your new CSV to retrain the model."
        )

    raw_df = _load_raw_dataset(raw_path)
    if raw_df.empty:
        raise ValueError("Training dataset does not contain any usable rows after preprocessing.")

    required_columns = {"zone", "hour", "minute", "second", "event"}
    for product in cfg.products:
        product_key = product.lower()
        required_columns.add(f"baseline_{product_key}")
        required_columns.add(f"support_{product_key}")
        required_columns.add(f"demand_{product_key}")
    if prepared_csv_path.exists() and prepared_csv_path.stat().st_size > 0:
        try:
            existing = pd.read_csv(prepared_csv_path, nrows=1)
            if required_columns.issubset(existing.columns):
                raw_mtime = raw_path.stat().st_mtime
                prepared_mtime = prepared_csv_path.stat().st_mtime
                if prepared_mtime >= raw_mtime:
                    return prepared_csv_path
        except Exception:
            pass

    _build_prepared_training_dataset(raw_df, prepared_csv_path, cfg)
    return prepared_csv_path
