// Lee db.sql y lo ejecuta sobre PostgreSQL (DATABASE_URL), luego crea usuarios demo.
// Uso: npm run seed
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, consulta } from './db.js';
import { hashPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(__dirname, 'db.sql'), 'utf-8');

try {
  await consulta(sql);

  const insertarUsuario =
    'INSERT INTO usuarios (nombre, email, password, rol) VALUES ($1, $2, $3, $4)';
  await consulta(insertarUsuario, ['Cliente Demo', 'cliente@demo.com', hashPassword('demo1234'), 'CLIENTE']);
  await consulta(insertarUsuario, ['Admin Demo', 'admin@demo.com', hashPassword('admin1234'), 'ADMIN']);

  console.log('Base de datos PostgreSQL creada y poblada.');
  console.log('Contrasenas demo almacenadas con scrypt.');
} catch (err) {
  console.error('Error al ejecutar el seed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
