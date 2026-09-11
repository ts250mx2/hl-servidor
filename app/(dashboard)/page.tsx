'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bot, KeyRound, KeySquare, ScrollText, ShieldCheck, XCircle } from 'lucide-react';
import { useLoad } from '@/lib/hooks';
import { api, fmtDate } from '@/lib/client';

interface Stats {
  llaves: number;
  llavesActivas: number;
  llavesCaducadas: number;
  llavesPorCaducar: number;
  agentes: number;
  agentesActivos: number;
  totalKeys: number;
  keysActivas: number;
  ipsActivas: number;
  consultas24h: number;
  rechazos24h: number;
  diasAviso: number;
  ultimos: { Fecha: string; IP: string; KeyPrefijo: string | null; Resultado: string; Agente: string | null }[];
}

const mutedSmall = { fontSize: '0.9rem', color: 'var(--text-muted)' } as const;

function resultBadge(r: string) {
  return <span className={`badge ${r === 'OK' ? 'badge-ok' : 'badge-danger'}`}>{r}</span>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await api<Stats>('/api/dashboard');
    if (r.success && r.data) setStats(r.data);
    else setError(r.error || 'No se pudo cargar el resumen');
  }, []);

  useLoad(load);

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Resumen</h1>
          <p className="page-sub">Estado general de llaves, agentes, keys y consultas al webservice.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {stats && (
        <>
          {stats.llavesCaducadas > 0 && (
            <div className="alert alert-error">
              Hay {stats.llavesCaducadas} llave(s) de API caducada(s). Los agentes que las usen ya no reciben llave.
            </div>
          )}
          {stats.llavesPorCaducar > 0 && (
            <div className="alert alert-warn">
              {stats.llavesPorCaducar} llave(s) caducan en los próximos {stats.diasAviso} días.
            </div>
          )}

          <div className="stats-grid">
            <Link href="/llaves" className="card stat">
              <span className="stat-icon"><KeySquare size={22} /></span>
              <div>
                <div className="stat-value">{stats.llavesActivas} <small style={mutedSmall}>/ {stats.llaves}</small></div>
                <div className="stat-label">Llaves de API activas</div>
              </div>
            </Link>
            <Link href="/agentes" className="card stat">
              <span className="stat-icon teal"><Bot size={22} /></span>
              <div>
                <div className="stat-value">{stats.agentesActivos} <small style={mutedSmall}>/ {stats.agentes}</small></div>
                <div className="stat-label">Agentes activos</div>
              </div>
            </Link>
            <Link href="/keys" className="card stat">
              <span className="stat-icon"><KeyRound size={22} /></span>
              <div>
                <div className="stat-value">{stats.keysActivas} <small style={mutedSmall}>/ {stats.totalKeys}</small></div>
                <div className="stat-label">Keys de acceso activas</div>
              </div>
            </Link>
            <Link href="/ips" className="card stat">
              <span className="stat-icon teal"><ShieldCheck size={22} /></span>
              <div>
                <div className="stat-value">{stats.ipsActivas}</div>
                <div className="stat-label">IPs permitidas</div>
              </div>
            </Link>
            <Link href="/bitacora" className="card stat">
              <span className="stat-icon amber"><ScrollText size={22} /></span>
              <div>
                <div className="stat-value">{stats.consultas24h}</div>
                <div className="stat-label">Consultas últimas 24 h</div>
              </div>
            </Link>
            <Link href="/bitacora" className="card stat">
              <span className="stat-icon red"><XCircle size={22} /></span>
              <div>
                <div className="stat-value">{stats.rechazos24h}</div>
                <div className="stat-label">Rechazos últimas 24 h</div>
              </div>
            </Link>
            <Link href="/llaves" className="card stat">
              <span className="stat-icon amber"><AlertTriangle size={22} /></span>
              <div>
                <div className="stat-value">{stats.llavesCaducadas + stats.llavesPorCaducar}</div>
                <div className="stat-label">Llaves caducadas o por caducar</div>
              </div>
            </Link>
          </div>

          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Últimas consultas</h2>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Fecha</th><th>IP</th><th>Key</th><th>Agente</th><th>Resultado</th></tr>
              </thead>
              <tbody>
                {stats.ultimos.length === 0 && (
                  <tr><td colSpan={5} className="empty">Aún no hay consultas al webservice.</td></tr>
                )}
                {stats.ultimos.map((u, i) => (
                  <tr key={i}>
                    <td>{fmtDate(u.Fecha)}</td>
                    <td className="mono">{u.IP}</td>
                    <td className="mono">{u.KeyPrefijo ? `${u.KeyPrefijo}…` : '—'}</td>
                    <td>{u.Agente ?? '—'}</td>
                    <td>{resultBadge(u.Resultado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
