import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { fmt } from '../util.js';
import { poTotals } from '../towelPo.js';

export default function Home() {
  const nav = useNavigate();
  const [pos, setPos] = useState([]);
  useEffect(() => { api.list('towel-pos').then(setPos).catch(() => {}); }, []);
  const open = pos.filter((p) => p.status === 'open');
  const t = pos.filter((p) => p.status !== 'cancelled').map(poTotals);
  const sum = (k) => t.reduce((s, x) => s + x[k], 0);

  return (
    <>
      <h1>Al Hasan Towel</h1>
      <p className="muted">Towel orders: quality, pile / ground / weft yarn, items and yarn requirement in one place</p>
      <div className="stat-chips" style={{ marginTop: 14 }}>
        <div className="chip"><small>Open Towel POs</small><b>{open.length}</b></div>
        <div className="chip"><small>Total Qty (Pcs)</small><b>{fmt(sum('pcs'))}</b></div>
        <div className="chip"><small>Total Lbs</small><b>{fmt(sum('lbs'), 2)}</b></div>
        <div className="chip net"><small>Net Bags Required</small><b>{fmt(sum('netBags'), 2)}</b></div>
        <div className="chip total"><small>PO Amount</small><b>{fmt(sum('total'), 2)}</b></div>
      </div>
      <div className="tiles">
        <button className="tile big" onClick={() => nav('/towel/po')}>
          <strong>Towel PO</strong>
          <span>Weaving program: quality, Pile / Ground / Weft, items, Lbs and amount</span>
        </button>
        <button className="tile big" onClick={() => nav('/towel/exporters')}>
          <strong>Exporters</strong>
          <span>Parties who give towel orders</span>
        </button>
      </div>
    </>
  );
}
