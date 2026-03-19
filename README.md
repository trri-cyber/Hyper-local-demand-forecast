# Hyperlocal Demand Forecasting (Hackathon Demo)

Minimal full-stack demo:
`Data -> Model (XGBoost) -> Prediction -> Dashboard`

## What you get
- React dashboard with inputs (`zone`, `time`, `event`)
- Predict demand for multiple products
- Stock recommendation + priority (`High` / `Medium` / `Low`)
- What-if simulation: change inputs -> auto update + chart comparison

## Prerequisites (Windows)
- Python launcher: `py` available
- Node.js + npm
- (Optional) Docker for Postgres

## 1) Start Postgres (optional, for persistence)
```powershell
docker-compose up -d
```

The dashboard will still work without Postgres; predictions are stored only if `DATABASE_URL` is set.

## 2) Backend (FastAPI)
```powershell
cd backend
py -m pip install -r requirements.txt

# Optional: set DATABASE_URL (if you started Postgres)
setx DATABASE_URL "postgresql+psycopg2://hyper:hyper@localhost:5432/hyperlocal"

py -m uvicorn app.main:app --reload --port 8000
```

## 3) Frontend (React)
```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Open: `http://localhost:5173`

## API
- `GET /api/meta` (zones, products, current stock baseline)
- `POST /api/predict` with `{ zone, time, event }`

