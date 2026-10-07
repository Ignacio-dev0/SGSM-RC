import dotenv from 'dotenv';

dotenv.config({ quiet: true });

function entero(nombre: string, porDefecto: number): number {
  const v = process.env[nombre];
  if (v === undefined || v === '') return porDefecto;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`La variable ${nombre} debe ser numérica`);
  return n;
}

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
  puerto: entero('PORT', 3000),
  /** Costo de bcrypt: 10 en desarrollo/producción; las pruebas usan 4 para ir rápido. */
  bcryptCosto: entero('BCRYPT_COSTO', 10),
  sesion: {
    secreto: secreto('JWT_SECRETO', 'solo-para-desarrollo-cambiar-en-produccion'),
    /** Minutos sin actividad tras los que se cierra la sesión (RNF05). */
    inactividadMinutos: entero('SESION_INACTIVIDAD_MIN', 15),
    /** Duración máxima de una sesión aunque haya actividad (un turno largo). */
    maximaHoras: entero('SESION_MAXIMA_HORAS', 12),
    /** La cookie solo viaja por HTTPS. Activado por defecto en producción. */
    cookieSegura: (process.env.COOKIE_SEGURA ?? String(produccion)) === 'true',
  },
};
