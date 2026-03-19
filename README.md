# Hyperlocal Demand Forecast

This repo is a small demo app for *hyperlocal demand forecasting*.
It combines:

- **Frontend**: React + Vite (renders a dashboard + charts)
- **Backend**: FastAPI (serves metadata and predictions)
- **Model**: A simple ML demo using **XGBoost regressors** trained on a dummy dataset
- **Optional persistence**: Postgres to store prediction request/response payloads

## What the demo predicts
Given:

- `zone` (one of `Z1..Z6`)
- `time` (hour of day `0..23`)
- `event` (`rain`, `weekend`, `normal`)

The backend returns per-product predicted demand plus:

- `priority` (High / Medium / Low)
- `stock_recommended` based on the hardcoded `current_stock` baseline in `backend/app/core/config.py`.

## API
Frontend talks to the backend under `/api` (see `frontend/vite.config.js`).

### `GET /api/meta`
Returns zones, products, current stock baseline, and short product descriptions.

### `POST /api/predict`
Request body:
```json
{
  "zone": "Z1",
  "time": 18,
  "event": "normal"
}
```

Response includes:
- `predictions`: a list of products with `predicted_demand`, `priority`, and `stock_recommended`
- `total_predicted_demand`: sum across products

## Model training (what actually gets trained)
On backend startup, the service:

1. Builds/loads a generated CSV dataset at `backend/app/data/dummy_dataset.csv`
2. Trains **one XGBoost regression model per product**
3. Saves/loads trained artifacts from `backend/app/artifacts/model_artifacts.joblib`

### Features used in the current demo
The current demo model uses only:

- `zone` (one-hot encoded)
- `hour` (numeric passthrough)
- `event` (one-hot encoded)

If you want real features like a full `date`, Indian `festivals/holidays`, or richer “location”, you’ll need to:

- update `backend/app/schemas.py` to accept those new inputs
- update the dataset columns produced/used in `backend/app/core/dataset.py`
- update the training feature set in `backend/app/core/model_service.py`

## Optional Postgres persistence
`docker-compose.yml` starts Postgres only.

The backend will only persist predictions if `DATABASE_URL` is set (see `backend/app/db.py` and `backend/.env.example`).

Example `DATABASE_URL`:
- `postgresql+psycopg2://hyper:hyper@localhost:5432/hyperlocal`

## Run locally
### 1) Start the backend (FastAPI)
Prereqs: Python 3 + system build tools if your environment requires it for wheels.

```bash
cd backend
python -m venv venv
# Windows (PowerShell):
# .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Optional: enable Postgres persistence:
```bash
set DATABASE_URL=postgresql+psycopg2://hyper:hyper@localhost:5432/hyperlocal
```

### 2) Start the frontend (Vite)
```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:8000` (configured in `frontend/vite.config.js`).

## Quick manual test (backend only)
```bash
curl http://localhost:8000/api/meta

curl -X POST http://localhost:8000/api/predict ^
  -H "Content-Type: application/json" ^
  -d "{\"zone\":\"Z1\",\"time\":18,\"event\":\"normal\"}"
```

