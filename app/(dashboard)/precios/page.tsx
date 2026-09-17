'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLoad } from '@/lib/hooks';
import { Calculator, Coins, Pencil, Plus, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal';
import ProviderPicker from '@/components/ProviderPicker';
import { ProviderBadge } from '@/components/ProviderMark';
import SearchBar, { SinCoincidencias } from '@/components/SearchBar';
import { coincideTexto } from '@/lib/buscar';
import { api, fmtDate } from '@/lib/client';
import { PROVIDERS, providerLabel, type ProviderId } from '@/lib/providers';

interface Precio {
  IdPrecio: number;
  Proveedor: string;
  Modelo: string;
  Entrada: number;
  Salida: number;
  CacheLectura: number;
  CacheEscritura: number;
  Nota: string | null;
  FechaModificacion: string;
}

interface Form {
  Proveedor: ProviderId;
  Modelo: string;
  Entrada: string;
  Salida: string;
  CacheLectura: string;
  CacheEscritura: string;
  Nota: string;
}

const EMPTY: Form = { Proveedor: 'claude', Modelo: '', Entrada: '', Salida: '', CacheLectura: '0', CacheEscritura: '0', Nota: '' };

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });

const coincide = (p: Precio, consulta: string) =>
  coincideTexto(consulta, [p.Proveedor, providerLabel(p.Proveedor), p.Modelo, p.Nota]);

