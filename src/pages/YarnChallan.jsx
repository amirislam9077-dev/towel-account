// Yarn Receive / Issue Challan (like Al Hasan Conversion's yarn challan).
//  receive — yarn bags received FROM the exporter against an Exporter Towel PO
//  issue   — yarn bags issued TO a loom against a Loom Towel PO
// A towel PO needs Pile, Ground, Weft and Fancy yarn for each quality: every one of these is its own line,
// with bags needed, already received / issued and balance, so you see exactly what yarn goes for what.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmt, fmtDate, num, today } from '../util.js';
import { CHALLAN_TYPES, challanType, yarnBalance, challanBags, yarnName, slotKey } from '../towelPo.js';
import Notice from '../components/Notice.jsx';
import LookupSelect from '../components/LookupSelect.jsx';
import NumberInput from '../components/NumberInput.jsx';
import DateInput from '../components/DateInput.jsx';
import { showToast } from '../components/Toast.jsx';

const BASE = '/towel/yarn-challan';
const COLL = 'yarn-challans';

const blank = (type = 'receive') => ({
  no: '', date: today(), type, exporterPoId: '', loomPoId: '', challanNo: '',
  vehicleNo: '', driverPhone: '', godown: 'Al Hasan Godown', deliveryPlace: '', remarks: '', gatePass: '', lines: [],
});

// one line per yarn of the PO (bags empty); saved bags / brand kept when editing
const linesFor = (po, type, challans, exceptId, saved = []) =>
  yarnBalance(po, type, challans, exceptId).slots.map((s) => {
    const old = saved.find((l) => slotKey(l.qKey, l.y) === s.key) || {};
    return { qKey: s.qKey, y: s.y, quality: s.quality, yarnText: s.text, bags: old.bags ?? '', brand: old.brand ?? '' };
  });

