'use client';

import { Suspense, useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BarChart3, RefreshCw, Table2, ZoomOut } from 'lucide-react';
import { useLoad } from '@/lib/hooks';
import { api } from '@/lib/client';
import { providerColor, providerLabel } from '@/lib/providers';
import ProviderMark from '@/components/ProviderMark';
import LineChart, { type LineSeries } from '@/components/charts/LineChart';
import BarChart, { type BarItem } from '@/components/charts/BarChart';
import { MAX_SERIES, fmtNum, fmtPeriodo, seriesColor } from '@/components/charts/chartUtils';

type Granularidad = 'hora' | 'dia' | 'mes';
type Agrupar = 'agente' | 'aplicacion' | 'proveedor' | 'modelo';

interface Estadisticas {
  desde: string;
  hasta: string;
  granularidad: Granularidad;
  agrupar: Agrupar;
  serie: { periodo: string; clave: string | null; etiqueta: string | null; total: number }[];
  porGrupo: { clave: string | null; etiqueta: string | null; total: number; ok: number }[];
}

interface AgenteOpt { IdAgente: number; Agente: string }
interface KeyOpt { IdKey: number; Nombre: string }
interface Rango { desde: string; hasta: string }

const PRESETS = [
  { id: '1', label: 'Hoy', dias: 1 },
  { id: '7', label: '7 días', dias: 7 },
  { id: '30', label: '30 días', dias: 30 },
  { id: '90', label: '90 días', dias: 90 },
] as const;

const AGRUPACIONES: { id: Agrupar; label: string; singular: string; plural: string; vacio: string }[] = [
  { id: 'agente', label: 'Agente', singular: 'agente', plural: 'Agentes', vacio: 'Sin agente' },
  { id: 'aplicacion', label: 'Aplicación', singular: 'aplicación', plural: 'Aplicaciones', vacio: 'Sin aplicación' },
  { id: 'proveedor', label: 'Proveedor', singular: 'proveedor', plural: 'Proveedores', vacio: 'Sin proveedor' },
  { id: 'modelo', label: 'Modelo', singular: 'modelo', plural: 'Modelos', vacio: 'Sin modelo' },
];

const OTROS = 'Otros';
const MS_POR_DIA = 86_400_000;
const GRANULARIDAD_LABEL: Record<Granularidad, string> = { hora: 'hora', dia: 'día', mes: 'mes' };

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const finDeHoy = () => { const d = new Date(); d.setHours(23, 59, 0, 0); return toLocalInput(d); };
const inicioHaceDias = (dias: number) => { const d = new Date(Date.now() - (dias - 1) * MS_POR_DIA); d.setHours(0, 0, 0, 0); return toLocalInput(d); };

