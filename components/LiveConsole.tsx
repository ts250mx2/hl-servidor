'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import ProviderMark from '@/components/ProviderMark';
import { fmtMs, fmtNum, fmtUsd } from '@/components/charts/chartUtils';
import { api } from '@/lib/client';
import { providerShort } from '@/lib/providers';

interface Llamada {
  IdBitacora: number;
  Fecha: string;
  IP: string;
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

/** Llamada ya en pantalla; `enCurso` se decide al recibirla, no al dibujarla. */
type Linea = Llamada & { enCurso: boolean };

/** Aceptada por el proxy pero sin duracion todavia: la respuesta del proveedor no ha terminado. */
const estaEnCurso = (l: Llamada, ahora: number): boolean =>
  l.Resultado === 'OK' && l.DuracionMs === null && /proxy /.test(l.Detalle ?? '') && ahora - new Date(l.Fecha).getTime() < MAX_EN_CURSO_MS;

/** Cada cuanto se pregunta por llamadas nuevas. */
const INTERVALO_MS = 3000;
/** Lineas que se conservan en pantalla; las mas viejas se descartan. */
const MAX_LINEAS = 200;
const CARGA_INICIAL = 40;
/** Mas alla de esto una llamada sin duracion ya no se considera en curso (bitacoras de versiones sin medicion). */
const MAX_EN_CURSO_MS = 10 * 60_000;

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/** "proxy POST /v1/messages · 200 · respaldo "X"" -> lo esencial para una linea de consola. */
function resumenDetalle(l: Llamada): string {
  const d = l.Detalle ?? '';
  const proxy = d.match(/proxy (\w+ \/\S+)/);
  if (proxy) return proxy[1];
  if (d.startsWith('App:')) return 'GET /api/ws/llave';
  return d.slice(0, 60);
}

function claseResultado(r: string): string {
  if (r === 'OK') return 'ok';
  if (r === 'CADUCADO' || r === 'AGENTE_INACTIVO' || r === 'LLAVE_INACTIVA' || r === 'PROVEEDOR_CAMBIADO' || r === 'PRESUPUESTO') return 'warn';
  return 'bad';
}

function metricas(l: Llamada): string {
  const partes: string[] = [];
  if (l.DuracionMs !== null) partes.push(fmtMs(l.DuracionMs));
  if (l.TokensSalida !== null) partes.push(`${fmtNum.format((l.TokensEntrada ?? 0) + l.TokensSalida + (l.TokensCacheLectura ?? 0) + (l.TokensCacheEscritura ?? 0))} tok`);
  if (l.CostoUsd !== null) partes.push(fmtUsd(Number(l.CostoUsd)));
  return partes.join(' · ');
}

/** Bitacora en vivo estilo terminal: las llamadas al webservice y al proxy conforme llegan. */
export default function LiveConsole() {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [pausado, setPausado] = useState(false);
  const [conectado, setConectado] = useState(true);
  const ultimoId = useRef(0);
  const cuerpoRef = useRef<HTMLDivElement>(null);
  const pausadoRef = useRef(false);
  useEffect(() => {
    pausadoRef.current = pausado;
  }, [pausado]);

  /* Llamadas ya mostradas cuya respuesta seguia en curso: se vuelven a pedir hasta que traigan duracion. */
  const pendientes = useRef<number[]>([]);

  const traer = useCallback(async () => {
    const ids = pendientes.current;
    const consulta = ultimoId.current
      ? `/api/bitacora?despues=${ultimoId.current}&limit=100${ids.length ? `&pendientes=${ids.join(',')}` : ''}`
      : `/api/bitacora?limit=${CARGA_INICIAL}`;
    const r = await api<Llamada[]>(consulta);
    if (!r.success || !r.data) { setConectado(false); return; }
    setConectado(true);
    // La carga inicial llega de la mas reciente a la mas antigua; la consola va al reves, como tail -f.
    const ahora = Date.now();
    const recibidas: Linea[] = (ultimoId.current ? r.data : [...r.data].reverse()).map((l) => ({ ...l, enCurso: estaEnCurso(l, ahora) }));
    if (recibidas.length === 0) return;
    const tope = ultimoId.current;
    const nuevas = recibidas.filter((l) => l.IdBitacora > tope);
    const actualizadas = recibidas.filter((l) => l.IdBitacora <= tope);
    ultimoId.current = Math.max(tope, ...recibidas.map((n) => n.IdBitacora));
    if (pausadoRef.current) return;
    setLineas((prev) => {
      const porId = new Map(actualizadas.map((l) => [l.IdBitacora, l]));
      const refrescadas = prev.map((l) => porId.get(l.IdBitacora) ?? l);
      return [...refrescadas, ...nuevas].slice(-MAX_LINEAS);
    });
    // Sigue pendiente lo que fue aceptado pero aun no tiene duracion (la respuesta del proveedor no ha terminado).
    pendientes.current = [...ids.filter((id) => actualizadas.find((a) => a.IdBitacora === id)?.enCurso ?? false), ...nuevas.filter((l) => l.enCurso).map((l) => l.IdBitacora)].slice(-50);
  }, []);

  useEffect(() => {
    void traer();
    const id = setInterval(() => void traer(), INTERVALO_MS);
    return () => clearInterval(id);
  }, [traer]);

  // Siempre al final, como una terminal: la ultima llamada queda a la vista. Para leer con calma esta el boton de pausa.
  useEffect(() => {
    const el = cuerpoRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lineas]);

  return (
    <div className="console" role="log" aria-live="polite" aria-label="Bitácora en vivo">
      <div className="console-bar">
        <span className="console-title"><span className="c-prompt">root@hl-console</span>:<span className="c-path">~</span>$ tail -f bitacora.log</span>
        <span className={`console-status ${conectado ? (pausado ? 'paused' : 'live') : 'off'}`}>
          {conectado ? (pausado ? 'pausado' : 'en vivo') : 'sin conexión'}
        </span>
        <button type="button" className="console-btn" onClick={() => setPausado((p) => !p)} title={pausado ? 'Reanudar' : 'Pausar'} aria-label={pausado ? 'Reanudar' : 'Pausar'}>
          {pausado ? <Play size={13} /> : <Pause size={13} />}
        </button>
      </div>
      <div className="console-body" ref={cuerpoRef}>
        {lineas.length === 0 && <div className="console-line muted">esperando llamadas…</div>}
        {lineas.map((l) => (
          <div key={l.IdBitacora} className={`console-line ${claseResultado(l.Resultado)}`}>
            <span className="c-time">{hora(l.Fecha)}</span>
            <span className="c-prov">{l.Proveedor ? <ProviderMark id={l.Proveedor} size={14} /> : <span className="c-noprov">·</span>}</span>
            <span className="c-app">{l.Aplicacion ?? l.IP}</span>
            {l.Agente && <span className="c-agent">› {l.Agente}</span>}
            <span className="c-path">{resumenDetalle(l)}</span>
            <span className="c-result">{l.Resultado}</span>
            {l.Modelo && <span className="c-model">{providerShort(l.Proveedor)}/{l.Modelo}</span>}
            {metricas(l) ? <span className="c-metrics">{metricas(l)}</span> : (l.enCurso && <span className="c-pending">en curso…</span>)}
            {l.Resultado !== 'OK' && l.Detalle && !l.Detalle.startsWith('App:') && <span className="c-detail">{l.Detalle}</span>}
          </div>
        ))}
        <div className="console-line"><span className="c-prompt">hl&gt;</span><span className="console-cursor" /></div>
      </div>
    </div>
  );
}
