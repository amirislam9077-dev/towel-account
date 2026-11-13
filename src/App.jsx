import { useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import Home from './pages/Home.jsx';
import TowelPo from './pages/TowelPo.jsx';
import TowelPoPrint from './pages/TowelPoPrint.jsx';
import Parties from './pages/Parties.jsx';
import ToastHost from './components/Toast.jsx';

const ICON = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
};
// Sub-menu of Al Hasan Towel (more pages will be added: challans, payments, ledger, reports …)
const SUB = [
  { to: '/towel', label: 'Dashboard', icon: 'home', exact: true, group: 0 },
  { to: '/towel/po', label: 'Towel PO', icon: 'file', group: 1 },
  { to: '/towel/exporters', label: 'Exporters', icon: 'users', group: 2 },
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
  useEffect(() => { document.title = 'Al Hasan Towel'; }, []);

  return (
    <>
      <header className="topbar">
        <div className="brand" onClick={() => nav('/towel')}>Al Hasan Towel</div>
        <nav>
          <button className="active" onClick={() => nav('/towel')}>Al Hasan Towel</button>
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
          <Route path="/towel/po" element={<TowelPo key="tpo" />} />
          <Route path="/towel/po/:id/edit" element={<TowelPo key="tpo" />} />
          <Route path="/towel/po/:id/print" element={<TowelPoPrint />} />
          <Route path="/towel/exporters" element={<Parties />} />
          <Route path="*" element={<Navigate to="/towel" replace />} />
        </Routes>
      </main>
    </>
  );
}
