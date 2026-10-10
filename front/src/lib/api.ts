const URL_API = import.meta.env.PUBLIC_API_URL;

export function urlImagen(imagen: string | null | undefined): string | null {
  if (!imagen) return null;
  return new URL(imagen, new URL(URL_API).origin).toString();
}

export interface UsuarioSesion {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}

export function obtenerToken(): string | null {
  return localStorage.getItem('token');
}

export function obtenerUsuario(): UsuarioSesion | null {
  try {
    return JSON.parse(localStorage.getItem('usuario') || 'null');
  } catch {
    return null;
  }
}

export function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
}

export function redirigirALogin() {
  const destino = window.location.pathname + window.location.search;
  window.location.href = `/login?next=${encodeURIComponent(destino)}`;
}

export function limpiarMensajeError(mensaje: string): string {
  return mensaje.replace(/^[A-Z_]+:\s*/, '');
}

export function escaparHtml(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function consultarApi<T = any>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const token = obtenerToken();
  const respuesta = await fetch(URL_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const resultado = await respuesta.json();

  if (resultado.errors?.length) {
    const mensaje: string = resultado.errors[0].message;
    if (mensaje.startsWith('AUTH_REQUIRED')) {
      cerrarSesion();
      redirigirALogin();
    }
    throw new Error(limpiarMensajeError(mensaje));
  }

  return resultado.data as T;
}
