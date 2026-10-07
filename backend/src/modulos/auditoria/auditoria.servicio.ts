import { Prisma } from '@prisma/client';
import type { ClienteDb } from '../../db';

/**
 * Módulo de auditoría (T104 · RN06 · RNF10 · CU35).
 *
 * Cada servicio que modifica datos llama a `registrarAuditoria` dentro de la MISMA transacción
 * que el cambio: si el cambio se revierte, el registro de auditoría también, y nunca queda un
 * cambio sin auditar. La tabla solo admite inserciones desde el código (no hay actualización ni
 * borrado de registros de auditoría).
 */

/** Campos que nunca se guardan en la auditoría, ni siquiera cifrados. */
const CAMPOS_SENSIBLES = new Set([
  'contrasenaHash',
  'contrasena',
  'patron',
  'fotoReferencia',
  'patronCifrado',
  'fotoCifrada',
]);

/** Campos técnicos que cambian solos y no aportan a la auditoría. */
const CAMPOS_IGNORADOS = new Set(['actualizadoEn']);

type Valores = Record<string, unknown>;

function normalizar(valor: unknown): unknown {
  if (valor instanceof Date) return valor.toISOString();
  if (Buffer.isBuffer(valor)) return '[binario]';
  if (Array.isArray(valor)) return valor.map(normalizar);
  if (valor !== null && typeof valor === 'object') return sanear(valor as Valores);
  return valor;
}

/** Copia los valores ocultando los datos sensibles y convirtiendo fechas a ISO. */
export function sanear(valores: Valores): Valores {
  const resultado: Valores = {};
  for (const [campo, valor] of Object.entries(valores)) {
    if (valor === undefined) continue;
    resultado[campo] = CAMPOS_SENSIBLES.has(campo) ? '[oculto]' : normalizar(valor);
  }
  return resultado;
}

/** Compara dos versiones de una entidad y devuelve solo los campos que cambiaron. */
export function cambios(antes: Valores, despues: Valores): { anterior: Valores; nuevo: Valores } {
  const anterior: Valores = {};
  const nuevo: Valores = {};
  for (const campo of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
    if (CAMPOS_IGNORADOS.has(campo)) continue;
    const a = normalizar(antes[campo]);
    const d = normalizar(despues[campo]);
    if (JSON.stringify(a) !== JSON.stringify(d)) {
      anterior[campo] = antes[campo];
      nuevo[campo] = despues[campo];
    }
  }
  return { anterior, nuevo };
}

export interface EntradaAuditoria {
  usuarioId?: number | null;
  /** CREAR, MODIFICAR, BAJA, INICIAR_SESION, ... (ver docs/auditoria.md) */
  accion: string;
  /** Nombre de la entidad del dominio: Usuario, Paciente, Prescripcion, ... */
  entidad: string;
  entidadId?: number | string | null;
  pacienteId?: number | null;
  anterior?: Valores | null;
  nuevo?: Valores | null;
  detalle?: string | null;
}

const comoJson = (v: Valores | null | undefined) =>
  v ? (sanear(v) as Prisma.InputJsonValue) : Prisma.DbNull;

export function registrarAuditoria(db: ClienteDb, entrada: EntradaAuditoria) {
  return db.auditoria.create({
    data: {
      usuarioId: entrada.usuarioId ?? null,
      accion: entrada.accion,
      entidad: entrada.entidad,
      entidadId:
        entrada.entidadId === undefined || entrada.entidadId === null
          ? null
          : String(entrada.entidadId),
      pacienteId: entrada.pacienteId ?? null,
      valorAnterior: comoJson(entrada.anterior),
      valorNuevo: comoJson(entrada.nuevo),
      detalle: entrada.detalle ?? null,
    },
  });
}
