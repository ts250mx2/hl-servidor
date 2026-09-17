'use client';

import { useCallback, useState } from 'react';
import { useLoad } from '@/lib/hooks';
import { RefreshCw, ScrollText } from 'lucide-react';
import { api, fmtDate } from '@/lib/client';
import { ProviderBadge } from '@/components/ProviderMark';
import { fmtMs, fmtNum, fmtUsd } from '@/components/charts/chartUtils';

interface LogRow {
  IdBitacora: number;
  Fecha: string;
  IP: string;
  KeyPrefijo: string | null;
  Aplicacion: string | null;
  Agente: string | null;
  Proveedor: string | null;
  Modelo: string | null;
  Resultado: string;
  Detalle: string | null;
  DuracionMs: number | null;
  TokensEntrada: number | null;
  TokensSalida: number | null;
  TokensCacheLectura: number | null;
  TokensCacheEscritura: number | null;
  CostoUsd: string | number | null;
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
          <p className="page-sub">Cada consulta a <code>/api/ws/llave</code> y al proxy <code>/api/ws/proxy</code>, aceptada o rechazada.</p>
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
          <thead><tr><th>Fecha</th><th>IP</th><th>Aplicación</th><th>Agente</th><th>Proveedor</th><th>Modelo</th><th className="num">Duración</th><th className="num">Tokens</th><th className="num">Gasto</th><th>Resultado</th><th>Detalle</th></tr></thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={11} className="empty">Sin registros.</td></tr>}
            {visible.map((l) => (
              <tr key={l.IdBitacora}>
                <td>{fmtDate(l.Fecha)}</td>
                <td className="mono">{l.IP}</td>
                <td>
                  {l.Aplicacion ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  {l.KeyPrefijo && <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{l.KeyPrefijo}…</div>}
                </td>
                <td>{l.Agente ?? '—'}</td>
                <td>{l.Proveedor ? <ProviderBadge id={l.Proveedor} short /> : '—'}</td>
                <td className="mono">{l.Modelo ?? '—'}</td>
                <td className="num mono">{l.DuracionMs === null ? '—' : fmtMs(l.DuracionMs)}</td>
                <td className="num mono" title={l.TokensSalida === null ? '' : `entrada ${fmtNum.format(l.TokensEntrada ?? 0)} · salida ${fmtNum.format(l.TokensSalida)} · caché ${fmtNum.format((l.TokensCacheLectura ?? 0) + (l.TokensCacheEscritura ?? 0))}`}>
                  {l.TokensSalida === null ? '—' : fmtNum.format((l.TokensEntrada ?? 0) + l.TokensSalida + (l.TokensCacheLectura ?? 0) + (l.TokensCacheEscritura ?? 0))}
                </td>
                <td className="num mono">{l.CostoUsd === null ? (l.TokensSalida === null ? '—' : <span title="El modelo no tiene precio capturado" style={{ color: 'var(--warning)' }}>sin precio</span>) : fmtUsd(Number(l.CostoUsd))}</td>
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
