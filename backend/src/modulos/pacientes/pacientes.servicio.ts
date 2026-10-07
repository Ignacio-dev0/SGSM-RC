import type { Paciente, Prisma } from '@prisma/client';
import { conflicto, noEncontrado } from '../../comun/errores';
import { respuestaPaginada } from '../../comun/paginacion';
import { reloj } from '../../comun/reloj';
import { prisma, type ClienteDb } from '../../db';
import { cambios, registrarAuditoria } from '../auditoria/auditoria.servicio';
import { asignacionActiva, asignarCama } from '../camas/camas.servicio';
import type {
  AltaPaciente,
  BusquedaPacientes,
  ModificacionPaciente,
  Reingreso,
} from './pacientes.esquemas';

/**
 * Gestión de pacientes (T202 · T204 · CU11, CU13, CU14). La ficha del paciente es única por DNI
 * (RN08): un reingreso reutiliza la ficha para que el historial quede en un solo lugar.
 */

type Asignacion = Awaited<ReturnType<typeof asignacionActiva>>;

/** `date` de la base → 'AAAA-MM-DD' (sin corrimientos de zona horaria). */
const comoFecha = (d: Date) => d.toISOString().slice(0, 10);
const desdeFecha = (s: string) => new Date(`${s}T00:00:00.000Z`);

export function aDtoPaciente(p: Paciente, asignacion: Asignacion) {
  return {
    id: p.id,
    dni: p.dni,
    nombre: p.nombre,
    apellido: p.apellido,
    fechaNacimiento: comoFecha(p.fechaNacimiento),
    sexo: p.sexo,
    obraSocial: p.obraSocial,
    numeroAfiliado: p.numeroAfiliado,
    diagnostico: p.diagnostico,
    contactoEmergenciaNombre: p.contactoEmergenciaNombre,
    contactoEmergenciaTelefono: p.contactoEmergenciaTelefono,
    observaciones: p.observaciones,
    estado: p.estado,
    fechaIngreso: p.fechaIngreso,
    fechaEgreso: p.fechaEgreso,
    motivoEgreso: p.motivoEgreso,
    cama: asignacion
      ? {
          id: asignacion.cama.id,
          numero: asignacion.cama.numero,
          sala: { id: asignacion.cama.sala.id, nombre: asignacion.cama.sala.nombre },
          desde: asignacion.fechaDesde,
        }
      : null,
  };
}

/** Datos del paciente que se comparan en la auditoría. */
const paraAuditoria = (p: Paciente) => {
  const { id: _id, creadoEn: _c, actualizadoEn: _a, creadoPorId: _cp, ...resto } = p;
  return { ...resto, fechaNacimiento: comoFecha(p.fechaNacimiento) };
};

/** Convierte los datos validados al formato de Prisma (la fecha de nacimiento es `date`). */
function aDatosDb<T extends { fechaNacimiento?: string | undefined }>(datos: T) {
  const { fechaNacimiento, ...resto } = datos;
  return {
    ...resto,
    ...(fechaNacimiento ? { fechaNacimiento: desdeFecha(fechaNacimiento) } : {}),
  };
}

export async function obtenerPacienteDb(db: ClienteDb, id: number) {
  const p = await db.paciente.findUnique({ where: { id } });
  if (!p) throw noEncontrado('El paciente no existe');
  return p;
}

export async function obtenerPaciente(id: number) {
  const p = await obtenerPacienteDb(prisma, id);
  return aDtoPaciente(p, await asignacionActiva(prisma, id));
}

async function verificarDniLibre(db: ClienteDb, dni: string, excepto?: number) {
  const existente = await db.paciente.findUnique({ where: { dni } });
  if (!existente || existente.id === excepto) return;
  if (existente.estado === 'EGRESADO' && excepto === undefined) {
    throw conflicto(
      'PACIENTE_EGRESADO',
      `${existente.apellido}, ${existente.nombre} ya estuvo internado. Puede registrar su reingreso.`,
      { pacienteId: existente.id },
    );
  }
  throw conflicto('DNI_DUPLICADO', 'Ya existe un paciente con ese DNI');
}

export async function crearPaciente(datos: AltaPaciente, actorId: number) {
  return prisma.$transaction(async (tx) => {
    await verificarDniLibre(tx, datos.dni);
    const { camaId, fechaIngreso, ...resto } = datos;
    const paciente = await tx.paciente.create({
      data: {
        ...aDatosDb(resto),
        fechaNacimiento: desdeFecha(resto.fechaNacimiento),
        fechaIngreso: fechaIngreso ? new Date(fechaIngreso) : reloj.ahora(),
        creadoPorId: actorId,
      },
    });
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'CREAR',
      entidad: 'Paciente',
      entidadId: paciente.id,
      pacienteId: paciente.id,
      nuevo: paraAuditoria(paciente),
    });
    await asignarCama(tx, {
      pacienteId: paciente.id,
      camaId,
      motivo: 'INGRESO',
      usuarioId: actorId,
    });
    return aDtoPaciente(paciente, await asignacionActiva(tx, paciente.id));
  });
}

