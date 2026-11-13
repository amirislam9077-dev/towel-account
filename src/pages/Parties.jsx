import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Notice from '../components/Notice.jsx';
import { showToast } from '../components/Toast.jsx';

const blank = { name: '', contact: '', phone: '', address: '', ntn: '', strn: '' };
const TYPE = 'exporter';

export default function Parties() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState(null);

  const load = () => api.list('parties', `?type=${TYPE}`).then(setRows).catch((e) => setMsg({ type: 'err', text: e.message }));
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    try {
      const body = { ...form, type: TYPE };
      if (editId) await api.update('parties', editId, body);
      else await api.create('parties', body);
      showToast({ title: editId ? 'Updated successfully' : 'Saved successfully', text: `Exporter "${form.name}" has been ${editId ? 'updated' : 'saved'}.` });
      setForm(blank);
      setEditId(null);
      load();
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    }
  }
  async function del(p) {
    if (!confirm(`Delete exporter "${p.name}"?`)) return;
    try {
      await api.remove('parties', p.id);
      load();
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    }
  }
  function edit(p) {
    setEditId(p.id);
    setForm({ ...blank, ...p });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const shown = rows
    .filter((r) => [r.name, r.contact, r.phone].join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <h2>Exporters</h2>
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <form className="card" onSubmit={save}>
        <div className="grid">
          <label>Exporter Name *<input value={form.name} onChange={set('name')} required autoFocus /></label>
          <label>Contact Person<input value={form.contact} onChange={set('contact')} /></label>
          <label>Phone<input value={form.phone} onChange={set('phone')} /></label>
          <label>NTN<input value={form.ntn} onChange={set('ntn')} /></label>
          <label>G.S.T. #<input value={form.strn} onChange={set('strn')} /></label>
          <label className="wide">Address<input value={form.address} onChange={set('address')} /></label>
        </div>
        <div className="actions">
          <button className="primary" type="submit">{editId ? 'Update' : '+ Add Exporter'}</button>
          {editId && <button type="button" onClick={() => { setEditId(null); setForm(blank); }}>Cancel</button>}
        </div>
      </form>

      <div className="toolbar">
        <input type="search" placeholder="Search exporters…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted">{shown.length} exporters</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Contact</th><th>Phone</th><th>NTN</th><th>G.S.T. #</th><th>Address</th><th></th></tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td className="strong">{p.name}</td>
                <td>{p.contact}</td>
                <td>{p.phone}</td>
                <td>{p.ntn}</td>
                <td>{p.strn}</td>
                <td>{p.address}</td>
                <td>
                  <div className="row-actions">
                    <button onClick={() => edit(p)}>Edit</button>
                    <button className="danger" onClick={() => del(p)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={7} className="empty">No exporters yet</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
