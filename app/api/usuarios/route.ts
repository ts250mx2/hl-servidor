import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { cleanText, fail, ok, parseStatus, withAuth } from '@/lib/api';

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

export async function GET() {
  return withAuth(async () => {
    const [rows] = await pool.query(
      'SELECT IdUsuario, Usuario, Login, Status, FechaAlta FROM tblUsuarios ORDER BY Usuario'
    );
    return ok(rows);
  });
}

export async function POST(request: Request) {
  return withAuth(async () => {
    const body = await request.json().catch(() => ({}));
    const usuario = cleanText(body.Usuario, 80);
    const login = cleanText(body.Login, 45);
    const password = String(body.Password ?? '');
    if (!usuario || !login || !password) return fail('Usuario, Login y Password son requeridos');
    if (password.length < MIN_PASSWORD_LENGTH) return fail(`La contrasena debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);

    const [existing] = await pool.query('SELECT 1 FROM tblUsuarios WHERE Login = ?', [login]);
    if ((existing as unknown[]).length > 0) return fail('Ese login ya existe', 409);

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [result] = await pool.query(
      'INSERT INTO tblUsuarios (Usuario, Login, Password, Status) VALUES (?, ?, ?, ?)',
      [usuario, login, hash, parseStatus(body.Status)]
    );
    const insertId = (result as { insertId: number }).insertId;
    return ok({ IdUsuario: insertId }, 201);
  });
}
