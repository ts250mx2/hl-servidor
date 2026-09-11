'use client';

import { useCallback, useState } from 'react';
import { useLoad } from '@/lib/hooks';
import { RefreshCw, ScrollText } from 'lucide-react';
import { api, fmtDate } from '@/lib/client';

interface LogRow {
  IdBitacora: number;
  Fecha: string;
  IP: string;
  KeyPrefijo: string | null;
  Agente: string | null;
  Resultado: string;
  Detalle: string | null;
}

const LIMITS = [100, 250, 500];

function badge(r: string) {
  if (r === 'OK') return <span className="badge badge-ok">OK</span>;
  if (r === 'CADUCADO' || r === 'AGENTE_INACTIVO' || r === 'LLAVE_INACTIVA') return <span className="badge badge-warn">{r}</span>;
  return <span className="badge badge-danger">{r}</span>;
}

export default function BitacoraPage() {
  const [items, setItems] = useState<LogRow[]>([]);
  const [limit, setLimit] = useState(LIMITS[0]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<LogRow[]>(`/api/bitacora?limit=${limit}`);
    setLoading(false);
    if (r.success && r.data) setItems(r.data); else setError(r.error || 'No se pudo cargar la bitácora');
  }, [limit]);

  useLoad(load);

  const visible = filter ? items.filter((i) => i.Resultado === filter) : items;

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title"><ScrollText size={26} /> Bitácora del webservice</h1>
          <p className="page-sub">Cada consulta a <code>/api/ws/llave</code>, aceptada o rechazada.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todos</option>
            <option value="OK">OK</option>
            <option value="IP_BLOQUEADA">IP bloqueada</option>
            <option value="KEY_INVALIDA">Key inválida</option>
            <option value="AGENTE_INVALIDO">Agente inválido</option>
            <option value="AGENTE_INACTIVO">Agente inactivo</option>
            <option value="LLAVE_INACTIVA">Llave inactiva</option>
            <option value="CADUCADO">Caducado</option>
            <option value="ERROR">Error</option>
          </select>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ width: 'auto' }}>
            {LIMITS.map((l) => <option key={l} value={l}>Últimos {l}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={load} disabled={loading}><RefreshCw size={16} /> Actualizar</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Fecha</th><th>IP</th><th>Key</th><th>Agente</th><th>Resultado</th><th>Detalle</th></tr></thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={6} className="empty">Sin registros.</td></tr>}
            {visible.map((l) => (
              <tr key={l.IdBitacora}>
                <td>{fmtDate(l.Fecha)}</td>
                <td className="mono">{l.IP}</td>
                <td className="mono">{l.KeyPrefijo ? `${l.KeyPrefijo}…` : '—'}</td>
                <td>{l.Agente ?? '—'}</td>
                <td>{badge(l.Resultado)}</td>
                <td style={{ color: 'var(--text-muted)' }}>{l.Detalle ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
