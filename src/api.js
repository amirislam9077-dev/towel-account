// Login token (online app is locked with a password); kept in this browser
const KEY = 'aht-token';
export const getToken = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* private window */ } };
export const LOGOUT_EVENT = 'aht-logout';

async function req(method, url, body) {
  const t = getToken();
  const headers = { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  const res = await fetch('/api' + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/login') {
    setToken('');
    window.dispatchEvent(new Event(LOGOUT_EVENT)); // show the login screen
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  login: (password) => req('POST', '/login', { password }).then((r) => { setToken(r.token); return r; }),
  me: () => req('GET', '/me'),
  list: (c, q = '') => req('GET', `/${c}${q}`),
  get: (c, id) => req('GET', `/${c}/${id}`),
  nextNo: (c) => req('GET', `/${c}/next-no`).then((r) => r.no),
  create: (c, body) => req('POST', `/${c}`, body),
  update: (c, id, body) => req('PUT', `/${c}/${id}`, body),
  remove: (c, id) => req('DELETE', `/${c}/${id}`),
};
