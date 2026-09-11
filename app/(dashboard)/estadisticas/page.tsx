'use client';

import { useCallback, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, Table2 } from 'lucide-react';
import { useLoad } from '@/lib/hooks';
import { api } from '@/lib/client';
import LineChart, { type LineSeries } from '@/components/charts/LineChart';
import BarChart, { type BarItem } from '@/components/charts/BarChart';
import { MAX_SERIES, fmtNum, fmtPeriodo, seriesColor } from '@/components/charts/chartUtils';

type Granularidad = 'hora' | 'dia' | 'mes';

interface Estadisticas {
  desde: string;
  hasta: string;
  granularidad: Granularidad;
  serie: { periodo: string; IdAgente: number | null; Agente: string | null; total: number }[];
  porAgente: { IdAgente: number | null; Agente: string | null; total: number; ok: number }[];
}

interface AgenteOpt { IdAgente: number; Agente: string }
interface KeyOpt { IdKey: number; Nombre: string }

const PRESETS = [
  { id: '7', label: '7 días', dias: 7 },
  { id: '30', label: '30 días', dias: 30 },
  { id: '90', label: '90 días', dias: 90 },
] as const;

const SIN_AGENTE = 'Sin agente';
const OTROS = 'Otros';
const MS_POR_DIA = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoy = () => toDateInput(new Date());
const haceDias = (dias: number) => toDateInput(new Date(Date.now() - (dias - 1) * MS_POR_DIA));

