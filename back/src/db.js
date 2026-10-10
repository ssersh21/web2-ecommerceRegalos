import pg from 'pg';

// NUMERIC y BIGINT llegan como string por defecto; los convierte a number.
pg.types.setTypeParser(1700, parseFloat);
pg.types.setTypeParser(20, (v) => parseInt(v, 10));
// DATE se queda como 'YYYY-MM-DD' (sin conversion a Date por zona horaria).
pg.types.setTypeParser(1082, (v) => v);

const cadenaConexion =
  process.env.DATABASE_URL || 'postgresql://tienda:tienda@localhost:5432/tienda';

export const pool = new pg.Pool({ connectionString: cadenaConexion });

pool.on('error', (err) => console.error('Error en el pool de Postgres:', err.message));

export const consulta = (texto, params = []) => pool.query(texto, params);
export const filas = async (texto, params) => (await consulta(texto, params)).rows;
export const fila = async (texto, params) => (await consulta(texto, params)).rows[0] ?? null;

// Ejecuta fn(cliente) dentro de una transaccion.
export async function transaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}
