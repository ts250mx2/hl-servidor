'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Bot, CheckCircle2, KeyRound, KeySquare, ShieldCheck, XCircle } from 'lucide-react';
import { useLoad } from '@/lib/hooks';
import { api, fmtDate } from '@/lib/client';
import { providerColor, providerShort } from '@/lib/providers';
import ProviderMark from '@/components/ProviderMark';
import Sparkline from '@/components/charts/Sparkline';
import Donut from '@/components/charts/Donut';
import { fmtMs, fmtNum, fmtUsd } from '@/components/charts/chartUtils';

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
  consultas7d: number;
  agentesSinRespaldo: number;
  llavesNoDescifrables: number;
  costo7d: number;
  latencia24h: number | null;
  diasAviso: number;
  diasTendencia: number;
  ultimos: { Fecha: string; IP: string; KeyPrefijo: string | null; Aplicacion: string | null; Proveedor: string | null; Modelo: string | null; Resultado: string; Agente: string | null }[];
  porProveedor: { proveedor: string | null; total: number; ok: number; costo: number }[];
  catalogo: { proveedor: string; llaves: number; agentes: number }[];
  tendencia: { dia: string; total: number }[];
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Rellena con ceros los días sin llamadas para que la tendencia siempre tenga N puntos. */
function tendenciaCompleta(rows: Stats['tendencia'], dias: number) {
  const byDay = new Map(rows.map((r) => [r.dia, r.total]));
  const labels: string[] = [];
  const values: number[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    labels.push(`${DIAS[d.getDay()]} ${d.getDate()}`);
    values.push(byDay.get(key) ?? 0);
  }
  return { labels, values };
}

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

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!stats) return null;

  const trend = tendenciaCompleta(stats.tendencia, stats.diasTendencia);
  const totalProv = stats.porProveedor.reduce((s, p) => s + p.total, 0);
  const slices = stats.porProveedor.map((p) => ({
    id: p.proveedor ?? 'null',
    label: providerShort(p.proveedor),
    value: p.total,
    color: providerColor(p.proveedor),
  }));
  const okRate = stats.consultas24h > 0 ? Math.round(((stats.consultas24h - stats.rechazos24h) / stats.consultas24h) * 100) : 100;

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <span className="eyebrow">Panel de control</span>
          <h1 className="page-title">Resumen</h1>
          <p className="page-sub">Estado de llaves, agentes y tráfico del webservice y el proxy en tiempo real.</p>
        </div>
        <span className="live"><span className="live-dot" /> actualizado {new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      {stats.llavesCaducadas > 0 && (
        <div className="alert alert-error">Hay {stats.llavesCaducadas} llave(s) de API caducada(s). Los agentes que las usen ya no reciben llave.</div>
      )}
      {stats.llavesPorCaducar > 0 && (
        <div className="alert alert-warn">{stats.llavesPorCaducar} llave(s) caducan en los próximos {stats.diasAviso} días.</div>
      )}

      <div className="bento">
        {/* ── Hero: tráfico ── */}
        <section className="card hero span-7">
          <div className="orb" aria-hidden="true" />
          <div className="hero-body">
            <span className="eyebrow">Tráfico · últimos {stats.diasTendencia} días</span>
            <div className="kpi-big">{fmtNum.format(stats.consultas7d)}<small>llamadas</small></div>
            <div className="kpi-row">
              <div className="kpi"><span className="kpi-value">{fmtNum.format(stats.consultas24h)}</span><span className="kpi-label">últimas 24 h</span></div>
              <div className="kpi"><span className="kpi-value" style={{ color: stats.rechazos24h ? 'var(--danger)' : 'inherit' }}>{fmtNum.format(stats.rechazos24h)}</span><span className="kpi-label">rechazos 24 h</span></div>
              <div className="kpi"><span className="kpi-value" style={{ color: okRate >= 95 ? '#16a34a' : 'var(--warning)' }}>{okRate}%</span><span className="kpi-label">aceptación 24 h</span></div>
              <div className="kpi"><span className="kpi-value">{fmtUsd(stats.costo7d)}</span><span className="kpi-label">gasto estimado {stats.diasTendencia} d</span></div>
              <div className="kpi"><span className="kpi-value">{stats.latencia24h === null ? '—' : fmtMs(stats.latencia24h)}</span><span className="kpi-label">latencia prom. 24 h</span></div>
            </div>
            <Sparkline labels={trend.labels} values={trend.values} height={140} ariaLabel="Llamadas por día" />
          </div>
        </section>

        {/* ── Tiles: catálogo ── */}
        <div className="span-5 tiles">
          <Link href="/llaves" className="tile" style={{ '--tile-accent': 'var(--indigo)' } as React.CSSProperties}>
            <div className="tile-top"><span>Llaves de API</span><KeySquare size={16} /></div>
            <div className="tile-value">{stats.llavesActivas} <small>/ {stats.llaves} activas</small></div>
          </Link>
          <Link href="/agentes" className="tile" style={{ '--tile-accent': 'var(--teal)' } as React.CSSProperties}>
            <div className="tile-top"><span>Agentes</span><Bot size={16} /></div>
            <div className="tile-value">{stats.agentesActivos} <small>/ {stats.agentes} activos</small></div>
          </Link>
          <Link href="/keys" className="tile" style={{ '--tile-accent': 'var(--coral)' } as React.CSSProperties}>
            <div className="tile-top"><span>Keys de acceso</span><KeyRound size={16} /></div>
            <div className="tile-value">{stats.keysActivas} <small>/ {stats.totalKeys} activas</small></div>
          </Link>
          <Link href="/ips" className="tile" style={{ '--tile-accent': 'var(--amber)' } as React.CSSProperties}>
            <div className="tile-top"><span>IPs permitidas</span><ShieldCheck size={16} /></div>
            <div className="tile-value">{stats.ipsActivas} <small>activas</small></div>
          </Link>
        </div>

        {/* ── Proveedores: uso ── */}
        <section className="card span-7">
          <div className="chart-head" style={{ marginBottom: '0.75rem' }}>
            <div>
              <div className="chart-title">Uso por proveedor de IA</div>
              <div className="chart-sub">Llamadas de los últimos {stats.diasTendencia} días, por proveedor de la llave que ejecutó cada agente.</div>
            </div>
            <Link href="/estadisticas?agrupar=proveedor" className="btn btn-ghost">Detalle <ArrowUpRight size={15} /></Link>
          </div>
          <div className="provider-panel">
            <Donut slices={slices} size={170} centerLabel="llamadas" />
            <div className="provider-list">
              {slices.length === 0 && <div className="chart-sub">Aún no hay llamadas registradas.</div>}
              {stats.porProveedor.map((p) => {
                const pct = totalProv ? Math.round((p.total / totalProv) * 100) : 0;
                const okPct = p.total ? Math.round((p.ok / p.total) * 100) : 0;
                return (
                  <div key={p.proveedor ?? 'null'} className="provider-row">
                    <ProviderMark id={p.proveedor} size={30} />
                    <div>
                      <div className="name"><span>{providerShort(p.proveedor)}</span><span className="sub">{pct}% · {okPct}% OK · {fmtUsd(p.costo)}</span></div>
                      <div className="share"><span style={{ width: `${pct}%`, background: providerColor(p.proveedor) }} /></div>
                    </div>
                    <div className="count">{fmtNum.format(p.total)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Salud ── */}
        <section className="card span-5">
          <div className="chart-title" style={{ marginBottom: '0.75rem' }}>Salud del catálogo</div>
          <div className="health">
            <div className={`health-row ${stats.llavesCaducadas ? 'bad' : 'ok'}`}>
              <span className="h-icon">{stats.llavesCaducadas ? <XCircle size={18} /> : <CheckCircle2 size={18} />}</span>
              <span className="h-text">Llaves caducadas</span>
              <span className="h-val">{stats.llavesCaducadas}</span>
            </div>
            <div className={`health-row ${stats.llavesPorCaducar ? 'warn' : 'ok'}`}>
              <span className="h-icon">{stats.llavesPorCaducar ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}</span>
              <span className="h-text">Caducan en {stats.diasAviso} días</span>
              <span className="h-val">{stats.llavesPorCaducar}</span>
            </div>
            <div className={`health-row ${stats.rechazos24h ? 'warn' : 'ok'}`}>
              <span className="h-icon">{stats.rechazos24h ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}</span>
              <span className="h-text">Rechazos en 24 h</span>
              <span className="h-val">{stats.rechazos24h}</span>
            </div>
            <div className={`health-row ${stats.agentesSinRespaldo ? 'warn' : 'ok'}`}>
              <span className="h-icon">{stats.agentesSinRespaldo ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}</span>
              <span className="h-text">Agentes activos sin llave de respaldo</span>
              <span className="h-val">{stats.agentesSinRespaldo}</span>
            </div>
            <div className={`health-row ${stats.llavesNoDescifrables ? 'bad' : 'ok'}`}>
              <span className="h-icon">{stats.llavesNoDescifrables ? <XCircle size={18} /> : <CheckCircle2 size={18} />}</span>
              <span className="h-text">Llaves que no se descifran con MASTER_KEY</span>
              <span className="h-val">{stats.llavesNoDescifrables}</span>
            </div>
          </div>

          <div className="chart-title" style={{ margin: '1.1rem 0 0.6rem' }}>Catálogo por proveedor</div>
          <div className="catalog-grid">
            {stats.catalogo.length === 0 && <div className="chart-sub">Sin llaves registradas.</div>}
            {stats.catalogo.map((c) => (
              <div key={c.proveedor} className="catalog-item">
                <ProviderMark id={c.proveedor} size={28} />
                <div>
                  <div className="cname">{providerShort(c.proveedor)}</div>
                  <div className="cmeta">{c.llaves} llave{c.llaves === 1 ? '' : 's'} · {c.agentes} agente{c.agentes === 1 ? '' : 's'}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Últimas llamadas ── */}
        <section className="span-12">
          <div className="chart-head" style={{ marginBottom: '0.6rem' }}>
            <div className="chart-title">Últimas llamadas</div>
            <Link href="/bitacora" className="btn btn-ghost">Bitácora completa <ArrowUpRight size={15} /></Link>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Fecha</th><th>IP</th><th>Aplicación</th><th>Agente</th><th>Proveedor / modelo</th><th>Resultado</th></tr>
              </thead>
              <tbody>
                {stats.ultimos.length === 0 && <tr><td colSpan={6} className="empty">Aún no hay consultas al webservice.</td></tr>}
                {stats.ultimos.map((u, i) => (
                  <tr key={i}>
                    <td>{fmtDate(u.Fecha)}</td>
                    <td className="mono">{u.IP}</td>
                    <td>{u.Aplicacion ?? (u.KeyPrefijo ? <span className="mono">{u.KeyPrefijo}…</span> : '—')}</td>
                    <td>{u.Agente ?? '—'}</td>
                    <td>
                      {u.Proveedor ? (
                        <span className="pbadge"><ProviderMark id={u.Proveedor} size={20} /><span>{providerShort(u.Proveedor)}</span>{u.Modelo && <code style={{ color: 'var(--text-muted)' }}>{u.Modelo}</code>}</span>
                      ) : '—'}
                    </td>
                    <td>{resultBadge(u.Resultado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
