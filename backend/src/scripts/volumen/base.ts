// Base de volumen para las pruebas de rendimiento (T702 · RNF03 · docs/rendimiento.md).
// Solo constantes y funciones puras: lo que tiene efectos está en entorno.ts.

/** Base por defecto: la del contenedor de desarrollo, aparte de `sgsm` y `sgsm_test`. */
export const URL_VOLUMEN_POR_DEFECTO =
  'postgresql://sgsm:sgsm@localhost:5432/sgsm_volumen?schema=public';

/**
 * Nombre de la base de la URL si termina en `_volumen`; si no, lanza. Es el resguardo para no
 * vaciar ni llenar otra base (desarrollo o pruebas) por error.
 */
export function baseDeVolumen(url: string): string {
  let base: string;
  try {
    base = decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    throw new Error('DATABASE_URL no es una URL de PostgreSQL válida');
  }
  if (!/_volumen$/.test(base)) {
    throw new Error(
      `Los scripts de volumen solo corren contra una base *_volumen (se recibió "${base}"). ` +
        `Use DATABASE_URL=${URL_VOLUMEN_POR_DEFECTO}`,
    );
  }
  return base;
}

/** Contraseña de los usuarios del volumen: pública, solo sirve en la base *_volumen. */
export const CONTRASENA_VOLUMEN = 'Volumen2026';

/** Un usuario por rol para medir (ids 1, 2 y 3 del volumen). */
export const USUARIOS_MEDICION = {
  admin: 'vol_admin',
  medico: 'vol_medico',
  enfermero: 'vol_enfermero',
} as const;

/** Semilla fija: con la misma semilla y el mismo VOLUMEN_AHORA salen los mismos datos. */
export const SEMILLA = 20_261_007;

/**
 * Hospital de rehabilitación de tamaño medio durante un año. Los suministros de medicamentos
 * salen de la agenda de cada prescripción; el resto, hasta `suministros`, son de insumos.
 */
export const VOLUMEN = {
  dias: 365,
  salas: 6,
  camasPorSala: 20,
  administradores: 4,
  medicos: 14,
  enfermeros: 42,
  pacientes: 1500,
  internados: 110,
  medicamentos: 200,
  insumos: 100,
  prescripciones: 12_000,
  suministros: 400_000,
  auditoria: 600_000,
  recordatorios: 150_000,
  estudios: 3000,
  /** Parte de las tomas que se administran (el resto: "No se administró" o vencidas). */
  adherencia: 0.93,
} as const;
