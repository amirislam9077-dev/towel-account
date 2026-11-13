import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmt, fmtDate, inWords, num } from '../util.js';
import { qualityTitle, construction, qualityCalc, poTotals, lbsPerDozen, itemLbs, itemAmount, rateUnitShort, sizeText, YARNS, yarnText } from '../towelPo.js';

const BASE = '/towel/po';

// Printed like the exporter's "Weaving Program — Sale and Purchase" sheet
export default function TowelPoPrint() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api.get('towel-pos', id), api.list('parties')])
      .then(([po, parties]) => setData({ po, party: parties.find((p) => p.id === po.exporterId) || {} }))
      .catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <div className="notice err">{err}</div>;
  if (!data) return <p className="muted">Loading…</p>;
  const { po, party } = data;
  const t = poTotals(po);

  return (
    <>
      <div className="actions no-print" style={{ marginTop: 0, marginBottom: 14 }}>
        <button onClick={() => nav(BASE)}>Back</button>
        <button onClick={() => nav(`${BASE}/${id}/edit`)}>Edit</button>
        <button className="primary" onClick={() => window.print()}>Print</button>
      </div>

      <div className="print-doc towel-print">
        <h1>AL HASAN TOWEL</h1>
        <div className="doc-title">WEAVING PROGRAM — SALE AND PURCHASE</div>

        <table className="kv">
          <tbody>
            <tr><th>P.O. #:</th><td>{po.no}</td><th>ORDER DATE:</th><td>{fmtDate(po.date)}</td></tr>
            <tr><th>REF NO:</th><td>{po.refNo}</td><th>REV ORDER DATE:</th><td>{fmtDate(po.revDate)}</td></tr>
            <tr><th>M/S:</th><td>{party.name}</td><th>DELIVERY DATE:</th><td>{fmtDate(po.deliveryDate)}</td></tr>
            <tr><th>G.S.T. # / NTN #:</th><td>{[party.strn, party.ntn].filter(Boolean).join(' / ')}</td><td colSpan={2}></td></tr>
          </tbody>
        </table>

        {(po.qualities || []).map((qa, qi) => {
          const c = qualityCalc(qa);
          return (
            <div key={qa.key || qi} className="tp-quality">
              {qa.finish && <div className="tp-finish">{qa.finish.toUpperCase()}</div>}
              <div className="tp-qtitle">{qualityTitle(qa).toUpperCase()}{qa.packing ? ` ( ${qa.packing.toUpperCase()} )` : ''}</div>
              <table className="items">
                <thead>
                  <tr>
                    <th>S.NO</th><th>ITEM</th><th className="num">PCS WT (GM)</th><th>SIZE</th><th className="num">LBS / DZ</th>
                    <th className="num">QTY (PCS)</th><th className="num">RATE</th><th className="num">T LBS</th><th className="num">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {(qa.items || []).map((it, ii) => (
                    <tr key={it.key || ii}>
                      <td>{ii + 1}</td>
                      <td>{String(it.item || '').toUpperCase()}</td>
                      <td className="num">{fmt(it.pcsWt)}</td>
                      <td>{sizeText(it)}</td>
                      <td className="num">{fmt(lbsPerDozen(it), 2)}</td>
                      <td className="num">{fmt(it.qty)} PCS</td>
                      <td className="num">{fmt(it.rate, 2)} <small>{rateUnitShort(it.rateUnit).toUpperCase()}</small></td>
                      <td className="num">{fmt(itemLbs(it), 2)}</td>
                      <td className="num">{fmt(itemAmount(it), 2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>TOTAL</td>
                    <td className="num">{fmt(c.pcs)} PCS</td>
                    <td></td>
                    <td className="num">{fmt(c.lbs, 2)} LBS</td>
                    <td className="num">{fmt(c.amount, 2)}</td>
                  </tr>
                </tfoot>
              </table>
              <table className="kv tp-yarn">
                <tbody>
                  <tr><th>CONSTRUCTION:</th><td colSpan={5}>{construction(qa)}</td></tr>
                  {YARNS.filter(([y]) => yarnText(qa, y) || num(qa[y + 'Pct'])).map(([y, name]) => (
                    <tr key={y}>
                      <th>{name.toUpperCase()}:</th>
                      <td colSpan={5}>{yarnText(qa, y)}{num(qa[y + 'Pct']) ? ` (${num(qa[y + 'Pct'])}%)` : ''} — <b>{fmt(c.yarns.find((x) => x.p === y).bags, 2)} BAGS</b></td>
                    </tr>
                  ))}
                  <tr><th>SHORTAGE:</th><td>{fmt(c.shortage, 2)} %</td><th>NET LBS:</th><td>{fmt(c.netLbs, 2)}</td><th>NET BAGS:</th><td><b>{fmt(c.netBags, 2)}</b></td></tr>
                </tbody>
              </table>
            </div>
          );
        })}

        <p>
          <b>Total Qty:</b> {fmt(t.pcs)} Pcs &nbsp; · &nbsp; <b>Total Lbs:</b> {fmt(t.lbs, 2)} &nbsp; · &nbsp; <b>Amount (excl. GST):</b> {fmt(t.amount, 2)}
          {po.gstType === 'with' && <> &nbsp; · &nbsp; <b>GST {num(po.gstPct)}%:</b> {fmt(t.gst, 2)}</>}
          &nbsp; · &nbsp; <b>Total:</b> {fmt(t.total, 2)}
        </p>
        <p><b>In words:</b> {inWords(t.total)}</p>
        {po.remarks && <div className="remarks"><b>REMARKS:</b><div style={{ whiteSpace: 'pre-wrap' }}>{po.remarks}</div></div>}

        <div className="sign four">
          <div>Prepared By</div>
          <div>Checked By</div>
          <div>Sanctioning Authority</div>
          <div>Received By</div>
        </div>
      </div>
    </>
  );
}
