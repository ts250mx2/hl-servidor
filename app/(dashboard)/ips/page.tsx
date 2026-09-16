'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLoad } from '@/lib/hooks';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal';
import SearchBar, { SinCoincidencias } from '@/components/SearchBar';
import { coincideTexto } from '@/lib/buscar';
import { api, fmtDate } from '@/lib/client';

interface IpRow { IdIP: number; IP: string; Descripcion: string | null; Status: number; FechaAlta: string; }
interface Form { IP: string; Descripcion: string; Status: boolean; }

/** Se busca por IP, descripcion y estado. */
const coincide = (ip: IpRow, consulta: string) =>
  coincideTexto(consulta, [ip.IP, ip.Descripcion, ip.Status === 1 ? 'activa' : 'inactiva']);

const LOCAL_IPS = ['127.0.0.1', '::1'];

export default function IpsPage() {
  const [items, setItems] = useState<IpRow[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ id: number | null; form: Form } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const r = await api<IpRow[]>('/api/ips');
    if (r.success && r.data) setItems(r.data); else setError(r.error || 'No se pudieron cargar las IPs');
  }, []);

  useLoad(load);

  const openNew = () => { setFormError(''); setModal({ id: null, form: { IP: '', Descripcion: '', Status: true } }); };
  const openEdit = (ip: IpRow) => {
    setFormError('');
    setModal({ id: ip.IdIP, form: { IP: ip.IP, Descripcion: ip.Descripcion ?? '', Status: ip.Status === 1 } });
  };
  const setField = <K extends keyof Form>(key: K, value: Form[K]) =>
    setModal((m) => (m ? { ...m, form: { ...m.form, [key]: value } } : m));

  const visibles = useMemo(() => items.filter((ip) => coincide(ip, busqueda)), [items, busqueda]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    setSaving(true);
    setFormError('');
    const payload = { ...modal.form, Status: modal.form.Status ? 1 : 0 };
    const r = modal.id
      ? await api(`/api/ips/${modal.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await api('/api/ips', { method: 'POST', body: JSON.stringify(payload) });
    setSaving(false);
    if (r.success) { setModal(null); load(); } else setFormError(r.error || 'No se pudo guardar');
  };

  const remove = async (ip: IpRow) => {
    if (!confirm(`¿Eliminar la IP ${ip.IP}? Las apps en esa IP dejarán de poder consultar el webservice.`)) return;
    const r = await api(`/api/ips/${ip.IdIP}`, { method: 'DELETE' });
    if (r.success) load(); else alert(r.error || 'No se pudo eliminar');
  };

  const isRemote = modal && modal.form.IP && !LOCAL_IPS.includes(modal.form.IP.trim());

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title"><ShieldCheck size={26} /> IPs permitidas</h1>
          <p className="page-sub">Solo estas IPs pueden consultar el webservice. La IP se toma del socket real, no de cabeceras que el cliente pueda falsificar.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Agregar IP</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <SearchBar
        value={busqueda}
        onChange={setBusqueda}
        placeholder="IP, descripción o estado (activa, inactiva)"
        total={items.length}
        visibles={visibles.length}
        nombre={['IP', 'IPs']}
      />

      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>IP</th><th>Descripción</th><th>Alta</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="empty">No hay IPs registradas. El webservice rechazará todo.</td></tr>}
            {items.length > 0 && visibles.length === 0 && <SinCoincidencias consulta={busqueda} columnas={5} />}
            {visibles.map((ip) => (
              <tr key={ip.IdIP}>
                <td className="mono"><strong>{ip.IP}</strong></td>
                <td>{ip.Descripcion || '—'}</td>
                <td>{fmtDate(ip.FechaAlta)}</td>
                <td>{ip.Status === 1 ? <span className="badge badge-ok">Activa</span> : <span className="badge badge-off">Inactiva</span>}</td>
                <td>
                  <div className="td-actions">
                    <button className="btn-icon" onClick={() => openEdit(ip)} title="Editar"><Pencil size={17} /></button>
                    <button className="btn-icon" onClick={() => remove(ip)} title="Eliminar"><Trash2 size={17} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? 'Editar IP' : 'Agregar IP'} onClose={() => setModal(null)}>
          {formError && <div className="alert alert-error">{formError}</div>}
          {isRemote && (
            <div className="alert alert-warn">
              Esta IP no es local. El webservice entrega la llave en claro, así que para IPs externas conviene poner el portal detrás de HTTPS.
            </div>
          )}
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="form-group">
                <label>Dirección IP</label>
                <input value={modal.form.IP} onChange={(e) => setField('IP', e.target.value)} maxLength={45} placeholder="Ej: 201.172.236.128" required autoFocus />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <input value={modal.form.Descripcion} onChange={(e) => setField('Descripcion', e.target.value)} maxLength={100} placeholder="Ej: Servidor de facturación" />
              </div>
              <div className="form-group">
                <label>Estado</label>
                <label className="form-check">
                  <input type="checkbox" checked={modal.form.Status} onChange={(e) => setField('Status', e.target.checked)} />
                  Activa
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
