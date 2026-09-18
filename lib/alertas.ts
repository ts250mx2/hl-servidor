import nodemailer from 'nodemailer';
import pool from './db';

/**
 * Alertas de HL Console: se guardan en tblAlertas (se ven en el portal, con campana en la
 * cabecera) y, si hay canal configurado en el .env, se envian:
 *   ALERTAS_WEBHOOK_URL   POST JSON { tipo, nivel, titulo, detalle, fecha, origen }
 *   ALERTAS_SMTP_HOST / ALERTAS_SMTP_PORT / ALERTAS_SMTP_USER / ALERTAS_SMTP_PASS
 *   ALERTAS_CORREO_DE / ALERTAS_CORREO_A (varios separados por coma)
 *   ALERTAS_GASTO_DIARIO_USD  umbral de gasto total por dia para avisar
 * Un mismo aviso (misma Clave) no se repite en 24 horas.
 */

export type TipoAlerta =
  | 'LLAVE_CADUCADA'
  | 'LLAVE_POR_CADUCAR'
  | 'PROVEEDOR_RECHAZA'
  | 'RESPALDO_USADO'
  | 'PRESUPUESTO'
  | 'GASTO_DIARIO'
  | 'ACCESO_NO_PERMITIDO';

export type NivelAlerta = 'info' | 'warn' | 'bad';

export interface NuevaAlerta {
  tipo: TipoAlerta;
  nivel: NivelAlerta;
  titulo: string;
  detalle?: string | null;
  /** Identidad del aviso para no repetirlo en 24 h (ej. "caducada:12:2026-09-18"). */
  clave: string;
}

export interface Alerta {
  IdAlerta: number;
  Fecha: Date | string;
  Tipo: TipoAlerta;
  Nivel: NivelAlerta;
  Titulo: string;
  Detalle: string | null;
  Clave: string;
  Leida: number;
  Enviada: number;
  Canal: string | null;
}

const VENTANA_REPETICION_H = 24;
const DIAS_AVISO_CADUCIDAD = 15;
const WEBHOOK_TIMEOUT_MS = 10_000;
const MAX_TITULO = 160;
const MAX_DETALLE = 500;
/** Cada cuanto se vuelve a sumar el gasto del dia para el aviso de umbral. */
const INTERVALO_GASTO_MS = 5 * 60_000;

/** "2026-09-18" en hora local del servidor, para claves de avisos diarios. */
export const hoyClave = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Medianoche local: desde ahi se cuenta "el dia" para presupuestos y gasto. */
export function inicioDelDia(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── envio ──────────────────────────────────────────────────────────────

async function enviarWebhook(a: NuevaAlerta): Promise<string | null> {
  const url = (process.env.ALERTAS_WEBHOOK_URL || '').trim();
  if (!url) return null;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origen: 'HL Console', tipo: a.tipo, nivel: a.nivel, titulo: a.titulo, detalle: a.detalle ?? null, fecha: new Date().toISOString() }),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`webhook ${res.status}`);
  return 'webhook';
}

async function enviarCorreo(a: NuevaAlerta): Promise<string | null> {
  const host = (process.env.ALERTAS_SMTP_HOST || '').trim();
  const para = (process.env.ALERTAS_CORREO_A || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!host || para.length === 0) return null;
  const port = parseInt(process.env.ALERTAS_SMTP_PORT || '587', 10);
  const user = process.env.ALERTAS_SMTP_USER || '';
  const transporte = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass: process.env.ALERTAS_SMTP_PASS || '' } : undefined,
  });
  const nivel = a.nivel === 'bad' ? 'ALERTA' : a.nivel === 'warn' ? 'Aviso' : 'Info';
  await transporte.sendMail({
    from: process.env.ALERTAS_CORREO_DE || user,
    to: para.join(', '),
    subject: `[HL Console] ${nivel}: ${a.titulo}`,
    text: `${a.titulo}\n\n${a.detalle ?? ''}\n\nTipo: ${a.tipo}\nFecha: ${new Date().toLocaleString('es-MX')}\n\nHL Console`,
  });
  return 'correo';
}

