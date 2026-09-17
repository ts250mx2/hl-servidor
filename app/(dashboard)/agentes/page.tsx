'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLoad } from '@/lib/hooks';
import { Bot, Check, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal';
import SearchBar, { SinCoincidencias } from '@/components/SearchBar';
import SearchSelect from '@/components/SearchSelect';
import { ProviderBadge } from '@/components/ProviderMark';
import { coincideTexto } from '@/lib/buscar';
import { api, fmtDate } from '@/lib/client';
import { providerApi, providerLabel } from '@/lib/providers';

interface Agente {
  IdAgente: number;
  Uuid: string;
  Agente: string;
  IdLlave: number;
  IdLlaveRespaldo: number | null;
  Status: number;
  FechaModificacion: string;
  Llave: string;
  Proveedor: string;
  Modelo: string;
  LlaveStatus: number;
  FechaCaducidad: string | null;
  LlaveRespaldo: string | null;
  ProveedorRespaldo: string | null;
  ModeloRespaldo: string | null;
}

interface LlaveOpt { IdLlave: number; Llave: string; Proveedor: string; Modelo: string; Status: number; }
interface Form { Agente: string; IdLlave: number; IdLlaveRespaldo: number; Status: boolean; }

const COPIED_MS = 1800;

function UuidCell({ uuid, full = false }: { uuid: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(uuid);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setCopied(false);
    }
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
      <code title={uuid}>{full ? uuid : `${uuid.slice(0, 8)}…`}</code>
      <button type="button" className="btn-icon" onClick={copy} title="Copiar UUID completo">
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </span>
  );
}

/** Palabras por las que tambien se encuentra el estado de un agente. */
function textoEstado(a: Agente): string {
  if (a.Status !== 1) return 'inactivo';
  if (a.LlaveStatus !== 1) return 'llave inactiva';
  if (a.FechaCaducidad && new Date(a.FechaCaducidad).getTime() < Date.now()) return 'llave caducada';
  return 'activo';
}

/** Se busca por nombre, UUID, llave, proveedor, modelo y estado. */
const coincide = (a: Agente, consulta: string) =>
  coincideTexto(consulta, [a.Agente, a.Uuid, a.Llave, a.Proveedor, providerLabel(a.Proveedor), a.Modelo, a.LlaveRespaldo, a.ModeloRespaldo, textoEstado(a)]);

function estado(a: Agente) {
  if (a.Status !== 1) return <span className="badge badge-off">Inactivo</span>;
  if (a.LlaveStatus !== 1) return <span className="badge badge-warn">Llave inactiva</span>;
  if (a.FechaCaducidad && new Date(a.FechaCaducidad).getTime() < Date.now()) {
    return <span className="badge badge-danger">Llave caducada</span>;
  }
  return <span className="badge badge-ok">Activo</span>;
}

