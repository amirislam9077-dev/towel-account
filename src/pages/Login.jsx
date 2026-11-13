import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.login(pw);
      onDone();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit} data-nocap>
        <h2>Al Hasan Towel</h2>
        <p className="muted">Enter the password to open the software</p>
        <label>
          Password
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus required />
        </label>
        {err && <div className="lookup-err">{err}</div>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Login'}</button>
      </form>
    </div>
  );
}
