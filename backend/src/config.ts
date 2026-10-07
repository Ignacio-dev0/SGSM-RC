import dotenv from 'dotenv';

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
  },
  biometria: {
    /** Distancia máxima entre patrones para considerar que es la misma persona (T404). */
    umbral: numero('BIOMETRIA_UMBRAL', 0.5),
    /** Validaciones fallidas seguidas que cancelan la operación (T407). */
    maxIntentos: numero('BIOMETRIA_MAX_INTENTOS', 3),
    /** Segundos que dura el comprobante de una validación correcta. */
    validezSegundos: numero('BIOMETRIA_VALIDEZ_SEG', 120),
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
