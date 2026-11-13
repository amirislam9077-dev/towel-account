// Al Hasan Towel — Reports (PO reports + yarn reports), like Al Hasan Conversion's reports.
// Every report works on the Exporter Towel POs / Loom Towel POs after the filters (date, party, status),
// then shows summary chips, a sortable table with totals, Excel (CSV) and Print.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { fmt, fmtDate, num } from '../util.js';
import DateInput from '../components/DateInput.jsx';
import { YARNS, poTotals, qualityCalc, qualityTitle, sizeText, itemLbs, itemAmount, givenToLooms, totalShortage,
  yarnBalance, challanType, yarnName, challanDone, wholeBags, slotKey } from '../towelPo.js';

// column helpers: T = text, N = number (dec = decimals, total = add in footer)
const T = (label, get, o = {}) => ({ label, get, ...o });
const N = (label, get, dec = 0, o = {}) => ({ label, get, num: true, dec, total: true, ...o });
const sumBy = (rows, get) => rows.reduce((t, r) => t + num(get(r)), 0);
const pcsOf = (po) => (po.qualities || []).reduce((s, q) => s + (q.items || []).reduce((t, it) => t + num(it.qty), 0), 0);
const uniq = (a) => [...new Set(a.filter(Boolean))];
const byNo = (a, b) => String(a.no || '').localeCompare(String(b.no || ''), undefined, { numeric: true });

const STATUS_OPTS = [
  ['active', 'Open + Closed'],
  ['open', 'Open'],
  ['closed', 'Closed'],
  ['cancelled', 'Cancelled'],
  ['all', 'All status'],
];

