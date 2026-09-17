import pool from '@/lib/db';
import { cleanText, fail, ok, parseStatus, withAuth } from '@/lib/api';
import { isValidIp, normalizeIp } from '@/lib/ip';
import { registrarAuditoria } from '@/lib/auditoria';

export async function GET() {
  return withAuth(async () => {
    const [rows] = await pool.query(
      'SELECT IdIP, IP, Descripcion, Status, FechaAlta FROM tblIPsPermitidas ORDER BY IdIP'
    );
    return ok(rows);
  });
}

export async function POST(request: Request) {
  return withAuth(async (user) => {
    const body = await request.json().catch(() => ({}));
    const ip = normalizeIp(cleanText(body.IP, 45));
    const descripcion = cleanText(body.Descripcion, 100);
    if (!isValidIp(ip)) return fail('IP invalida');

    const [existing] = await pool.query('SELECT 1 FROM tblIPsPermitidas WHERE IP = ?', [ip]);
    if ((existing as unknown[]).length > 0) return fail('Esa IP ya esta registrada', 409);

    const [result] = await pool.query(
      'INSERT INTO tblIPsPermitidas (IP, Descripcion, Status) VALUES (?, ?, ?)',
      [ip, descripcion || null, parseStatus(body.Status)]
    );
    const insertId = (result as { insertId: number }).insertId;
    await registrarAuditoria({ user, request, accion: 'CREAR', entidad: 'ip', idEntidad: insertId, nombre: ip, despues: { IP: ip, Descripcion: descripcion || null, Status: parseStatus(body.Status) } });
    return ok({ IdIP: insertId }, 201);
  });
}
