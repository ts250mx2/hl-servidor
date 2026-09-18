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

/** Cada cuanto se pregunta por llamadas nuevas. */
const INTERVALO_MS = 3000;
/** Lineas que se conservan en pantalla; las mas viejas se descartan. */
const MAX_LINEAS = 200;
const CARGA_INICIAL = 40;

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
  if (r === 'CADUCADO' || r === 'AGENTE_INACTIVO' || r === 'LLAVE_INACTIVA' || r === 'PROVEEDOR_CAMBIADO') return 'warn';
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
  const [lineas, setLineas] = useState<Llamada[]>([]);
  const [pausado, setPausado] = useState(false);
  const [conectado, setConectado] = useState(true);
  const ultimoId = useRef(0);
  const cuerpoRef = useRef<HTMLDivElement>(null);
  const pausadoRef = useRef(false);
  useEffect(() => {
    pausadoRef.current = pausado;
  }, [pausado]);

  const traer = useCallback(async () => {
    const consulta = ultimoId.current ? `/api/bitacora?despues=${ultimoId.current}&limit=100` : `/api/bitacora?limit=${CARGA_INICIAL}`;
    const r = await api<Llamada[]>(consulta);
    if (!r.success || !r.data) { setConectado(false); return; }
    setConectado(true);
    // La carga inicial llega de la mas reciente a la mas antigua; la consola va al reves, como tail -f.
    const nuevas = ultimoId.current ? r.data : [...r.data].reverse();
    if (nuevas.length === 0) return;
    ultimoId.current = Math.max(ultimoId.current, ...nuevas.map((n) => n.IdBitacora));
    if (pausadoRef.current) return;
    setLineas((prev) => [...prev, ...nuevas].slice(-MAX_LINEAS));
  }, []);

  useEffect(() => {
    void traer();
    const id = setInterval(() => void traer(), INTERVALO_MS);
    return () => clearInterval(id);
  }, [traer]);

  // Siempre al final, como una terminal; si el usuario se desplazo hacia arriba, no se le mueve.
  useEffect(() => {
    const el = cuerpoRef.current;
    if (!el) return;
    const cerca = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (cerca) el.scrollTop = el.scrollHeight;
  }, [lineas]);

  return (
    <div className="console" role="log" aria-live="polite" aria-label="Bitácora en vivo">
      <div className="console-bar">
        <span className="console-dots"><i /><i /><i /></span>
        <span className="console-title">hl-console — bitácora en vivo</span>
        <span className={`console-status ${conectado ? (pausado ? 'paused' : 'live') : 'off'}`}>
          {conectado ? (pausado ? 'pausado' : 'en vivo') : 'sin conexión'}
        </span>
        <button type="button" className="console-btn" onClick={() => setPausado((p) => !p)} title={pausado ? 'Reanudar' : 'Pausar'} aria-label={pausado ? 'Reanudar' : 'Pausar'}>
          {pausado ? <Play size={13} /> : <Pause size={13} />}
        </button>
      </div>
      <div className="console-body" ref={cuerpoRef}>
        {lineas.length === 0 && <div className="console-line muted">$ tail -f bitacora.log<br />esperando llamadas…</div>}
        {lineas.map((l) => (
          <div key={l.IdBitacora} className={`console-line ${claseResultado(l.Resultado)}`}>
            <span className="c-time">{hora(l.Fecha)}</span>
            <span className="c-prov">{l.Proveedor ? <ProviderMark id={l.Proveedor} size={14} /> : <span className="c-noprov">·</span>}</span>
            <span className="c-app">{l.Aplicacion ?? l.IP}</span>
            {l.Agente && <span className="c-agent">› {l.Agente}</span>}
            <span className="c-path">{resumenDetalle(l)}</span>
            <span className="c-result">{l.Resultado}</span>
            {l.Modelo && <span className="c-model">{providerShort(l.Proveedor)}/{l.Modelo}</span>}
            {metricas(l) && <span className="c-metrics">{metricas(l)}</span>}
            {l.Resultado !== 'OK' && l.Detalle && !l.Detalle.startsWith('App:') && <span className="c-detail">{l.Detalle}</span>}
          </div>
        ))}
        <div className="console-line"><span className="c-prompt">hl&gt;</span><span className="console-cursor" /></div>
      </div>
    </div>
  );
}
