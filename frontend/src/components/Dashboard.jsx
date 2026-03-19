import React, { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { fetchMeta, predict } from "../api.js";

function getCurrentTimeString() {
  return new Date().toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatPriority(priority) {
  const p = String(priority);
  if (p === "High") return { text: "High", color: "#dc3545" };
  if (p === "Medium") return { text: "Medium", color: "#fd7e14" };
  return { text: "Low", color: "#28a745" };
}

function formatDelta(current, previous) {
  const delta = Number(current) - Number(previous);
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
}

export default function Dashboard() {
  const [meta, setMeta] = useState(null);
  const [zone, setZone] = useState("");
  const [time, setTime] = useState(() => getCurrentTimeString());
  const [event, setEvent] = useState("normal");

  const [autoRun, setAutoRun] = useState(true);
  const [loading, setLoading] = useState(false);

  const [results, setResults] = useState(null);
  const [prevResults, setPrevResults] = useState(null);
  const [error, setError] = useState("");

  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const requestControllerRef = useRef(null);
  const requestSequenceRef = useRef(0);

  const productOrder = useMemo(() => {
    if (!meta?.products) return [];
    return meta.products;
  }, [meta]);

  const labels = useMemo(() => {
    if (!productOrder?.length) return [];
    return productOrder;
  }, [productOrder]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setTime(getCurrentTimeString());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  async function runSimulation({ compareWithPrevious = false } = {}) {
    if (!meta) return;
    if (requestControllerRef.current) {
      requestControllerRef.current.abort();
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    const currentResults = results;

    setLoading(true);
    setError("");
    try {
      const payload = { zone, time, event };
      const data = await predict(payload, controller.signal);
      if (requestId !== requestSequenceRef.current) return;

      setPrevResults(compareWithPrevious ? currentResults : null);
      setResults(data);
    } catch (e) {
      if (e?.name === "AbortError") return;
      setError(e?.message || "Prediction failed");
    } finally {
      if (requestId === requestSequenceRef.current) {
        setLoading(false);
      }
    }
  }

  // Load meta and init defaults.
  useEffect(() => {
    let cancelled = false;
    fetchMeta()
      .then((m) => {
        if (cancelled) return;
        setMeta(m);
        setZone(m.zones[0] || "");
      })
      .catch((e) => setError(e?.message || "Meta fetch failed"));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (requestControllerRef.current) {
        requestControllerRef.current.abort();
      }
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, []);

  // Auto-run on input changes (what-if simulation).
  useEffect(() => {
    if (!autoRun || !meta) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      runSimulation({ compareWithPrevious: Boolean(results) });
    }, 600);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone, time, event, autoRun, meta]);

  // Render / update chart when results change.
  useEffect(() => {
    if (!canvasRef.current) return;
    if (!results?.predictions?.length) return;

    const labelsLocal = productOrder.length ? productOrder : results.predictions.map((p) => p.product);

    const prevMap = new Map();
    if (prevResults?.predictions) {
      for (const p of prevResults.predictions) prevMap.set(p.product, p.predicted_demand);
    }

    const currentData = labelsLocal.map((product) => {
      const found = results.predictions.find((p) => p.product === product);
      return found ? Number(found.predicted_demand) : 0;
    });
    const prevData = labelsLocal.map((product) => {
      const v = prevMap.get(product);
      return typeof v === "number" ? Number(v) : null;
    });

    if (chartInstanceRef.current) chartInstanceRef.current.destroy();

    chartInstanceRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: labelsLocal,
        datasets: [
          {
            label: "Previous",
            data: prevData,
            backgroundColor: "rgba(220, 53, 69, 0.35)",
          },
          {
            label: "Current",
            data: currentData,
            backgroundColor: "rgba(13, 110, 253, 0.55)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const v = ctx.raw;
                if (v === null || v === undefined) return `${ctx.dataset.label}: (n/a)`;
                return `${ctx.dataset.label}: ${Number(v).toFixed(1)}`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Predicted demand (units)" },
          },
        },
      },
    });
  }, [results, prevResults, productOrder]);

  function renderResultsTable() {
    if (!results?.predictions?.length) return null;
    return (
      <table className="resultsTable">
        <thead>
          <tr>
            <th>Product</th>
            <th>Predicted Demand</th>
            <th>Stock Recommendation</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          {results.predictions.map((p) => {
            const badge = formatPriority(p.priority);
            return (
              <tr key={p.product}>
                <td>{p.product}</td>
                <td>{Number(p.predicted_demand).toFixed(1)}</td>
                <td>{p.stock_recommended}</td>
                <td>
                  <span className="priorityBadge" style={{ backgroundColor: badge.color }}>
                    {badge.text}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  function resetCompare() {
    setPrevResults(null);
    setResults(null);
  }

  return (
    <div className="page">
      <div className="header">
        <h1>Hyperlocal Demand Forecast</h1>
        <div className="subtitle">Data → Model → Prediction → Dashboard (demo)</div>
      </div>

      <div className="grid">
        <div className="panel">
          <h2>Inputs</h2>

          {meta ? (
            <>
              <label>
                Zone
                <select value={zone} onChange={(e) => setZone(e.target.value)}>
                  {meta.zones.map((z) => (
                    <option value={z} key={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Time (hh:mm:ss)
                <div className="timeDisplay" aria-live="polite">
                  {time}
                </div>
              </label>

              <div className="eventGroup">
                <div className="eventLabel">Event</div>
                {["rain", "weekend", "normal"].map((ev) => (
                  <label key={ev} className="eventOption">
                    <input
                      type="radio"
                      name="event"
                      value={ev}
                      checked={event === ev}
                      onChange={(e) => setEvent(e.target.value)}
                    />
                    {ev}
                  </label>
                ))}
              </div>

              <div className="actions">
                <label className="checkbox">
                  <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
                  Auto-run what-if
                </label>
                <button
                  className="primaryButton"
                  onClick={() => runSimulation({ compareWithPrevious: Boolean(results) })}
                  disabled={loading || !zone}
                >
                  {loading ? "Predicting..." : "Run Simulation"}
                </button>
                <button className="secondaryButton" onClick={resetCompare} disabled={loading}>
                  Clear
                </button>
              </div>
            </>
          ) : (
            <div className="loadingBox">Loading meta...</div>
          )}

          {error ? <div className="errorBox">{error}</div> : null}
        </div>

        <div className="panel wide">
          <h2>Results</h2>

          {results ? (
            <div className="summaryRow">
              <div className="summaryCard">
                <div className="summaryLabel">Total predicted demand</div>
                <div className="summaryValue">{Number(results.total_predicted_demand).toFixed(1)}</div>
              </div>
              {prevResults ? (
                <div className="summaryCard">
                  <div className="summaryLabel">Delta vs previous</div>
                  <div className="summaryValue">{formatDelta(results.total_predicted_demand, prevResults.total_predicted_demand)}</div>
                </div>
              ) : (
                <div className="summaryCard muted">
                  <div className="summaryLabel">Delta vs previous</div>
                  <div className="summaryValue">—</div>
                </div>
              )}
            </div>
          ) : null}

          <div className="chartBox">
            <canvas ref={canvasRef} />
          </div>

          {renderResultsTable()}
        </div>
      </div>
    </div>
  );
}

