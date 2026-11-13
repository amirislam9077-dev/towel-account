import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmt, fmtDate } from '../util.js';
import { challanType, challanBags, yarnName } from '../towelPo.js';


export default function YarnChallanPrint() {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api.get('yarn-challans', id), api.list('towel-pos'), api.list('loom-towel-pos'), api.list('parties')])
      .then(([ch, epos, lpos, parties]) => {
        const issue = challanType(ch) === 'issue';
        const po = (issue ? lpos.find((l) => l.id === ch.loomPoId) : epos.find((e) => e.id === ch.exporterPoId)) || {};
        const ep = issue ? epos.find((e) => e.id === po.exporterPoId) || {} : po;
        const party = parties.find((p) => p.id === (issue ? po.loomId : po.exporterId)) || {};
        const exporter = parties.find((p) => p.id === ep.exporterId) || {};
        setD({ ch, po, ep, party, exporter, issue });
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <div className="notice err">{err}</div>;
  if (!d) return <p className="muted">Loading…</p>;
  const { ch, po, ep, party, exporter, issue } = d;
  const BASE = issue ? '/towel/yarn-issue' : '/towel/yarn-receive';

  return (
    <>
      <div className="actions no-print" style={{ marginTop: 0, marginBottom: 14 }}>
        <button onClick={() => nav(BASE)}>Back</button>
        <button onClick={() => nav(`${BASE}/${id}/edit`)}>Edit</button>
        <button className="primary" onClick={() => window.print()}>Print</button>
      </div>

      <div className="print-doc fg-po">
        <h1>AL HASAN TOWEL</h1>
        <div className="doc-title">{issue ? 'YARN ISSUE CHALLAN (TO LOOM)' : 'YARN RECEIVE CHALLAN (FROM EXPORTER)'}</div>

        <table className="kv">
          <tbody>
            <tr><th>M/S:</th><td>{party.name}</td><th>CHALLAN REF NO:</th><td><b>{ch.no}</b></td></tr>
            <tr><th>ADDRESS:</th><td>{party.address}</td><th>DATE:</th><td>{fmtDate(ch.date)}</td></tr>
            <tr>
              <th>{issue ? 'LOOM TOWEL PO #:' : 'EXPORTER TOWEL PO #:'}</th><td>{po.no}</td>
              <th>{issue ? 'EXPORTER PO #:' : 'REF NO:'}</th><td>{issue ? `${ep.no || ''}${exporter.name ? ` · ${exporter.name}` : ''}` : ep.refNo}</td>
            </tr>
            <tr><th>VEHICLE NO:</th><td>{ch.vehicleNo}</td><th>DRIVER / PHONE:</th><td>{ch.driverPhone}</td></tr>
            <tr><th>{issue ? 'YARN ISSUED FROM:' : 'GODOWN:'}</th><td>{ch.godown}</td><th>CHALLAN NO:</th><td>{ch.challanNo}</td></tr>
            {issue && <tr><th>LOOM DELIVERY PLACE:</th><td colSpan={3}>{ch.deliveryPlace}</td></tr>}
          </tbody>
        </table>

        <table className="items">
          <thead>
            <tr>
              <th>SNO</th><th>QUALITY</th><th>FOR</th><th>YARN</th><th>BRAND</th>
              <th className="num">{issue ? 'ISSUE' : 'RECEIVE'} BAGS</th>
            </tr>
          </thead>
          <tbody>
            {(ch.lines || []).map((l, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{String(l.quality || '').toUpperCase()}</td>
                <td><b>{yarnName(l.y).toUpperCase()}</b></td>
                <td>{String(l.yarnText || '').toUpperCase()}</td>
                <td>{l.brand}</td>
                <td className="num">{fmt(l.bags)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={5}>TOTAL</td><td className="num">{fmt(challanBags(ch))} BAGS</td></tr>
          </tfoot>
        </table>
        {ch.remarks && <p><b>Remarks:</b> {ch.remarks}</p>}

        <div className="sign">
          <div>Prepared By</div>
          <div>Driver</div>
          <div>{issue ? 'Received By (Loom)' : 'Received By'}</div>
        </div>
      </div>
    </>
  );
}
