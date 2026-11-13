import { useEffect, useState } from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { api, setToken, LOGOUT_EVENT } from './api.js';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import TowelPo from './pages/TowelPo.jsx';
import TowelPoPrint from './pages/TowelPoPrint.jsx';
import Parties from './pages/Parties.jsx';
import Reports from './pages/Reports.jsx';
import YarnChallan from './pages/YarnChallan.jsx';
import YarnChallanPrint from './pages/YarnChallanPrint.jsx';
import ToastHost from './components/Toast.jsx';

const ICON = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  loom: 'M3 5h18M3 19h18M6 5v14M10 5v14M14 5v14M18 5v14',
  factory: 'M2 20h20M4 20V10l5 3V10l5 3V6l6 4v10',
  chart: 'M3 3v18h18M8 17v-5M13 17V8M18 17v-9',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
};
// Sub-menu of Al Hasan Towel (more pages will be added: challans, payments, ledger, reports …)
const SUB = [
  { to: '/towel', label: 'Dashboard', icon: 'home', exact: true, group: 0 },
  { to: '/towel/po', label: 'Exporter Towel PO', icon: 'file', group: 1 },
  { to: '/towel/loom-po', label: 'Loom Towel PO', icon: 'loom', group: 1 },
  { to: '/towel/yarn-receive', label: 'Yarn Receive (Exporter)', icon: 'inbox', group: 2 },
  { to: '/towel/yarn-issue', label: 'Yarn Issue (Loom)', icon: 'truck', group: 2 },
  { to: '/towel/exporters', label: 'Exporters', icon: 'users', group: 3 },
  { to: '/towel/looms', label: 'Looms', icon: 'factory', group: 3 },
  { to: '/towel/reports', label: 'Reports', icon: 'chart', group: 4 },
];
const SubIcon = ({ name }) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICON[name]} />
  </svg>
);
const isActive = (path, item) => (item.exact ? path === item.to : path === item.to || path.startsWith(item.to + '/'));

export default function App() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  // 'checking' | 'in' | 'out' — the online app asks for a password
  const [auth, setAuth] = useState('checking');
  const [locked, setLocked] = useState(false); // true when the server has a password (show Logout)
  useEffect(() => {
    document.title = 'Al Hasan Towel';
    api.me().then((r) => { setLocked(!!r.locked); setAuth('in'); }).catch(() => setAuth('out'));
    const out = () => { setLocked(true); setAuth('out'); };
    window.addEventListener(LOGOUT_EVENT, out);
    return () => window.removeEventListener(LOGOUT_EVENT, out);
  }, []);

  if (auth === 'checking') return <p className="muted" style={{ padding: 20 }}>Loading…</p>;
  if (auth === 'out') return <Login onDone={() => { setLocked(true); setAuth('in'); }} />;

  return (
    <>
      <header className="topbar">
        <div className="brand" onClick={() => nav('/towel')}>Al Hasan Towel</div>
        <nav>
          <button className="active" onClick={() => nav('/towel')}>Al Hasan Towel</button>
          {locked && <button onClick={() => { setToken(''); setAuth('out'); }}>Logout</button>}
        </nav>
      </header>
      <nav className="subbar">
        {SUB.map((m, i) => (
          <span key={m.to} className="sub-item">
            {i > 0 && SUB[i - 1].group !== m.group && <span className="sub-sep" aria-hidden="true" />}
            <button className={isActive(pathname, m) ? 'active' : ''} onClick={() => nav(m.to)}>
              <SubIcon name={m.icon} />
              <span>{m.label}</span>
            </button>
          </span>
        ))}
      </nav>

      <ToastHost />
      <main className="page">
        <Routes>
          <Route path="/" element={<Navigate to="/towel" replace />} />
          <Route path="/towel" element={<Home />} />
          {/* Exporter Towel PO and Loom Towel PO share one page (form on top, list below) and one print layout */}
          <Route path="/towel/po" element={<TowelPo key="tpo" kind="exporter" />} />
          <Route path="/towel/po/:id/edit" element={<TowelPo key="tpo" kind="exporter" />} />
          <Route path="/towel/po/:id/print" element={<TowelPoPrint key="tpo" kind="exporter" />} />
          <Route path="/towel/loom-po" element={<TowelPo key="ltpo" kind="loom" />} />
          <Route path="/towel/loom-po/:id/edit" element={<TowelPo key="ltpo" kind="loom" />} />
          <Route path="/towel/loom-po/:id/print" element={<TowelPoPrint key="ltpo" kind="loom" />} />
          <Route path="/towel/exporters" element={<Parties key="exp" type="exporter" />} />
          <Route path="/towel/looms" element={<Parties key="loom" type="loom" />} />
          <Route path="/towel/yarn-receive" element={<YarnChallan key="ycr" mode="receive" />} />
          <Route path="/towel/yarn-receive/:id/edit" element={<YarnChallan key="ycr" mode="receive" />} />
          <Route path="/towel/yarn-receive/:id/print" element={<YarnChallanPrint />} />
          <Route path="/towel/yarn-issue" element={<YarnChallan key="yci" mode="issue" />} />
          <Route path="/towel/yarn-issue/:id/edit" element={<YarnChallan key="yci" mode="issue" />} />
          <Route path="/towel/yarn-issue/:id/print" element={<YarnChallanPrint />} />
          <Route path="/towel/yarn-challan" element={<Navigate to="/towel/yarn-receive" replace />} />
          <Route path="/towel/reports" element={<Navigate to="/towel/reports/epo-register" replace />} />
          <Route path="/towel/reports/:type" element={<Reports />} />
          <Route path="*" element={<Navigate to="/towel" replace />} />
        </Routes>
      </main>
    </>
  );
}