/** Todos los periodos del rango, para que los dias sin llamadas aparezcan en cero. */
function periodosDelRango(desde: string, hasta: string, g: Granularidad): string[] {
  const out: string[] = [];
  const fin = new Date(`${hasta}T23:59:59`);
  const cursor = new Date(`${desde}T00:00:00`);
  if (g === 'mes') cursor.setDate(1);
  while (cursor <= fin && out.length < 2000) {
    const base = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    if (g === 'hora') {
      out.push(`${base} ${pad(cursor.getHours())}:00`);
      cursor.setHours(cursor.getHours() + 1);
    } else if (g === 'dia') {
      out.push(base);
      cursor.setDate(cursor.getDate() + 1);
    } else {
      out.push(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-01`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return out;
}

const claveAgente = (id: number | null) => (id === null ? 'null' : String(id));

export default function EstadisticasPage() {
  const [preset, setPreset] = useState<string>('30');
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(hoy());
  const [agente, setAgente] = useState('');
  const [key, setKey] = useState('');
  const [soloOk, setSoloOk] = useState(false);
  const [verTabla, setVerTabla] = useState(false);

  const [agentes, setAgentes] = useState<AgenteOpt[]>([]);
  const [keys, setKeys] = useState<KeyOpt[]>([]);
  const [data, setData] = useState<Estadisticas | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadCatalogos = useCallback(async () => {
    const [a, k] = await Promise.all([api<AgenteOpt[]>('/api/agentes'), api<KeyOpt[]>('/api/keys')]);
    if (a.success && a.data) setAgentes(a.data);
    if (k.success && k.data) setKeys(k.data);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const q = new URLSearchParams({ desde, hasta });
    if (agente) q.set('agente', agente);
    if (key) q.set('key', key);
    if (soloOk) q.set('soloOk', '1');
    const r = await api<Estadisticas>(`/api/estadisticas?${q}`);
    setLoading(false);
    if (r.success && r.data) setData(r.data);
    else setError(r.error || 'No se pudieron cargar las estadísticas');
  }, [desde, hasta, agente, key, soloOk]);

  useLoad(loadCatalogos);
  useLoad(load);

  const aplicarPreset = (id: string, dias: number) => {
    setPreset(id);
    setDesde(haceDias(dias));
    setHasta(hoy());
  };

  const vista = useMemo(() => {
    if (!data) return null;
    const periodos = periodosDelRango(desde, hasta, data.granularidad);
    const labels = periodos.map((p) => fmtPeriodo(p, data.granularidad));

    // Color por entidad: el orden lo fija el total en el rango; a partir del octavo se pliega en "Otros".
    const ranking = data.porAgente.map((r) => claveAgente(r.IdAgente));
    const slot = new Map(ranking.map((k, i) => [k, Math.min(i, MAX_SERIES - 1)]));
    const nombre = new Map(data.porAgente.map((r) => [claveAgente(r.IdAgente), r.Agente ?? SIN_AGENTE]));
    const plegar = ranking.length > MAX_SERIES;

    const seriesMap = new Map<string, LineSeries>();
    for (const row of data.serie) {
      const k = claveAgente(row.IdAgente);
      const idx = slot.get(k) ?? MAX_SERIES - 1;
      const esOtro = plegar && idx === MAX_SERIES - 1;
      const id = esOtro ? 'otros' : k;
      if (!seriesMap.has(id)) {
        seriesMap.set(id, {
          id,
          label: esOtro ? OTROS : nombre.get(k) ?? SIN_AGENTE,
          color: seriesColor(idx),
          values: new Array(periodos.length).fill(0),
        });
      }
      const pos = periodos.indexOf(row.periodo);
      if (pos >= 0) seriesMap.get(id)!.values[pos] += row.total;
    }
    const series = [...seriesMap.values()].sort((a, b) => (slot.get(a.id) ?? MAX_SERIES) - (slot.get(b.id) ?? MAX_SERIES));

    const barras: BarItem[] = data.porAgente.map((r) => {
      const k = claveAgente(r.IdAgente);
      const rechazos = r.total - r.ok;
      return {
        id: k,
        label: r.Agente ?? SIN_AGENTE,
        color: seriesColor(slot.get(k) ?? MAX_SERIES - 1),
        value: r.total,
        detail: `${fmtNum.format(r.ok)} OK · ${fmtNum.format(rechazos)} rechazadas`,
      };
    });

    const total = data.porAgente.reduce((s, r) => s + r.total, 0);
    const ok = data.porAgente.reduce((s, r) => s + r.ok, 0);
    return { periodos, labels, series, barras, total, ok, rechazos: total - ok };
  }, [data, desde, hasta]);

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title"><BarChart3 size={26} /> Estadísticas del webservice</h1>
          <p className="page-sub">Llamadas a <code>/api/ws/llave</code> por periodo y por agente.</p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}><RefreshCw size={16} /> Actualizar</button>
      </div>

      <div className="filters-row">
        <div className="form-group narrow">
          <label>Rango</label>
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.id} className={preset === p.id ? 'active' : ''} onClick={() => aplicarPreset(p.id, p.dias)}>{p.label}</button>
            ))}
          </div>
        </div>
        <div className="form-group narrow">
          <label>Desde</label>
          <input type="date" value={desde} max={hasta} onChange={(e) => { setPreset(''); setDesde(e.target.value); }} />
        </div>
        <div className="form-group narrow">
          <label>Hasta</label>
          <input type="date" value={hasta} min={desde} max={hoy()} onChange={(e) => { setPreset(''); setHasta(e.target.value); }} />
        </div>
        <div className="form-group">
          <label>Agente</label>
          <select value={agente} onChange={(e) => setAgente(e.target.value)}>
            <option value="">Todos los agentes</option>
            {agentes.map((a) => <option key={a.IdAgente} value={a.IdAgente}>{a.Agente}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Aplicación</label>
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            <option value="">Todas las aplicaciones</option>
            {keys.map((k) => <option key={k.IdKey} value={k.IdKey}>{k.Nombre}</option>)}
          </select>
        </div>
        <div className="form-group narrow">
          <label className="form-check" style={{ marginBottom: '0.6rem' }}>
            <input type="checkbox" checked={soloOk} onChange={(e) => setSoloOk(e.target.checked)} /> Solo aceptadas
          </label>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {vista && (
        <>
          <div className="stats-grid">
            <div className="card stat"><div><div className="stat-value">{fmtNum.format(vista.total)}</div><div className="stat-label">Llamadas en el rango</div></div></div>
            <div className="card stat"><div><div className="stat-value">{fmtNum.format(vista.ok)}</div><div className="stat-label">Aceptadas</div></div></div>
            <div className="card stat"><div><div className="stat-value">{fmtNum.format(vista.rechazos)}</div><div className="stat-label">Rechazadas</div></div></div>
            <div className="card stat"><div><div className="stat-value">{vista.barras.length}</div><div className="stat-label">Agentes con actividad</div></div></div>
          </div>

          <div className="charts-grid">
            <div className={`card chart-card ${loading ? 'loading' : ''}`}>
              <div className="chart-head">
                <div>
                  <div className="chart-title">Llamadas por {data?.granularidad === 'hora' ? 'hora' : data?.granularidad === 'mes' ? 'mes' : 'día'}</div>
                  <div className="chart-sub">Una línea por agente{vista.series.length > MAX_SERIES - 1 ? ', los de menor volumen agrupados en "Otros"' : ''}.</div>
                </div>
                <button className="btn btn-ghost" onClick={() => setVerTabla((v) => !v)}><Table2 size={15} /> {verTabla ? 'Ver gráfica' : 'Ver tabla'}</button>
              </div>
              {verTabla ? (
                <div className="table-wrap" style={{ boxShadow: 'none' }}>
                  <table className="tbl chart-table">
                    <thead><tr><th>Periodo</th>{vista.series.map((s) => <th key={s.id} className="num">{s.label}</th>)}</tr></thead>
                    <tbody>
                      {vista.periodos.map((p, i) => (
                        <tr key={p}><td>{p}</td>{vista.series.map((s) => <td key={s.id} className="num">{fmtNum.format(s.values[i])}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  <LineChart labels={vista.labels} titles={vista.periodos} series={vista.series} />
                  {vista.series.length > 1 && (
                    <div className="chart-legend">
                      {vista.series.map((s) => (
                        <span key={s.id} className="lg-item"><span className="lg-key" style={{ background: s.color }} />{s.label}</span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className={`card chart-card ${loading ? 'loading' : ''}`}>
              <div className="chart-head">
                <div>
                  <div className="chart-title">Llamadas por agente</div>
                  <div className="chart-sub">Total en el rango, de mayor a menor.</div>
                </div>
              </div>
              <BarChart items={vista.barras} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
