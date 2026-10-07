import {
  ErrorDeCifrado,
  FORMATO_AES_GCM,
  FORMATO_PENDIENTE,
  cifrar,
  descifrar,
  huellaDeClave,
  type Llavero,
} from '../../comun/cifrado';
import { ErrorApi } from '../../comun/errores';
import { config } from '../../config';
import { prisma, type ClienteDb } from '../../db';
import { LARGO_PATRON } from './comparacion';

/**
 * Patrón facial y foto de referencia cifrados en reposo (T705 · RNF06 · docs/seguridad.md).
 * Solo se descifran en memoria para comparar (validación 1:1) o para servir la foto al
 * administrador; nunca van en claro a la base, a los registros ni a la auditoría.
 */

type Campo = 'patron' | 'foto';

/** Ata cada blob a su campo y a su usuario: el rostro cifrado de otro no sirve si lo copian. */
const contexto = (campo: Campo, usuarioId: number) => `datos_biometricos.${campo}:${usuarioId}`;

const BYTES_PATRON = LARGO_PATRON * 8;

/** 128 double big-endian: el mismo orden que float8send() de PostgreSQL (migración). */
export function patronABytes(patron: readonly number[]): Buffer {
  const bytes = Buffer.alloc(patron.length * 8);
  patron.forEach((v, i) => bytes.writeDoubleBE(v, i * 8));
  return bytes;
}

function bytesAPatron(bytes: Buffer): number[] {
  if (bytes.length !== BYTES_PATRON) {
    throw new ErrorDeCifrado(`El patrón descifrado no tiene ${LARGO_PATRON} valores`);
  }
  return Array.from({ length: LARGO_PATRON }, (_, i) => bytes.readDoubleBE(i * 8));
}

export function cifrarDatoBiometrico(
  usuarioId: number,
  patron: readonly number[],
  foto: Uint8Array,
  llavero: Llavero = config.biometria.llavero,
) {
  return {
    patronCifrado: cifrar(patronABytes(patron), llavero.actual, contexto('patron', usuarioId)),
    fotoCifrada: cifrar(foto, llavero.actual, contexto('foto', usuarioId)),
  };
}

export const descifrarPatron = (
  usuarioId: number,
  blob: Uint8Array,
  llavero: Llavero = config.biometria.llavero,
) => bytesAPatron(descifrar(blob, llavero, contexto('patron', usuarioId)));

export const descifrarFoto = (
  usuarioId: number,
  blob: Uint8Array,
  llavero: Llavero = config.biometria.llavero,
) => descifrar(blob, llavero, contexto('foto', usuarioId));

/**
 * Descifra para usar en un pedido. Si el dato no se puede leer (clave equivocada, alterado o
 * copiado de otro usuario) deja el motivo en el registro del servidor, sin el dato, y responde
 * un error que dice qué hacer.
 */
export function leerDatoBiometrico<T>(usuarioId: number, leer: () => T): T {
  try {
    return leer();
  } catch (e) {
    if (!(e instanceof ErrorDeCifrado)) throw e;
    console.error(`Biometría: no se pudo descifrar el dato del usuario ${usuarioId}: ${e.message}`);
    throw new ErrorApi(
      500,
      'BIOMETRIA_ILEGIBLE',
      'No se pudo leer el rostro registrado. Pídale al administrador que lo registre de nuevo.',
    );
  }
}

/** Contenido en claro de un blob en formato 0 (migración) o cifrado con cualquier clave del llavero. */
function abrir(blob: Uint8Array, campo: Campo, usuarioId: number, llavero: Llavero): Buffer {
  const datos = Buffer.from(blob);
  if (datos[0] !== FORMATO_PENDIENTE) return descifrar(datos, llavero, contexto(campo, usuarioId));
  const claro = datos.subarray(1);
  if (campo === 'patron') bytesAPatron(claro);
  return claro;
}

/**
 * Cifra con la clave actual lo que todavía no lo está: los registros en formato 0 que deja la
 * migración `biometria_cifrada` y los cifrados con la clave anterior (rotación). Idempotente: lo
 * corren `npm run biometria:cifrar` y el servidor al arrancar. No cambia `actualizadoEn` (no es
 * un registro nuevo del rostro) y no pisa un registro que cambió mientras tanto.
 */
export async function cifrarPendientes(
  db: ClienteDb = prisma,
  llavero: Llavero = config.biometria.llavero,
) {
  const prefijo = Buffer.concat([Buffer.from([FORMATO_AES_GCM]), huellaDeClave(llavero.actual)]);
  // Solo los ids: las fotos de los que ya están al día no se traen.
  const pendientes = await db.$queryRaw<{ usuario_id: number }[]>`
    SELECT usuario_id FROM datos_biometricos
    WHERE encode(substring(patron_cifrado FROM 1 FOR 5), 'hex') <> ${prefijo.toString('hex')}
       OR encode(substring(foto_cifrada FROM 1 FOR 5), 'hex') <> ${prefijo.toString('hex')}
    ORDER BY usuario_id`;

  let cifrados = 0;
  const ilegibles: number[] = [];
  for (const { usuario_id: usuarioId } of pendientes) {
    const dato = await db.datoBiometrico.findUnique({ where: { usuarioId } });
    if (!dato) continue;
    let nuevo;
    try {
      nuevo = cifrarDatoBiometrico(
        usuarioId,
        bytesAPatron(abrir(dato.patronCifrado, 'patron', usuarioId, llavero)),
        abrir(dato.fotoCifrada, 'foto', usuarioId, llavero),
        llavero,
      );
    } catch (e) {
      if (!(e instanceof ErrorDeCifrado)) throw e;
      ilegibles.push(usuarioId);
      continue;
    }
    const { count } = await db.datoBiometrico.updateMany({
      where: { usuarioId, patronCifrado: dato.patronCifrado, fotoCifrada: dato.fotoCifrada },
      data: { ...nuevo, actualizadoEn: dato.actualizadoEn },
    });
    cifrados += count;
  }
  return { revisados: pendientes.length, cifrados, ilegibles };
}
