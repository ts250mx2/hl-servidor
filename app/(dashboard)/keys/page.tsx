'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLoad } from '@/lib/hooks';
import { Copy, KeyRound, Pencil, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal';
import SearchBar, { SinCoincidencias } from '@/components/SearchBar';
import { coincideTexto } from '@/lib/buscar';
import { api, fmtDate } from '@/lib/client';

interface KeyRow {
  IdKey: number;
  Nombre: string;
  KeyPrefijo: string;
  Status: number;
  UltimoUso: string | null;
  FechaAlta: string;
  TieneSecreto: number;
  /** Agentes que puede usar; vacio = todos (sin restriccion). */
  Agentes: { IdAgente: number; Agente: string }[];
}

/** Key y secreto se muestran una sola vez, juntos. */
interface Revelado { nombre: string; key: string; secreto: string | null; }
type Credencial = 'key' | 'secreto';


interface Form { Nombre: string; Status: boolean; Agentes: number[]; }
interface AgenteOpt { IdAgente: number; Agente: string; Status: number }

/** Se busca por aplicacion, prefijo de la key, cifrado y estado. */
const coincide = (k: KeyRow, consulta: string) =>
  coincideTexto(consulta, [k.Nombre, k.KeyPrefijo, k.TieneSecreto ? 'con secreto' : 'sin secreto', k.Status === 1 ? 'activa' : 'inactiva', k.Agentes.length ? k.Agentes.map((a) => a.Agente).join(' ') : 'todos sin restriccion']);

const WS_URL = 'http://localhost:3056';
const COPIED_MS = 2000;

export default function KeysPage() {
  const [items, setItems] = useState<KeyRow[]>([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ id: number | null; form: Form } | null>(null);
  const [revealed, setRevealed] = useState<Revelado | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState<Credencial | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [agentes, setAgentes] = useState<AgenteOpt[]>([]);
  const [filtroAgentes, setFiltroAgentes] = useState('');

  const load = useCallback(async () => {
    const [r, a] = await Promise.all([api<KeyRow[]>('/api/keys'), api<AgenteOpt[]>('/api/agentes')]);
    if (r.success && r.data) setItems(r.data); else setError(r.error || 'No se pudieron cargar las keys');
    if (a.success && a.data) setAgentes(a.data);
  }, []);

  useLoad(load);

  const openNew = () => { setFormError(''); setFiltroAgentes(''); setModal({ id: null, form: { Nombre: '', Status: true, Agentes: [] } }); };
  const openEdit = (k: KeyRow) => {
    setFormError('');
    setFiltroAgentes('');
    setModal({ id: k.IdKey, form: { Nombre: k.Nombre, Status: k.Status === 1, Agentes: k.Agentes.map((a) => a.IdAgente) } });
  };
  const toggleAgente = (id: number) =>
    setModal((m) => (m ? { ...m, form: { ...m.form, Agentes: m.form.Agentes.includes(id) ? m.form.Agentes.filter((x) => x !== id) : [...m.form.Agentes, id] } } : m));
  const setField = <K extends keyof Form>(key: K, value: Form[K]) =>
    setModal((m) => (m ? { ...m, form: { ...m.form, [key]: value } } : m));

  const visibles = useMemo(() => items.filter((k) => coincide(k, busqueda)), [items, busqueda]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    setSaving(true);
    setFormError('');
    const payload = { ...modal.form, Status: modal.form.Status ? 1 : 0 };
    const r = modal.id
      ? await api<{ Key: string | null; Secreto: string | null }>(`/api/keys/${modal.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await api<{ Key: string; Secreto: string }>('/api/keys', { method: 'POST', body: JSON.stringify(payload) });
    setSaving(false);
    if (!r.success) { setFormError(r.error || 'No se pudo guardar'); return; }
    setModal(null);
    if (r.data?.Key) setRevealed({ nombre: modal.form.Nombre, key: r.data.Key, secreto: r.data.Secreto });
    load();
  };

  const regenerate = async (k: KeyRow) => {
    if (!confirm(`¿Regenerar la key y el secreto de "${k.Nombre}"? Los anteriores dejarán de funcionar de inmediato.`)) return;
    const r = await api<{ Key: string; Secreto: string }>(`/api/keys/${k.IdKey}`, {
      method: 'PUT',
      body: JSON.stringify({ Nombre: k.Nombre, Status: k.Status, Agentes: k.Agentes.map((a) => a.IdAgente), Regenerar: true }),
    });
    if (r.success && r.data?.Key) { setRevealed({ nombre: k.Nombre, key: r.data.Key, secreto: r.data.Secreto }); load(); }
    else alert(r.error || 'No se pudo regenerar');
  };

  const remove = async (k: KeyRow) => {
    if (!confirm(`¿Eliminar la key de "${k.Nombre}"? Esa app dejará de poder consultar el webservice.`)) return;
    const r = await api(`/api/keys/${k.IdKey}`, { method: 'DELETE' });
    if (r.success) load(); else alert(r.error || 'No se pudo eliminar');
  };

  const copy = async (cual: Credencial) => {
    if (!revealed) return;
    const valor = cual === 'key' ? revealed.key : revealed.secreto;
    if (!valor) return;
    try {
      await navigator.clipboard.writeText(valor);
      setCopied(cual);
      setTimeout(() => setCopied(null), COPIED_MS);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title"><KeyRound size={26} /> Keys de acceso</h1>
          <p className="page-sub">Credencial de cada aplicación. La app manda su key en el header <code>X-HL-Key</code> junto con el UUID del agente. Con el secreto descifra la llave que recibe.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Nueva key</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <SearchBar
        value={busqueda}
        onChange={setBusqueda}
        placeholder="Aplicación, inicio de la key, cifrado (con secreto, sin secreto) o estado"
        total={items.length}
        visibles={visibles.length}
        nombre={['key', 'keys']}
      />

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Aplicación</th><th>Key</th><th>Agentes permitidos</th><th>Cifrado</th><th>Alta</th><th>Último uso</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={8} className="empty">No hay keys registradas.</td></tr>}
            {items.length > 0 && visibles.length === 0 && <SinCoincidencias consulta={busqueda} columnas={8} />}
            {visibles.map((k) => (
              <tr key={k.IdKey}>
                <td><strong>{k.Nombre}</strong></td>
                <td className="mono">{k.KeyPrefijo}…</td>
                <td>
                  {k.Agentes.length === 0
                    ? <span className="badge badge-warn" title="Puede pedir cualquier agente. Restringela a los que use esta app."><ShieldAlert size={12} /> Todos</span>
                    : <span className="chip-list">{k.Agentes.map((a) => <span key={a.IdAgente} className="chip">{a.Agente}</span>)}</span>}
                </td>
                <td>
                  {k.TieneSecreto
                    ? <span className="badge badge-ok">Con secreto</span>
                    : <span className="badge badge-warn" title="La llave viaja en claro. Regenera la key para obtener un secreto."><ShieldAlert size={12} /> Sin secreto</span>}
                </td>
                <td>{fmtDate(k.FechaAlta)}</td>
                <td>{fmtDate(k.UltimoUso)}</td>
                <td>{k.Status === 1 ? <span className="badge badge-ok">Activa</span> : <span className="badge badge-off">Inactiva</span>}</td>
                <td>
                  <div className="td-actions">
                    <button className="btn-icon" onClick={() => regenerate(k)} title="Regenerar key y secreto"><RefreshCw size={17} /></button>
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
              <div className="form-group full">
                <label>Agentes permitidos</label>
                <div className="search-box" style={{ marginBottom: '0.4rem' }}>
                  <input value={filtroAgentes} onChange={(e) => setFiltroAgentes(e.target.value)} placeholder="Filtrar agentes" autoComplete="off" />
                </div>
                <div className="check-list">
                  {agentes.filter((a) => coincideTexto(filtroAgentes, [a.Agente])).map((a) => (
                    <label key={a.IdAgente} className={`check-item ${modal.form.Agentes.includes(a.IdAgente) ? 'active' : ''}`}>
                      <input type="checkbox" checked={modal.form.Agentes.includes(a.IdAgente)} onChange={() => toggleAgente(a.IdAgente)} />
                      <span>{a.Agente}</span>
                      {a.Status !== 1 && <span className="badge badge-off">inactivo</span>}
                    </label>
                  ))}
                  {agentes.length === 0 && <span className="form-hint">Aún no hay agentes.</span>}
                </div>
                <span className="form-hint" style={modal.form.Agentes.length === 0 ? { color: 'var(--warning)' } : undefined}>
                  {modal.form.Agentes.length === 0
                    ? 'Sin selección la key puede usar cualquier agente. Si se filtra, expone todas las llaves: marca solo los que use esta aplicación.'
                    : `Esta key solo podrá pedir ${modal.form.Agentes.length} agente(s); cualquier otro se rechaza con AGENTE_NO_PERMITIDO.`}
                </span>
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
        <Modal title={`Credenciales para "${revealed.nombre}"`} onClose={() => setRevealed(null)}>
          <div className="alert alert-warn">Copia estos valores ahora. Por seguridad no se vuelven a mostrar: de la key queda solo su hash y el secreto queda cifrado.</div>
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label>Key de acceso (header X-HL-Key)</label>
            <div className="key-box">
              <code>{revealed.key}</code>
              <button className="btn btn-ghost" onClick={() => copy('key')}><Copy size={16} /> {copied === 'key' ? 'Copiada' : 'Copiar'}</button>
            </div>
          </div>
          {revealed.secreto && (
            <div className="form-group">
              <label>Secreto compartido (descifra la llave de API, nunca viaja)</label>
              <div className="key-box">
                <code>{revealed.secreto}</code>
                <button className="btn btn-ghost" onClick={() => copy('secreto')}><Copy size={16} /> {copied === 'secreto' ? 'Copiado' : 'Copiar'}</button>
              </div>
            </div>
          )}
          <p className="form-hint" style={{ marginTop: '1rem' }}>
            En el .env de tu app: <code>HL_URL={WS_URL}</code>, <code>HL_KEY=…</code>, <code>HL_SECRET=…</code> y <code>HL_AGENTE=&lt;uuid&gt;</code>.
            El módulo <code>hl-cliente.ts</code> descifra la llave solo.
          </p>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={() => setRevealed(null)}>Listo</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