// ---------- report definitions ----------
// src: which POs the party / date / status filters apply to ('epo' | 'lpo' | 'basis' = chosen by the Basis select)
export const REPORTS = {
  'epo-register': {
    group: 'PO Reports', title: 'Exporter Towel PO Register', sub: 'All exporter orders: ref, qualities, pcs, Lbs, bags and amount',
    src: 'epo',
    rows: ({ epos, name }) => epos.map((p) => {
      const t = poTotals(p);
      return {
        // exporter: first word of the name only (Eastern Textiles (Pvt) Ltd → Eastern)
        _link: `/towel/po/${p.id}/edit`, no: p.no, date: p.date, party: name(p.exporterId).trim().split(/\s+/)[0], ref: p.refNo || '',
        qualities: uniq((p.qualities || []).map(qualityTitle)).join(' ; '),
        // item with towel size (W x L) and weight: "Hand Towel 16 X 27 · 112 Gm"
        items: uniq((p.qualities || []).flatMap((q) => (q.items || []).map((i) =>
          [i.item, sizeText(i), num(i.pcsWt) ? `· ${fmt(i.pcsWt)} Gm` : ''].filter(Boolean).join(' ')))).join(', '),
        delivery: p.deliveryDate, ...t, status: p.status,
        // bags of each yarn: Pile / Ground / Weft (Bobbin) / Fancy
        ...Object.fromEntries(YARNS.map(([y]) => [y + 'Bags', (p.qualities || []).reduce((s, q) => s + qualityCalc(q).yarns.find((x) => x.p === y).bags, 0)])),
      };
    }),
    cols: [
      T('PO No', (r) => r.no, { strong: true }), T('Date', (r) => fmtDate(r.date), { sort: (r) => r.date }), T('Exporter', (r) => r.party),
      T('Ref No', (r) => r.ref), T('Quality', (r) => r.qualities, { wrap: true }), T('Items (Size · Weight)', (r) => r.items, { wrap: true }),
      N('Pcs', (r) => r.pcs, 0, { chip: 'net' }), N('Lbs', (r) => r.lbs, 2, { chip: '' }),
      ...YARNS.map(([y, n]) => N(`${y === 'weft' ? 'Bobbin' : n} Bags`, (r) => r[y + 'Bags'], 2, { chip: 'yarn-' + y })),
      N('Net Bags', (r) => r.netBags, 2, { chip: 'base' }),
    ],
  },

  'lpo-register': {
    group: 'PO Reports', title: 'Loom Towel PO Register', sub: 'All weaving orders given to looms, with their Exporter PO',
    src: 'lpo',
    rows: ({ lpos, name, epoOf }) => lpos.map((p) => {
      const t = poTotals(p);
      const ep = epoOf(p.exporterPoId);
      return {
        _link: `/towel/loom-po/${p.id}/edit`, no: p.no, date: p.date, party: name(p.loomId), epo: ep?.no || '', exporter: ep ? name(ep.exporterId) : '',
        items: uniq((p.qualities || []).flatMap((q) => (q.items || []).map((i) => i.item))).join(', '),
        ...t, rate: t.lbs ? t.amount / t.lbs : 0, delivery: p.deliveryDate, status: p.status,
      };
    }),
    cols: [
      T('LPO No', (r) => r.no, { strong: true }), T('Date', (r) => fmtDate(r.date), { sort: (r) => r.date }), T('Loom', (r) => r.party),
      T('Exporter PO', (r) => r.epo), T('Exporter', (r) => r.exporter), T('Items', (r) => r.items, { wrap: true }),
      N('Pcs', (r) => r.pcs, 0, { chip: 'net' }), N('Lbs', (r) => r.lbs, 2, { chip: '' }), N('Net Bags', (r) => r.netBags, 2, { chip: 'base' }),
      N('Avg Rate / Lbs', (r) => r.rate, 2, { total: false }), N('Weaving Amount', (r) => r.amount, 2), N('Total', (r) => r.total, 2, { chip: 'total' }),
      T('Delivery', (r) => fmtDate(r.delivery), { sort: (r) => r.delivery }), T('Status', (r) => r.status, { tag: true }),
    ],
  },

  'epo-loom-balance': {
    group: 'PO Reports', title: 'Exporter PO vs Loom PO (Balance)', sub: 'Each Exporter PO with its Loom POs: pcs ordered, given to looms and balance',
    src: 'epo',
    rows: ({ epos, allLpos, name }) => {
      const given = givenToLooms(allLpos);
      const out = [];
      for (const p of epos) {
        for (const q of p.qualities || []) {
          for (const it of q.items || []) {
            const mine = allLpos.filter((l) => l.exporterPoId === p.id && l.status !== 'cancelled'
              && (l.qualities || []).some((x) => (x.items || []).some((y) => y.srcKey === it.key && num(y.qty))));
            const g = given[`${p.id}|${it.key}`] || 0;
            out.push({
              _link: `/towel/po/${p.id}/edit`, no: p.no, date: p.date, party: name(p.exporterId), quality: qualityTitle(q),
              item: it.item, size: sizeText(it), pcsWt: num(it.pcsWt), ordered: num(it.qty), given: g, balance: num(it.qty) - g,
              lpos: mine.map((l) => l.no).join(', '), looms: uniq(mine.map((l) => name(l.loomId))).join(', '),
            });
          }
        }
      }
      return out;
    },
    rowClass: (r) => (r.balance > 0 ? 'warn-row' : r.balance < 0 ? 'bad-row' : 'good-row'),
    // grouped view (like Al Hasan): every Loom PO under its Exporter PO, then given / balance
    groups: ({ epos, allLpos, name }) => epos.slice().sort(byNo).map((p) => {
      const given = givenToLooms(allLpos);
      const items = (p.qualities || []).flatMap((q) => (q.items || []).map((it) => {
        const g = given[`${p.id}|${it.key}`] || 0;
        return { label: [it.item, sizeText(it), num(it.pcsWt) ? `${fmt(it.pcsWt)} Gm` : ''].filter(Boolean).join(' · '), ordered: num(it.qty), given: g, balance: num(it.qty) - g };
      }));
      const lines = allLpos.filter((l) => l.exporterPoId === p.id && l.status !== 'cancelled')
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || byNo(a, b))
        .map((l) => {
          const t = poTotals(l);
          return {
            id: l.id, no: l.no, date: l.date, loom: name(l.loomId), status: l.status,
            items: (l.qualities || []).flatMap((q) => (q.items || []).filter((it) => num(it.qty))
              .map((it) => `${[it.item, sizeText(it), num(it.pcsWt) ? `${fmt(it.pcsWt)} Gm` : ''].filter(Boolean).join(' · ')}: ${fmt(it.qty)} Pcs`)),
            pcs: t.pcs, lbs: t.lbs, bags: t.netBags, amount: t.amount, rate: t.lbs ? t.amount / t.lbs : 0,
          };
        });
      const ordered = items.reduce((s, x) => s + x.ordered, 0);
      const g = lines.reduce((s, x) => s + x.pcs, 0);
      return {
        ep: { id: p.id, no: p.no, date: p.date, party: name(p.exporterId), ref: p.refNo || '', ordered, status: p.status },
        items, lines, given: g, balance: ordered - g,
        lbs: lines.reduce((s, x) => s + x.lbs, 0), bags: lines.reduce((s, x) => s + x.bags, 0), amount: lines.reduce((s, x) => s + x.amount, 0),
      };
    }),
    cols: [
      T('Exporter PO', (r) => r.no, { strong: true }), T('Date', (r) => fmtDate(r.date), { sort: (r) => r.date }), T('Exporter', (r) => r.party),
      T('Quality', (r) => r.quality, { wrap: true }), T('Item', (r) => r.item), T('Size', (r) => r.size), N('Pcs Wt (Gm)', (r) => r.pcsWt, 0, { total: false }),
      N('Ordered', (r) => r.ordered, 0, { chip: '' }), N('Given to Looms', (r) => r.given, 0, { chip: 'net' }), N('Balance', (r) => r.balance, 0, { chip: 'base' }),
      T('Loom POs', (r) => r.lpos), T('Looms', (r) => r.looms),
    ],
  },

  'exporter-wise': {
    group: 'PO Reports', title: 'Exporter-wise Summary', sub: 'Each exporter: POs, pcs, Lbs, bags, amount and balance with looms',
    src: 'epo',
    rows: ({ epos, allLpos, name }) => {
      const m = {};
      for (const p of epos) {
        const t = poTotals(p);
        const g = (m[p.exporterId] ||= { party: name(p.exporterId), nos: [], pcs: 0, lbs: 0, netBags: 0, amount: 0, total: 0, given: 0 });
        g.nos.push(p.no); g.pcs += t.pcs; g.lbs += t.lbs; g.netBags += t.netBags; g.amount += t.amount; g.total += t.total;
        g.given += allLpos.filter((l) => l.exporterPoId === p.id && l.status !== 'cancelled').reduce((s, l) => s + pcsOf(l), 0);
      }
      return Object.values(m).map((g) => ({ ...g, count: g.nos.length, balance: g.pcs - g.given }));
    },
    cols: [
      T('Exporter', (r) => r.party, { strong: true }), T('PO No', (r) => r.nos.sort().join(', '), { wrap: true }), N('POs', (r) => r.count),
      N('Pcs', (r) => r.pcs, 0, { chip: 'net' }), N('Given to Looms', (r) => r.given), N('Balance', (r) => r.balance),
      N('Lbs', (r) => r.lbs, 2, { chip: '' }), N('Net Bags', (r) => r.netBags, 2, { chip: 'base' }), N('Amount (excl. GST)', (r) => r.amount, 2), N('Total', (r) => r.total, 2, { chip: 'total' }),
    ],
  },

  'loom-wise': {
    group: 'PO Reports', title: 'Loom PO Summary', sub: 'Orders given to each loom: pcs, Lbs and Pile / Ground / Bobbin / Fancy bags',
    src: 'lpo',
    rows: ({ lpos, name, epoOf }) => {
      const m = {};
      for (const p of lpos) {
        const t = poTotals(p);
        const g = (m[p.loomId] ||= { party: name(p.loomId), nos: [], epos: [], pcs: 0, lbs: 0, netBags: 0, amount: 0, total: 0,
          pileBags: 0, groundBags: 0, weftBags: 0, fancyBags: 0, quals: [], items: [] });
        g.nos.push(p.no); g.epos.push(epoOf(p.exporterPoId)?.no);
        // quality, and item with towel size and weight
        for (const q of p.qualities || []) {
          g.quals.push(qualityTitle(q));
          for (const i of q.items || []) g.items.push([i.item, sizeText(i), num(i.pcsWt) ? `· ${fmt(i.pcsWt)} Gm` : ''].filter(Boolean).join(' '));
        }
        g.pcs += t.pcs; g.lbs += t.lbs; g.netBags += t.netBags; g.amount += t.amount; g.total += t.total;
        // bags of each yarn for this loom
        for (const q of p.qualities || []) for (const y of qualityCalc(q).yarns) g[y.p + 'Bags'] += y.bags;
      }
      return Object.values(m).map((g) => ({ ...g, count: g.nos.length, rate: g.lbs ? g.amount / g.lbs : 0 }));
    },
    cols: [
      T('Loom', (r) => r.party, { strong: true }), T('LPO No', (r) => r.nos.sort().join(', ')), T('Exporter POs', (r) => uniq(r.epos).join(', ')),
      T('Quality', (r) => uniq(r.quals).join(' ; '), { wrap: true }), T('Items (Size · Weight)', (r) => uniq(r.items).join(', '), { wrap: true }),
      N('LPOs', (r) => r.count), N('Pcs', (r) => r.pcs, 0, { chip: 'net' }), N('Lbs', (r) => r.lbs, 2, { chip: '' }),
      ...YARNS.map(([y, n]) => N(`${y === 'weft' ? 'Bobbin' : n} Bags`, (r) => r[y + 'Bags'], 2, { chip: 'yarn-' + y })),
      N('Net Bags', (r) => r.netBags, 2, { chip: 'base' }),
    ],
  },

  'item-wise': {
    group: 'PO Reports', title: 'Item-wise Summary', sub: 'Hand Towel, Bath Towel …: size, pcs, Lbs, amount, given to looms and balance',
    src: 'epo',
    rows: ({ epos, allLpos }) => {
      const given = givenToLooms(allLpos);
      const m = {};
      for (const p of epos) {
        for (const q of p.qualities || []) {
          for (const it of q.items || []) {
            const k = [it.item, sizeText(it), num(it.pcsWt)].join('|');
            const g = (m[k] ||= { item: it.item || '—', size: sizeText(it), pcsWt: num(it.pcsWt), nos: [], pcs: 0, lbs: 0, amount: 0, given: 0 });
            g.nos.push(p.no); g.pcs += num(it.qty); g.lbs += itemLbs(it); g.amount += itemAmount(it); g.given += given[`${p.id}|${it.key}`] || 0;
          }
        }
      }
      return Object.values(m).map((g) => ({ ...g, rate: g.lbs ? g.amount / g.lbs : 0, balance: g.pcs - g.given }));
    },
    cols: [
      T('Item', (r) => r.item, { strong: true }), T('Size', (r) => r.size), N('Pcs Wt (Gm)', (r) => r.pcsWt, 0, { total: false }),
      T('Exporter POs', (r) => uniq(r.nos).join(', '), { wrap: true }), N('Pcs', (r) => r.pcs, 0, { chip: 'net' }), N('Dozen', (r) => r.pcs / 12, 2),
      N('Lbs', (r) => r.lbs, 2, { chip: '' }), N('Avg Rate / Lbs', (r) => r.rate, 2, { total: false }), N('Amount', (r) => r.amount, 2, { chip: 'total' }),
      N('Given to Looms', (r) => r.given), N('Balance', (r) => r.balance, 0, { chip: 'base' }),
    ],
  },

  'yarn-requirement': {
    group: 'Yarn Reports', title: 'Yarn Requirement (Count-wise)', sub: 'Bags needed for Pile, Ground, Weft and Fancy (with shortage), bags received / issued against the PO, and balance',
    src: 'basis', basis: true,
    // PO-wise view: a separate box for every PO with its yarn lines
    groupView: 'yarn', groupLabels: ['PO-wise (boxes)', 'Count-wise'],
    groups: ({ basisPos, name, basis, epoOf, allYcs }) => basisPos.map((p) => {
      // bags received (Exporter PO) / issued (Loom PO) against this PO by yarn challans
      const done = challanDone(allYcs, basis === 'lpo' ? 'issue' : 'receive', p.id);
      const lines = (p.qualities || []).flatMap((q, qi) => qualityCalc(q).yarns.filter((y) => y.lbs).map((y) => {
        const need = wholeBags(y.bags);
        const got = done[slotKey(q.key, y.p)] || 0;
        return {
          key: `${q.key}|${y.p}`, qk: q.key, q: `Q${qi + 1}`, quality: qualityTitle(q), y: y.p, name: y.name, text: y.text || '—', pct: y.pct,
          shortage: totalShortage(q), lbs: y.lbs, need, got, balance: need - got,
        };
      }));
      const ep = basis === 'lpo' ? epoOf(p.exporterPoId) : null;
      return {
        po: { id: p.id, no: p.no, date: p.date, party: name(basis === 'lpo' ? p.loomId : p.exporterId), ref: p.refNo || '',
          epo: ep?.no || '', link: `${basis === 'lpo' ? '/towel/loom-po' : '/towel/po'}/${p.id}/edit` },
        verb: basis === 'lpo' ? 'Issued' : 'Received',
        // each quality: finish, packing and its items with size, weight, pcs and Lbs
        quals: Object.fromEntries((p.qualities || []).map((q) => [q.key, {
          finish: [q.finish, q.packing].filter(Boolean).join(' · '),
          items: (q.items || []).filter((it) => it.item || num(it.qty)).map((it) => ({
            item: it.item || 'Item', size: sizeText(it), wt: num(it.pcsWt), pcs: num(it.qty), lbs: itemLbs(it),
          })),
        }])),
        lines, lbs: lines.reduce((s, x) => s + x.lbs, 0), need: lines.reduce((s, x) => s + x.need, 0),
        got: lines.reduce((s, x) => s + x.got, 0), balance: lines.reduce((s, x) => s + x.balance, 0),
      };
    }),
    rows: ({ basisPos, basis, allYcs }) => {
      const m = {};
      for (const p of basisPos) {
        const done = challanDone(allYcs, basis === 'lpo' ? 'issue' : 'receive', p.id);
        for (const q of p.qualities || []) {
          for (const y of qualityCalc(q).yarns) {
            if (!y.lbs) continue;
            const k = y.text || '—';
            const g = (m[k] ||= { yarn: k, used: new Set(), nos: [], lbs: 0, need: 0, got: 0 });
            g.used.add(y.name); g.nos.push(p.no); g.lbs += y.lbs; g.need += wholeBags(y.bags); g.got += done[slotKey(q.key, y.p)] || 0;
          }
        }
      }
      return Object.values(m).map((g) => ({ ...g, balance: g.need - g.got }));
    },
    cols: [
      T('Yarn (Blend · Count · Spinning)', (r) => r.yarn, { strong: true }), T('Used as', (r) => YARNS.map(([, n]) => n).filter((n) => r.used.has(n)).join(', ')),
      T('PO No', (r) => uniq(r.nos).join(', '), { wrap: true }), N('Bags Needed', (r) => r.need, 0, { chip: '' }),
      N('Received / Issued', (r) => r.got, 0, { chip: 'net' }), N('Balance', (r) => r.balance, 0, { chip: 'base' }),
    ],
  },

  'yarn-po-wise': {
    group: 'Yarn Reports', title: 'Yarn Requirement (PO-wise)', sub: 'Each PO and quality: net Lbs and Pile / Ground / Weft / Fancy bags',
    src: 'basis', basis: true,
    rows: ({ basisPos, name, basis }) => basisPos.flatMap((p) => (p.qualities || []).map((q) => {
      const c = qualityCalc(q);
      const r = {
        _link: `${basis === 'lpo' ? '/towel/loom-po' : '/towel/po'}/${p.id}/edit`, no: p.no, date: p.date,
        party: name(basis === 'lpo' ? p.loomId : p.exporterId), quality: qualityTitle(q), pcs: c.pcs, lbs: c.lbs, shortage: totalShortage(q),
        netLbs: c.netLbs, netBags: c.netBags, cost: c.yarnCost,
      };
      for (const y of c.yarns) { r[y.p] = y.bags; r[y.p + 'Text'] = y.text; }
      return r;
    })),
    cols: [
      T('PO No', (r) => r.no, { strong: true }), T('Date', (r) => fmtDate(r.date), { sort: (r) => r.date }), T('Party', (r) => r.party),
      T('Quality', (r) => r.quality, { wrap: true }), N('Pcs', (r) => r.pcs), N('Lbs', (r) => r.lbs, 2), N('Shortage %', (r) => r.shortage, 2, { total: false }),
      N('Net Lbs', (r) => r.netLbs, 2, { chip: '' }),
      ...YARNS.map(([p, n]) => N(`${n} Bags`, (r) => r[p], 2, { chip: 'base' })),
      N('Total Bags', (r) => r.netBags, 2, { chip: 'net' }), N('Yarn Cost', (r) => r.cost, 2, { chip: 'total' }),
    ],
  },

  'yc-register': {
    group: 'Yarn Reports', title: 'Yarn Challan Register', sub: 'Every yarn receive / issue challan line: which yarn, for Pile / Ground / Weft / Fancy, bags',
    src: 'yc',
    // extra filters (dropdowns filled from the rows)
    picks: [
      { key: 'type', label: 'Receive + Issue', get: (r) => r.type },
      { key: 'yarn', label: 'All yarn counts', get: (r) => r.yarn },
      { key: 'brand', label: 'All brands', get: (r) => r.brand },
      { key: 'for', label: 'Pile / Ground / Weft / Fancy', get: (r) => r.for },
    ],
    rows: ({ ycs, name, epoOf, lpoOf }) => ycs.flatMap((c) => {
      const t = challanType(c);
      const po = t === 'issue' ? lpoOf(c.loomPoId) : epoOf(c.exporterPoId);
      const ep = t === 'issue' ? epoOf(po?.exporterPoId) : po;
      return (c.lines || []).map((l) => ({
        _link: `/towel/yarn-challan/${c.id}/edit`, no: c.no, date: c.date, type: t === 'issue' ? 'Issue' : 'Receive',
        po: po?.no || '', party: name(t === 'issue' ? po?.loomId : po?.exporterId), epo: ep?.no || '',
        quality: l.quality, for: yarnName(l.y), yarn: l.yarnText, brand: l.brand || '', bags: num(l.bags),
        recv: t === 'receive' ? num(l.bags) : 0, iss: t === 'issue' ? num(l.bags) : 0,
        vehicle: c.vehicleNo || '', godown: c.godown || '', paper: c.challanNo || '',
      }));
    }),
    cols: [
      T('Ref No', (r) => r.no, { strong: true }), T('Date', (r) => fmtDate(r.date), { sort: (r) => r.date }), T('Type', (r) => r.type),
      T('PO', (r) => r.po), T('Party', (r) => r.party), T('Exporter PO', (r) => r.epo), T('Quality', (r) => r.quality, { wrap: true }),
      T('For', (r) => r.for), T('Yarn', (r) => r.yarn), T('Brand', (r) => r.brand),
      N('Received Bags', (r) => r.recv, 0, { chip: 'net' }), N('Issued Bags', (r) => r.iss, 0, { chip: 'base' }),
      T('Vehicle', (r) => r.vehicle), T('Godown', (r) => r.godown), T('Paper No', (r) => r.paper),
    ],
  },

  'receive-balance': {
    group: 'Yarn Reports', title: 'Receive Balance (Exporter)', sub: 'Each Exporter PO yarn: bags needed, received from the exporter and balance',
    src: 'epo',
    rows: ({ epos, allYcs, name }) => epos.flatMap((p) => yarnBalance(p, 'receive', allYcs).slots.map((s) => ({
      _link: `/towel/yarn-challan?epo=${p.id}`, no: p.no, date: p.date, party: name(p.exporterId),
      quality: `Q${s.qi + 1} ${s.quality}`, for: s.name, yarn: s.text, need: s.need, done: s.done, balance: s.balance,
    }))),
    rowClass: (r) => (r.balance > 0 ? 'warn-row' : r.balance < 0 ? 'bad-row' : 'good-row'),
    cols: [
      T('Exporter PO', (r) => r.no, { strong: true }), T('Date', (r) => fmtDate(r.date), { sort: (r) => r.date }), T('Exporter', (r) => r.party),
      T('Quality', (r) => r.quality, { wrap: true }), T('For', (r) => r.for), T('Yarn', (r) => r.yarn),
      N('Bags Needed', (r) => r.need, 0, { chip: '' }), N('Received', (r) => r.done, 0, { chip: 'net' }), N('Balance', (r) => r.balance, 0, { chip: 'base' }),
    ],
  },

  'issue-balance': {
    group: 'Yarn Reports', title: 'Issue Balance (Loom)', sub: 'Each Loom PO yarn: bags required, issued to the loom and balance',
    src: 'lpo',
    rows: ({ lpos, allYcs, name, epoOf }) => lpos.flatMap((p) => yarnBalance(p, 'issue', allYcs).slots.map((s) => ({
      _link: `/towel/yarn-challan?lpo=${p.id}`, no: p.no, date: p.date, party: name(p.loomId), epo: epoOf(p.exporterPoId)?.no || '',
      quality: `Q${s.qi + 1} ${s.quality}`, for: s.name, yarn: s.text, need: s.need, done: s.done, balance: s.balance,
    }))),
    rowClass: (r) => (r.balance > 0 ? 'warn-row' : r.balance < 0 ? 'bad-row' : 'good-row'),
    cols: [
      T('Loom PO', (r) => r.no, { strong: true }), T('Date', (r) => fmtDate(r.date), { sort: (r) => r.date }), T('Loom', (r) => r.party),
      T('Exporter PO', (r) => r.epo), T('Quality', (r) => r.quality, { wrap: true }), T('For', (r) => r.for), T('Yarn', (r) => r.yarn),
      N('Bags Required', (r) => r.need, 0, { chip: '' }), N('Issued', (r) => r.done, 0, { chip: 'net' }), N('Balance', (r) => r.balance, 0, { chip: 'base' }),
    ],
  },

  'yarn-stock': {
    group: 'Yarn Reports', title: 'Yarn Stock (Godown / Count-wise)', sub: 'Bags received − bags issued = bags in the godown, for each yarn',
    src: 'yc',
    rows: ({ ycs }) => {
      const m = {};
      for (const c of ycs) {
        const t = challanType(c);
        for (const l of c.lines || []) {
          const k = `${c.godown || '—'}|${l.yarnText || '—'}`;
          const g = (m[k] ||= { godown: c.godown || '—', yarn: l.yarnText || '—', used: new Set(), recv: 0, iss: 0 });
          g.used.add(yarnName(l.y));
          if (t === 'issue') g.iss += num(l.bags); else g.recv += num(l.bags);
        }
      }
      return Object.values(m).map((g) => ({ ...g, stock: g.recv - g.iss }));
    },
    rowClass: (r) => (r.stock < 0 ? 'bad-row' : ''),
    cols: [
      T('Godown', (r) => r.godown, { strong: true }), T('Yarn (Blend · Count · Spinning)', (r) => r.yarn, { strong: true }),
      T('Used as', (r) => YARNS.map(([, n]) => n).filter((n) => r.used.has(n)).join(', ')),
      N('Received Bags', (r) => r.recv, 0, { chip: 'net' }), N('Issued Bags', (r) => r.iss, 0, { chip: 'base' }), N('Stock Bags', (r) => r.stock, 0, { chip: 'total' }),
    ],
  },

  margin: {
    group: 'Accounts', title: 'Margin / Profit', sub: 'Exporter amount − loom weaving amount − yarn cost (amounts without GST)',
    src: 'epo',
    rows: ({ epos, allLpos }) => epos.map((p) => {
      const t = poTotals(p);
      const mine = allLpos.filter((l) => l.exporterPoId === p.id && l.status !== 'cancelled');
      const loom = mine.reduce((s, l) => s + poTotals(l).amount, 0);
      const given = mine.reduce((s, l) => s + pcsOf(l), 0);
      const margin = t.amount - loom - t.yarnCost;
      return {
        _link: `/towel/po/${p.id}/edit`, no: p.no, date: p.date, party: '', exporterId: p.exporterId, pcs: t.pcs, given,
        exp: t.amount, loom, yarn: t.yarnCost, margin, pct: t.amount ? (margin / t.amount) * 100 : 0, lpos: mine.map((l) => l.no).join(', '),
      };
    }),
    rowClass: (r) => (r.margin < 0 ? 'bad-row' : ''),
    cols: [
      T('Exporter PO', (r) => r.no, { strong: true }), T('Date', (r) => fmtDate(r.date), { sort: (r) => r.date }), T('Exporter', (r) => r.party),
      N('Pcs', (r) => r.pcs), N('Given to Looms', (r) => r.given), T('Loom POs', (r) => r.lpos),
      N('Exporter Amount', (r) => r.exp, 2, { chip: 'total' }), N('Loom Weaving Amount', (r) => r.loom, 2, { chip: 'base' }),
      N('Yarn Cost', (r) => r.yarn, 2, { chip: 'gst' }), N('Margin', (r) => r.margin, 2, { chip: 'net' }), N('Margin %', (r) => r.pct, 2, { total: false }),
    ],
  },
};
export const REPORT_LIST = Object.entries(REPORTS).map(([key, r]) => ({ key, group: r.group, title: r.title, sub: r.sub }));

