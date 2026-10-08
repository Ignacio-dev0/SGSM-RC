import dotenv from 'dotenv';
import { leerClave, type Llavero } from './comun/cifrado';

dotenv.config({ quiet: true });

function numero(nombre: string, porDefecto: number): number {
  const v = process.env[nombre];
  if (v === undefined || v === '') return porDefecto;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`La variable ${nombre} debe ser numérica`);
  return n;
}

/** Interruptor `true`/`false`; sin valor usa el de por defecto. */
export function booleano(nombre: string, porDefecto: boolean): boolean {
  const v = process.env[nombre];
  if (v === undefined || v === '') return porDefecto;
  if (v !== 'true' && v !== 'false') throw new Error(`La variable ${nombre} debe ser true o false`);
  return v === 'true';
}

/** Lista separada por comas (sin espacios ni elementos vacíos); sin valor, vacía. */
export const lista = (nombre: string): string[] =>
  (process.env[nombre] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const entorno = process.env.NODE_ENV ?? 'development';
const produccion = entorno === 'production';

function secreto(nombre: string, porDefectoEnDesarrollo: string): string {
  const v = process.env[nombre];
  if (v) return v;
  if (produccion) throw new Error(`Falta la variable ${nombre}, obligatoria en producción`);
  return porDefectoEnDesarrollo;
}

/**
 * Clave del cifrado biométrico SOLO para desarrollo y pruebas: es el base64 de
 * "sgsm-rc-solo-para-desarrollo-001". En producción BIOMETRIA_CLAVE es obligatoria y no puede ser
 * esta (docs/seguridad.md, D51).
 */
export const CLAVE_BIOMETRIA_DESARROLLO = 'c2dzbS1yYy1zb2xvLXBhcmEtZGVzYXJyb2xsby0wMDE=';

/** Llavero del cifrado biométrico (T705): la clave actual y, durante una rotación, la anterior. */
export function clavesBiometria(env: NodeJS.ProcessEnv, enProduccion: boolean): Llavero {
  if (!env.BIOMETRIA_CLAVE && enProduccion) {
    throw new Error('Falta la variable BIOMETRIA_CLAVE, obligatoria en producción');
  }
  const actual = leerClave(env.BIOMETRIA_CLAVE || CLAVE_BIOMETRIA_DESARROLLO, 'BIOMETRIA_CLAVE');
  if (enProduccion && actual.equals(Buffer.from(CLAVE_BIOMETRIA_DESARROLLO, 'base64'))) {
    throw new Error('BIOMETRIA_CLAVE no puede ser la clave de desarrollo en producción');
  }
  const anterior = env.BIOMETRIA_CLAVE_ANTERIOR
    ? leerClave(env.BIOMETRIA_CLAVE_ANTERIOR, 'BIOMETRIA_CLAVE_ANTERIOR')
    : null;
  return { actual, anteriores: anterior ? [anterior] : [] };
}

/**
 * `trust proxy` de Express, para leer la IP real del cliente (límite por IP del login). Por
 * defecto 1: la API siempre está detrás de un solo proxy (nginx en Docker, Vite en desarrollo).
 * `false` si se expone sin proxy; un número de saltos o una lista de direcciones si hay más.
 */
export function confianzaProxy(valor: string | undefined): boolean | number | string {
  if (valor === undefined || valor.trim() === '') return 1;
  if (valor === 'false') return false;
  return /^\d+$/.test(valor) ? Number(valor) : valor;
}

/** Configuración del backend leída de las variables de entorno (ver docs/entorno.md). */
export const config = {
  entorno,
  produccion,
  puerto: numero('PORT', 3000),
  /** Costo de bcrypt: 10 en desarrollo/producción; las pruebas usan 4 para ir rápido. */
  bcryptCosto: numero('BCRYPT_COSTO', 10),
  login: {
    /** Intentos fallidos consecutivos que bloquean la cuenta (T112). */
    maxIntentos: numero('LOGIN_MAX_INTENTOS', 3),
    bloqueoMinutos: numero('LOGIN_BLOQUEO_MIN', 15),
    /** Límite por IP contra barridos de usuarios (T705): fallidos en la ventana deslizante. */
    ip: {
      maxFallidos: numero('LOGIN_IP_MAX_FALLIDOS', 10),
      ventanaMinutos: numero('LOGIN_IP_VENTANA_MIN', 15),
    },
  },
  confiarProxy: confianzaProxy(process.env.CONFIAR_PROXY),
  biometria: {
    /** Distancia máxima entre patrones para considerar que es la misma persona (T404). */
    umbral: numero('BIOMETRIA_UMBRAL', 0.5),
    /** Validaciones fallidas seguidas que cancelan la operación (T407). */
    maxIntentos: numero('BIOMETRIA_MAX_INTENTOS', 3),
    /** Segundos que dura el comprobante de una validación correcta. */
    validezSegundos: numero('BIOMETRIA_VALIDEZ_SEG', 120),
    /** Claves del cifrado del patrón y la foto en reposo (T705 · RNF06). */
    llavero: clavesBiometria(process.env, produccion),
  },
  suministros: {
    /** Horas durante las que se puede corregir un suministro (CU23). */
    plazoCorreccionHoras: numero('SUMINISTRO_PLAZO_CORRECCION_HORAS', 24),
  },
  /** Recordatorios de tomas (E5 · docs/diseno-e5.md, supuestos S9–S11). */
  recordatorios: {
    /** El servidor arranca el temporizador (T501). Las pruebas nunca lo arrancan. */
    temporizador: booleano('RECORDATORIOS_TEMPORIZADOR', true),
    /** Segundos entre dos ciclos del temporizador. */
    intervaloSegundos: numero('RECORDATORIOS_INTERVALO_SEG', 60),
    /** Minutos antes de la toma en que aparece su recordatorio (T502 · S9). */
    anticipacionMinutos: numero('RECORDATORIO_ANTICIPACION_MIN', 30),
    /** Minutos desde que se generó tras los que vence sin atender (T503 · S11). */
    vencimientoMinutos: numero('RECORDATORIO_VENCIMIENTO_MIN', 60),
    /** ALTA con esta cantidad de minutos o menos hasta la toma, o si está atrasada (S10). */
    prioridadAltaMinutos: numero('RECORDATORIO_PRIORIDAD_ALTA_MIN', 5),
    /** MEDIA hasta esta cantidad de minutos; con más falta, BAJA (S10). */
    prioridadMediaMinutos: numero('RECORDATORIO_PRIORIDAD_MEDIA_MIN', 15),
    /** Horas que un vencido sigue en el panel para atenderlo tarde (S11). */
    vencidosVisiblesHoras: numero('RECORDATORIO_VENCIDOS_VISIBLES_HORAS', 12),
  },
  /** Avisos por WebSocket en /api/tiempo-real (T505 · docs/recordatorios.md). */
  tiempoReal: {
    /** Segundos entre latidos: cada uno revisa la sesión y el permiso de la conexión. */
    latidoSegundos: numero('TIEMPO_REAL_LATIDO_SEG', 30),
    /** Orígenes aceptados además del propio (el del encabezado Host), separados por comas. */
    origenes: lista('TIEMPO_REAL_ORIGENES'),
  },
  sesion: {
    secreto: secreto('JWT_SECRETO', 'solo-para-desarrollo-cambiar-en-produccion'),
    /** Minutos sin actividad tras los que se cierra la sesión (RNF05). */
    inactividadMinutos: numero('SESION_INACTIVIDAD_MIN', 15),
    /** Duración máxima de una sesión aunque haya actividad (un turno largo). */
    maximaHoras: numero('SESION_MAXIMA_HORAS', 12),
    /** La cookie solo viaja por HTTPS. Activado por defecto en producción. */
    cookieSegura: (process.env.COOKIE_SEGURA ?? String(produccion)) === 'true',
  },
};
