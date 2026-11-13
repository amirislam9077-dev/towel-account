async function req(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  list: (c, q = '') => req('GET', `/${c}${q}`),
  get: (c, id) => req('GET', `/${c}/${id}`),
  nextNo: (c) => req('GET', `/${c}/next-no`).then((r) => r.no),
  create: (c, body) => req('POST', `/${c}`, body),
  update: (c, id, body) => req('PUT', `/${c}/${id}`, body),
  remove: (c, id) => req('DELETE', `/${c}/${id}`),
};