function csvDownload(name, head, body) {
  const lines = [head, ...body];
  const csv = lines.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// Exporter PO vs Loom PO, grouped: each Exporter PO, its Loom POs, then given / balance (like Al Hasan)
function GroupView({ groups, nav }) {
  const tot = groups.reduce((t, g) => ({ ordered: t.ordered + g.ep.ordered, given: t.given + g.given, balance: t.balance + g.balance,
    lbs: t.lbs + g.lbs, bags: t.bags + g.bags, amount: t.amount + g.amount }), { ordered: 0, given: 0, balance: 0, lbs: 0, bags: 0, amount: 0 });
  return (
    <div className="table-wrap">
      <table className="group-table rep-table">
        <thead>
          <tr>
            <th>Loom PO</th><th>Date</th><th>Loom</th><th>Items (Size · Weight: Pcs)</th>
            <th className="num">Pcs</th><th className="num">Lbs</th><th className="num">Rate / Lbs</th><th className="num">Weaving Amount</th>
            <th className="num">Net Bags</th><th>Balance</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.ep.id}>
            <tr className="grp-head">
              <td colSpan={10}>
                <b className="clickable-text" onClick={() => nav(`/towel/po/${g.ep.id}/edit`)}>{g.ep.no}</b> · {fmtDate(g.ep.date)} · <b>{g.ep.party}</b>
                {g.ep.ref && <span className="ref-chip"><small>Ref</small> {g.ep.ref}</span>}
                {g.ep.ordered > 0 && g.balance <= 0 && <span className="done-chip">✔ Order Completed</span>}
                <span className="grp-ordered">Ordered <b>{fmt(g.ep.ordered)}</b> Pcs</span>
              </td>
            </tr>
            {g.lines.map((l) => (
              <tr key={l.id} className="clickable" onClick={() => nav(`/towel/loom-po/${l.id}/edit`)} title="Open Loom PO">
                <td className="strong">{l.no}</td><td>{fmtDate(l.date)}</td><td>{l.loom}</td>
                <td className="wrap">{l.items.map((x, i) => <div key={i}>{x}</div>)}</td>
                <td className="num">{fmt(l.pcs)}</td><td className="num">{fmt(l.lbs, 2)}</td><td className="num">{fmt(l.rate, 2)}</td>
                <td className="num">{fmt(l.amount, 2)}</td><td className="num">{fmt(l.bags, 2)}</td><td></td>
              </tr>
            ))}
            {!g.lines.length && <tr><td colSpan={10} className="muted">No Loom PO yet against this Exporter PO</td></tr>}
            {g.items.length > 1 && g.items.map((x, i) => (
              <tr key={'i' + i} className="ch-line">
                <td colSpan={4}>↳ {x.label}</td>
                <td className="num">{fmt(x.given)}</td>
                <td colSpan={4} className="num">of {fmt(x.ordered)} · balance</td>
                <td className={x.balance > 0 ? '' : 'good'}><b>{fmt(x.balance)}</b> Pcs</td>
              </tr>
            ))}
            <tr className={`grp-foot ${g.balance > 0 ? 'warn-row' : g.balance < 0 ? 'bad-row' : 'good-row'}`}>
              <td colSpan={4}>
                {g.lines.length} Loom PO(s) · Given <b>{fmt(g.given)}</b> of {fmt(g.ep.ordered)} Pcs
                {g.ep.ordered > 0 && g.balance <= 0 && <b className="done-text"> · ✔ Completed: all pcs given to looms</b>}
              </td>
              <td className="num"><b>{fmt(g.given)}</b></td><td className="num"><b>{fmt(g.lbs, 2)}</b></td><td></td>
              <td className="num"><b>{fmt(g.amount, 2)}</b></td><td className="num"><b>{fmt(g.bags, 2)}</b></td>
              <td className="grp-bal">{g.balance < 0 ? 'Over ' : ''}<b>{fmt(Math.abs(g.balance))}</b> Pcs</td>
            </tr>
          </tbody>
        ))}
        {!groups.length && <tbody><tr><td colSpan={10} className="empty">Nothing to show for these filters.</td></tr></tbody>}
        {groups.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={4}>TOTAL · Ordered {fmt(tot.ordered)} · Given {fmt(tot.given)}</td>
              <td className="num">{fmt(tot.given)}</td><td className="num">{fmt(tot.lbs, 2)}</td><td></td>
              <td className="num">{fmt(tot.amount, 2)}</td><td className="num">{fmt(tot.bags, 2)}</td>
              <td className="grp-bal tot-bal"><b>{fmt(tot.balance)}</b> Pcs</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// Yarn Requirement, PO-wise: a separate box for every PO, its Pile / Ground / Weft / Fancy yarn lines and totals
function YarnGroupView({ groups, nav }) {
  const tot = groups.reduce((t, g) => ({ lbs: t.lbs + g.lbs, need: t.need + g.need, got: t.got + g.got, balance: t.balance + g.balance }), { lbs: 0, need: 0, got: 0, balance: 0 });
  const verb = groups[0]?.verb || 'Received';
  if (!groups.length) return <div className="table-wrap"><p className="empty">Nothing to show for these filters.</p></div>;
  return (
    <div className="po-boxes">
      {groups.map((g) => (
        <div key={g.po.id} className="po-box">
          <div className="po-box-head">
            <b className="clickable-text" onClick={() => nav(g.po.link)}>{g.po.no}</b>
            <span>{fmtDate(g.po.date)}</span>
            <b>{g.po.party}</b>
            {g.po.ref && <span className="ref-chip"><small>Ref</small> {g.po.ref}</span>}
            {g.po.epo && <span className="ref-chip"><small>Exporter PO</small> {g.po.epo}</span>}
            <span className="po-box-sum">Need <b>{fmt(g.need)}</b> · {g.verb} <b>{fmt(g.got)}</b> · Balance <b>{fmt(g.balance)}</b> Bags</span>
          </div>
          <table className="rep-table">
            <thead>
              <tr>
                <th>Quality · Items (Size · Weight · Pcs)</th><th>For</th><th>Yarn (Blend · Count · Spinning)</th><th className="num">%</th><th className="num">Shortage %</th>
                <th className="num">Bags Needed</th><th className="num">{g.verb} Bags</th><th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {g.lines.map((l, li) => (
                <tr key={l.key} className={li && g.lines[li - 1].qk !== l.qk ? 'q-start' : ''}>
                  {(li === 0 || g.lines[li - 1].qk !== l.qk) && (
                    <td className="wrap q-cell" rowSpan={g.lines.filter((x) => x.qk === l.qk).length}>
                      <div><b>{l.q}</b> {l.quality}</div>
                      {g.quals[l.qk]?.finish && <div className="muted q-finish">{g.quals[l.qk].finish}</div>}
                      {(g.quals[l.qk]?.items || []).map((it, i) => (
                        <div key={i} className="q-item">
                          <b>{it.item}</b>{it.size && <> · {it.size}</>}{it.wt ? <> · {fmt(it.wt)} Gm</> : null}
                          {' '}· <b>{fmt(it.pcs)}</b> Pcs · {fmt(it.lbs, 2)} Lbs
                        </div>
                      ))}
                    </td>
                  )}
                  <td><span className={`yarn-tag ${l.y}`}>{l.y === 'weft' ? 'Weft (Bobbin)' : l.name}</span></td>
                  <td className="strong">{l.text}</td>
                  <td className="num">{fmt(l.pct)}%</td>
                  <td className="num">{fmt(l.shortage, 2)}%</td>
                  <td className="num strong">{fmt(l.need)}</td>
                  <td className="num good">{fmt(l.got)}</td>
                  <td className={`num strong ${l.balance > 0 ? 'warn' : l.balance < 0 ? 'bad' : 'good'}`}>{fmt(l.balance)}</td>
                </tr>
              ))}
              {!g.lines.length && <tr><td colSpan={8} className="muted">No yarn % / weight on this PO</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>{g.po.no} TOTAL</td>
                <td className="num">{fmt(g.need)}</td><td className="num">{fmt(g.got)}</td><td className="num">{fmt(g.balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
      <div className="po-box grand">
        <span>GRAND TOTAL · {groups.length} PO(s)</span>
        <span>Need {fmt(tot.need)} Bags</span>
        <span>{verb} {fmt(tot.got)} Bags</span>
        <b>Balance {fmt(tot.balance)} Bags</b>
      </div>
    </div>
  );
}

export default function Reports() {
  const { type } = useParams();
  const nav = useNavigate();
  const R = REPORTS[type];
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fParty, setFParty] = useState('');
  const [fStatus, setFStatus] = useState('active');
  const [basis, setBasis] = useState('epo');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ i: -1, dir: 1 });
  const [flat, setFlat] = useState(false); // grouped reports: show the plain item-wise table instead
  const [picks, setPicks] = useState({}); // extra filters of a report (R.picks): { key: value }

  useEffect(() => {
    Promise.all([api.list('towel-pos'), api.list('loom-towel-pos'), api.list('parties'), api.list('yarn-challans')])
      .then(([epos, lpos, parties, ycs]) => setData({ epos, lpos, parties, ycs }))
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { setFParty(''); setSort({ i: -1, dir: 1 }); setQ(''); setFlat(false); setPicks({}); }, [type]);

  const src = R?.src === 'basis' ? basis : R?.src;
  const partyType = src === 'lpo' ? 'loom' : 'exporter';

  const view = useMemo(() => {
    if (!data || !R) return null;
    const pn = Object.fromEntries(data.parties.map((p) => [p.id, p.name]));
    const name = (id) => pn[id] || '—';
    const epoOf = (id) => data.epos.find((e) => e.id === id);
    const pass = (p, pf) => {
      if (fStatus === 'active' ? p.status === 'cancelled' : fStatus !== 'all' && p.status !== fStatus) return false;
      if (from && (p.date || '') < from) return false;
      if (to && (p.date || '') > to) return false;
      if (fParty && p[pf] !== fParty) return false;
      return true;
    };
    const lpoOf = (id) => data.lpos.find((e) => e.id === id);
    const epos = src === 'epo' ? data.epos.filter((p) => pass(p, 'exporterId')) : data.epos;
    const lpos = src === 'lpo' ? data.lpos.filter((p) => pass(p, 'loomId')) : data.lpos;
    // yarn challans: date filter, and party = exporter (receive) or loom (issue) of its PO
    const ycParty = (c) => (challanType(c) === 'issue' ? lpoOf(c.loomPoId)?.loomId : epoOf(c.exporterPoId)?.exporterId);
    const ycs = (data.ycs || []).filter((c) => (!from || (c.date || '') >= from) && (!to || (c.date || '') <= to) && (!fParty || ycParty(c) === fParty));
    const ctx = { epos, lpos, allLpos: data.lpos, ycs, allYcs: data.ycs || [], name, epoOf, lpoOf, basis, basisPos: (basis === 'lpo' ? lpos : epos).slice().sort(byNo) };
    let rows = R.rows(ctx).map((r) => (r.exporterId && !r.party ? { ...r, party: name(r.exporterId) } : r));
    // dropdown values of the extra filters, then apply them
    const pickOpts = Object.fromEntries((R.picks || []).map((f) => [f.key,
      uniq(rows.map((r) => String(f.get(r) || '').trim())).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))]));
    for (const f of R.picks || []) if (picks[f.key]) rows = rows.filter((r) => String(f.get(r) || '').trim() === picks[f.key]);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      rows = rows.filter((r) => R.cols.some((c) => String(c.get(r) ?? '').toLowerCase().includes(s)));
    }
    const c = R.cols[sort.i];
    if (c) {
      const key = c.sort || c.get;
      rows = rows.slice().sort((a, b) => {
        const x = key(a), y = key(b);
        return (c.num ? num(x) - num(y) : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })) * sort.dir;
      });
    }
    const parties = data.parties.filter((p) => src === 'yc' || p.type === partyType).sort((a, b) => a.name.localeCompare(b.name));
    let grp = R.groups ? R.groups(ctx) : null;
    if (grp && q.trim()) {
      const s = q.trim().toLowerCase();
      grp = grp.filter((g) => JSON.stringify(g).toLowerCase().includes(s));
    }
    return { rows, parties, grp, pickOpts };
  }, [data, R, src, from, to, fParty, fStatus, basis, q, sort, partyType, picks]);

  if (!R) return <Navigate to="/towel/reports/epo-register" replace />;

  const groups = uniq(REPORT_LIST.map((r) => r.group));
  const rows = view?.rows || [];
  const cell = (c, r) => {
    const v = c.get(r);
    if (c.num) return fmt(v, c.dec);
    return v ?? '';
  };
  const exportExcel = () => csvDownload(type, R.cols.map((c) => c.label), [
    ...rows.map((r) => R.cols.map((c) => (c.num ? Number(num(c.get(r)).toFixed(c.dec)) : c.get(r)))),
    R.cols.map((c, i) => (c.num && c.total ? Number(sumBy(rows, c.get).toFixed(c.dec)) : i === 0 ? 'TOTAL' : '')),
  ]);

  return (
    <div className="reports full">
      <section className="rep-main">
        <div className="page-head">
          <div>
            <h2 style={{ marginBottom: 2 }}>{R.title}</h2>
            <p className="muted" style={{ margin: 0 }}>{R.sub}</p>
          </div>
          <div className="row-actions big no-print">
            {/* choose another report (no left menu) */}
            <select className="rep-pick" value={type} onChange={(e) => nav(`/towel/reports/${e.target.value}`)}>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {REPORT_LIST.filter((r) => r.group === g).map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}
                </optgroup>
              ))}
            </select>
            <button className="btn-print" onClick={() => window.print()}>Print</button>
            <button className="btn-excel" onClick={exportExcel} disabled={!rows.length}>Excel</button>
          </div>
        </div>

        <div className="toolbar no-print">
          <input type="search" placeholder="Search in this report…" value={q} onChange={(e) => setQ(e.target.value)} />
          {R.basis && (
            <select value={basis} onChange={(e) => { setBasis(e.target.value); setFParty(''); }}>
              <option value="epo">Basis: Exporter Towel POs</option>
              <option value="lpo">Basis: Loom Towel POs</option>
            </select>
          )}
          <label>From <DateInput value={from} onChange={setFrom} /></label>
          <label>To <DateInput value={to} onChange={setTo} /></label>
          <select value={fParty} onChange={(e) => setFParty(e.target.value)}>
            <option value="">{src === 'yc' ? 'All parties' : `All ${partyType === 'loom' ? 'looms' : 'exporters'}`}</option>
            {(view?.parties || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {(R.picks || []).map((f) => (
            <select key={f.key} value={picks[f.key] || ''} onChange={(e) => setPicks({ ...picks, [f.key]: e.target.value })}>
              <option value="">{f.label}</option>
              {(view?.pickOpts?.[f.key] || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          ))}
          {src !== 'yc' && (
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              {STATUS_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          )}
          {(from || to || fParty || q || fStatus !== 'active' || Object.values(picks).some(Boolean)) && (
            <button onClick={() => { setFrom(''); setTo(''); setFParty(''); setQ(''); setFStatus('active'); setPicks({}); }}>Clear</button>
          )}
          {R.groups && (
            <div className="seg">
              <button className={!flat ? 'on' : ''} onClick={() => setFlat(false)}>{R.groupLabels?.[0] || 'PO-wise (Loom POs)'}</button>
              <button className={flat ? 'on' : ''} onClick={() => setFlat(true)}>{R.groupLabels?.[1] || 'Item-wise'}</button>
            </div>
          )}
        </div>

        {err && <div className="notice err">{err}</div>}
        {!data && !err && <p className="muted">Loading…</p>}

        {data && (
          <>
            <div className="stat-chips">
              <div className="chip"><small>Rows</small><b>{fmt(rows.length)}</b></div>
              {R.cols.filter((c) => c.chip != null).map((c) => (
                <div key={c.label} className={`chip ${c.chip}`}><small>{c.label}</small><b>{fmt(sumBy(rows, c.get), c.dec)}</b></div>
              ))}
            </div>
            <div className="print-only rep-print-head">
              <b>AL HASAN TOWEL — {R.title.toUpperCase()}</b>
              <span>{[from && `From ${fmtDate(from)}`, to && `To ${fmtDate(to)}`, fParty && view.parties.find((p) => p.id === fParty)?.name].filter(Boolean).join(' · ')}</span>
            </div>
            {view.grp && !flat ? (R.groupView === 'yarn' ? <YarnGroupView groups={view.grp} nav={nav} /> : <GroupView groups={view.grp} nav={nav} />) : (
            <div className="table-wrap">
              <table className="rep-table">
                <thead>
                  <tr>
                    <th>#</th>
                    {R.cols.map((c, i) => (
                      <th key={c.label} className={`sortable ${c.num ? 'num' : ''}`} onClick={() => setSort((s) => ({ i, dir: s.i === i ? -s.dir : c.num ? -1 : 1 }))}>
                        {c.label}{sort.i === i ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!rows.length && <tr><td colSpan={R.cols.length + 1} className="empty">Nothing to show for these filters.</td></tr>}
                  {rows.map((r, ri) => (
                    <tr key={ri} className={`${R.rowClass ? R.rowClass(r) : ''} ${r._link ? 'clickable' : ''}`} onClick={() => r._link && nav(r._link)}
                      title={r._link ? 'Open' : undefined}>
                      <td className="muted">{ri + 1}</td>
                      {R.cols.map((c) => (
                        <td key={c.label} className={[c.num && 'num', c.strong && 'strong', c.wrap && 'wrap'].filter(Boolean).join(' ')}>
                          {c.tag ? <span className={`tag ${c.get(r)}`}>{c.get(r)}</span> : cell(c, r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td></td>
                      {R.cols.map((c, i) => (
                        <td key={c.label} className={c.num ? 'num' : ''}>{c.num && c.total ? fmt(sumBy(rows, c.get), c.dec) : i === 0 ? 'TOTAL' : ''}</td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
