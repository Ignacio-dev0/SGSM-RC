import { prisma } from '../../db';

/**
 * D114: el nombre legible del registro afectado por una entrada de la auditoría, para no mostrar
 * "Usuario n.º 4". Lo usan la consulta de la auditoría y el historial del paciente.
 */

const nombreDe = (p: { apellido: string; nombre: string }) => `${p.apellido}, ${p.nombre}`;

/** El mayor id que entra en una columna `integer` de PostgreSQL. */
const ID_MAXIMO = 2_147_483_647;

/** Los ids numéricos (sin repetir) de las filas de una entidad. */
function idsDe(filas: { entidad: string; entidadId: string | null }[], entidad: string) {
  const ids = filas.flatMap((a) =>
    a.entidad === entidad && a.entidadId && /^\d{1,10}$/.test(a.entidadId)
      ? [Number(a.entidadId)]
      : [],
  );
  return [...new Set(ids.filter((id) => id > 0 && id <= ID_MAXIMO))];
}

const ninguno = Promise.resolve([]);

/**
 * Una consulta por tipo de registro presente en las filas (no una por fila) y solo los tipos con
 * nombre: usuario y paciente ("Apellido, Nombre"), insumo (nombre y presentación) y prescripción
 * ("Medicamento · Apellido, Nombre"). Los pacientes salen de la misma consulta que la columna
 * Paciente. Devuelve las etiquetas por "Entidad:id" (ver `etiquetaDe`) y los pacientes por id.
 */
export async function etiquetasDe(
  filas: { entidad: string; entidadId: string | null; pacienteId: number | null }[],
) {
  const idsPacientes = new Set([
    ...filas.flatMap((a) => (a.pacienteId ? [a.pacienteId] : [])),
    ...idsDe(filas, 'Paciente'),
  ]);
  const usuarios = idsDe(filas, 'Usuario');
  const insumos = idsDe(filas, 'Insumo');
  const prescripciones = idsDe(filas, 'Prescripcion');
  const [pacientes, us, ins, ps] = await Promise.all([
    idsPacientes.size > 0
      ? prisma.paciente.findMany({
          where: { id: { in: [...idsPacientes] } },
          select: { id: true, apellido: true, nombre: true, dni: true },
        })
      : ninguno,
    usuarios.length > 0
      ? prisma.usuario.findMany({
          where: { id: { in: usuarios } },
          select: { id: true, apellido: true, nombre: true },
        })
      : ninguno,
    insumos.length > 0
      ? prisma.insumo.findMany({
          where: { id: { in: insumos } },
          select: { id: true, nombre: true, presentacion: true },
        })
      : ninguno,
    prescripciones.length > 0
      ? prisma.prescripcion.findMany({
          where: { id: { in: prescripciones } },
          select: {
            id: true,
            insumo: { select: { nombre: true } },
            paciente: { select: { apellido: true, nombre: true } },
          },
        })
      : ninguno,
  ]);
  const etiquetas = new Map<string, string>([
    ...pacientes.map((p): [string, string] => [`Paciente:${p.id}`, nombreDe(p)]),
    ...us.map((u): [string, string] => [`Usuario:${u.id}`, nombreDe(u)]),
    ...ins.map((i): [string, string] => [`Insumo:${i.id}`, `${i.nombre} ${i.presentacion}`.trim()]),
    ...ps.map((p): [string, string] => [
      `Prescripcion:${p.id}`,
      `${p.insumo.nombre} · ${nombreDe(p.paciente)}`,
    ]),
  ]);
  return { pacientes: new Map(pacientes.map((p) => [p.id, p])), etiquetas };
}

/** La etiqueta de una fila, o null si su tipo no tiene nombre o el registro ya no existe. */
export const etiquetaDe = (
  etiquetas: Map<string, string>,
  fila: { entidad: string; entidadId: string | null },
) => etiquetas.get(`${fila.entidad}:${fila.entidadId}`) ?? null;
