from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Dict, List


@dataclass(frozen=True)
class AppConfig:
    # Prediction model settings
    random_seed: int = 42

    # Product lineup (5-10 products)
    products: List[str] = (
        "Water",
        "Bread",
        "Milk",
        "Eggs",
        "Snacks",
        "Coffee",
        "Fruits",
        "Vegetables",
    )

    # Zones for the dummy demo
    zones: List[str] = ("Z1", "Z2", "Z3", "Z4", "Z5", "Z6")

    # Event types
    events: List[str] = ("rain", "weekend", "normal")

    # Inventory baseline used for stock recommendations
    current_stock: Dict[str, int] = None  # type: ignore[assignment]

    def __post_init__(self):
        # dataclass frozen => use object.__setattr__ in post-init
        if self.current_stock is None:
            object.__setattr__(
                self,
                "current_stock",
                {
                    "Water": 220,
                    "Bread": 65,
                    "Milk": 90,
                    "Eggs": 75,
                    "Snacks": 85,
                    "Coffee": 60,
                    "Fruits": 70,
                    "Vegetables": 55,
                },
            )

    @property
    def batch_size(self) -> int:
        # Practical batch sizing for stock ordering
        return 10

    def safety_margin_for_priority(self, priority: str) -> float:
        # Higher priority => larger safety buffer
        if priority == "High":
            return 0.30
        if priority == "Medium":
            return 0.15
        return 0.05


def get_config() -> AppConfig:
    # We keep config simple for the hackathon; environment variables can be added later.
    _ = os.environ.get("HYPERLOCAL_DUMMY", "")
    return AppConfig()  # type: ignore[call-arg]

