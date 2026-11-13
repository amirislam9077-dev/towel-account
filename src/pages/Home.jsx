import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { fmt, fmtDate } from '../util.js';
import { poTotals, qualityCalc, epoBalance, YARNS } from '../towelPo.js';
import { REPORT_LIST } from './Reports.jsx';

// small line icons (24x24 paths)
const I = {
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5',
  loom: 'M3 5h18M3 19h18M6 5v14M10 5v14M14 5v14M18 5v14',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  factory: 'M2 20h20M4 20V10l5 3V10l5 3V6l6 4v10',
  plus: 'M12 5v14M5 12h14',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  yarn: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5 8c4 0 10 2 14 8M4 13c4-1 9 0 13 5M8 4c1 5 5 11 11 13',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  print: 'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z',
};
const Icon = ({ d, size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

function Module({ tone, icon, title, links, nav }) {
  return (
    <section className={`mod ${tone}`}>
      <header><Icon d={icon} /> {title}</header>
      {links.map((l) => (
        <button key={l.title} className="mod-link" title={l.sub} onClick={() => nav(l.to)}>
          <span className="mod-ic"><Icon d={l.icon} size={16} /></span>
          <span className="mod-txt"><strong>{l.title}</strong><small>{l.sub}</small></span>
          {l.count != null && <span className="mod-count">{l.count}</span>}
        </button>
      ))}
    </section>
  );
}

export default function Home() {
  const nav = useNavigate();
  const [d, setD] = useState({ epos: [], lpos: [], parties: [], loaded: false });
  useEffect(() => {
    Promise.all([api.list('towel-pos'), api.list('loom-towel-pos'), api.list('parties')])
      .then(([epos, lpos, parties]) => setD({ epos, lpos, parties, loaded: true }))
      .catch(() => setD((x) => ({ ...x, loaded: true })));
  }, []);

  const s = useMemo(() => {
    const live = d.epos.filter((p) => p.status !== 'cancelled');
    const liveL = d.lpos.filter((p) => p.status !== 'cancelled');
    const t = live.map(poTotals);
    const sum = (k) => t.reduce((a, x) => a + x[k], 0);
    const rows = live.map((ep) => ({ ep, ...epoBalance(ep, d.lpos), t: poTotals(ep) }));
    const ordered = rows.reduce((a, r) => a + r.ordered, 0);
    const given = rows.reduce((a, r) => a + r.given, 0);
    // yarn needed for all live exporter POs, by Pile / Ground / Weft / Fancy
    const yarn = YARNS.map(([p, name]) => ({ p, name, lbs: 0, bags: 0 }));
    for (const po of live) for (const q of po.qualities || []) {
      qualityCalc(q).yarns.forEach((y, i) => { yarn[i].lbs += y.lbs; yarn[i].bags += y.bags; });
    }
    const name = (id) => d.parties.find((p) => p.id === id)?.name || '—';
    return {
      openE: live.filter((p) => p.status === 'open').length,
      loomPos: liveL.length,
      ordered, given, balance: ordered - given,
      lbs: sum('lbs'), netBags: sum('netBags'), amount: sum('total'),
      yarn, yarnBags: yarn.reduce((a, y) => a + y.bags, 0),
      rows: rows.sort((a, b) => String(b.ep.date || '').localeCompare(String(a.ep.date || '')) || String(b.ep.no).localeCompare(String(a.ep.no))).slice(0, 8),
      name,
      exporters: d.parties.filter((p) => p.type === 'exporter').length,
      looms: d.parties.filter((p) => p.type === 'loom').length,
    };
  }, [d]);

  const pct = s.ordered ? Math.min(100, (s.given / s.ordered) * 100) : 0;

  return (
    <div className="dash">
      <div className="hero">
        <div>
          <div className="hero-kicker">Al Hasan Textiles</div>
          <h1>Al Hasan Towel</h1>
          <p>Exporter towel orders, loom weaving orders and Pile / Ground / Weft / Fancy yarn in one place</p>
        </div>
        <div className="hero-right">
          <div className="hero-actions">
            <button className="hero-btn solid" onClick={() => nav('/towel/po')}><Icon d={I.plus} size={16} /> New Exporter Towel PO</button>
            <button className="hero-btn" onClick={() => nav('/towel/loom-po')}><Icon d={I.plus} size={16} /> New Loom Towel PO</button>
          </div>
        <div className="flow">
          <button onClick={() => nav('/towel/po')}>Exporter Towel PO</button>
          <span>→</span>
          <button onClick={() => nav('/towel/loom-po')}>Loom Towel PO</button>
          <span>→</span>
          <span className="flow-step">Yarn Requirement</span>
          <span>→</span>
          <span className="flow-step end">Weaving</span>
        </div>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><small>Open Exporter POs</small><b>{fmt(s.openE)}</b></div>
        <div className="kpi"><small>Loom Towel POs</small><b>{fmt(s.loomPos)}</b></div>
        <div className="kpi"><small>Ordered (Pcs)</small><b>{fmt(s.ordered)}</b></div>
        <div className="kpi good"><small>Given to Looms (Pcs)</small><b>{fmt(s.given)}</b></div>
        <div className="kpi warn"><small>Balance (Pcs)</small><b>{fmt(s.balance)}</b></div>
        <div className="kpi"><small>Total Lbs</small><b>{fmt(s.lbs, 2)}</b></div>
        <div className="kpi"><small>Net Yarn Bags</small><b>{fmt(s.netBags, 2)}</b></div>
        <div className="kpi total"><small>Exporter PO Amount</small><b>{fmt(s.amount, 2)}</b></div>
      </div>

      <div className="mods">
        <Module nav={nav} tone="t1" icon={I.file} title="Purchase Orders" links={[
          { to: '/towel/po', icon: I.file, title: 'Exporter Towel PO', sub: 'Order from exporter: quality, yarn, items, Lbs', count: d.epos.length },
          { to: '/towel/loom-po', icon: I.loom, title: 'Loom Towel PO', sub: 'Weaving order to a loom against an Exporter PO', count: d.lpos.length },
        ]} />
        <Module nav={nav} tone="t2" icon={I.users} title="Parties" links={[
          { to: '/towel/exporters', icon: I.users, title: 'Exporters', sub: 'Parties who give towel orders', count: s.exporters },
          { to: '/towel/looms', icon: I.factory, title: 'Looms', sub: 'Loom / weaver parties', count: s.looms },
        ]} />
        <section className="mod t3">
          <header><Icon d={I.chart} /> Loom Progress</header>
          <div className="prog-box">
            <div className="prog-head"><span>Given to looms</span><b>{fmt(pct, 1)}%</b></div>
            <div className="prog"><i style={{ width: `${pct}%` }} /></div>
            <div className="prog-legend">
              <span><em className="dot g" /> Given {fmt(s.given)}</span>
              <span><em className="dot w" /> Balance {fmt(s.balance)}</span>
            </div>
          </div>
        </section>
        <section className="mod t4">
          <header><Icon d={I.yarn} /> Yarn Requirement</header>
          <div className="yarn-list">
            {s.yarn.map((y) => (
              <div key={y.p} className="yarn-row">
                <span className={`yarn-dot ${y.p}`} />
                <span className="yarn-name">{y.name}</span>
                <span className="yarn-bar"><i className={y.p} style={{ width: `${s.yarnBags ? (y.bags / s.yarnBags) * 100 : 0}%` }} /></span>
                <b>{fmt(y.bags, 2)}</b><small>bags</small>
              </div>
            ))}
          </div>
        </section>
        <Module nav={nav} tone="t5 span2" icon={I.chart} title="Reports" links={REPORT_LIST
          .map((r) => ({ to: `/towel/reports/${r.key}`, icon: r.group === 'Yarn Reports' ? I.yarn : I.chart, title: r.title, sub: r.sub }))} />
      </div>

      <section className="panel">
        <header>
          <span><Icon d={I.chart} /> Exporter Towel POs: balance with looms</span>
          <button className="link-btn" onClick={() => nav('/towel/po')}>View all →</button>
        </header>
        <div className="table-wrap flat">
          <table>
            <thead>
              <tr>
                <th>PO No</th><th>Date</th><th>Exporter</th><th>Ref No</th><th className="num">Ordered</th>
                <th className="num">Given to Looms</th><th style={{ width: 170 }}>Progress</th><th className="num">Balance</th>
                <th className="num">Amount</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {!s.rows.length && (
                <tr><td colSpan={11} className="empty">{d.loaded ? 'No Exporter Towel PO yet. Click "New Exporter Towel PO" to start.' : 'Loading…'}</td></tr>
              )}
              {s.rows.map((r) => {
                const p = r.ordered ? Math.min(100, (r.given / r.ordered) * 100) : 0;
                return (
                  <tr key={r.ep.id}>
                    <td className="strong">{r.ep.no}</td>
                    <td>{fmtDate(r.ep.date)}</td>
                    <td>{s.name(r.ep.exporterId)}</td>
                    <td>{r.ep.refNo}</td>
                    <td className="num">{fmt(r.ordered)}</td>
                    <td className="num good">{fmt(r.given)}</td>
                    <td><div className="prog sm"><i style={{ width: `${p}%` }} /></div></td>
                    <td className={`num ${r.balance > 0 ? 'warn' : 'good'}`}>{fmt(r.balance)}</td>
                    <td className="num">{fmt(r.t.total, 2)}</td>
                    <td><span className={`tag ${r.ep.status}`}>{r.ep.status}</span></td>
                    <td className="row-actions">
                      <button onClick={() => nav(`/towel/po/${r.ep.id}/edit`)}>Open</button>
                      {r.balance > 0 && r.ep.status === 'open' && <button onClick={() => nav(`/towel/loom-po?epo=${r.ep.id}`)}>+ Loom PO</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
