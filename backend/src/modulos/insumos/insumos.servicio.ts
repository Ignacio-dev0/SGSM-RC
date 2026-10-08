import { Prisma, type Insumo, type TipoInsumo } from '@prisma/client';
import type { z } from 'zod';
import { conflicto, noEncontrado } from '../../comun/errores';
import { prisma, type ClienteDb } from '../../db';
import { cambios, registrarAuditoria } from '../auditoria/auditoria.servicio';
import type {
  esquemaAltaInsumo,
  esquemaFiltrosInsumos,
  esquemaModificacionInsumo,
} from './insumos.esquemas';

/**
 * Catálogo de insumos y medicamentos (T303). El catálogo es chico (decenas a cientos de ítems),
 * así que se lista completo, sin paginar, para alimentar los selectores de las pantallas.
 */

const aDto = (i: Insumo, enUso: boolean) => ({
  id: i.id,
  nombre: i.nombre,
  tipo: i.tipo,
  unidadMedida: i.unidadMedida,
  presentacion: i.presentacion,
  activo: i.activo,
  /** Lo usa alguna prescripción o algún suministro: no se le cambia el tipo ni la unidad (D116). */
  enUso,
});

/**
 * D116: cuáles de estos insumos usa alguna prescripción o algún suministro. Una sola consulta de
 * existencia, apoyada en los índices por insumo de las dos tablas.
 */
async function idsEnUso(db: ClienteDb, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const filas = await db.$queryRaw<{ id: number }[]>`
    SELECT i.id FROM insumos i
    WHERE i.id = ANY(${ids}::int[])
      AND (EXISTS (SELECT 1 FROM prescripciones p WHERE p.insumo_id = i.id)
        OR EXISTS (SELECT 1 FROM detalles_suministro d WHERE d.insumo_id = i.id))`;
  return new Set(filas.map((f) => f.id));
}

const enUso = async (db: ClienteDb, id: number) => (await idsEnUso(db, [id])).has(id);

const TIPO_EN_PALABRAS: Record<TipoInsumo, string> = {
  MEDICAMENTO: 'medicamento',
  INSUMO: 'insumo',
};

const sinId = (i: Insumo) => {
  const { id: _id, ...resto } = i;
  return resto;
};

/**
 * El aviso de duplicado dice qué es el que ya existe (medicamento o insumo) y si está dado de
 * baja, para que se reactive en lugar de cargar otro.
 */
async function duplicado(nombre: string, presentacion: string, tipo: TipoInsumo) {
  const existente = await prisma.insumo.findUnique({
    where: { nombre_presentacion: { nombre, presentacion } },
  });
  const mensaje = `Ya existe un ${TIPO_EN_PALABRAS[existente?.tipo ?? tipo]} con ese nombre y presentación`;
  return conflicto(
    'INSUMO_DUPLICADO',
    existente && !existente.activo
      ? `${mensaje}, dado de baja: reactívelo en lugar de agregar otro`
      : mensaje,
  );
}

async function obtenerDb(id: number) {
  const i = await prisma.insumo.findUnique({ where: { id } });
  if (!i) throw noEncontrado('El insumo no existe');
  return i;
}

export async function listarInsumos(f: z.infer<typeof esquemaFiltrosInsumos>) {
  const insumos = await prisma.insumo.findMany({
    where: {
      activo: f.activo === 'true',
      ...(f.tipo ? { tipo: f.tipo } : {}),
      ...(f.texto ? { nombre: { contains: f.texto, mode: 'insensitive' } } : {}),
    },
    orderBy: [{ nombre: 'asc' }, { presentacion: 'asc' }],
  });
  const usados = await idsEnUso(
    prisma,
    insumos.map((i) => i.id),
  );
  return insumos.map((i) => aDto(i, usados.has(i.id)));
}

export async function obtenerInsumo(id: number) {
  return aDto(await obtenerDb(id), await enUso(prisma, id));
}

/** Traduce el índice único (nombre, presentación) al aviso de duplicado. */
const traducirUnico =
  (datos: { nombre: string; presentacion: string; tipo: TipoInsumo }) => async (e: unknown) => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw await duplicado(datos.nombre, datos.presentacion, datos.tipo);
    }
    throw e;
  };

export async function crearInsumo(datos: z.infer<typeof esquemaAltaInsumo>, actorId: number) {
  return prisma
    .$transaction(async (tx) => {
      const creado = await tx.insumo.create({ data: datos });
      await registrarAuditoria(tx, {
        usuarioId: actorId,
        accion: 'CREAR',
        entidad: 'Insumo',
        entidadId: creado.id,
        nuevo: sinId(creado),
      });
      return aDto(creado, false);
    })
    .catch(traducirUnico(datos));
}

export async function modificarInsumo(
  id: number,
  datos: z.infer<typeof esquemaModificacionInsumo>,
  actorId: number,
  accion = 'MODIFICAR',
) {
  const leido = await obtenerDb(id);
  return prisma
    .$transaction(async (tx) => {
      // D116: con la fila bloqueada, una prescripción o un suministro que la usa y se está
      // registrando (su FOR KEY SHARE o el FOR SHARE de quien lee el tipo) termina antes, y se ve.
      await tx.$queryRaw`SELECT 1 FROM insumos WHERE id = ${id} FOR UPDATE`;
      const antes = (await tx.insumo.findUnique({ where: { id } })) ?? leido;
      const usado = await enUso(tx, id);
      const cambiaTipo = datos.tipo !== undefined && datos.tipo !== antes.tipo;
      const cambiaUnidad =
        datos.unidadMedida !== undefined && datos.unidadMedida !== antes.unidadMedida;
      if (usado && (cambiaTipo || cambiaUnidad)) {
        throw conflicto(
          'INSUMO_EN_USO',
          `Este ${TIPO_EN_PALABRAS[antes.tipo]} ya se usó en prescripciones o suministros: no se puede cambiar su tipo ni su unidad de medida. Si hace falta otro, agréguelo al catálogo.`,
        );
      }
      const despues = await tx.insumo.update({ where: { id }, data: datos });
      const { anterior, nuevo } = cambios(sinId(antes), sinId(despues));
      await registrarAuditoria(tx, {
        usuarioId: actorId,
        accion,
        entidad: 'Insumo',
        entidadId: id,
        anterior,
        nuevo,
      });
      return aDto(despues, usado);
    })
    .catch(
      traducirUnico({
        nombre: datos.nombre ?? leido.nombre,
        presentacion: datos.presentacion ?? leido.presentacion,
        tipo: datos.tipo ?? leido.tipo,
      }),
    );
}

export const darDeBajaInsumo = (id: number, actorId: number) =>
  modificarInsumo(id, { activo: false }, actorId, 'BAJA');
