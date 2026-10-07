import { Prisma, type Insumo } from '@prisma/client';
import { z } from 'zod';
import { conflicto, noEncontrado } from '../../comun/errores';
import { prisma } from '../../db';
import { cambios, registrarAuditoria } from '../auditoria/auditoria.servicio';

/**
 * Catálogo de insumos y medicamentos (T303). El catálogo es chico (decenas a cientos de ítems),
 * así que se lista completo, sin paginar, para alimentar los selectores de las pantallas.
 */

const camposInsumo = {
  nombre: z.string().trim().min(2, 'Ingrese el nombre').max(120),
  tipo: z.enum(['MEDICAMENTO', 'INSUMO'], { error: 'Elija si es medicamento o insumo' }),
  unidadMedida: z
    .string({ error: 'Ingrese la unidad de medida' })
    .trim()
    .min(1, 'Ingrese la unidad de medida')
    .max(30),
  presentacion: z.string().trim().max(120).default(''),
};

export const esquemaAltaInsumo = z.object(camposInsumo);
export const esquemaModificacionInsumo = z
  .object({ ...camposInsumo, presentacion: z.string().trim().max(120), activo: z.boolean() })
  .partial();
export const esquemaFiltrosInsumos = z.object({
  texto: z.string().trim().max(80).optional(),
  tipo: z.enum(['MEDICAMENTO', 'INSUMO']).optional(),
  activo: z.enum(['true', 'false']).default('true'),
});

const aDto = (i: Insumo) => ({
  id: i.id,
  nombre: i.nombre,
  tipo: i.tipo,
  unidadMedida: i.unidadMedida,
  presentacion: i.presentacion,
  activo: i.activo,
});

const sinId = (i: Insumo) => {
  const { id: _id, ...resto } = i;
  return resto;
};

const duplicado = () =>
  conflicto('INSUMO_DUPLICADO', 'Ya existe un insumo con ese nombre y presentación');

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
  return insumos.map(aDto);
}

export async function obtenerInsumo(id: number) {
  return aDto(await obtenerDb(id));
}

const traducirUnico = (e: unknown) => {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw duplicado();
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
      return aDto(creado);
    })
    .catch(traducirUnico);
}

export async function modificarInsumo(
  id: number,
  datos: z.infer<typeof esquemaModificacionInsumo>,
  actorId: number,
  accion = 'MODIFICAR',
) {
  const antes = await obtenerDb(id);
  return prisma
    .$transaction(async (tx) => {
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
      return aDto(despues);
    })
    .catch(traducirUnico);
}

export const darDeBajaInsumo = (id: number, actorId: number) =>
  modificarInsumo(id, { activo: false }, actorId, 'BAJA');
