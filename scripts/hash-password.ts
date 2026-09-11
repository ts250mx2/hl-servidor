/**
 * Genera un hash bcrypt para pegarlo en SQL.
 * Uso:  npm run hash -- MiContrasena
 */
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;
const password = process.argv[2];

if (!password) {
  console.error('Uso: npm run hash -- <contrasena>');
  process.exit(1);
}

console.log(bcrypt.hashSync(password, BCRYPT_ROUNDS));
