/**
 * Cliente HTTP de la API del SGSM-RC. Sigue la convención de docs/api.md: las respuestas
 * exitosas traen `data` (y `meta` en los listados) y los errores `{ error: { codigo, mensaje } }`.
 * La sesión viaja en una cookie httpOnly que el navegador envía solo; acá nunca se lee el token.
 */

export class ErrorApi extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalles?: unknown,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

export interface MetaPaginacion {
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
}

export interface Lista<T> {
  data: T[];
  meta: MetaPaginacion;
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Query = Record<string, string | number | boolean | undefined | null>;

let manejadorSesionVencida: ((mensaje: string) => void) | null = null;

/** Registra quién se entera cuando el backend responde que la sesión ya no es válida. */
export function alExpirarSesion(manejador: ((mensaje: string) => void) | null) {
  manejadorSesionVencida = manejador;
}

function armarUrl(ruta: string, query?: Query) {
  const url = new URL(ruta, window.location.origin);
  for (const [clave, valor] of Object.entries(query ?? {})) {
    if (valor !== undefined && valor !== null && valor !== '') {
      url.searchParams.set(clave, String(valor));
    }
  }
  return url;
}

async function pedir(metodo: Metodo, ruta: string, cuerpo?: unknown, query?: Query) {
  let respuesta: Response;
  try {
    respuesta = await fetch(armarUrl(ruta, query), {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? null : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(
      0,
      'SIN_CONEXION',
      'No hay conexión con el servidor. Revise el Wi-Fi e intente de nuevo.',
    );
  }

  const json = (await respuesta.json().catch(() => ({}))) as {
    data?: unknown;
    meta?: MetaPaginacion;
    error?: { codigo: string; mensaje: string; detalles?: unknown };
  };

  if (!respuesta.ok) {
    const e = json.error ?? { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' };
    if (respuesta.status === 401 && e.codigo === 'NO_AUTENTICADO') {
      manejadorSesionVencida?.(e.mensaje);
    }
    throw new ErrorApi(respuesta.status, e.codigo, e.mensaje, e.detalles);
  }
  return json;
}

export const api = {
  get: async <T>(ruta: string, query?: Query) =>
    (await pedir('GET', ruta, undefined, query)).data as T,
  post: async <T>(ruta: string, cuerpo?: unknown) =>
    (await pedir('POST', ruta, cuerpo ?? {})).data as T,
  patch: async <T>(ruta: string, cuerpo: unknown) => (await pedir('PATCH', ruta, cuerpo)).data as T,
  put: async <T>(ruta: string, cuerpo: unknown) => (await pedir('PUT', ruta, cuerpo)).data as T,
  delete: async <T>(ruta: string, cuerpo?: unknown) =>
    (await pedir('DELETE', ruta, cuerpo)).data as T,
  lista: async <T>(ruta: string, query?: Query) => {
    const r = await pedir('GET', ruta, undefined, query);
    return { data: r.data as T[], meta: r.meta as MetaPaginacion } satisfies Lista<T>;
  },
};

/** Mensaje para mostrar al usuario a partir de cualquier error. */
export const mensajeDeError = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado';

/** Errores de validación por campo que devuelve el backend (`detalles`). */
export function erroresPorCampo(e: unknown): Record<string, string> {
  if (!(e instanceof ErrorApi) || !Array.isArray(e.detalles)) return {};
  const resultado: Record<string, string> = {};
  for (const d of e.detalles as { campo?: string; mensaje?: string }[]) {
    if (d.campo && d.mensaje && !resultado[d.campo]) resultado[d.campo] = d.mensaje;
  }
  return resultado;
}
