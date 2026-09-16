'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLoad } from '@/lib/hooks';
import { KeySquare, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import Modal from '@/components/Modal';
import ProviderPicker from '@/components/ProviderPicker';
import { ProviderBadge } from '@/components/ProviderMark';
import { api, fmtDate, toInputDate } from '@/lib/client';
import { MODEL_SUGGESTIONS, PROVIDERS, providerLabel, type ProviderId } from '@/lib/providers';

/** Sugerencias de modelo solo del proveedor elegido; "otro" no tiene. */
const suggestionsFor = (provider: ProviderId) => MODEL_SUGGESTIONS.filter((g) => g.provider === provider);

interface Llave {
  IdLlave: number;
  Llave: string;
  Proveedor: string;
  Modelo: string;
  LlaveMascara: string;
  FechaCaducidad: string | null;
  Status: number;
  TotalAgentes: number;
  FechaModificacion: string;
}

interface Form {
  Llave: string;
  Proveedor: ProviderId;
  Modelo: string;
  Secreto: string;
  FechaCaducidad: string;
  Status: boolean;
}

const EMPTY: Form = { Llave: '', Proveedor: 'claude', Modelo: '', Secreto: '', FechaCaducidad: '', Status: true };

const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Palabra por la que tambien se encuentra cada estado, para poder escribir "caducada" o "inactiva". */
function textoEstado(l: Llave): string {
  if (l.Status !== 1) return 'inactiva';
  if (l.FechaCaducidad && new Date(l.FechaCaducidad).getTime() < Date.now()) return 'caducada';
  return 'activa';
}

/** Busqueda incremental: todas las palabras escritas deben aparecer en nombre, proveedor, modelo, mascara o estado. */
function coincide(l: Llave, consulta: string): boolean {
  const pajar = normalizar(`${l.Llave} ${l.Proveedor} ${providerLabel(l.Proveedor)} ${l.Modelo} ${l.LlaveMascara} ${textoEstado(l)}`);
  return normalizar(consulta).split(/\s+/).filter(Boolean).every((palabra) => pajar.includes(palabra));
}

function estado(l: Llave) {
  if (l.Status !== 1) return <span className="badge badge-off">Inactiva</span>;
  if (l.FechaCaducidad && new Date(l.FechaCaducidad).getTime() < Date.now()) {
    return <span className="badge badge-danger">Caducada</span>;
  }
  return <span className="badge badge-ok">Activa</span>;
}

export default function LlavesPage() {
  const [items, setItems] = useState<Llave[]>([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ id: number | null; form: Form } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const load = useCallback(async () => {
    const r = await api<Llave[]>('/api/llaves');
    if (r.success && r.data) setItems(r.data);
    else setError(r.error || 'No se pudieron cargar las llaves');
  }, []);

  useLoad(load);

  const openNew = () => { setFormError(''); setModal({ id: null, form: EMPTY }); };
  const openEdit = (l: Llave) => {
    setFormError('');
    setModal({
      id: l.IdLlave,
      form: {
        Llave: l.Llave,
        Proveedor: (PROVIDERS.some((p) => p.id === l.Proveedor) ? l.Proveedor : 'otro') as ProviderId,
        Modelo: l.Modelo,
        Secreto: '',
        FechaCaducidad: toInputDate(l.FechaCaducidad),
        Status: l.Status === 1,
      },
    });
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
      ? await api(`/api/llaves/${modal.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await api('/api/llaves', { method: 'POST', body: JSON.stringify(payload) });
    setSaving(false);
    if (r.success) { setModal(null); load(); }
    else setFormError(r.error || 'No se pudo guardar');
  };

  const remove = async (l: Llave) => {
    if (!confirm(`¿Eliminar la llave "${l.Llave}"? Esta acción no se puede deshacer.`)) return;
    const r = await api(`/api/llaves/${l.IdLlave}`, { method: 'DELETE' });
    if (r.success) load();
    else alert(r.error || 'No se pudo eliminar');
  };

  const visibles = useMemo(() => (busqueda.trim() ? items.filter((l) => coincide(l, busqueda)) : items), [items, busqueda]);

  /** Al elegir una sugerencia se llena el modelo y se ajusta el proveedor al que corresponde. */
  const pickModel = (provider: ProviderId, model: string) =>
    setModal((m) => (m ? { ...m, form: { ...m.form, Proveedor: provider, Modelo: model } } : m));

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title"><KeySquare size={26} /> Llaves de API</h1>
          <p className="page-sub">Cada llave es un proveedor + modelo + llave de API. Se guardan cifradas y nunca se muestran completas. Los agentes apuntan a una de estas llaves.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Nueva llave</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card toolbar">
        <div className="filters-row">
          <div className="form-group" style={{ flex: '1 1 320px' }}>
            <label>Buscar</label>
            <div className="search-box">
              <Search size={16} />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, proveedor, modelo, terminación de la llave o estado (activa, caducada, inactiva)"
                autoComplete="off"
              />
              {busqueda && (
                <button type="button" className="btn-icon" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda" title="Limpiar"><X size={15} /></button>
              )}
            </div>
          </div>
          <div className="form-group narrow">
            <label>&nbsp;</label>
            <span className="form-hint" style={{ minHeight: '2.4rem', display: 'inline-flex', alignItems: 'center' }}>
              {busqueda.trim() ? `${visibles.length} de ${items.length}` : `${items.length} llave${items.length === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Nombre</th><th>Proveedor</th><th>Modelo</th><th>Llave</th><th>Caduca</th><th>Agentes</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={8} className="empty">No hay llaves. Crea la primera.</td></tr>}
            {items.length > 0 && visibles.length === 0 && (
              <tr><td colSpan={8} className="empty">Ninguna llave coincide con &ldquo;{busqueda.trim()}&rdquo;.</td></tr>
            )}
            {visibles.map((l) => (
              <tr key={l.IdLlave}>
                <td><strong>{l.Llave}</strong></td>
                <td><ProviderBadge id={l.Proveedor} short /></td>
                <td className="mono">{l.Modelo}</td>
                <td className="mono">{l.LlaveMascara}</td>
                <td>{fmtDate(l.FechaCaducidad)}</td>
                <td>{l.TotalAgentes}</td>
                <td>{estado(l)}</td>
                <td>
                  <div className="td-actions">
                    <button className="btn-icon" onClick={() => openEdit(l)} title="Editar"><Pencil size={17} /></button>
                    <button className="btn-icon" onClick={() => remove(l)} title="Eliminar"><Trash2 size={17} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? 'Editar llave' : 'Nueva llave'} onClose={() => setModal(null)}>
          {formError && <div className="alert alert-error">{formError}</div>}
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="form-group full">
                <label>Nombre de la llave</label>
                <input value={modal.form.Llave} onChange={(e) => setField('Llave', e.target.value)} maxLength={45} placeholder="Ej: Claude Opus producción" required autoFocus />
              </div>
              <div className="form-group full">
                <label>Proveedor (IA)</label>
                <ProviderPicker value={modal.form.Proveedor} onChange={(id) => setField('Proveedor', id)} />
              </div>
              <div className="form-group full">
                <label>Modelo</label>
                <input list="modelos" value={modal.form.Modelo} onChange={(e) => setField('Modelo', e.target.value)} maxLength={100} placeholder="Escribe cualquier modelo o elige una sugerencia" required />
                <datalist id="modelos">{suggestionsFor(modal.form.Proveedor).flatMap((g) => g.models).map((m) => <option key={m} value={m} />)}</datalist>
                <span className="form-hint">Campo libre: puedes escribir cualquier identificador. Las sugerencias son las del proveedor elegido. Cambia el modelo aquí y todos los agentes que usen esta llave lo tomarán en su siguiente consulta.</span>
                <div className="chip-groups">
                  {suggestionsFor(modal.form.Proveedor).map((group) => (
                    <div key={group.provider} className="chip-group">
                      <span className="chip-group-label">{group.label}</span>
                      <div className="chip-list">
                        {group.models.map((m) => (
                          <button
                            key={m}
                            type="button"
                            className={`chip ${modal.form.Modelo === m ? 'chip-active' : ''}`}
                            onClick={() => pickModel(group.provider, m)}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-group full">
                <label>Llave de API {modal.id && '(déjala vacía para conservar la actual)'}</label>
                <input
                  type="password"
                  value={modal.form.Secreto}
                  onChange={(e) => setField('Secreto', e.target.value)}
                  placeholder={PROVIDERS.find((p) => p.id === modal.form.Proveedor)?.keyHint || 'Llave secreta'}
                  autoComplete="off"
                  required={!modal.id}
                />
                <span className="form-hint">Se cifra con AES-256-GCM antes de guardarse. No se vuelve a mostrar.</span>
              </div>
              <div className="form-group">
                <label>Fecha de caducidad (opcional)</label>
                <input type="datetime-local" value={modal.form.FechaCaducidad} onChange={(e) => setField('FechaCaducidad', e.target.value)} />
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