/** Intenta todos los canales configurados; regresa por cuales salio y los errores. */
async function notificar(a: NuevaAlerta): Promise<{ enviada: boolean; canal: string | null }> {
  const resultados = await Promise.allSettled([enviarWebhook(a), enviarCorreo(a)]);
  const canales: string[] = [];
  const errores: string[] = [];
  for (const r of resultados) {
    if (r.status === 'fulfilled') {
      if (r.value) canales.push(r.value);
    } else {
      errores.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }
  if (errores.length) console.error('Alerta: fallo el envio:', errores.join(' | '));
  const canal = [...canales, ...errores.map((e) => `error: ${e}`)].join(', ').slice(0, 60) || null;
  return { enviada: canales.length > 0, canal };
}

// ── registro ───────────────────────────────────────────────────────────

/**
 * Guarda la alerta (si no hay una igual en las ultimas 24 h) y la envia por los canales
 * configurados cuando es warn o bad. Nunca sube: una alerta no debe tirar una llamada.
 */
export async function registrarAlerta(a: NuevaAlerta): Promise<boolean> {
  try {
    const [previas] = await pool.query(
      'SELECT 1 FROM tblAlertas WHERE Clave = ? AND Fecha >= DATE_SUB(NOW(), INTERVAL ? HOUR) LIMIT 1',
      [a.clave.slice(0, 120), VENTANA_REPETICION_H]
    );
    if ((previas as unknown[]).length > 0) return false;

    const envio = a.nivel === 'info' ? { enviada: false, canal: null } : await notificar(a);
    await pool.query(
      'INSERT INTO tblAlertas (Tipo, Nivel, Titulo, Detalle, Clave, Enviada, Canal) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [a.tipo, a.nivel, a.titulo.slice(0, MAX_TITULO), a.detalle ? a.detalle.slice(0, MAX_DETALLE) : null, a.clave.slice(0, 120), envio.enviada ? 1 : 0, envio.canal]
    );
    return true;
  } catch (error) {
    console.error('No se pudo registrar la alerta:', error);
    return false;
  }
}

// ── revisiones programadas (llaves) ────────────────────────────────────

interface LlaveCaducidad { IdLlave: number; Llave: string; FechaCaducidad: Date; Agentes: number }

/**
 * Revisa las llaves caducadas o por caducar. La llama el script `npm run alertas:revisar`
 * (programalo a diario) y el boton "Revisar ahora" del portal.
 */
export async function revisarAlertasProgramadas(): Promise<{ caducadas: number; porCaducar: number }> {
  const [caducadas] = await pool.query(
    `SELECT l.IdLlave, l.Llave, l.FechaCaducidad, (SELECT COUNT(*) FROM tblAgentes a WHERE a.IdLlave = l.IdLlave AND a.Status = 1) AS Agentes
     FROM tblLlaves l WHERE l.Status = 1 AND l.FechaCaducidad IS NOT NULL AND l.FechaCaducidad < NOW()`
  );
  const [porCaducar] = await pool.query(
    `SELECT l.IdLlave, l.Llave, l.FechaCaducidad, (SELECT COUNT(*) FROM tblAgentes a WHERE a.IdLlave = l.IdLlave AND a.Status = 1) AS Agentes
     FROM tblLlaves l WHERE l.Status = 1 AND l.FechaCaducidad IS NOT NULL AND l.FechaCaducidad >= NOW() AND l.FechaCaducidad < DATE_ADD(NOW(), INTERVAL ? DAY)`,
    [DIAS_AVISO_CADUCIDAD]
  );
  const hoy = hoyClave();
  let nCaducadas = 0;
  for (const l of caducadas as LlaveCaducidad[]) {
    if (await registrarAlerta({
      tipo: 'LLAVE_CADUCADA', nivel: 'bad', clave: `caducada:${l.IdLlave}:${hoy}`,
      titulo: `La llave "${l.Llave}" ya caducó`,
      detalle: `Caducó el ${new Date(l.FechaCaducidad).toLocaleString('es-MX')}. ${l.Agentes} agente(s) activo(s) la usan y ya no reciben llave. Actualízala o reasigna los agentes.`,
    })) nCaducadas++;
  }
  let nPorCaducar = 0;
  for (const l of porCaducar as LlaveCaducidad[]) {
    const dias = Math.ceil((new Date(l.FechaCaducidad).getTime() - Date.now()) / 86_400_000);
    if (await registrarAlerta({
      tipo: 'LLAVE_POR_CADUCAR', nivel: 'warn', clave: `porcaducar:${l.IdLlave}:${hoy}`,
      titulo: `La llave "${l.Llave}" caduca en ${dias} día(s)`,
      detalle: `Caduca el ${new Date(l.FechaCaducidad).toLocaleString('es-MX')}. ${l.Agentes} agente(s) activo(s) la usan.`,
    })) nPorCaducar++;
  }
  return { caducadas: nCaducadas, porCaducar: nPorCaducar };
}

// ── gasto diario total ─────────────────────────────────────────────────

let ultimaRevisionGasto = 0;

/** Si ALERTAS_GASTO_DIARIO_USD esta definido, avisa una vez al dia cuando el gasto total lo rebasa. */
export async function revisarGastoDiario(): Promise<void> {
  const umbral = Number(process.env.ALERTAS_GASTO_DIARIO_USD);
  if (!Number.isFinite(umbral) || umbral <= 0) return;
  if (Date.now() - ultimaRevisionGasto < INTERVALO_GASTO_MS) return;
  ultimaRevisionGasto = Date.now();
  try {
    const [rows] = await pool.query('SELECT IFNULL(SUM(CostoUsd), 0) AS gasto FROM tblBitacora WHERE Fecha >= ?', [inicioDelDia()]);
    const gasto = Number((rows as { gasto: unknown }[])[0]?.gasto ?? 0);
    if (gasto < umbral) return;
    await registrarAlerta({
      tipo: 'GASTO_DIARIO', nivel: 'warn', clave: `gasto:${hoyClave()}`,
      titulo: `El gasto de hoy ya va en $${gasto.toFixed(2)} USD (umbral $${umbral.toFixed(2)})`,
      detalle: 'Suma del gasto estimado de todas las llamadas del día. Revisa Estadísticas agrupando por aplicación o agente.',
    });
  } catch (error) {
    console.error('No se pudo revisar el gasto diario:', error);
  }
}

// ── consulta para el portal ────────────────────────────────────────────

export async function contarNoLeidas(): Promise<number> {
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM tblAlertas WHERE Leida = 0');
  return Number((rows as { n: number }[])[0]?.n ?? 0);
}