/** Todos los periodos del rango, para que los tramos sin llamadas aparezcan en cero. */
function periodosDelRango(desde: string, hasta: string, g: Granularidad): string[] {
  const out: string[] = [];
  const fin = new Date(hasta);
  const cursor = new Date(desde);
  cursor.setSeconds(0, 0);
  if (g !== 'hora') cursor.setHours(0, 0, 0, 0);
  else cursor.setMinutes(0);
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

/** Limites (inicio del primero, fin del ultimo) de un tramo de periodos, para acercar la grafica. */
function rangoDePeriodos(periodos: string[], from: number, to: number, g: Granularidad): Rango {
  // Con hora explicita el navegador interpreta la fecha en hora local; sin ella la tomaria como UTC.
  const aLocal = (periodo: string) => new Date(periodo.includes(' ') ? periodo.replace(' ', 'T') : `${periodo}T00:00`);
  const inicio = aLocal(periodos[from]);
  const fin = aLocal(periodos[to]);
  if (g === 'hora') fin.setMinutes(59);
  else if (g === 'dia') fin.setHours(23, 59);
  else { fin.setMonth(fin.getMonth() + 1); fin.setDate(0); fin.setHours(23, 59); }
  return { desde: toLocalInput(inicio), hasta: toLocalInput(fin) };
}

interface Vista {
  periodos: string[];
  labels: string[];
  series: LineSeries[];
  barras: BarItem[];
  total: number;
  ok: number;
  rechazos: number;
}

/** Convierte la respuesta del API en series, barras y totales listos para dibujar. */
function construirVista(data: Estadisticas, desde: string, hasta: string): Vista {
  const periodos = periodosDelRango(desde, hasta, data.granularidad);
  const labels = periodos.map((p) => fmtPeriodo(p, data.granularidad));
  const dim = AGRUPACIONES.find((a) => a.id === data.agrupar) ?? AGRUPACIONES[0];
  const claveDe = (c: string | null) => c ?? 'null';
  const nombreDe = (r: { clave: string | null; etiqueta: string | null }) => {
    if (r.clave === null) return dim.vacio;
    return data.agrupar === 'proveedor' ? providerLabel(r.etiqueta ?? r.clave) : r.etiqueta ?? r.clave;
  };

  // Color por entidad: el orden lo fija el total en el rango; a partir del octavo se pliega en "Otros".
  const ranking = data.porGrupo.map((r) => claveDe(r.clave));
  const slot = new Map(ranking.map((k, i) => [k, Math.min(i, MAX_SERIES - 1)]));
  const nombre = new Map(data.porGrupo.map((r) => [claveDe(r.clave), nombreDe(r)]));
  const plegar = ranking.length > MAX_SERIES;
  const porProveedor = data.agrupar === 'proveedor';
  /* Al agrupar por proveedor cada serie usa su color de marca; en las demas dimensiones, la paleta categorica. */
  const colorDe = (k: string, idx: number) => (porProveedor && k !== 'null' ? providerColor(k) : seriesColor(idx));

  const seriesMap = new Map<string, LineSeries>();
  for (const row of data.serie) {
    const k = claveDe(row.clave);
    const idx = slot.get(k) ?? MAX_SERIES - 1;
    const esOtro = plegar && idx === MAX_SERIES - 1;
    const id = esOtro ? 'otros' : k;
    if (!seriesMap.has(id)) {
      seriesMap.set(id, {
        id,
        label: esOtro ? OTROS : nombre.get(k) ?? dim.vacio,
        color: esOtro ? seriesColor(idx) : colorDe(k, idx),
        values: new Array(periodos.length).fill(0),
      });
    }
    const pos = periodos.indexOf(row.periodo);
    if (pos >= 0) seriesMap.get(id)!.values[pos] += row.total;
  }
  const series = [...seriesMap.values()].sort((a, b) => (slot.get(a.id) ?? MAX_SERIES) - (slot.get(b.id) ?? MAX_SERIES));

  const barras: BarItem[] = data.porGrupo.map((r) => {
    const k = claveDe(r.clave);
    return {
      id: k,
      label: nombreDe(r),
      color: colorDe(k, slot.get(k) ?? MAX_SERIES - 1),
      value: r.total,
      detail: `${fmtNum.format(r.ok)} OK · ${fmtNum.format(r.total - r.ok)} rechazadas`,
      provider: porProveedor ? r.clave : undefined,
    };
  });

  const total = data.porGrupo.reduce((s, r) => s + r.total, 0);
  const ok = data.porGrupo.reduce((s, r) => s + r.ok, 0);
  return { periodos, labels, series, barras, total, ok, rechazos: total - ok };
}

const parseAgrupar = (raw: string | null): Agrupar =>
  raw === 'aplicacion' || raw === 'proveedor' || raw === 'modelo' ? raw : 'agente';

/** La pagina se envuelve en Suspense porque useSearchParams lo exige al prerenderizar. */
export default function EstadisticasPage() {
  return (
    <Suspense fallback={null}>
      <EstadisticasContent />
    </Suspense>
  );
}

function EstadisticasContent() {
  const searchParams = useSearchParams();
  const [preset, setPreset] = useState<string>('30');
  const [rango, setRango] = useState<Rango>({ desde: inicioHaceDias(30), hasta: finDeHoy() });
  const [zoomStack, setZoomStack] = useState<Rango[]>([]);
  const [agente, setAgente] = useState('');
  const [key, setKey] = useState('');
  const [soloOk, setSoloOk] = useState(false);
  const [agrupar, setAgrupar] = useState<Agrupar>(() => parseAgrupar(searchParams.get('agrupar')));
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
    const q = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta, agrupar });
    if (agente) q.set('agente', agente);
    if (key) q.set('key', key);
    if (soloOk) q.set('soloOk', '1');
    const r = await api<Estadisticas>(`/api/estadisticas?${q}`);
    setLoading(false);
    if (r.success && r.data) setData(r.data);
    else setError(r.error || 'No se pudieron cargar las estadísticas');
  }, [rango, agente, key, soloOk, agrupar]);

  useLoad(loadCatalogos);
  useLoad(load);

  const cambiarRango = (nuevo: Rango, presetId = '') => {
    setPreset(presetId);
    setZoomStack([]);
    setRango(nuevo);
  };

  const acercar = (from: number, to: number) => {
    if (!vista || !data) return;
    setZoomStack((s) => [...s, rango]);
    setPreset('');
    setRango(rangoDePeriodos(vista.periodos, from, to, data.granularidad));
  };

  const alejar = () => {
    const previo = zoomStack[zoomStack.length - 1];
    if (!previo) return;
    setZoomStack((s) => s.slice(0, -1));
    setRango(previo);
  };

  const dimension = AGRUPACIONES.find((a) => a.id === (data?.agrupar ?? agrupar)) ?? AGRUPACIONES[0];

  const vista = data ? construirVista(data, rango.desde, rango.hasta) : null;

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title"><BarChart3 size={26} /> Estadísticas</h1>
          <p className="page-sub">Llamadas al webservice y al proxy por periodo, agrupadas por agente, aplicación, proveedor o modelo.</p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}><RefreshCw size={16} /> Actualizar</button>
      </div>

      <div className="card toolbar">
        <div className="filters-row">
          <div className="form-group narrow">
            <label>Rango</label>
            <div className="presets">
              {PRESETS.map((p) => (
                <button key={p.id} className={preset === p.id ? 'active' : ''} onClick={() => cambiarRango({ desde: inicioHaceDias(p.dias), hasta: finDeHoy() }, p.id)}>{p.label}</button>
              ))}
            </div>
          </div>
          <div className="form-group narrow">
            <label>Desde</label>
            <input type="datetime-local" value={rango.desde} max={rango.hasta} onChange={(e) => cambiarRango({ ...rango, desde: e.target.value })} />
          </div>
          <div className="form-group narrow">
            <label>Hasta</label>
            <input type="datetime-local" value={rango.hasta} min={rango.desde} onChange={(e) => cambiarRango({ ...rango, hasta: e.target.value })} />
          </div>
          <div className="form-group narrow">
            <label>Agrupar por</label>
            <div className="presets">
              {AGRUPACIONES.map((a) => (
                <button key={a.id} className={agrupar === a.id ? 'active' : ''} onClick={() => setAgrupar(a.id)}>{a.label}</button>
              ))}
            </div>
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
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {vista && data && (
        <>
          <div className="stats-grid">
            <div className="card stat"><div><div className="stat-value">{fmtNum.format(vista.total)}</div><div className="stat-label">Llamadas en el rango</div></div></div>
            <div className="card stat"><div><div className="stat-value">{fmtNum.format(vista.ok)}</div><div className="stat-label">Aceptadas</div></div></div>
            <div className="card stat"><div><div className="stat-value">{fmtNum.format(vista.rechazos)}</div><div className="stat-label">Rechazadas</div></div></div>
            <div className="card stat"><div><div className="stat-value">{vista.barras.length}</div><div className="stat-label">{dimension.plural} con actividad</div></div></div>
          </div>

          <div className="charts-grid">
            <div className={`card chart-card ${loading ? 'loading' : ''}`}>
              <div className="chart-head">
                <div>
                  <div className="chart-title">Llamadas por {GRANULARIDAD_LABEL[data.granularidad]}</div>
                  <div className="chart-sub">
                    Una línea por {dimension.singular}{vista.series.length > MAX_SERIES - 1 ? ', los de menor volumen agrupados en "Otros"' : ''}. Arrastra sobre la gráfica para acercar.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {zoomStack.length > 0 && (
                    <button className="btn btn-ghost" onClick={alejar}><ZoomOut size={15} /> Alejar</button>
                  )}
                  <button className="btn btn-ghost" onClick={() => setVerTabla((v) => !v)}><Table2 size={15} /> {verTabla ? 'Ver gráfica' : 'Ver tabla'}</button>
                </div>
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
                  <LineChart labels={vista.labels} titles={vista.periodos} series={vista.series} onZoom={acercar} />
                  {vista.series.length > 1 && (
                    <div className="chart-legend">
                      {vista.series.map((s) => (
                        <span key={s.id} className="lg-item">
                          {data.agrupar === 'proveedor' && s.id !== 'otros' && s.id !== 'null'
                            ? <ProviderMark id={s.id} size={16} />
                            : <span className="lg-key" style={{ background: s.color }} />}
                          {s.label}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className={`card chart-card ${loading ? 'loading' : ''}`}>
              <div className="chart-head">
                <div>
                  <div className="chart-title">Llamadas por {dimension.singular}</div>
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