export async function modificarPaciente(id: number, datos: ModificacionPaciente, actorId: number) {
  return prisma.$transaction(async (tx) => {
    const antes = await obtenerPacienteDb(tx, id);
    if (datos.dni) await verificarDniLibre(tx, datos.dni, id);
    const despues = await tx.paciente.update({ where: { id }, data: aDatosDb(datos) });
    const { anterior, nuevo } = cambios(paraAuditoria(antes), paraAuditoria(despues));
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'MODIFICAR',
      entidad: 'Paciente',
      entidadId: id,
      pacienteId: id,
      anterior,
      nuevo,
    });
    return aDtoPaciente(despues, await asignacionActiva(tx, id));
  });
}

/** Reingreso de un paciente egresado (T204): reactiva su ficha y le asigna cama. */
export async function reingresarPaciente(id: number, datos: Reingreso, actorId: number) {
  return prisma.$transaction(async (tx) => {
    const antes = await obtenerPacienteDb(tx, id);
    if (antes.estado === 'INTERNADO') {
      throw conflicto('PACIENTE_INTERNADO', 'El paciente ya está internado');
    }
    const { camaId, ...resto } = datos;
    if (resto.dni) await verificarDniLibre(tx, resto.dni, id);
    const despues = await tx.paciente.update({
      where: { id },
      data: {
        ...aDatosDb(resto),
        estado: 'INTERNADO',
        fechaIngreso: reloj.ahora(),
        fechaEgreso: null,
        motivoEgreso: null,
      },
    });
    const { anterior, nuevo } = cambios(paraAuditoria(antes), paraAuditoria(despues));
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'REINGRESAR',
      entidad: 'Paciente',
      entidadId: id,
      pacienteId: id,
      anterior,
      nuevo,
    });
    await asignarCama(tx, { pacienteId: id, camaId, motivo: 'REINGRESO', usuarioId: actorId });
    return aDtoPaciente(despues, await asignacionActiva(tx, id));
  });
}

export type DtoPaciente = ReturnType<typeof aDtoPaciente>;

/** Escapa los comodines de LIKE para que el texto se busque tal cual. */
const escaparLike = (t: string) => t.replace(/[\\%_]/g, (c) => '\\' + c);

/**
 * Ids de pacientes cuyo apellido o nombre contiene el texto sin importar mayúsculas ni tildes
 * (extensión unaccent de PostgreSQL), o cuyo DNI empieza con él.
 */
async function idsQueCoinciden(texto: string, incluirDniYNombre: boolean) {
  const patron = `%${escaparLike(texto)}%`;
  const filas = incluirDniYNombre
    ? await prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM pacientes
        WHERE dni LIKE ${`${escaparLike(texto)}%`}
           OR unaccent(apellido) ILIKE unaccent(${patron})
           OR unaccent(nombre) ILIKE unaccent(${patron})`
    : await prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM pacientes WHERE unaccent(apellido) ILIKE unaccent(${patron})`;
  return filas.map((f) => f.id);
}

/** Búsqueda de pacientes para la grilla (T203 · CU12): DNI, apellido, cama, sala y estado. */
export async function buscarPacientes(filtros: BusquedaPacientes) {
  const { pagina, porPagina, texto, dni, apellido, cama, salaId, estado } = filtros;
  const camaActual = (condicion: Prisma.CamaWhereInput): Prisma.PacienteWhereInput => ({
    asignaciones: { some: { fechaHasta: null, cama: condicion } },
  });
  const condiciones: Prisma.PacienteWhereInput[] = [
    ...(texto ? [{ id: { in: await idsQueCoinciden(texto, true) } }] : []),
    ...(dni ? [{ dni: { startsWith: dni } }] : []),
    ...(apellido ? [{ id: { in: await idsQueCoinciden(apellido, false) } }] : []),
    ...(cama ? [camaActual({ numero: { equals: cama, mode: 'insensitive' } })] : []),
    ...(salaId ? [camaActual({ salaId })] : []),
    ...(estado ? [{ estado }] : []),
  ];
  const where: Prisma.PacienteWhereInput = { AND: condiciones };

  const [filas, total] = await prisma.$transaction([
    prisma.paciente.findMany({
      where,
      include: {
        asignaciones: {
          where: { fechaHasta: null },
          include: { cama: { include: { sala: true } } },
        },
      },
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.paciente.count({ where }),
  ]);
  return respuestaPaginada(
    filas.map((p) => aDtoPaciente(p, p.asignaciones[0] ?? null)),
    total,
    { pagina, porPagina },
  );
}
