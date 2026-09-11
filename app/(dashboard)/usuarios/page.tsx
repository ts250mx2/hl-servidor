'use client';

import { useCallback, useState } from 'react';
import { useLoad } from '@/lib/hooks';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import Modal from '@/components/Modal';
import { api, fmtDate } from '@/lib/client';

interface UserRow { IdUsuario: number; Usuario: string; Login: string; Status: number; FechaAlta: string; }
interface Form { Usuario: string; Login: string; Password: string; Status: boolean; }

export default function UsuariosPage() {
  const [items, setItems] = useState<UserRow[]>([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ id: number | null; form: Form } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const r = await api<UserRow[]>('/api/usuarios');
    if (r.success && r.data) setItems(r.data); else setError(r.error || 'No se pudieron cargar los usuarios');
  }, []);

  useLoad(load);

  const openNew = () => { setFormError(''); setModal({ id: null, form: { Usuario: '', Login: '', Password: '', Status: true } }); };
  const openEdit = (u: UserRow) => {
    setFormError('');
    setModal({ id: u.IdUsuario, form: { Usuario: u.Usuario, Login: u.Login, Password: '', Status: u.Status === 1 } });
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
      ? await api(`/api/usuarios/${modal.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await api('/api/usuarios', { method: 'POST', body: JSON.stringify(payload) });
    setSaving(false);
    if (r.success) { setModal(null); load(); } else setFormError(r.error || 'No se pudo guardar');
  };

  const remove = async (u: UserRow) => {
    if (!confirm(`¿Eliminar al usuario "${u.Usuario}"?`)) return;
    const r = await api(`/api/usuarios/${u.IdUsuario}`, { method: 'DELETE' });
    if (r.success) load(); else alert(r.error || 'No se pudo eliminar');
  };

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Users size={26} /> Usuarios del portal</h1>
          <p className="page-sub">Quién puede entrar a este portal. Las contraseñas se guardan con bcrypt.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Nuevo usuario</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Nombre</th><th>Login</th><th>Alta</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.IdUsuario}>
                <td><strong>{u.Usuario}</strong></td>
                <td className="mono">{u.Login}</td>
                <td>{fmtDate(u.FechaAlta)}</td>
                <td>{u.Status === 1 ? <span className="badge badge-ok">Activo</span> : <span className="badge badge-off">Inactivo</span>}</td>
                <td>
                  <div className="td-actions">
                    <button className="btn-icon" onClick={() => openEdit(u)} title="Editar"><Pencil size={17} /></button>
                    <button className="btn-icon" onClick={() => remove(u)} title="Eliminar"><Trash2 size={17} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? 'Editar usuario' : 'Nuevo usuario'} onClose={() => setModal(null)}>
          {formError && <div className="alert alert-error">{formError}</div>}
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="form-group">
                <label>Nombre</label>
                <input value={modal.form.Usuario} onChange={(e) => setField('Usuario', e.target.value)} maxLength={80} required autoFocus />
              </div>
              <div className="form-group">
                <label>Login</label>
                <input value={modal.form.Login} onChange={(e) => setField('Login', e.target.value)} maxLength={45} autoComplete="off" required />
              </div>
              <div className="form-group full">
                <label>Contraseña {modal.id && '(vacía = no cambiar)'}</label>
                <input type="password" value={modal.form.Password} onChange={(e) => setField('Password', e.target.value)} autoComplete="new-password" minLength={8} required={!modal.id} />
              </div>
              <div className="form-group">
                <label>Estado</label>
                <label className="form-check">
                  <input type="checkbox" checked={modal.form.Status} onChange={(e) => setField('Status', e.target.checked)} />
                  Activo
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