export default function AgentesPage() {
  const [items, setItems] = useState<Agente[]>([]);
  const [llaves, setLlaves] = useState<LlaveOpt[]>([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ id: number | null; uuid: string | null; form: Form } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const load = useCallback(async () => {
    const [a, l] = await Promise.all([api<Agente[]>('/api/agentes'), api<LlaveOpt[]>('/api/llaves')]);
    if (a.success && a.data) setItems(a.data); else setError(a.error || 'No se pudieron cargar los agentes');
    if (l.success && l.data) setLlaves(l.data);
  }, []);

  useLoad(load);

  const openNew = () => {
    setFormError('');
    setModal({ id: null, uuid: null, form: { Agente: '', IdLlave: 0, IdLlaveRespaldo: 0, Status: true } });
  };
  const openEdit = (a: Agente) => {
    setFormError('');
    setModal({ id: a.IdAgente, uuid: a.Uuid, form: { Agente: a.Agente, IdLlave: a.IdLlave, IdLlaveRespaldo: a.IdLlaveRespaldo ?? 0, Status: a.Status === 1 } });
  };
  const setField = <K extends keyof Form>(key: K, value: Form[K]) =>
    setModal((m) => (m ? { ...m, form: { ...m.form, [key]: value } } : m));

  const llaveOptions = llaves.map((l) => ({
    value: l.IdLlave,
    label: l.Llave + (l.Status !== 1 ? ' (inactiva)' : ''),
    sublabel: `${providerLabel(l.Proveedor)} · ${l.Modelo}`,
    keywords: `${l.Proveedor} ${l.Modelo}`,
  }));

  const visibles = useMemo(() => items.filter((a) => coincide(a, busqueda)), [items, busqueda]);

  /* El respaldo solo sirve por proxy si habla el mismo API que la principal; se avisa, no se impide. */
  const llaveDe = (id: number) => llaves.find((l) => l.IdLlave === id);
  const apiPrincipal = modal ? providerApi(llaveDe(modal.form.IdLlave)?.Proveedor ?? '') : null;
  const apiRespaldo = modal && modal.form.IdLlaveRespaldo ? providerApi(llaveDe(modal.form.IdLlaveRespaldo)?.Proveedor ?? '') : null;
  const respaldoDistintoApi = Boolean(apiPrincipal && apiRespaldo && apiPrincipal !== apiRespaldo);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    if (!modal.form.IdLlave) { setFormError('Selecciona la llave que ejecutará este agente'); return; }
    setSaving(true);
    setFormError('');
    const payload = { ...modal.form, IdLlaveRespaldo: modal.form.IdLlaveRespaldo || null, Status: modal.form.Status ? 1 : 0 };
    const r = modal.id
      ? await api(`/api/agentes/${modal.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await api('/api/agentes', { method: 'POST', body: JSON.stringify(payload) });
    setSaving(false);
    if (r.success) { setModal(null); load(); }
    else setFormError(r.error || 'No se pudo guardar');
  };

  const remove = async (a: Agente) => {
    if (!confirm(`¿Eliminar el agente "${a.Agente}"? Las apps que usen su UUID dejarán de recibir llave.`)) return;
    const r = await api(`/api/agentes/${a.IdAgente}`, { method: 'DELETE' });
    if (r.success) load();
    else alert(r.error || 'No se pudo eliminar');
  };

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Bot size={26} /> Agentes</h1>
          <p className="page-sub">Cada agente tiene un UUID y apunta a una llave. Tus apps piden el agente por UUID y reciben el proveedor, modelo y llave de esa llave.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew} disabled={llaves.length === 0}><Plus size={18} /> Nuevo agente</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {llaves.length === 0 && <div className="alert alert-warn">Primero registra al menos una llave de API para poder crear agentes.</div>}

      <SearchBar
        value={busqueda}
        onChange={setBusqueda}
        placeholder="Nombre, UUID, llave, proveedor, modelo o estado (activo, inactivo, llave caducada)"
        total={items.length}
        visibles={visibles.length}
        nombre={['agente', 'agentes']}
      />

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Agente</th><th>UUID</th><th>Llave</th><th>Proveedor / Modelo</th><th>Modificado</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={7} className="empty">No hay agentes. Crea el primero.</td></tr>}
            {items.length > 0 && visibles.length === 0 && <SinCoincidencias consulta={busqueda} columnas={7} />}
            {visibles.map((a) => (
              <tr key={a.IdAgente}>
                <td><strong>{a.Agente}</strong></td>
                <td><UuidCell uuid={a.Uuid} /></td>
                <td>
                  {a.Llave}
                  {a.LlaveRespaldo && <div className="respaldo-tag" title={`Si la principal falla, el proxy reintenta con ${a.LlaveRespaldo} (${a.ModeloRespaldo})`}>↻ respaldo: {a.LlaveRespaldo}</div>}
                </td>
                <td><span className="pbadge"><ProviderBadge id={a.Proveedor} short /><code style={{ color: 'var(--text-muted)' }}>{a.Modelo}</code></span></td>
                <td>{fmtDate(a.FechaModificacion)}</td>
                <td>{estado(a)}</td>
                <td>
                  <div className="td-actions">
                    <button className="btn-icon" onClick={() => openEdit(a)} title="Editar"><Pencil size={17} /></button>
                    <button className="btn-icon" onClick={() => remove(a)} title="Eliminar"><Trash2 size={17} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? 'Editar agente' : 'Nuevo agente'} onClose={() => setModal(null)}>
          {formError && <div className="alert alert-error">{formError}</div>}
          {modal.uuid ? (
            <div className="key-box" style={{ marginBottom: '1rem' }}>
              <span className="form-hint">UUID</span>
              <UuidCell uuid={modal.uuid} full />
            </div>
          ) : (
            <p className="form-hint" style={{ marginBottom: '1rem' }}>El UUID se genera automáticamente al guardar. Con él tus apps piden este agente en el webservice.</p>
          )}
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="form-group full">
                <label>Nombre del agente</label>
                <input value={modal.form.Agente} onChange={(e) => setField('Agente', e.target.value)} maxLength={45} placeholder="Ej: Asistente Tapi" required autoFocus />
              </div>
              <div className="form-group full">
                <label>Llave que ejecuta</label>
                <SearchSelect
                  options={llaveOptions}
                  value={modal.form.IdLlave}
                  onChange={(v) => setField('IdLlave', v)}
                  placeholder="Escribe nombre, proveedor o modelo para buscar"
                  emptyText="Ninguna llave coincide"
                />
                <span className="form-hint">Busca por nombre, proveedor o modelo. Para cambiar de modelo o de IA en las apps que usan este agente, basta con reasignar aquí la llave.</span>
              </div>
              <div className="form-group full">
                <label>Llave de respaldo (opcional)</label>
                <SearchSelect
                  options={llaveOptions.filter((o) => o.value !== modal.form.IdLlave)}
                  value={modal.form.IdLlaveRespaldo}
                  onChange={(v) => setField('IdLlaveRespaldo', v)}
                  placeholder="Sin respaldo. Escribe para elegir una llave"
                  emptyText="Ninguna llave coincide"
                />
                {respaldoDistintoApi ? (
                  <span className="form-hint" style={{ color: 'var(--warning)' }}>Esta llave habla otro API que la principal: por proxy no se puede reintentar con ella (la app ya mandó la llamada en el formato del otro SDK). Solo sirve a las apps en modo llave.</span>
                ) : (
                  <span className="form-hint">Si el proveedor rechaza la principal (sin saldo, llave revocada, saturado o caído), el proxy repite la llamada con esta llave antes de contestarle a la app. Conviene que sea de otra cuenta u otro proveedor con el mismo API.</span>
                )}
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
