import type { Prisma } from '@prisma/client';
import { noEncontrado } from '../../comun/errores';
import { respuestaPaginada } from '../../comun/paginacion';
import { prisma } from '../../db';
import type { BusquedaSuministros } from './suministros.esquemas';
import { aDtoSuministro, incluirSuministro } from './suministros.servicio';

/** Historial de suministros (T411 · CU22 · RF10): paciente, período, tipo de insumo y responsable. */
export async function buscarSuministros(f: BusquedaSuministros) {
  const where: Prisma.SuministroWhereInput = {
    ...(f.pacienteId ? { pacienteId: f.pacienteId } : {}),
    ...(f.usuarioId ? { usuarioId: f.usuarioId } : {}),
    ...(f.tipoInsumo ? { detalles: { some: { insumo: { tipo: f.tipoInsumo } } } } : {}),
    ...(f.desde || f.hasta
      ? {
          fechaHora: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lte: f.hasta } : {}) },
        }
      : {}),
  };
  const [filas, total] = await prisma.$transaction([
    prisma.suministro.findMany({
      where,
      include: incluirSuministro,
      orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
      skip: (f.pagina - 1) * f.porPagina,
      take: f.porPagina,
    }),
    prisma.suministro.count({ where }),
  ]);
  return respuestaPaginada(filas.map(aDtoSuministro), total, f);
}

export async function obtenerSuministro(id: number) {
  const s = await prisma.suministro.findUnique({ where: { id }, include: incluirSuministro });
  if (!s) throw noEncontrado('El suministro no existe');
  return aDtoSuministro(s);
}

/** Usuarios que registraron al menos un suministro: opciones del filtro "responsable". */
export async function responsables() {
  const usuarios = await prisma.usuario.findMany({
    where: { suministros: { some: {} } },
    select: { id: true, apellido: true, nombre: true },
    orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
  });
  return usuarios.map((u) => ({ id: u.id, nombre: `${u.apellido}, ${u.nombre}` }));
}