export default function PreciosPage() {
  const [items, setItems] = useState<Precio[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ id: number | null; form: Form } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [recalculando, setRecalculando] = useState(false);
  const [aviso, setAviso] = useState('');

  const recalcular = async () => {
    setRecalculando(true);
    setAviso('');
    const r = await api<{ revisadas: number; actualizadas: number; sinPrecio: number }>('/api/precios/recalcular', { method: 'POST' });
    setRecalculando(false);
    if (r.success && r.data) setAviso(`Se revisaron ${r.data.revisadas} llamadas con tokens: ${r.data.actualizadas} cambiaron de gasto y ${r.data.sinPrecio} siguen sin precio para su modelo.`);
    else setError(r.error || 'No se pudo recalcular');
  };

  const load = useCallback(async () => {
    const r = await api<Precio[]>('/api/precios');
    if (r.success && r.data) setItems(r.data); else setError(r.error || 'No se pudieron cargar los precios');
  }, []);

  useLoad(load);

  const visibles = useMemo(() => items.filter((p) => coincide(p, busqueda)), [items, busqueda]);

  const openNew = () => { setFormError(''); setModal({ id: null, form: EMPTY }); };
  const openEdit = (p: Precio) => {
    setFormError('');
    setModal({
      id: p.IdPrecio,
      form: {
        Proveedor: (PROVIDERS.some((x) => x.id === p.Proveedor) ? p.Proveedor : 'otro') as ProviderId,
        Modelo: p.Modelo,
        Entrada: String(p.Entrada),
        Salida: String(p.Salida),
        CacheLectura: String(p.CacheLectura),
        CacheEscritura: String(p.CacheEscritura),
        Nota: p.Nota ?? '',
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
    const r = modal.id
      ? await api(`/api/precios/${modal.id}`, { method: 'PUT', body: JSON.stringify(modal.form) })
      : await api('/api/precios', { method: 'POST', body: JSON.stringify(modal.form) });
    setSaving(false);
    if (r.success) { setModal(null); load(); } else setFormError(r.error || 'No se pudo guardar');
  };

  const remove = async (p: Precio) => {
    if (!confirm(`¿Eliminar el precio de ${p.Modelo}? Las llamadas nuevas de ese modelo quedarán sin gasto estimado.`)) return;
    const r = await api(`/api/precios/${p.IdPrecio}`, { method: 'DELETE' });
    if (r.success) load(); else alert(r.error || 'No se pudo eliminar');
  };

  const campoPrecio = (key: 'Entrada' | 'Salida' | 'CacheLectura' | 'CacheEscritura', label: string, required = false) => (
    <div className="form-group">
      <label>{label}</label>
      <input type="number" min={0} step="0.0001" value={modal?.form[key] ?? ''} onChange={(e) => setField(key, e.target.value)} placeholder="USD por millón" required={required} />
    </div>
  );

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Coins size={26} /> Precios por modelo</h1>
          <p className="page-sub">USD por millón de tokens. Con esto el proxy estima el gasto de cada llamada. El modelo es un prefijo con límite de guion: <code>claude-sonnet-5</code> cubre <code>claude-sonnet-5-20260101</code>, pero <code>gpt-5</code> no cubre <code>gpt-5.6-sol</code>; gana el prefijo más largo.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={recalcular} disabled={recalculando} title="Vuelve a calcular el gasto de toda la bitácora con los precios actuales"><Calculator size={16} /> {recalculando ? 'Recalculando...' : 'Recalcular gasto'}</button>
          <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Nuevo precio</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {aviso && <div className="alert alert-success">{aviso}</div>}

      <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Proveedor, modelo o nota" total={items.length} visibles={visibles.length} nombre={['precio', 'precios']} />

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Proveedor</th><th>Modelo (prefijo)</th><th className="num">Entrada</th><th className="num">Salida</th><th className="num">Caché lectura</th><th className="num">Caché escritura</th><th>Nota</th><th>Modificado</th><th></th></tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={9} className="empty">Sin precios. Sin ellos las llamadas registran tokens pero no gasto.</td></tr>}
            {items.length > 0 && visibles.length === 0 && <SinCoincidencias consulta={busqueda} columnas={9} />}
            {visibles.map((p) => (
              <tr key={p.IdPrecio}>
                <td><ProviderBadge id={p.Proveedor} short /></td>
                <td className="mono">{p.Modelo}</td>
                <td className="num">{usd.format(p.Entrada)}</td>
                <td className="num">{usd.format(p.Salida)}</td>
                <td className="num">{usd.format(p.CacheLectura)}</td>
                <td className="num">{usd.format(p.CacheEscritura)}</td>
                <td style={{ color: 'var(--text-muted)' }}>{p.Nota ?? ''}</td>
                <td>{fmtDate(p.FechaModificacion)}</td>
                <td>
                  <div className="td-actions">
                    <button className="btn-icon" onClick={() => openEdit(p)} title="Editar"><Pencil size={17} /></button>
                    <button className="btn-icon" onClick={() => remove(p)} title="Eliminar"><Trash2 size={17} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? 'Editar precio' : 'Nuevo precio'} onClose={() => setModal(null)}>
          {formError && <div className="alert alert-error">{formError}</div>}
          <form onSubmit={save}>
            <div className="form-grid">
              {modal.id ? (
                <div className="form-group full">
                  <label>Modelo</label>
                  <div className="pbadge"><ProviderBadge id={modal.form.Proveedor} short /><code>{modal.form.Modelo}</code></div>
                  <span className="form-hint">Proveedor y modelo identifican el precio; para cambiarlos crea uno nuevo.</span>
                </div>
              ) : (
                <>
                  <div className="form-group full">
                    <label>Proveedor</label>
                    <ProviderPicker value={modal.form.Proveedor} onChange={(id) => setField('Proveedor', id)} />
                  </div>
                  <div className="form-group full">
                    <label>Modelo o prefijo</label>
                    <input value={modal.form.Modelo} onChange={(e) => setField('Modelo', e.target.value)} maxLength={100} placeholder="Ej: gpt-5.6-sol" required autoFocus />
                  </div>
                </>
              )}
              {campoPrecio('Entrada', 'Entrada (USD por millón)', true)}
              {campoPrecio('Salida', 'Salida (USD por millón)', true)}
              {campoPrecio('CacheLectura', 'Caché lectura')}
              {campoPrecio('CacheEscritura', 'Caché escritura')}
              <div className="form-group full">
                <label>Nota (opcional)</label>
                <input value={modal.form.Nota} onChange={(e) => setField('Nota', e.target.value)} maxLength={120} placeholder="Ej: lista pública septiembre 2026" />
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
