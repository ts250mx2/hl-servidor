'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLoad } from '@/lib/hooks';
import { BellRing, CheckCheck, RefreshCw } from 'lucide-react';
import SearchBar, { SinCoincidencias } from '@/components/SearchBar';
import { coincideTexto } from '@/lib/buscar';
import { api, fmtDate } from '@/lib/client';

interface Alerta {
  IdAlerta: number;
  Fecha: string;
  Tipo: string;
  Nivel: 'info' | 'warn' | 'bad';
  Titulo: string;
  Detalle: string | null;
  Leida: number;
  Enviada: number;
  Canal: string | null;
}

const LIMITS = [100, 250, 500];

const TIPO: Record<string, string> = {
  LLAVE_CADUCADA: 'Llave caducada',
  LLAVE_POR_CADUCAR: 'Llave por caducar',
  PROVEEDOR_RECHAZA: 'Proveedor rechazó la llave',
  RESPALDO_USADO: 'Respaldo en acción',
  PRESUPUESTO: 'Presupuesto agotado',
  GASTO_DIARIO: 'Gasto del día',
  ACCESO_NO_PERMITIDO: 'Acceso no permitido',
};
const NIVEL: Record<Alerta['Nivel'], { texto: string; clase: string }> = {
  bad: { texto: 'Alerta', clase: 'badge-danger' },
  warn: { texto: 'Aviso', clase: 'badge-warn' },
  info: { texto: 'Info', clase: 'badge-info' },
};

const coincide = (a: Alerta, consulta: string) =>
  coincideTexto(consulta, [a.Tipo, TIPO[a.Tipo], a.Nivel, NIVEL[a.Nivel]?.texto, a.Titulo, a.Detalle, a.Leida ? 'leida' : 'sin leer', a.Enviada ? 'enviada' : 'no enviada', a.Canal]);

export default function AlertasPage() {
  const [items, setItems] = useState<Alerta[]>([]);
  const [limit, setLimit] = useState(LIMITS[0]);
  const [busqueda, setBusqueda] = useState('');
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<Alerta[]>(`/api/alertas?limit=${limit}${soloNoLeidas ? '&noLeidas=1' : ''}`);
    setLoading(false);
    if (r.success && r.data) setItems(r.data); else setError(r.error || 'No se pudieron cargar las alertas');
  }, [limit, soloNoLeidas]);

  useLoad(load);

  const visibles = useMemo(() => items.filter((a) => coincide(a, busqueda)), [items, busqueda]);
  const noLeidas = items.filter((a) => !a.Leida).length;

  const marcar = async (ids: number[] | 'todas') => {
    const r = await api('/api/alertas', { method: 'PATCH', body: JSON.stringify(ids === 'todas' ? { todas: true } : { ids }) });
    if (r.success) load(); else setError(r.error || 'No se pudo marcar');
  };

  const revisar = async () => {
    setAviso('');
    const r = await api<{ caducadas: number; porCaducar: number }>('/api/alertas/revisar', { method: 'POST' });
    if (r.success && r.data) {
      setAviso(`Revisión hecha: ${r.data.caducadas} llave(s) caducada(s) y ${r.data.porCaducar} por caducar con aviso nuevo.`);
      load();
    } else setError(r.error || 'No se pudo revisar');
  };

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title"><BellRing size={26} /> Alertas</h1>
          <p className="page-sub">Avisos que genera HL: llaves por caducar, proveedores que rechazan, respaldos en acción, presupuestos agotados y gasto del día. Se envían por webhook o correo si están configurados en el .env.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="form-check" style={{ fontSize: '0.85rem' }}>
            <input type="checkbox" checked={soloNoLeidas} onChange={(e) => setSoloNoLeidas(e.target.checked)} /> Solo sin leer
          </label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ width: 'auto' }}>
            {LIMITS.map((l) => <option key={l} value={l}>Últimas {l}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={revisar} title="Revisa ahora la caducidad de llaves y el gasto del día"><RefreshCw size={16} /> Revisar ahora</button>
          <button className="btn btn-primary" onClick={() => marcar('todas')} disabled={noLeidas === 0}><CheckCheck size={16} /> Marcar todas leídas</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {aviso && <div className="alert alert-success">{aviso}</div>}

      <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Tipo, texto, nivel, leída, enviada" total={items.length} visibles={visibles.length} nombre={['alerta', 'alertas']} />

      <div className={`table-wrap ${loading ? 'loading' : ''}`}>
        <table className="tbl">
          <thead><tr><th>Fecha</th><th>Nivel</th><th>Tipo</th><th>Aviso</th><th>Envío</th><th></th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} className="empty">Sin alertas. Buena señal.</td></tr>}
            {items.length > 0 && visibles.length === 0 && <SinCoincidencias consulta={busqueda} columnas={6} />}
            {visibles.map((a) => (
              <tr key={a.IdAlerta} className={a.Leida ? 'alerta-leida' : 'alerta-nueva'}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.Fecha)}</td>
                <td><span className={`badge ${NIVEL[a.Nivel]?.clase ?? 'badge-off'}`}>{NIVEL[a.Nivel]?.texto ?? a.Nivel}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>{TIPO[a.Tipo] ?? a.Tipo}</td>
                <td>
                  <div style={{ fontWeight: a.Leida ? 500 : 700 }}>{a.Titulo}</div>
                  {a.Detalle && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textWrap: 'pretty' }}>{a.Detalle}</div>}
                </td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{a.Enviada ? a.Canal : a.Nivel === 'info' ? '—' : (a.Canal ? a.Canal : 'sin canal')}</td>
                <td>{!a.Leida && <button className="btn btn-ghost" onClick={() => marcar([a.IdAlerta])} style={{ minHeight: '2rem', padding: '0.3rem 0.7rem' }}>Leída</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
