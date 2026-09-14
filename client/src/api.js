async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  dashboard: () => request("/api/dashboard"),
  history: () => request("/api/evidence"),
  evidence: (id) => request(`/api/evidence/${encodeURIComponent(id)}`),
  seal: (payload) =>
    request("/api/changes", { method: "POST", body: JSON.stringify(payload) }),
  verify: (id, which) =>
    request(`/api/evidence/${encodeURIComponent(id)}/verify`, {
      method: "POST",
      body: JSON.stringify({ which }),
    }),
  tamper: (id) =>
    request(`/api/evidence/${encodeURIComponent(id)}/tamper`, { method: "POST" }),
};