function readPicture(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(r.result);
      img.onload = () => {
        const k = Math.min(1, 1400 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.75));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

export default function YarnChallan() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const nav = useNavigate();
  const [ch, setCh] = useState(null);
  const [challans, setChallans] = useState([]);
  const [epos, setEpos] = useState([]);
  const [lpos, setLpos] = useState([]);
  const [parties, setParties] = useState([]);
  const [lookups, setLookups] = useState([]);
  const [msg, setMsg] = useState(null);
  const [popup, setPopup] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPic, setShowPic] = useState(false);
  const [q, setQ] = useState('');
  const [fType, setFType] = useState('');

  const loadChallans = () => api.list(COLL).then((x) => { setChallans(x); return x; });
  const loadLookups = () => api.list('lookups').then(setLookups);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [all, ep, lp, pa] = await Promise.all([loadChallans(), api.list('towel-pos'), api.list('loom-towel-pos'), api.list('parties'), loadLookups()]);
        if (!alive) return;
        setEpos(ep); setLpos(lp); setParties(pa);
        let doc;
        if (id) {
          const saved = await api.get(COLL, id);
          doc = { ...blank(), ...saved, type: challanType(saved) };
          const T = CHALLAN_TYPES[doc.type];
          const po = (doc.type === 'issue' ? lp : ep).find((p) => p.id === doc[T.poField]);
          if (po) doc.lines = linesFor(po, doc.type, all, id, saved.lines || []);
        } else {
          doc = { ...blank(), no: await api.nextNo(COLL) };
          const e = ep.find((p) => p.id === search.get('epo'));
          const l = lp.find((p) => p.id === search.get('lpo'));
          if (e) doc = { ...doc, type: 'receive', exporterPoId: e.id, lines: linesFor(e, 'receive', all) };
          if (l) doc = { ...doc, type: 'issue', loomPoId: l.id, lines: linesFor(l, 'issue', all) };
        }
        alive && setCh(doc);
      } catch (e) {
        alive && setMsg({ type: 'err', text: e.message });
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const name = useMemo(() => Object.fromEntries(parties.map((p) => [p.id, p.name])), [parties]);
  const eById = useMemo(() => Object.fromEntries(epos.map((p) => [p.id, p])), [epos]);
  const lById = useMemo(() => Object.fromEntries(lpos.map((p) => [p.id, p])), [lpos]);
  const bind = (kind, label) => ({
    label,
    options: lookups.filter((l) => l.kind === kind).sort((a, b) => a.value.localeCompare(b.value)).map((l) => ({ id: l.id, value: l.value })),
    onAdd: async (value) => { await api.create('lookups', { kind, value }); await loadLookups(); },
    onEdit: async (o, value) => { await api.update('lookups', o.id, { kind, value }); await loadLookups(); },
    onDelete: async (o) => { await api.remove('lookups', o.id); await loadLookups(); },
  });

  if (!ch) return msg ? <Notice msg={msg} onClose={() => setMsg(null)} /> : <p className="muted">Loading…</p>;

  const T = CHALLAN_TYPES[ch.type];
  const isIssue = ch.type === 'issue';
  const poOf = (c) => (challanType(c) === 'issue' ? lById[c.loomPoId] : eById[c.exporterPoId]);
  const po = isIssue ? lById[ch.loomPoId] : eById[ch.exporterPoId];
  const bal = po ? yarnBalance(po, ch.type, challans, id) : null;
  const slotOf = (l) => bal?.slots.find((s) => s.qKey === l.qKey && s.y === l.y);
  const thisBags = (ch.lines || []).reduce((t, l) => t + num(l.bags), 0);
  const partyOf = (p, type = ch.type) => name[type === 'issue' ? p?.loomId : p?.exporterId] || '—';
  const set = (k) => (e) => setCh({ ...ch, [k]: e.target.value });

  function chooseType(type) {
    setCh({ ...ch, type, exporterPoId: '', loomPoId: '', lines: [] });
  }
  function choosePo(poId) {
    const p = isIssue ? lById[poId] : eById[poId];
    setCh({ ...ch, [T.poField]: poId, lines: p ? linesFor(p, ch.type, challans, id) : [] });
  }
  function setLine(i, patch) {
    if (patch.bags !== undefined) {
      const s = slotOf(ch.lines[i]);
      if (s && num(patch.bags) > Math.max(0, s.balance)) {
        const left = Math.max(0, s.balance);
        setPopup({
          title: `Only ${fmt(left)} Bags balance`,
          text: `${po.no} · Quality ${s.qi + 1} · ${s.name} (${s.text}) needs ${fmt(s.need)} Bags; ${fmt(s.done)} Bags already ${T.past}. ` +
            `You can ${T.verb.toLowerCase()} at most ${fmt(left)} Bags of this yarn in this challan.`,
        });
        patch = { ...patch, bags: String(left) };
      }
    }
    setCh({ ...ch, lines: ch.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  }
  // fill every line with its full balance
  const fillAll = () => setCh({ ...ch, lines: ch.lines.map((l) => ({ ...l, bags: String(Math.max(0, slotOf(l)?.balance || 0)) })) });

  async function pickPicture(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { setCh({ ...ch, gatePass: await readPicture(file) }); } catch { setMsg({ type: 'err', text: 'Could not read the picture' }); }
  }

  async function save(e, andPrint) {
    e?.preventDefault();
    if (!po) return setMsg({ type: 'err', text: `Select the ${T.poLabel}` });
    if (thisBags <= 0) return setMsg({ type: 'err', text: `Enter ${T.verb} Bags in at least one yarn line` });
    if (!String(ch.godown || '').trim()) {
      setPopup({ title: isIssue ? 'Yarn Issued From is required' : 'Godown is required', text: isIssue ? 'Please select where the yarn is issued from.' : 'Please select the godown the yarn is received into.' });
      return setMsg({ type: 'err', text: isIssue ? 'Select Yarn Issued From' : 'Select the Godown' });
    }
    setSaving(true);
    try {
      const body = { ...ch, [isIssue ? 'exporterPoId' : 'loomPoId']: '', lines: ch.lines.filter((l) => num(l.bags) > 0) };
      if (isIssue) body.forExporterPoId = po.exporterPoId || ''; // the Exporter PO this loom yarn belongs to
      const saved = id ? await api.update(COLL, id, body) : await api.create(COLL, body);
      await loadChallans();
      showToast({
        title: id ? 'Updated successfully' : 'Saved successfully',
        text: `Yarn ${isIssue ? 'issue' : 'receive'} challan ${saved.no}: ${fmt(thisBags)} Bags has been ${id ? 'updated' : 'saved'}.`,
      });
      if (andPrint) return nav(`${BASE}/${saved.id}/print`);
      if (id) return nav(BASE);
      // fresh, empty form for the next challan (PO not selected); ?epo= / ?lpo= taken off the address
      setCh({ ...blank(ch.type), no: await api.nextNo(COLL) });
      if (search.get('epo') || search.get('lpo')) nav(BASE, { replace: true });
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (/balance/i.test(err.message)) setPopup({ title: 'More than the balance', text: err.message });
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function del(c) {
    if (!confirm(`Delete yarn challan ${c.no}?`)) return;
    try {
      await api.remove(COLL, c.id);
      await loadChallans();
      showToast({ type: 'delete', title: 'Deleted', text: `Yarn challan ${c.no} has been deleted.` });
      if (c.id === id) nav(BASE);
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
  }

  // PO dropdown: POs with bags left first; completed ones grey and not clickable
  const poOptions = (isIssue ? lpos : epos)
    .filter((p) => p.status !== 'cancelled' || p.id === po?.id)
    .map((p) => ({ p, b: yarnBalance(p, ch.type, challans, id) }))
    .map((x) => ({ ...x, done: x.b.need > 0 && x.b.balance <= 0 && x.p.id !== po?.id }))
    .sort((a, b) => a.done - b.done || String(b.p.no).localeCompare(String(a.p.no), undefined, { numeric: true }));

  // list: the chosen PO's challans, otherwise all
  const list = (po ? challans.filter((c) => challanType(c) === ch.type && c[T.poField] === po.id) : challans)
    .filter((c) => !fType || challanType(c) === fType)
    .filter((c) => {
      if (!q.trim()) return true;
      const p = poOf(c);
      const s = [c.no, c.challanNo, c.vehicleNo, c.driverPhone, c.godown, p?.no, partyOf(p, challanType(c)),
        ...(c.lines || []).map((l) => `${yarnName(l.y)} ${l.yarnText} ${l.brand}`)].join(' ').toLowerCase();
      return s.includes(q.trim().toLowerCase());
    })
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.no).localeCompare(String(a.no), undefined, { numeric: true }));
  const sumRecv = list.filter((c) => challanType(c) === 'receive').reduce((t, c) => t + challanBags(c), 0);
  const sumIss = list.filter((c) => challanType(c) === 'issue').reduce((t, c) => t + challanBags(c), 0);

  return (
    <>
      <Notice msg={msg} onClose={() => setMsg(null)} />
      {popup && (
        <div className="popup-back" onClick={() => setPopup(null)}>
          <div className="popup" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="popup-title">⚠ {popup.title}</div>
            <p>{popup.text}</p>
            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              <button className="primary" autoFocus onClick={() => setPopup(null)}>OK</button>
            </div>
          </div>
        </div>
      )}
      {showPic && ch.gatePass && (
        <div className="popup-back" onClick={() => setShowPic(false)}>
          <img className="pic-full" src={ch.gatePass} alt="Gate pass" />
        </div>
      )}

      <form onSubmit={(e) => save(e, false)} className="no-print po-compact dc-steps">
        <div className="page-head">
          <h2>{id ? `Edit Yarn Challan ${ch.no}` : 'Yarn Receive / Issue Challan'}</h2>
          <span className="muted">Fill the steps from top to bottom</span>
        </div>

        {/* STEP 1 — receive or issue */}
        <div className="po-section">
          <div className="sec-title"><span className="sec-no">1</span>What are you doing?</div>
          <div className="choice-row">
            {Object.keys(CHALLAN_TYPES).map((k) => (
              <button type="button" key={k} className={`choice ${k} ${ch.type === k ? 'on' : ''}`}
                onClick={() => !id && chooseType(k)} disabled={!!id && ch.type !== k}>
                <b>{k === 'issue' ? '⬆ Issue yarn TO a Loom' : '⬇ Receive yarn FROM the Exporter'}</b>
                <span>{k === 'issue' ? 'Bags going out to a weaver, against a Loom Towel PO' : 'Bags coming in from the exporter, against an Exporter Towel PO'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* STEP 2 — which PO */}
        <div className="po-section">
          <div className="sec-title"><span className="sec-no">2</span>Select the {T.poLabel}</div>
          <select className="big-select" value={ch[T.poField] || ''} onChange={(e) => choosePo(e.target.value)} required>
            <option value="">-- select {T.poLabel} --</option>
            {poOptions.map(({ p, b, done }) => (
              <option key={p.id} value={p.id} disabled={done} style={done ? { color: '#9aa7b0' } : { color: '#0b5d1e', fontWeight: 600 }}>
                {done ? '✔ COMPLETED · ' : ''}{p.no} · {partyOf(p)}
                {isIssue ? ` · ${eById[p.exporterPoId]?.no || ''}` : p.refNo ? ` · Ref ${p.refNo}` : ''}
                {` — Balance ${fmt(b.balance)} of ${fmt(b.need)} Bags`}
              </option>
            ))}
          </select>
          {po && (
            <div className="po-card">
              <div><small>{isIssue ? 'Loom' : 'Exporter'}</small><b>{partyOf(po)}</b></div>
              <div><small>{T.poLabel}</small><b>{po.no}{isIssue && eById[po.exporterPoId] ? ` · ${eById[po.exporterPoId].no} (${name[eById[po.exporterPoId].exporterId] || ''})` : po.refNo ? ` · Ref ${po.refNo}` : ''}</b></div>
              <div><small>Total Bags needed</small><b>{fmt(bal.need)}</b></div>
              <div><small>Already {T.past}</small><b>{fmt(bal.done)}</b></div>
              <div className={`hl bal-big ${bal.balance <= 0 ? 'zero' : ''}`}><small>Balance Bags</small><b>{fmt(bal.balance)}</b></div>
            </div>
          )}
        </div>

        {/* STEP 3 — bags of each yarn */}
        {po && (
          <div className="po-section">
            <div className="sec-title">
              <span className="sec-no">3</span>How many bags of each yarn {isIssue ? 'are you issuing' : 'did you receive'}?
              <div className="bags-bal bal-corner">
                <div><small>Balance now</small><b>{fmt(bal.balance)}</b></div>
                <div className="arrow">−</div>
                <div><small>This challan</small><b>{fmt(thisBags)}</b></div>
                <div className="arrow">=</div>
                <div className={`after ${bal.balance - thisBags < 0 ? 'neg' : ''}`}><small>Left after this</small><b>{fmt(bal.balance - thisBags)}</b></div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="yc-lines">
                <thead>
                  <tr>
                    <th>Quality</th><th>For</th><th>Yarn (Blend · Count · Spinning)</th><th className="num">%</th>
                    <th className="num">Needed</th><th className="num">Already {T.past}</th><th className="num">Balance</th>
                    <th style={{ width: 130 }}>{T.verb} Bags</th><th style={{ width: 210 }}>Brand</th><th className="num">Left after</th>
                  </tr>
                </thead>
                <tbody>
                  {ch.lines.map((l, i) => {
                    const s = slotOf(l);
                    if (!s) return null;
                    const left = s.balance - num(l.bags);
                    return (
                      <tr key={s.key} className={s.balance <= 0 && !num(l.bags) ? 'done-row' : ''}>
                        <td className="wrap"><b>Q{s.qi + 1}</b> <span className="muted">{s.quality}</span></td>
                        <td><span className={`yarn-tag ${s.y}`}>{s.name}</span></td>
                        <td className="strong">{s.text || '—'}</td>
                        <td className="num">{fmt(s.pct)}%</td>
                        <td className="num">{fmt(s.need)}</td>
                        <td className="num">{fmt(s.done)}</td>
                        <td className="num strong">{fmt(s.balance)}</td>
                        <td><NumberInput value={l.bags ?? ''} onChange={(v) => setLine(i, { bags: v })} unit="Bags" placeholder="0" /></td>
                        <td><LookupSelect value={l.brand || ''} onChange={(v) => setLine(i, { brand: v })} placeholder="-- brand --" {...bind('yarnBrand', 'brand')} /></td>
                        <td className={`num strong ${left < 0 ? 'bad' : left === 0 ? 'good' : ''}`}>{fmt(left)}</td>
                      </tr>
                    );
                  })}
                  {!ch.lines.length && <tr><td colSpan={10} className="empty">This PO has no yarn % / weight, so no bags are needed.</td></tr>}
                </tbody>
                {ch.lines.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={4}>TOTAL <button type="button" className="link-btn" style={{ marginLeft: 10 }} onClick={fillAll}>fill full balance</button></td>
                      <td className="num">{fmt(bal.need)}</td><td className="num">{fmt(bal.done)}</td><td className="num">{fmt(bal.balance)}</td>
                      <td className="num">{fmt(thisBags)} Bags</td><td></td><td className="num">{fmt(bal.balance - thisBags)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* STEP 4 — challan details */}
        <div className="po-section">
          <div className="sec-title"><span className="sec-no">{po ? 4 : 3}</span>Challan details</div>
          <div className="grid dc-grid">
            <label>Challan Ref No<input value={ch.no} disabled /></label>
            <label>Date *<DateInput value={ch.date} onChange={(v) => setCh({ ...ch, date: v })} required /></label>
            <label>Challan No (paper)<input value={ch.challanNo} onChange={set('challanNo')} /></label>
            <label className="span2">{isIssue ? 'Loom Delivery Place (yarn delivered at)' : 'Delivery Place (delivered from)'}<LookupSelect value={ch.deliveryPlace || ''} onChange={(v) => setCh({ ...ch, deliveryPlace: v })} {...bind('deliveryPlace', 'delivery place')} /></label>
            <label>Vehicle No<LookupSelect value={ch.vehicleNo || ''} onChange={(v) => setCh({ ...ch, vehicleNo: v })} {...bind('vehicleNo', 'vehicle no')} /></label>
            <label>Driver / Phone<LookupSelect value={ch.driverPhone || ''} onChange={(v) => setCh({ ...ch, driverPhone: v })} {...bind('driverPhone', 'driver / phone')} /></label>
            <label className="span2">{isIssue ? 'Yarn Issued From *' : 'Godown (received into) *'}<LookupSelect value={ch.godown || ''} onChange={(v) => setCh({ ...ch, godown: v })} {...bind('godown', 'godown')} required /></label>
            <label className="span2">Remarks<input value={ch.remarks} onChange={set('remarks')} /></label>
            <label>
              Gate Pass Picture
              <div className="pic-row">
                <label className="pic-btn">
                  📎 {ch.gatePass ? 'Change' : 'Attach Picture'}
                  <input type="file" accept="image/*" capture="environment" onChange={pickPicture} hidden />
                </label>
                {ch.gatePass && (
                  <>
                    <img src={ch.gatePass} alt="Gate pass" className="pic-thumb" onClick={() => setShowPic(true)} />
                    <button type="button" className="icon-btn del" title="Remove picture" onClick={() => setCh({ ...ch, gatePass: '' })}>🗑</button>
                  </>
                )}
              </div>
            </label>
          </div>
        </div>

        <div className="actions">
          <button className="save-btn" type="button" disabled={saving} onClick={(e) => save(e, true)}>{saving ? 'Saving…' : 'Save & Print'}</button>
          <button className="primary" type="submit" disabled={saving}>{id ? 'Update' : 'Save'}</button>
          <button type="button" onClick={() => (id ? nav(BASE) : setCh({ ...blank(ch.type), no: ch.no }))}>Cancel</button>
        </div>
      </form>

      {/* ---- list ---- */}
      <div className="page-head list-head">
        <h3 style={{ margin: 0 }}>{po ? `${T.poLabel} ${po.no}: all ${isIssue ? 'issue' : 'receive'} challans` : 'All Yarn Challans'}</h3>
        <div className="stat-chips" style={{ margin: 0 }}>
          <div className="chip"><small>Challans</small><b>{list.length}</b></div>
          {(!po || !isIssue) && <div className="chip net"><small>Received</small><b>{fmt(sumRecv)} Bags</b></div>}
          {(!po || isIssue) && <div className="chip base"><small>Issued</small><b>{fmt(sumIss)} Bags</b></div>}
          {po && <div className="chip total"><small>Balance</small><b>{fmt(bal.balance)} Bags</b></div>}
        </div>
      </div>
      <div className="toolbar no-print">
        <input type="search" placeholder="Search challan, PO, party, yarn, vehicle…" value={q} onChange={(e) => setQ(e.target.value)} />
        {!po && (
          <select value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">Receive + Issue</option>
            <option value="receive">Receive only</option>
            <option value="issue">Issue only</option>
          </select>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ref No</th><th>Date</th><th>Type</th><th>PO</th><th>Party</th><th>Yarn (for · count · bags)</th>
              <th className="num">Bags</th><th>Delivery Place</th><th>Vehicle</th><th>Driver</th><th>Godown / Issued From</th><th>Paper No</th><th className="no-print"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const t = challanType(c);
              const p = poOf(c);
              return (
                <tr key={c.id} className={c.id === id ? 'editing' : ''}>
                  <td className="strong">{c.no}</td>
                  <td>{fmtDate(c.date)}</td>
                  <td><span className={`tag ${t === 'issue' ? 'loom' : 'exporter'}`}>{t === 'issue' ? 'Issue' : 'Receive'}</span></td>
                  <td>{p?.no || '—'}{t === 'issue' && p && eById[p.exporterPoId] ? <small className="muted"> · {eById[p.exporterPoId].no}</small> : null}</td>
                  <td>{partyOf(p, t)}</td>
                  <td className="wrap yc-yarns">
                    {(c.lines || []).map((l, i) => (
                      <span key={i}><span className={`yarn-tag ${l.y}`}>{yarnName(l.y)}</span> {l.yarnText}{l.brand ? ` (${l.brand})` : ''}: <b>{fmt(l.bags)}</b></span>
                    ))}
                  </td>
                  <td className="num strong">{fmt(challanBags(c))}</td>
                  <td>{c.deliveryPlace}</td>
                  <td>{c.vehicleNo}</td>
                  <td>{c.driverPhone}</td>
                  <td>{c.godown}</td>
                  <td>{c.challanNo}</td>
                  <td className="no-print">
                    <div className="mini-actions">
                      <button title="Edit" onClick={() => { nav(`${BASE}/${c.id}/edit`); window.scrollTo({ top: 0 }); }}>✎</button>
                      <button title="Print" onClick={() => nav(`${BASE}/${c.id}/print`)}>🖨</button>
                      <button title="Delete" className="danger" onClick={() => del(c)}>🗑</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={13} className="empty">{po ? `No challan made for this ${T.poLabel} yet` : 'No yarn challans yet'}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
