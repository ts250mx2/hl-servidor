'use client';

import { useCallback, useState } from 'react';
import { useLoad } from '@/lib/hooks';
import { Copy, KeyRound, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal';
import { api, fmtDate } from '@/lib/client';

interface KeyRow {
  IdKey: number;
  Nombre: string;
  KeyPrefijo: string;
  Status: number;
  UltimoUso: string | null;
  FechaAlta: string;
}

interface Form { Nombre: string; Status: boolean; }

const WS_URL = 'http://localhost:3056/api/ws/llave';
const COPIED_MS = 2000;

export default function KeysPage() {
  const [items, setItems] = useState<KeyRow[]>([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ id: number | null; form: Form } | null>(null);
  const [revealed, setRevealed] = useState<{ nombre: string; key: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await api<KeyRow[]>('/api/keys');
    if (r.success && r.data) setItems(r.data); else setError(r.error || 'No se pudieron cargar las keys');
  }, []);

  useLoad(load);

  const openNew = () => { setFormError(''); setModal({ id: null, form: { Nombre: '', Status: true } }); };
  const openEdit = (k: KeyRow) => {
    setFormError('');
    setModal({ id: k.IdKey, form: { Nombre: k.Nombre, Status: k.Status === 1 } });
  };
  const setField = <K extends keyof Form>(key: K, value: Form[K]) =>
    setModal((m) => (m ? { ...m, form: { ...m.form, [key]: value } } : m));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    setSaving(true);
    setFormError('');
    const payload = { ...modal.form, Status: modal.form.Status ? 1 : 0 };
    const r = modal.id
      ? await api<{ Key: string | null }>(`/api/keys/${modal.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await api<{ Key: string }>('/api/keys', { method: 'POST', body: JSON.stringify(payload) });
    setSaving(false);
    if (!r.success) { setFormError(r.error || 'No se pudo guardar'); return; }
    setModal(null);
    if (r.data?.Key) setRevealed({ nombre: modal.form.Nombre, key: r.data.Key });
    load();
  };

  const regenerate = async (k: KeyRow) => {
    if (!confirm(`¿Regenerar la key de "${k.Nombre}"? La key anterior dejará de funcionar de inmediato.`)) return;
    const r = await api<{ Key: string }>(`/api/keys/${k.IdKey}`, {
      method: 'PUT',
      body: JSON.stringify({ Nombre: k.Nombre, Status: k.Status, Regenerar: true }),
    });
    if (r.success && r.data?.Key) { setRevealed({ nombre: k.Nombre, key: r.data.Key }); load(); }
    else alert(r.error || 'No se pudo regenerar');
  };

  const remove = async (k: KeyRow) => {
    if (!confirm(`¿Eliminar la key de "${k.Nombre}"? Esa app dejará de poder consultar el webservice.`)) return;
    const r = await api(`/api/keys/${k.IdKey}`, { method: 'DELETE' });
    if (r.success) load(); else alert(r.error || 'No se pudo eliminar');
  };

  const copy = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.key);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title"><KeyRound size={26} /> Keys de acceso</h1>
          <p className="page-sub">Credencial de cada aplicación. La app manda su key en el header <code>X-HL-Key</code> junto con el UUID del agente que quiere usar.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Nueva key</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Aplicación</th><th>Key</th><th>Alta</th><th>Último uso</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} className="empty">No hay keys registradas.</td></tr>}
            {items.map((k) => (
              <tr key={k.IdKey}>
                <td><strong>{k.Nombre}</strong></td>
                <td className="mono">{k.KeyPrefijo}…</td>
                <td>{fmtDate(k.FechaAlta)}</td>
                <td>{fmtDate(k.UltimoUso)}</td>
                <td>{k.Status === 1 ? <span className="badge badge-ok">Activa</span> : <span className="badge badge-off">Inactiva</span>}</td>
                <td>
                  <div className="td-actions">
                    <button className="btn-icon" onClick={() => regenerate(k)} title="Regenerar key"><RefreshCw size={17} /></button>
                    <button className="btn-icon" onClick={() => openEdit(k)} title="Editar"><Pencil size={17} /></button>
                    <button className="btn-icon" onClick={() => remove(k)} title="Eliminar"><Trash2 size={17} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? 'Editar key' : 'Nueva key'} onClose={() => setModal(null)}>
          {formError && <div className="alert alert-error">{formError}</div>}
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="form-group full">
                <label>Nombre de la aplicación</label>
                <input value={modal.form.Nombre} onChange={(e) => setField('Nombre', e.target.value)} maxLength={80} placeholder="Ej: Tapioki POS" required autoFocus />
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
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : modal.id ? 'Guardar' : 'Generar key'}</button>
            </div>
          </form>
        </Modal>
      )}

      {revealed && (
        <Modal title={`Key para "${revealed.nombre}"`} onClose={() => setRevealed(null)}>
          <div className="alert alert-warn">Copia esta key ahora. Por seguridad no se vuelve a mostrar: en la base solo queda su hash.</div>
          <div className="key-box">
            <code>{revealed.key}</code>
            <button className="btn btn-ghost" onClick={copy}><Copy size={16} /> {copied ? 'Copiada' : 'Copiar'}</button>
          </div>
          <p className="form-hint" style={{ marginTop: '1rem' }}>
            En el .env de tu app: <code>HL_KEY={revealed.key}</code> y <code>HL_URL={WS_URL}</code>.
            Después, en cada llamada manda el UUID del agente: <code>GET {WS_URL}/&lt;uuid&gt;</code>.
          </p>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={() => setRevealed(null)}>Listo</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
