'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLoad } from '@/lib/hooks';
import { History, RefreshCw } from 'lucide-react';
import SearchBar, { SinCoincidencias } from '@/components/SearchBar';
import { coincideTexto } from '@/lib/buscar';
import { api, fmtDate } from '@/lib/client';

interface Cambio { antes: string | number | boolean | null; despues: string | number | boolean | null }

interface AuditRow {
  IdAuditoria: number;
  Fecha: string;
  IdUsuario: number | null;
  Usuario: string;
  IP: string;
  Accion: string;
  Entidad: string;
  IdEntidad: number | null;
  Nombre: string;
  /* MySQL entrega el JSON ya parseado o como texto segun el driver; se aceptan ambos. */
  Cambios: Record<string, Cambio> | string | null;
  Detalle: string | null;
}

const LIMITS = [100, 250, 500];

const ENTIDAD: Record<string, string> = { llave: 'Llave de API', agente: 'Agente', key: 'Key de acceso', ip: 'IP permitida', usuario: 'Usuario', sesion: 'Sesión', precio: 'Precio' };
const ACCION: Record<string, { texto: string; clase: string }> = {
  CREAR: { texto: 'Creó', clase: 'badge-ok' },
  EDITAR: { texto: 'Editó', clase: 'badge-info' },
  ELIMINAR: { texto: 'Eliminó', clase: 'badge-danger' },
  REGENERAR: { texto: 'Regeneró', clase: 'badge-warn' },
  LOGIN: { texto: 'Entró', clase: 'badge-off' },
  LOGIN_FALLIDO: { texto: 'Login fallido', clase: 'badge-danger' },
};
const CAMPO: Record<string, string> = {
  Llave: 'Nombre', Proveedor: 'Proveedor', Modelo: 'Modelo', FechaCaducidad: 'Caducidad', Status: 'Estado',
  Agente: 'Nombre', IdLlave: 'Llave', LlaveNombre: 'Llave', LlaveRespaldo: 'Llave de respaldo',
  Nombre: 'Nombre', IP: 'IP', Descripcion: 'Descripción', Usuario: 'Nombre', Login: 'Login',
  Entrada: 'Entrada USD/M', Salida: 'Salida USD/M', CacheLectura: 'Caché lectura', CacheEscritura: 'Caché escritura', Nota: 'Nota',
};

function parseCambios(raw: AuditRow['Cambios']): Record<string, Cambio> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, Cambio>; } catch { return {}; }
  }
  return raw;
}

const valor = (v: Cambio['antes']) => {
  if (v === null || v === undefined || v === '') return '—';
  if (v === 1 || v === true) return 'activo';
  if (v === 0 || v === false) return 'inactivo';
  return String(v);
};

function textoCambios(cambios: Record<string, Cambio>): string {
  return Object.entries(cambios).map(([campo, c]) => `${CAMPO[campo] ?? campo} ${valor(c.antes)} ${valor(c.despues)}`).join(' ');
}

const coincide = (r: AuditRow, consulta: string) =>
  coincideTexto(consulta, [r.Usuario, r.IP, r.Accion, ACCION[r.Accion]?.texto, r.Entidad, ENTIDAD[r.Entidad], r.Nombre, r.Detalle, textoCambios(parseCambios(r.Cambios))]);

export default function AuditoriaPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [limit, setLimit] = useState(LIMITS[0]);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<AuditRow[]>(`/api/auditoria?limit=${limit}`);
    setLoading(false);
    if (r.success && r.data) setItems(r.data); else setError(r.error || 'No se pudo cargar la auditoría');
  }, [limit]);

  useLoad(load);

  const visibles = useMemo(() => items.filter((r) => coincide(r, busqueda)), [items, busqueda]);

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title"><History size={26} /> Auditoría del portal</h1>
          <p className="page-sub">Quién creó, editó o eliminó llaves, agentes, keys, IPs y usuarios, y qué cambió. Los secretos nunca se registran.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ width: 'auto' }}>
            {LIMITS.map((l) => <option key={l} value={l}>Últimos {l}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={load} disabled={loading}><RefreshCw size={16} /> Actualizar</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <SearchBar
        value={busqueda}
        onChange={setBusqueda}
        placeholder="Usuario, acción, tipo, nombre, IP o valor cambiado (ej. gpt-5.6-sol)"
        total={items.length}
        visibles={visibles.length}
        nombre={['registro', 'registros']}
      />

      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Qué</th><th>Cambios</th><th>IP</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} className="empty">Aún no hay registros. Se llenan con cada cambio hecho desde el portal.</td></tr>}
            {items.length > 0 && visibles.length === 0 && <SinCoincidencias consulta={busqueda} columnas={6} />}
            {visibles.map((r) => {
              const accion = ACCION[r.Accion] ?? { texto: r.Accion, clase: 'badge-off' };
              const cambios = Object.entries(parseCambios(r.Cambios));
              return (
                <tr key={r.IdAuditoria}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.Fecha)}</td>
                  <td><strong>{r.Usuario}</strong></td>
                  <td><span className={`badge ${accion.clase}`}>{accion.texto}</span></td>
                  <td>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{ENTIDAD[r.Entidad] ?? r.Entidad}</div>
                    <div>{r.Nombre}</div>
                  </td>
                  <td>
                    {cambios.length === 0 && !r.Detalle && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    {cambios.length > 0 && (
                      <ul className="audit-cambios">
                        {cambios.map(([campo, c]) => (
                          <li key={campo}>
                            <span className="audit-campo">{CAMPO[campo] ?? campo}</span>
                            {r.Accion === 'EDITAR' && <><span className="audit-antes">{valor(c.antes)}</span><span className="audit-flecha">›</span></>}
                            <span className="audit-despues">{valor(r.Accion === 'ELIMINAR' ? c.antes : c.despues)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.Detalle && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.Detalle}</div>}
                  </td>
                  <td className="mono">{r.IP}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
