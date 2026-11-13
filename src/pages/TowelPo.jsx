import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmt, fmtDate, inWords, num } from '../util.js';
import {
  YARNS, SHORTAGE_FIELDS, RATE_UNITS, rateUnitShort, yarnText, qualityTitle, construction, lbsPerDozen, itemLbs, itemAmount,
  qualityCalc, poTotals, withYarnPct, emptyItem, emptyQuality, blankTowelPo, LBS_PER_BAG,
} from '../towelPo.js';
import Notice from '../components/Notice.jsx';
import LookupSelect from '../components/LookupSelect.jsx';
import NumberInput from '../components/NumberInput.jsx';
import DateInput from '../components/DateInput.jsx';
import { showToast } from '../components/Toast.jsx';

const BASE = '/towel/po';
const COLL = 'towel-pos';
const STATUSES = ['open', 'closed', 'cancelled'];
const DEFAULT_GST = '18';
const gstPctFor = (type, current) => (type === 'with' ? (Number(current) > 0 ? current : DEFAULT_GST) : '0');

export default function TowelPo() {
  const { id } = useParams();
  const nav = useNavigate();
  const [po, setPo] = useState(null);
  const [rows, setRows] = useState([]);
  const [parties, setParties] = useState([]);
  const [lookups, setLookups] = useState([]);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [popup, setPopup] = useState(null);

  // list filters
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fParty, setFParty] = useState('');
  const [fStatus, setFStatus] = useState('');

  const loadList = () => api.list(COLL).then(setRows);
  const loadParties = () => api.list('parties', '?type=exporter').then(setParties);
  const loadLookups = () => api.list('lookups').then(setLookups);

  useEffect(() => {
    Promise.all([loadList(), loadParties(), loadLookups()]).catch((e) => setMsg({ type: 'err', text: e.message }));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const doc = id ? await api.get(COLL, id) : { ...blankTowelPo(), no: await api.nextNo(COLL) };
        if (!doc.qualities?.length) doc.qualities = [emptyQuality()];
        if (doc.gstType !== 'with') doc.gstPct = '0';
        alive && setPo(doc);
      } catch (e) {
        alive && setMsg({ type: 'err', text: e.message });
      }
    })();
    return () => { alive = false; };
  }, [id]);

  // new PO with only one exporter saved: select it automatically
  const autoSetFor = useRef('');
  useEffect(() => {
    if (id || !po || po.exporterId || autoSetFor.current === po.no || parties.length !== 1) return;
    autoSetFor.current = po.no;
    setPo((cur) => (cur && !cur.exporterId ? { ...cur, exporterId: parties[0].id } : cur));
  }, [id, po, parties]);

  const partyName = useMemo(() => Object.fromEntries(parties.map((p) => [p.id, p.name])), [parties]);
  const sortedParties = [...parties].sort((a, b) => a.name.localeCompare(b.name));
  const lk = (kind) =>
    lookups
      .filter((l) => l.kind === kind)
      .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }))
      .map((l) => ({ id: l.id, value: l.value }));
  const bind = (kind, label) => ({
    label,
    options: lk(kind),
    onAdd: async (value) => { await api.create('lookups', { kind, value }); await loadLookups(); },
    onEdit: async (o, value) => { await api.update('lookups', o.id, { kind, value }); await loadLookups(); },
    onDelete: async (o) => { await api.remove('lookups', o.id); await loadLookups(); },
  });

  // ---------- form helpers ----------
  const setQual = (qi, patch) => setPo((p) => ({ ...p, qualities: p.qualities.map((x, j) => (j === qi ? { ...x, ...patch } : x)) }));
  const setYarn = (qi, patch) => setPo((p) => ({ ...p, qualities: p.qualities.map((x, j) => (j === qi ? { ...x, ...withYarnPct(x, patch) } : x)) }));
  const setItem = (qi, ii, patch) =>
    setPo((p) => ({
      ...p,
      qualities: p.qualities.map((x, j) => (j === qi ? { ...x, items: x.items.map((it, k) => (k === ii ? { ...it, ...patch } : it)) } : x)),
    }));
  const addItem = (qi) => {
    const last = po.qualities[qi].items.at(-1);
    // new row keeps the rate unit of the row above
    setQual(qi, { items: [...po.qualities[qi].items, { ...emptyItem(), rateUnit: last?.rateUnit || 'lbs' }] });
  };
  const removeItem = (qi, ii) => {
    const items = po.qualities[qi].items;
    if (items.length === 1) return setQual(qi, { items: [emptyItem()] });
    setQual(qi, { items: items.filter((_, k) => k !== ii) });
  };
  const addQuality = () => setPo({ ...po, qualities: [...po.qualities, emptyQuality()] });
  const removeQuality = (qi) => confirm(`Remove Quality ${qi + 1}?`) && setPo({ ...po, qualities: po.qualities.filter((_, j) => j !== qi) });

  async function save(e) {
    e.preventDefault();
    const fail = (text, title = 'Please complete the PO') => {
      setMsg({ type: 'err', text });
      setSaveErr(text);
      setPopup({ title, text });
    };
    setSaveErr('');
    if (!po.exporterId) return fail('Select the Exporter (M/S) at the top of the form');
    for (const [qi, qa] of po.qualities.entries()) {
      const p = `Quality ${qi + 1}: `;
      const filled = qa.items.filter((it) => it.item || num(it.qty) || num(it.pcsWt));
      if (!filled.some((it) => num(it.qty) > 0)) return fail(`${p}enter at least one item with Qty (Pcs)`);
      for (const [ii, it] of filled.entries()) {
        const r = `${p}row ${ii + 1}: `;
        if (!it.item) return fail(`${r}select the Item`);
        if (!(num(it.qty) > 0)) return fail(`${r}enter Qty (Pcs)`);
        if (!(num(it.pcsWt) > 0)) return fail(`${r}enter Pcs Wt (Gram)`);
        if (!(num(it.rate) > 0)) return fail(`${r}enter the Rate`);
      }
      const pct = YARNS.reduce((s, [y]) => s + num(qa[y + 'Pct']), 0);
      if (Math.abs(pct - 100) > 0.01) return fail(`${p}Pile % + Ground % + Weft % + Fancy % must be 100 (now ${fmt(pct, 2)})`);
    }
    setSaving(true);
    try {
      const body = {
        ...po,
        qualities: po.qualities.map((qa) => ({
          ...qa,
          title: qualityTitle(qa),
          construction: construction(qa),
          items: qa.items.filter((it) => it.item || num(it.qty) || num(it.pcsWt)),
        })),
      };
      if (id) await api.update(COLL, id, body);
      else await api.create(COLL, body);
      showToast({
        title: id ? 'Updated successfully' : 'Saved successfully',
        text: `Towel PO ${po.no}${partyName[po.exporterId] ? ` for ${partyName[po.exporterId]}` : ''} has been ${id ? 'updated' : 'saved'}.`,
      });
      await loadList();
      if (id) nav(BASE);
      else setPo({ ...blankTowelPo(), no: await api.nextNo(COLL) });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
      setSaveErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function del(p) {
    if (!confirm(`Delete Towel PO ${p.no}?`)) return;
    try {
      await api.remove(COLL, p.id);
      showToast({ type: 'delete', title: 'Deleted', text: `Towel PO ${p.no} has been deleted.` });
      loadList();
      if (p.id === id) nav(BASE);
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
  }

  // ---------- list ----------
  const list = rows
    .filter((p) => !fParty || p.exporterId === fParty)
    .filter((p) => !fStatus || p.status === fStatus)
    .filter((p) => (!from || p.date >= from) && (!to || p.date <= to))
    .filter((p) => {
      if (!q) return true;
      const hay = [p.no, p.refNo, p.buyerName, partyName[p.exporterId], ...(p.qualities || []).flatMap((x) => [qualityTitle(x), ...(x.items || []).map((i) => i.item)])]
        .join(' ').toLowerCase();
      return hay.includes(q.toLowerCase());
    })
    .map((p) => ({ ...p, t: poTotals(p) }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.no || '').localeCompare(a.no || ''));
  const sum = (k) => list.reduce((s, r) => s + r.t[k], 0);

  function exportExcel() {
    const head = ['PO No', 'Date', 'Exporter', 'Buyer', 'Ref No', 'Quality', 'Item', 'Size', 'Pcs Wt (Gm)', 'Lbs / Dz', 'Qty (Pcs)', 'Rate', 'Rate Unit', 'Total Lbs', 'Amount', 'Delivery Date', 'Status'];
    const lines = [head];
    for (const p of list) {
      for (const qa of p.qualities || []) {
        for (const it of qa.items || []) {
          lines.push([p.no, fmtDate(p.date), partyName[p.exporterId] || '', p.buyerName || '', p.refNo || '', qualityTitle(qa), it.item,
            `${it.width || ''} x ${it.length || ''}`, num(it.pcsWt), lbsPerDozen(it).toFixed(2), num(it.qty), num(it.rate), rateUnitShort(it.rateUnit),
            itemLbs(it).toFixed(2), itemAmount(it).toFixed(2), fmtDate(p.deliveryDate), p.status]);
        }
      }
    }
    const csv = lines.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `towel-pos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const party = parties.find((p) => p.id === po?.exporterId);
  const t = po ? poTotals(po) : null;

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

      {po && (
        <form onSubmit={save} className="no-print po-compact">
          <div className="page-head">
            <h2>{id ? `Edit Towel PO ${po.no}` : 'New Towel PO'}</h2>
            {id && <button type="button" onClick={() => nav(BASE)}>+ New instead</button>}
          </div>

          {/* ---- 1. PO details ---- */}
          <div className="po-section">
            <div className="sec-title">
              <span className="sec-no">1</span>PO Details
              <span className="sec-ref" title="PO No | Exporter | Buyer | Ref No">
                <small>Ref</small> {[po.no, partyName[po.exporterId]?.split(' ')[0], po.buyerName, po.refNo].filter(Boolean).join(' | ') || '—'}
              </span>
            </div>
            <div className="grid head-grid">
              <label>
                Towel PO No *
                <input value={po.no} disabled />
              </label>
              <label>
                PO Date *
                <DateInput value={po.date} onChange={(v) => setPo({ ...po, date: v })} required />
              </label>
              <label className="span2">
                M/S (Exporter) *
                <LookupSelect
                  label="Exporter name"
                  placeholder="-- select --"
                  value={po.exporterId}
                  onChange={(v) => setPo({ ...po, exporterId: v })}
                  options={sortedParties.map((p) => ({ id: p.id, value: p.id, label: p.name }))}
                  onAdd={async (name) => { const p = await api.create('parties', { type: 'exporter', name }); await loadParties(); return p.id; }}
                  onEdit={async (o, name) => { const p = parties.find((x) => x.id === o.id); await api.update('parties', o.id, { ...p, name }); await loadParties(); return o.id; }}
                  onDelete={async (o) => { await api.remove('parties', o.id); await loadParties(); }}
                  required
                />
              </label>
              <label className="span2">
                Buyer Name
                <LookupSelect value={po.buyerName} onChange={(v) => setPo({ ...po, buyerName: v })} {...bind('buyer', 'buyer (e.g. Katzkon Brothers)')} />
              </label>
              <label>
                Exporter PO / Ref No
                <input value={po.refNo || ''} onChange={(e) => setPo({ ...po, refNo: e.target.value })} placeholder="e.g. 230-14 CTD" />
              </label>
              <label>
                Rev Order Date
                <DateInput value={po.revDate} onChange={(v) => setPo({ ...po, revDate: v })} />
              </label>
              <label>
                Delivery Date
                <DateInput value={po.deliveryDate} onChange={(v) => setPo({ ...po, deliveryDate: v })} />
              </label>
              <label>
                GST Type
                <select value={po.gstType} onChange={(e) => setPo({ ...po, gstType: e.target.value, gstPct: gstPctFor(e.target.value, po.gstPct) })}>
                  <option value="with">With GST</option>
                  <option value="without">Without GST</option>
                </select>
              </label>
              <label>
                GST %
                <input type="number" step="any" min="0" value={po.gstPct} onChange={(e) => setPo({ ...po, gstPct: e.target.value })} disabled={po.gstType !== 'with'} />
              </label>
              <label>
                Status
                <select value={po.status} onChange={(e) => setPo({ ...po, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </select>
              </label>
            </div>
            {party && (
              <div className="party-info">
                {party.address && <span><b>Address:</b> {party.address}</span>}
                {party.strn && <span><b>G.S.T. #:</b> {party.strn}</span>}
                {party.ntn && <span><b>NTN #:</b> {party.ntn}</span>}
                {party.phone && <span><b>Phone #:</b> {party.phone}</span>}
                {!party.address && !party.strn && !party.ntn && !party.phone && (
                  <span className="muted">No address / GST / NTN saved for this exporter — <a href="/towel/exporters">add in Exporters</a></span>
                )}
              </div>
            )}
          </div>

          {/* ---- Qualities ---- */}
          {po.qualities.map((qa, qi) => {
            const c = qualityCalc(qa);
            const pctSum = YARNS.reduce((s, [y]) => s + num(qa[y + 'Pct']), 0);
            return (
              <div key={qa.key} className="quality-block">
                <div className="quality-head">
                  <span className="q-badge">Quality {qi + 1}{po.qualities.length > 1 ? ` of ${po.qualities.length}` : ''}</span>
                  <b className="q-title">{qualityTitle(qa) || '—'}</b>
                  {qa.finish && <span className="q-finish">{qa.finish}</span>}
                  {po.qualities.length > 1 && <button type="button" className="danger" onClick={() => removeQuality(qi)}>Remove Quality</button>}
                </div>

                {/* 2. Quality, construction & yarn */}
                <div className="po-section">
                  <div className="sec-title">
                    <span className="sec-no">2</span>Quality, Construction &amp; Yarn
                    <span className="sec-ref" title="Construction (auto): Reed x Pick / Pile · Ground · Weft · Fancy / Width">
                      <small>CONSTRUCTION</small> {construction(qa) || '—'}
                    </span>
                  </div>
                  <div className="grid towel-q-grid">
                    <label>
                      Quality
                      <LookupSelect value={qa.qualityName} onChange={(v) => setQual(qi, { qualityName: v })} {...bind('towelQuality', 'quality (e.g. KB Plush)')} />
                    </label>
                    <label>
                      Border
                      <LookupSelect value={qa.border} onChange={(v) => setQual(qi, { border: v })} {...bind('border', 'border (e.g. CAM Border)')} />
                    </label>
                    <label>
                      Color
                      <LookupSelect value={qa.color} onChange={(v) => setQual(qi, { color: v })} {...bind('color', 'color (e.g. White)')} />
                    </label>
                    <label className="span2">
                      Finish
                      <LookupSelect value={qa.finish} onChange={(v) => setQual(qi, { finish: v })} {...bind('finish', 'finish (e.g. With Stitching & With Bleaching)')} />
                    </label>
                    <label>
                      Packing
                      <LookupSelect value={qa.packing} onChange={(v) => setQual(qi, { packing: v })} {...bind('packing', 'packing (e.g. Bale Pack)')} />
                    </label>
                    <label>
                      Reed
                      <LookupSelect value={qa.reed} onChange={(v) => setQual(qi, { reed: v })} {...bind('reed', 'reed (e.g. 60)')} />
                    </label>
                    <label>
                      Pick
                      <LookupSelect value={qa.pick} onChange={(v) => setQual(qi, { pick: v })} {...bind('pick', 'pick (e.g. 40)')} />
                    </label>
                    <label className="span-pair">
                      Width
                      <div className="pair-row">
                        <LookupSelect value={qa.width} onChange={(v) => setQual(qi, { width: v })} placeholder="--" {...bind('fabricWidth', 'width (e.g. 63)')} />
                        <LookupSelect value={qa.widthUnit} onChange={(v) => setQual(qi, { widthUnit: v })} placeholder="Unit" {...bind('widthUnit', 'unit (e.g. Inches)')} />
                      </div>
                    </label>
                  </div>

                  <div className="yarn-grid towel-yarns">
                    {YARNS.map(([y, name]) => (
                      <fieldset key={y} className="yarn-field towel-yarn">
                        {/* yarn name shown first, before Count */}
                        <div className="yarn-name">
                          <b>{y === 'weft' ? 'Weft (Bobbin)' : name}</b>
                          {yarnText(qa, y) && <span className="yarn-sum">{yarnText(qa, y)}</span>}
                        </div>
                        <label>
                          Count
                          <LookupSelect value={qa[y]} onChange={(v) => setQual(qi, { [y]: v })} {...bind('count', 'count (e.g. 16)')} />
                        </label>
                        <label>
                          Type
                          <LookupSelect value={qa[y + 'Type']} onChange={(v) => setQual(qi, { [y + 'Type']: v })} {...bind('yarnType', 'type (e.g. Single)')} />
                        </label>
                        <label>
                          Quality / Blend
                          <LookupSelect value={qa[y + 'Blend']} onChange={(v) => setQual(qi, { [y + 'Blend']: v })} {...bind('blend', 'blend (e.g. Cotton)')} />
                        </label>
                        <label>
                          Spinning
                          <LookupSelect value={qa[y + 'Spin']} onChange={(v) => setQual(qi, { [y + 'Spin']: v })} {...bind('spinning', 'spinning (e.g. OE, Ring)')} />
                        </label>
                        <label>
                          Yarn Rate / Bag
                          <NumberInput value={qa[y + 'Rate'] ?? ''} onChange={(v) => setQual(qi, { [y + 'Rate']: v })} unit="Rs" placeholder="0" />
                        </label>
                        <label>
                          %
                          <NumberInput value={qa[y + 'Pct'] ?? ''} onChange={(v) => setYarn(qi, { [y + 'Pct']: v })} unit="%" placeholder="0" />
                        </label>
                      </fieldset>
                    ))}
                  </div>
                  {Math.abs(pctSum - 100) > 0.01 && (
                    <div className="pct-warn">Pile % + Ground % + Weft % + Fancy % = {fmt(pctSum, 2)} — must be 100</div>
                  )}
                </div>

                {/* 3. Items */}
                <div className="po-section">
                  <div className="sec-title">
                    <span className="sec-no">3</span>Items (Size, Weight, Qty &amp; Rate)
                    <span className="sec-ref"><small>TOTAL</small> {fmt(c.pcs)} Pcs · {fmt(c.lbs, 2)} Lbs · Rs {fmt(c.amount, 2)}</span>
                  </div>
                  <div className="table-wrap towel-items-wrap">
                    <table className="towel-items">
                      <thead>
                        <tr>
                          <th className="c-sno">S.No</th>
                          <th className="c-item">Item</th>
                          <th className="c-size">Size (W x L)</th>
                          <th className="c-n">Pcs Wt (Gm)</th>
                          <th className="c-n num">Lbs / Dz</th>
                          <th className="c-n">Qty (Pcs)</th>
                          <th className="c-n">Rate / Lbs</th>
                          <th className="c-unit">Rate Unit</th>
                          <th className="c-n num">Total Lbs</th>
                          <th className="c-n num">Amount</th>
                          <th className="c-x"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {qa.items.map((it, ii) => (
                          <tr key={it.key}>
                            <td className="c-sno">{ii + 1}</td>
                            <td className="c-item">
                              <LookupSelect value={it.item} onChange={(v) => setItem(qi, ii, { item: v })} placeholder="-- item --" {...bind('towelItem', 'item (e.g. Hand Towel)')} />
                            </td>
                            <td className="c-size">
                              <div className="size-row">
                                <NumberInput value={it.width} onChange={(v) => setItem(qi, ii, { width: v })} placeholder="W" />
                                <span>x</span>
                                <NumberInput value={it.length} onChange={(v) => setItem(qi, ii, { length: v })} placeholder="L" />
                              </div>
                            </td>
                            <td><NumberInput value={it.pcsWt} onChange={(v) => setItem(qi, ii, { pcsWt: v })} unit="Gm" placeholder="0" /></td>
                            <td className="num calc-cell">{num(it.pcsWt) ? fmt(lbsPerDozen(it), 2) : '—'}</td>
                            <td><NumberInput value={it.qty} onChange={(v) => setItem(qi, ii, { qty: v })} unit="Pcs" placeholder="0" /></td>
                            <td><NumberInput value={it.rate} onChange={(v) => setItem(qi, ii, { rate: v })} placeholder="0.00" decimals={2} /></td>
                            <td className="c-unit">
                              <select value={it.rateUnit || 'lbs'} onChange={(e) => setItem(qi, ii, { rateUnit: e.target.value })}>
                                {RATE_UNITS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                              </select>
                            </td>
                            <td className="num calc-cell">{itemLbs(it) ? fmt(itemLbs(it), 2) : '—'}</td>
                            <td className="num calc-cell strong">{itemAmount(it) ? fmt(itemAmount(it), 2) : '—'}</td>
                            <td className="c-x">
                              <button type="button" className="icon-btn del" title="Remove row" onClick={() => removeItem(qi, ii)}>🗑</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2}>
                            <button type="button" className="add-row" onClick={() => addItem(qi)}>+ Add Item</button>
                          </td>
                          <td colSpan={3} className="num">Total</td>
                          <td className="num">{fmt(c.pcs)} Pcs</td>
                          <td colSpan={2}></td>
                          <td className="num">{fmt(c.lbs, 2)}</td>
                          <td className="num">{fmt(c.amount, 2)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <small className="muted formula-note">
                    Lbs / Dz = Pcs Wt × 12 ÷ 453.59 · Total Lbs = Qty × Pcs Wt ÷ 453.59 · Amount = Rate × Total Lbs (or × Pcs / × Dozen)
                  </small>
                </div>

                {/* 4. Shortage & yarn requirement */}
                <div className="po-section">
                  <div className="sec-title">
                    <span className="sec-no">4</span>Shortage &amp; Yarn Requirement
                    <span className="sec-ref"><small>NET</small> {fmt(c.netLbs, 2)} Lbs · {fmt(c.netBags, 2)} Bags</span>
                  </div>
                  <div className="grid shortage-grid towel-shortage">
                    {SHORTAGE_FIELDS.map(([k, label]) => (
                      <label key={k}>
                        {label}
                        <NumberInput value={qa[k] ?? ''} onChange={(v) => setQual(qi, { [k]: v })} unit="%" placeholder="0" />
                      </label>
                    ))}
                    <label>
                      Total Shortage
                      <div className="calc hl-shortage">{fmt(c.shortage, 2)} %</div>
                    </label>
                  </div>
                  <div className="table-wrap" style={{ marginTop: 12 }}>
                    <table className="yarn-req">
                      <thead>
                        <tr>
                          <th>Yarn</th>
                          <th>Count</th>
                          <th className="num">%</th>
                          <th className="num">Net Lbs</th>
                          <th className="num">Bags Required</th>
                          <th className="num">Yarn Rate / Bag</th>
                          <th className="num">Yarn Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.yarns.map((y) => (
                          <tr key={y.p}>
                            <td className="strong">{y.name}</td>
                            <td>{y.text || '—'}</td>
                            <td className="num">{fmt(y.pct, 2)} %</td>
                            <td className="num">{fmt(y.lbs, 2)}</td>
                            <td className="num strong">{fmt(y.bags, 2)}</td>
                            <td className="num">{y.rate ? fmt(y.rate) : '—'}</td>
                            <td className="num">{y.cost ? fmt(y.cost, 2) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2}>Total (Total Lbs {fmt(c.lbs, 2)} + {fmt(c.shortage, 2)} % shortage)</td>
                          <td className="num">{fmt(c.yarns.reduce((s, y) => s + y.pct, 0), 2)} %</td>
                          <td className="num">{fmt(c.netLbs, 2)}</td>
                          <td className="num">{fmt(c.netBags, 2)}</td>
                          <td></td>
                          <td className="num">{c.yarnCost ? fmt(c.yarnCost, 2) : '—'}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <small className="muted formula-note">Net Lbs = Total Lbs + Shortage % · split by Pile / Ground / Weft / Fancy % · Bags = Lbs ÷ {LBS_PER_BAG}</small>
                </div>
              </div>
            );
          })}

          <div className="add-quality">
            <button type="button" onClick={addQuality}>+ Add Quality</button>
            <span className="muted">Each quality (yarn / border / color) has its own items, like the weaving program.</span>
          </div>

          <div className="po-section">
            <div className="sec-title"><span className="sec-no">5</span>Remarks</div>
            <textarea rows={2} value={po.remarks || ''} onChange={(e) => setPo({ ...po, remarks: e.target.value })} placeholder="Sample, labels, packing instructions…" style={{ width: '100%' }} />
          </div>

          {/* ---- Summary bar ---- */}
          <div className="sumbar">
            <div className="chip"><small>Total Qty (Pcs)</small><b>{fmt(t.pcs)}</b></div>
            <div className="chip"><small>Total Lbs</small><b>{fmt(t.lbs, 2)}</b></div>
            <div className="chip net"><small>Net Bags Required</small><b>{fmt(t.netBags, 2)}</b></div>
            <div className="chip base"><small>Amount (excl. GST)</small><b>{fmt(t.amount, 2)}</b></div>
            <div className="chip gst"><small>GST</small><b>{fmt(t.gst, 2)}</b></div>
            <div className="chip total"><small>Grand Total</small><b>{fmt(t.total, 2)}</b></div>
            {saveErr && (
              <div className="save-err" role="alert">
                ⚠ {saveErr}
                <button type="button" onClick={() => setSaveErr('')} aria-label="Close">×</button>
              </div>
            )}
            <div className="sumbar-actions">
              <button className="save-btn" type="submit" disabled={saving}>{saving ? 'Saving…' : id ? 'Update Towel PO' : 'Save Towel PO'}</button>
              <button type="button" onClick={() => (id ? nav(BASE) : setPo({ ...blankTowelPo(), no: po.no }))}>Cancel</button>
            </div>
          </div>
          <div className="words">{inWords(t.total)}</div>
        </form>
      )}

      {/* ---- List ---- */}
      <div className="page-head list-head">
        <h2>All Towel POs</h2>
        <div className="row-actions big no-print">
          <button className="btn-print" onClick={() => window.print()}>Print</button>
          <button className="btn-excel" onClick={exportExcel}>Excel</button>
        </div>
      </div>
      <div className="toolbar no-print">
        <input type="search" placeholder="Search PO, buyer, ref, exporter, quality, item…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label>From <DateInput value={from} onChange={setFrom} /></label>
        <label>To <DateInput value={to} onChange={setTo} /></label>
        <select value={fParty} onChange={(e) => setFParty(e.target.value)}>
          <option value="">All exporters</option>
          {sortedParties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">All status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="stat-chips">
        <div className="chip"><small>Towel POs</small><b>{list.length}</b></div>
        <div className="chip"><small>Total Qty (Pcs)</small><b>{fmt(sum('pcs'))}</b></div>
        <div className="chip"><small>Total Lbs</small><b>{fmt(sum('lbs'), 2)}</b></div>
        <div className="chip net"><small>Net Bags Required</small><b>{fmt(sum('netBags'), 2)}</b></div>
        <div className="chip base"><small>Amount (excl. GST)</small><b>{fmt(sum('amount'), 2)}</b></div>
        <div className="chip gst"><small>GST</small><b>{fmt(sum('gst'), 2)}</b></div>
        <div className="chip total"><small>Total Amount</small><b>{fmt(sum('total'), 2)}</b></div>
      </div>

      <div className="table-wrap">
        <table className="po-list">
          <thead>
            <tr>
              <th>PO No</th>
              <th>Date</th>
              <th>Exporter</th>
              <th>Buyer · Ref</th>
              <th>Quality · Items</th>
              <th className="num">Qty (Pcs)</th>
              <th className="num">Total Lbs</th>
              <th className="num">Net Bags</th>
              <th className="num">Amount</th>
              <th>Delivery</th>
              <th className="no-print"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const qs = p.qualities || [];
              return (
                <tr key={p.id} className={p.id === id ? 'editing' : ''}>
                  <td className="strong">{p.no}{p.status !== 'open' && <div className="qty-2nd">{p.status}</div>}</td>
                  <td>{fmtDate(p.date)}</td>
                  <td>{partyName[p.exporterId] || '—'}</td>
                  <td>{p.buyerName || '—'}{p.refNo && <div className="qty-2nd">{p.refNo}</div>}</td>
                  <td className="wrap" style={{ fontSize: 12.5 }}>
                    {qs.map((qa) => (
                      <div key={qa.key}>
                        <b>{qualityTitle(qa)}</b>
                        <div className="qty-2nd">{(qa.items || []).map((it) => `${it.item} ${it.width || ''}x${it.length || ''} (${fmt(it.qty)})`).join(' · ')}</div>
                      </div>
                    ))}
                  </td>
                  <td className="num">{fmt(p.t.pcs)}</td>
                  <td className="num">{fmt(p.t.lbs, 2)}</td>
                  <td className="num strong">{fmt(p.t.netBags, 2)}</td>
                  <td className="num">{fmt(p.t.total, 2)}</td>
                  <td>{fmtDate(p.deliveryDate)}</td>
                  <td className="no-print">
                    <div className="mini-actions">
                      <button title="Edit" onClick={() => { nav(`${BASE}/${p.id}/edit`); window.scrollTo({ top: 0 }); }}>✎</button>
                      <button title="Print" onClick={() => nav(`${BASE}/${p.id}/print`)}>🖨</button>
                      <button title="Delete" className="danger" onClick={() => del(p)}>🗑</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!list.length && (
              <tr><td colSpan={11} className="empty">No Towel PO found</td></tr>
            )}
          </tbody>
          {list.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5}>Total</td>
                <td className="num">{fmt(sum('pcs'))}</td>
                <td className="num">{fmt(sum('lbs'), 2)}</td>
                <td className="num">{fmt(sum('netBags'), 2)}</td>
                <td className="num">{fmt(sum('total'), 2)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
