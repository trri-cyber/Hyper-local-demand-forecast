const API_BASE = "/api";

export async function fetchMeta() {
  const res = await fetch(`${API_BASE}/meta`);
  if (!res.ok) throw new Error(`Meta fetch failed: ${res.status}`);
  return res.json();
}

export async function predict(payload, signal) {
  const res = await fetch(`${API_BASE}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Predict failed: ${res.status} ${text}`);
  }
  return res.json();
}

