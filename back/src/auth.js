import crypto from 'crypto';
import { fila } from './db.js';

const TOKEN_SECRET = process.env.AUTH_SECRET || 'detalles-regalos-dev-secret-cambiar-en-produccion';
const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 8);

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(value).digest('base64url');
}

export function crearToken(usuario) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: String(usuario.id),
    email: usuario.email,
    rol: usuario.rol,
    nombre: usuario.nombre,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  }));
  const body = `${header}.${payload}`;
  return `${body}.${sign(body)}`;
}

export function verificarToken(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const body = `${header}.${payload}`;
  const expected = sign(body);

  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!decoded.exp || decoded.exp <= now) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function tokenDesdeAuthorization(headerValue = '') {
  const match = String(headerValue).match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function usuarioDesdeRequest(req) {
  const token = tokenDesdeAuthorization(req?.headers?.authorization || '');
  const payload = verificarToken(token);
  if (!payload?.sub) return null;

  const id = Number(payload.sub);
  if (!Number.isInteger(id)) return null;

  return fila('SELECT id, nombre, email, rol FROM usuarios WHERE id = $1', [id]);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verificarPassword(password, storedPassword) {
  const stored = String(storedPassword || '');

  // Compatibilidad con el avance anterior: si todavía está en texto plano,
  // permite iniciar sesión y el resolver lo actualiza a scrypt automáticamente.
  if (!stored.startsWith('scrypt$')) {
    const actual = Buffer.from(String(password));
    const expected = Buffer.from(stored);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  const [, salt, expectedHex] = stored.split('$');
  if (!salt || !expectedHex) return false;

  const actual = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function requireUser(context) {
  if (!context?.user) {
    throw new Error('AUTH_REQUIRED: Debes iniciar sesión para continuar');
  }
  return context.user;
}

export function requireAdmin(context) {
  const user = requireUser(context);
  if (user.rol !== 'ADMIN') {
    throw new Error('FORBIDDEN: Esta acción requiere permisos de administrador');
  }
  return user;
}
