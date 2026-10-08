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

/** Qué pasó y qué hacer cuando el servidor falla (F60): nunca un "error inesperado" a secas. */
const FALLA_DEL_SERVIDOR =
  'El servidor tuvo un problema. Intente de nuevo en unos minutos; si sigue, avise al área de sistemas.';
const FALLA_INESPERADA =
  'Ocurrió un problema inesperado. Intente de nuevo; si sigue, avise al área de sistemas.';

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

const SIN_CONEXION = 'No hay conexión con el servidor. Revise el Wi-Fi e intente de nuevo.';

/** Toda falla de red (al pedir o mientras llega el cuerpo) es el mismo error, que dice qué revisar. */
const errorSinConexion = () => new ErrorApi(0, 'SIN_CONEXION', SIN_CONEXION);

/** Quien pidió el archivo lo canceló: no es una falla de la red ni del servidor. */
const errorCancelado = () => new ErrorApi(0, 'CANCELADO', 'Se canceló la descarga.');

/** Hace el pedido con la cookie de sesión; sin red, un error que dice qué revisar. */
async function enviar(
  metodo: Metodo,
  ruta: string,
  cuerpo?: unknown,
  query?: Query,
  senal?: AbortSignal,
) {
  try {
    return await fetch(armarUrl(ruta, query), {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? null : JSON.stringify(cuerpo),
      ...(senal && { signal: senal }),
    });
  } catch {
    throw senal?.aborted ? errorCancelado() : errorSinConexion();
  }
}

interface CuerpoApi {
  data?: unknown;
  meta?: MetaPaginacion;
  error?: { codigo: string; mensaje: string; detalles?: unknown };
}

/** El error de una respuesta fallida, con el mensaje que se le muestra a la persona. */
function errorDeRespuesta(respuesta: Response, json: CuerpoApi) {
  // Sin cuerpo con el formato de la API (un proxy caído, una página de error) es lo mismo que un
  // error interno. El servidor no da detalles de un error interno a propósito: se explica acá.
  const e = json.error ?? { codigo: 'ERROR_INTERNO', mensaje: FALLA_DEL_SERVIDOR };
  if (respuesta.status === 401 && e.codigo === 'NO_AUTENTICADO') {
    manejadorSesionVencida?.(e.mensaje);
  }
  const mensaje = e.codigo === 'ERROR_INTERNO' ? FALLA_DEL_SERVIDOR : e.mensaje;
  return new ErrorApi(respuesta.status, e.codigo, mensaje, e.detalles);
}

const leerJson = async (respuesta: Response) =>
  (await respuesta.json().catch(() => ({}))) as CuerpoApi;

async function pedir(metodo: Metodo, ruta: string, cuerpo?: unknown, query?: Query) {
  const respuesta = await enviar(metodo, ruta, cuerpo, query);
  const json = await leerJson(respuesta);
  if (!respuesta.ok) throw errorDeRespuesta(respuesta, json);
  return json;
}

/** Un archivo bajado de la API (PDF, Excel) con el nombre que le dio el servidor. */
export interface Archivo {
  blob: Blob;
  nombre: string;
}

/**
 * Nombre del archivo de `Content-Disposition`: primero `filename*` (RFC 5987, admite tildes) y si
 * no, `filename`. Sin encabezado, el de respaldo.
 */
function nombreDeArchivo(encabezado: string | null, respaldo: string) {
  if (!encabezado) return respaldo;
  const codificado = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(encabezado)?.[1];
  if (codificado) {
    try {
      return decodeURIComponent(codificado.trim());
    } catch {
      // Mal codificado: se prueba con el nombre simple.
    }
  }
  const simple = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/.exec(encabezado);
  return (simple?.[1] ?? simple?.[2])?.trim() || respaldo;
}

/**
 * Baja un archivo de la API con la cookie de sesión. Si falla, el error es el de cualquier otro
 * pedido (`ErrorApi` con el mensaje del servidor; sin red, también si se corta mientras llega el
 * archivo); si sale bien, el archivo y su nombre. Con `senal` se puede cancelar (`CANCELADO`).
 */
export async function descargar(
  ruta: string,
  query?: Query,
  nombreDeRespaldo = 'archivo',
  senal?: AbortSignal,
) {
  const respuesta = await enviar('GET', ruta, undefined, query, senal);
  if (!respuesta.ok) throw errorDeRespuesta(respuesta, await leerJson(respuesta));
  let blob: Blob;
  try {
    blob = await respuesta.blob();
  } catch {
    throw senal?.aborted ? errorCancelado() : errorSinConexion();
  }
  return {
    blob,
    nombre: nombreDeArchivo(respuesta.headers.get('Content-Disposition'), nombreDeRespaldo),
  } satisfies Archivo;
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

/**
 * Mensaje para mostrar a la persona a partir de cualquier error. Solo el de un `ErrorApi` está
 * escrito para ella; el de cualquier otro error es técnico ("Failed to fetch"), y se cambia por
 * la falla inesperada, que dice qué hacer.
 */
export const mensajeDeError = (e: unknown) =>
  e instanceof ErrorApi ? e.message : FALLA_INESPERADA;

/** Errores de validación por campo que devuelve el backend (`detalles`). */
export function erroresPorCampo(e: unknown): Record<string, string> {
  if (!(e instanceof ErrorApi) || !Array.isArray(e.detalles)) return {};
  const resultado: Record<string, string> = {};
  for (const d of e.detalles as { campo?: string; mensaje?: string }[]) {
    if (d.campo && d.mensaje && !resultado[d.campo]) resultado[d.campo] = d.mensaje;
  }
  return resultado;
}
