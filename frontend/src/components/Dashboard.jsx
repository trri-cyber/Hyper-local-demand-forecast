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
  if (p === "High") return { text: "High", color: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.35)" };
  if (p === "Medium") return { text: "Medium", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)" };
  return { text: "Low", color: "#10b981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)" };
}

function formatDelta(current, previous) {
  const delta = Number(current) - Number(previous);
  return { value: `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`, positive: delta >= 0 };
}

const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const ActivityIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

const MapPinIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const ZapIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

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
  const [darkMode, setDarkMode] = useState(true);

  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const requestControllerRef = useRef(null);
  const requestSequenceRef = useRef(0);

  const productOrder = useMemo(() => (meta?.products ? meta.products : []), [meta]);

  // Theme tokens
  const theme = darkMode ? {
    bg: "#080e1a",
    surface: "#0f1726",
    panel: "#111d30",
    panelHover: "#162035",
    border: "rgba(99,140,255,0.12)",
    borderAccent: "rgba(99,140,255,0.28)",
    text: "#e4ecff",
    textMuted: "#7a90bb",
    textFaint: "#3d537a",
    primary: "#3b82f6",
    primaryGlow: "rgba(59,130,246,0.18)",
    primaryBorder: "rgba(59,130,246,0.45)",
    accent: "#6366f1",
    gridLine: "rgba(99,140,255,0.06)",
    inputBg: "#0a1220",
    chartCurrent: "rgba(59,130,246,0.7)",
    chartPrev: "rgba(239,68,68,0.45)",
    chartCurrentBorder: "rgba(99,160,255,1)",
    chartPrevBorder: "rgba(239,68,68,0.8)",
    shadow: "0 8px 32px rgba(0,0,0,0.45)",
    cardShadow: "0 2px 12px rgba(0,0,0,0.3)",
  } : {
    bg: "#f0f4fc",
    surface: "#ffffff",
    panel: "#ffffff",
    panelHover: "#f7f9ff",
    border: "rgba(59,130,246,0.15)",
    borderAccent: "rgba(59,130,246,0.35)",
    text: "#0f172a",
    textMuted: "#4b6080",
    textFaint: "#94a3b8",
    primary: "#2563eb",
    primaryGlow: "rgba(37,99,235,0.1)",
    primaryBorder: "rgba(37,99,235,0.4)",
    accent: "#4f46e5",
    gridLine: "rgba(59,130,246,0.07)",
    inputBg: "#f8faff",
    chartCurrent: "rgba(37,99,235,0.65)",
    chartPrev: "rgba(239,68,68,0.4)",
    chartCurrentBorder: "rgba(37,99,235,1)",
    chartPrevBorder: "rgba(239,68,68,0.8)",
    shadow: "0 8px 32px rgba(59,130,246,0.08)",
    cardShadow: "0 2px 12px rgba(59,130,246,0.07)",
  };

  const t = theme;

  // Inject Google Font
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600;700&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => setTime(getCurrentTimeString()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  async function runSimulation({ compareWithPrevious = false } = {}) {
    if (!meta) return;
    if (requestControllerRef.current) requestControllerRef.current.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestSequenceRef.current;
    const currentResults = results;
    setLoading(true);
    setError("");
    try {
      const data = await predict({ zone, time, event }, controller.signal);
      if (requestId !== requestSequenceRef.current) return;
      setPrevResults(compareWithPrevious ? currentResults : null);
      setResults(data);
    } catch (e) {
      if (e?.name === "AbortError") return;
      setError(e?.message || "Prediction failed");
    } finally {
      if (requestId === requestSequenceRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchMeta()
      .then((m) => { if (!cancelled) { setMeta(m); setZone(m.zones[0] || ""); } })
      .catch((e) => setError(e?.message || "Meta fetch failed"));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    requestControllerRef.current?.abort();
    chartInstanceRef.current?.destroy();
  }, []);

  useEffect(() => {
    if (!autoRun || !meta) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      runSimulation({ compareWithPrevious: Boolean(results) });
    }, 600);
    return () => clearTimeout(debounceTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone, time, event, autoRun, meta]);

  useEffect(() => {
    if (!canvasRef.current || !results?.predictions?.length) return;
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

    chartInstanceRef.current?.destroy();
    Chart.defaults.color = t.textMuted;
    Chart.defaults.borderColor = t.gridLine;

    chartInstanceRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: labelsLocal,
        datasets: [
          { label: "Previous", data: prevData, backgroundColor: t.chartPrev, borderColor: t.chartPrevBorder, borderWidth: 1.5, borderRadius: 6 },
          { label: "Current", data: currentData, backgroundColor: t.chartCurrent, borderColor: t.chartCurrentBorder, borderWidth: 1.5, borderRadius: 6 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: t.textMuted, font: { family: "DM Sans", size: 12 }, boxWidth: 12, padding: 16 } },
          tooltip: {
            backgroundColor: darkMode ? "rgba(10,18,32,0.95)" : "rgba(255,255,255,0.98)",
            titleColor: t.text,
            bodyColor: t.textMuted,
            borderColor: t.borderAccent,
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (ctx) => {
                const v = ctx.raw;
                if (v === null || v === undefined) return `${ctx.dataset.label}: (n/a)`;
                return `${ctx.dataset.label}: ${Number(v).toFixed(1)} units`;
              },
            },
          },
        },
        scales: {
          x: { grid: { color: t.gridLine }, ticks: { color: t.textMuted, font: { family: "DM Sans", size: 11 } } },
          y: {
            beginAtZero: true,
            grid: { color: t.gridLine },
            ticks: { color: t.textMuted, font: { family: "DM Sans", size: 11 } },
            title: { display: true, text: "Predicted demand (units)", color: t.textFaint, font: { family: "DM Sans", size: 11 } },
          },
        },
      },
    });
  }, [results, prevResults, productOrder, darkMode]);

  function resetCompare() { setPrevResults(null); setResults(null); }

  const deltaInfo = results && prevResults ? formatDelta(results.total_predicted_demand, prevResults.total_predicted_demand) : null;

  const eventIcons = { rain: "🌧", weekend: "🎉", normal: "☀️" };

  const styles = {
    root: {
      minHeight: "100vh",
      background: darkMode
        ? "radial-gradient(ellipse at 20% 0%, rgba(59,90,200,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(99,60,200,0.1) 0%, transparent 60%), linear-gradient(180deg, #060c17 0%, #080e1a 100%)"
        : "radial-gradient(ellipse at 20% 0%, rgba(219,234,255,0.8) 0%, transparent 60%), linear-gradient(180deg, #eef3ff 0%, #f0f4fc 100%)",
      fontFamily: "'DM Sans', sans-serif",
      color: t.text,
      transition: "background 0.4s ease, color 0.3s ease",
    },
    page: { maxWidth: 1240, margin: "0 auto", padding: "28px 24px" },
    header: {
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      marginBottom: 28, paddingBottom: 24,
      borderBottom: `1px solid ${t.border}`,
    },
    headerLeft: {},
    badge: {
      display: "inline-flex", alignItems: "center", gap: 6,
      background: t.primaryGlow, border: `1px solid ${t.primaryBorder}`,
      borderRadius: 999, padding: "4px 12px", marginBottom: 10,
      fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
      textTransform: "uppercase", color: t.primary, fontFamily: "'Space Mono', monospace",
    },
    h1: {
      margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em",
      color: t.text, lineHeight: 1.1,
    },
    subtitle: { color: t.textMuted, marginTop: 6, fontSize: 14, fontWeight: 400 },
    themeToggle: {
      display: "flex", alignItems: "center", gap: 8,
      background: t.panel, border: `1px solid ${t.border}`,
      borderRadius: 12, padding: "8px 14px", cursor: "pointer",
      color: t.textMuted, fontSize: 13, fontWeight: 500,
      transition: "all 0.2s ease", boxShadow: t.cardShadow,
    },
    grid: {
      display: "grid", gridTemplateColumns: "320px 1fr", gap: 20,
    },
    panel: {
      background: t.panel, border: `1px solid ${t.border}`,
      borderRadius: 16, padding: 20, boxShadow: t.cardShadow,
      transition: "background 0.3s ease, border-color 0.3s ease",
    },
    panelHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 20 },
    panelIcon: {
      width: 30, height: 30, borderRadius: 8,
      background: t.primaryGlow, border: `1px solid ${t.primaryBorder}`,
      display: "flex", alignItems: "center", justifyContent: "center", color: t.primary,
    },
    panelTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: t.text },
    fieldLabel: {
      display: "flex", alignItems: "center", gap: 6,
      fontSize: 11, fontWeight: 600, letterSpacing: "0.07em",
      textTransform: "uppercase", color: t.textMuted, marginBottom: 8,
      fontFamily: "'Space Mono', monospace",
    },
    fieldGroup: { marginBottom: 18 },
    select: {
      width: "100%", background: t.inputBg, color: t.text,
      border: `1px solid ${t.border}`, borderRadius: 10,
      padding: "10px 12px", fontSize: 14, fontFamily: "'DM Sans', sans-serif",
      outline: "none", cursor: "pointer", appearance: "none",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a90bb' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
      transition: "border-color 0.2s",
    },
    timeDisplay: {
      width: "100%", background: t.inputBg, color: t.primary,
      border: `1px solid ${t.border}`, borderRadius: 10,
      padding: "12px 14px", fontSize: 22, fontFamily: "'Space Mono', monospace",
      fontVariantNumeric: "tabular-nums", letterSpacing: "0.1em",
      boxSizing: "border-box", display: "flex", alignItems: "center",
    },
    eventGroup: { display: "flex", gap: 8, flexWrap: "wrap" },
    eventOption: (selected) => ({
      flex: 1, minWidth: 72, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 4,
      padding: "10px 8px", borderRadius: 10, cursor: "pointer",
      border: selected ? `1px solid ${t.primaryBorder}` : `1px solid ${t.border}`,
      background: selected ? t.primaryGlow : t.inputBg,
      color: selected ? t.primary : t.textMuted,
      fontSize: 12, fontWeight: selected ? 600 : 400,
      transition: "all 0.15s ease", textAlign: "center",
    }),
    divider: { height: 1, background: t.border, margin: "18px 0" },
    autoRunRow: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 12,
    },
    toggleTrack: (on) => ({
      width: 36, height: 20, borderRadius: 999,
      background: on ? t.primary : t.border,
      border: `1px solid ${on ? t.primary : t.border}`,
      position: "relative", cursor: "pointer",
      transition: "background 0.2s",
    }),
    toggleThumb: (on) => ({
      position: "absolute", width: 14, height: 14,
      borderRadius: "50%", background: "#fff",
      top: 2, left: on ? 18 : 2, transition: "left 0.2s",
    }),
    primaryBtn: {
      width: "100%", padding: "11px 16px", borderRadius: 10,
      background: loading ? t.primaryGlow : `linear-gradient(135deg, #2563eb, #4f46e5)`,
      border: `1px solid ${t.primaryBorder}`,
      color: "#fff", fontSize: 14, fontWeight: 600,
      cursor: loading ? "not-allowed" : "pointer",
      opacity: loading ? 0.8 : 1,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      transition: "all 0.2s ease", letterSpacing: "0.01em",
      marginBottom: 10, fontFamily: "'DM Sans', sans-serif",
    },
    secondaryBtn: {
      width: "100%", padding: "10px 16px", borderRadius: 10,
      background: "transparent", border: `1px solid ${t.border}`,
      color: t.textMuted, fontSize: 14, fontWeight: 500,
      cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
      transition: "all 0.2s ease",
    },
    errorBox: {
      marginTop: 12, padding: "10px 14px", borderRadius: 10,
      background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
      color: "#f87171", fontSize: 13,
    },
    summaryRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 },
    summaryCard: (highlight) => ({
      background: highlight ? t.primaryGlow : (darkMode ? "rgba(255,255,255,0.03)" : "rgba(59,130,246,0.04)"),
      border: `1px solid ${highlight ? t.primaryBorder : t.border}`,
      borderRadius: 12, padding: "14px 16px",
    }),
    summaryLabel: { color: t.textMuted, fontSize: 12, fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Space Mono', monospace" },
    summaryValue: { fontSize: 26, fontWeight: 700, color: t.text, letterSpacing: "-0.02em" },
    deltaValue: (positive) => ({ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: positive ? "#10b981" : "#ef4444" }),
    chartBox: {
      height: 280, background: darkMode ? "rgba(255,255,255,0.02)" : "rgba(59,130,246,0.02)",
      border: `1px solid ${t.border}`, borderRadius: 12, padding: "12px",
      marginBottom: 16, position: "relative",
    },
    emptyChart: {
      height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      color: t.textFaint, gap: 10, fontSize: 14,
    },
    tableWrap: { borderRadius: 12, border: `1px solid ${t.border}`, overflow: "hidden" },
    table: { width: "100%", borderCollapse: "collapse" },
    th: {
      padding: "11px 14px", textAlign: "left", color: t.textMuted,
      fontSize: 11, fontWeight: 600, letterSpacing: "0.07em",
      textTransform: "uppercase", fontFamily: "'Space Mono', monospace",
      background: darkMode ? "rgba(255,255,255,0.03)" : "rgba(59,130,246,0.04)",
      borderBottom: `1px solid ${t.border}`,
    },
    td: {
      padding: "11px 14px", fontSize: 14, color: t.text,
      borderBottom: `1px solid ${t.border}`,
    },
    badge: (badge) => ({
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 999,
      background: badge.bg, border: `1px solid ${badge.border}`,
      color: badge.color, fontWeight: 600, fontSize: 12,
    }),
    loadingDot: {
      width: 6, height: 6, borderRadius: "50%",
      background: t.primary, display: "inline-block",
      animation: "pulse 1s ease-in-out infinite",
    },
    statusBar: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 12,
    },
  };

  return (
    <div style={styles.root}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.85)} 50%{opacity:1;transform:scale(1)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; } 
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 999px; }
        select:focus { border-color: ${t.primaryBorder} !important; box-shadow: 0 0 0 3px ${t.primaryGlow}; }
        tbody tr:last-child td { border-bottom: none !important; }
        tbody tr:hover td { background: ${darkMode ? "rgba(255,255,255,0.025)" : "rgba(59,130,246,0.04)"}; }
        @media (max-width: 900px) { .df-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <div style={styles.page}>
        {/* HEADER */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:6, background: t.primaryGlow, border: `1px solid ${t.primaryBorder}`, borderRadius:999, padding:"4px 12px", marginBottom:10, fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:t.primary, fontFamily:"'Space Mono', monospace" }}>
              <ActivityIcon /> Live Forecast
            </div>
            <h1 style={styles.h1}>Hyperlocal Demand<br/>Forecast</h1>
            <div style={styles.subtitle}>Real-time prediction engine · What-if simulation mode</div>
          </div>
          <button
            style={styles.themeToggle}
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? <SunIcon /> : <MoonIcon />}
            {darkMode ? "Light Mode" : "Dark Mode"}
          </button>
        </div>

        {/* MAIN GRID */}
        <div className="df-grid" style={styles.grid}>
          {/* LEFT PANEL: INPUTS */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <div style={styles.panelIcon}><ZapIcon /></div>
              <h2 style={styles.panelTitle}>Simulation Inputs</h2>
            </div>

            {meta ? (
              <>
                {/* Zone */}
                <div style={styles.fieldGroup}>
                  <div style={styles.fieldLabel}><MapPinIcon /> Zone</div>
                  <select style={styles.select} value={zone} onChange={(e) => setZone(e.target.value)}>
                    {meta.zones.map((z) => <option value={z} key={z}>{z}</option>)}
                  </select>
                </div>

                {/* Time */}
                <div style={styles.fieldGroup}>
                  <div style={styles.fieldLabel}><ClockIcon /> Current Time</div>
                  <div style={styles.timeDisplay} aria-live="polite">{time}</div>
                </div>

                {/* Event */}
                <div style={styles.fieldGroup}>
                  <div style={styles.fieldLabel}><ZapIcon /> Event Modifier</div>
                  <div style={styles.eventGroup}>
                    {["normal", "rain", "weekend"].map((ev) => (
                      <div
                        key={ev}
                        style={styles.eventOption(event === ev)}
                        onClick={() => setEvent(ev)}
                      >
                        <span style={{ fontSize: 18 }}>{eventIcons[ev]}</span>
                        <span style={{ textTransform: "capitalize" }}>{ev}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={styles.divider} />

                {/* Auto-run toggle */}
                <div style={styles.autoRunRow}>
                  <span style={{ fontSize: 13, color: t.textMuted, fontWeight: 500 }}>Auto-run what-if</span>
                  <div
                    style={styles.toggleTrack(autoRun)}
                    onClick={() => setAutoRun(!autoRun)}
                  >
                    <div style={styles.toggleThumb(autoRun)} />
                  </div>
                </div>

                <button
                  style={styles.primaryBtn}
                  onClick={() => runSimulation({ compareWithPrevious: Boolean(results) })}
                  disabled={loading || !zone}
                >
                  {loading ? (
                    <><span style={styles.loadingDot} /> Predicting…</>
                  ) : (
                    <><ActivityIcon /> Run Simulation</>
                  )}
                </button>
                <button style={styles.secondaryBtn} onClick={resetCompare} disabled={loading}>
                  Clear Results
                </button>
              </>
            ) : (
              <div style={{ color: t.textMuted, padding: "12px 0", display:"flex", alignItems:"center", gap:8 }}>
                <span style={styles.loadingDot} /> Loading configuration…
              </div>
            )}

            {error && <div style={styles.errorBox}>⚠ {error}</div>}
          </div>

          {/* RIGHT PANEL: RESULTS */}
          <div style={{ ...styles.panel, animation: "fadeIn 0.4s ease" }}>
            <div style={styles.statusBar}>
              <div style={styles.panelHeader}>
                <div style={styles.panelIcon}><ActivityIcon /></div>
                <h2 style={styles.panelTitle}>Forecast Results</h2>
              </div>
              {loading && (
                <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:t.textMuted }}>
                  <span style={styles.loadingDot} /> Updating…
                </div>
              )}
            </div>

            {/* Summary cards */}
            {results && (
              <div style={styles.summaryRow}>
                <div style={styles.summaryCard(true)}>
                  <div style={styles.summaryLabel}>Total Predicted Demand</div>
                  <div style={styles.summaryValue}>{Number(results.total_predicted_demand).toFixed(1)}</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:4 }}>units forecasted</div>
                </div>
                {deltaInfo ? (
                  <div style={styles.summaryCard(false)}>
                    <div style={styles.summaryLabel}>Δ vs Previous</div>
                    <div style={styles.deltaValue(deltaInfo.positive)}>{deltaInfo.value}</div>
                    <div style={{ fontSize:11, color: deltaInfo.positive ? "#10b981" : "#ef4444", marginTop:4 }}>
                      {deltaInfo.positive ? "▲ increase" : "▼ decrease"}
                    </div>
                  </div>
                ) : (
                  <div style={styles.summaryCard(false)}>
                    <div style={styles.summaryLabel}>Δ vs Previous</div>
                    <div style={{ ...styles.summaryValue, color: t.textFaint }}>—</div>
                    <div style={{ fontSize:11, color:t.textFaint, marginTop:4 }}>run again to compare</div>
                  </div>
                )}
              </div>
            )}

            {/* Chart */}
            <div style={styles.chartBox}>
              {!results?.predictions?.length ? (
                <div style={styles.emptyChart}>
                  <ActivityIcon />
                  <span>Run a simulation to see the forecast chart</span>
                </div>
              ) : (
                <canvas ref={canvasRef} />
              )}
            </div>

            {/* Table */}
            {results?.predictions?.length ? (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {["Product", "Predicted Demand", "Stock Recommendation", "Priority"].map((h) => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.predictions.map((p) => {
                      const badge = formatPriority(p.priority);
                      return (
                        <tr key={p.product}>
                          <td style={{ ...styles.td, fontWeight: 600 }}>{p.product}</td>
                          <td style={{ ...styles.td, fontFamily:"'Space Mono', monospace", fontSize:13 }}>{Number(p.predicted_demand).toFixed(1)}</td>
                          <td style={styles.td}>{p.stock_recommended}</td>
                          <td style={styles.td}>
                            <span style={styles.badge(badge)}>{badge.text}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!results && !loading && (
              <div style={{ textAlign:"center", padding:"40px 20px", color:t.textFaint }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
                <div style={{ fontSize:15, fontWeight:500, color:t.textMuted, marginBottom:6 }}>No forecast yet</div>
                <div style={{ fontSize:13 }}>Configure inputs on the left and run a simulation</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
