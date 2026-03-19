from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_config
from app.core.dataset import get_available_zones
from app.schemas import MetaResponse


router = APIRouter()


@router.get("/meta", response_model=MetaResponse)
def get_meta() -> MetaResponse:
    cfg = get_config()
    descriptions = {
        "Water": "Bottled water demand",
        "Bread": "Fresh bakery demand",
        "Milk": "Dairy demand",
        "Eggs": "Breakfast essentials",
        "Snacks": "Impulse snacks",
        "Coffee": "Morning beverage",
        "Fruits": "Weekend/healthy options",
        "Vegetables": "Dinner essentials",
    }
    return MetaResponse(
        zones=get_available_zones(),
        products=list(cfg.products),
        current_stock=dict(cfg.current_stock),
        product_descriptions=descriptions,
    )

