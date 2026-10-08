// Fábricas de datos para las pruebas: crean lo mínimo necesario directamente en la base.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/db';

let secuencia = 0;
const siguiente = () => ++secuencia;

export async function crearRol(codigo = `ROL_${siguiente()}`) {
  return prisma.rol.upsert({ where: { codigo }, update: {}, create: { codigo, nombre: codigo } });
}

export async function crearUsuarioBasico(datos: Partial<Prisma.UsuarioUncheckedCreateInput> = {}) {
  const n = siguiente();
  const rolId = datos.rolId ?? (await crearRol('BASICO')).id;
  return prisma.usuario.create({
    data: {
      nombreUsuario: `usuario${n}`,
      contrasenaHash: 'x',
      dni: String(20000000 + n),
      nombre: 'Nombre',
      apellido: `Apellido${n}`,
      ...datos,
      rolId,
    },
  });
}

export async function crearCama(salaNombre = 'Sala A', numero = String(siguiente())) {
  const sala = await prisma.sala.upsert({
    where: { nombre: salaNombre },
    update: {},
    create: { nombre: salaNombre },
  });
  return prisma.cama.create({ data: { numero, salaId: sala.id } });
}

export async function crearPacienteBasico(
  creadoPorId: number,
  datos: Partial<Prisma.PacienteUncheckedCreateInput> = {},
) {
  const n = siguiente();
  return prisma.paciente.create({
    data: {
      dni: String(30000000 + n),
      nombre: 'Paciente',
      apellido: `Prueba${n}`,
      fechaNacimiento: new Date('1950-05-10'),
      sexo: 'FEMENINO',
      fechaIngreso: new Date(),
      creadoPorId,
      ...datos,
    },
  });
}

export async function crearInsumo(datos: Partial<Prisma.InsumoUncheckedCreateInput> = {}) {
  const n = siguiente();
  return prisma.insumo.create({
    data: {
      nombre: `Medicamento ${n}`,
      tipo: 'MEDICAMENTO',
      unidadMedida: 'comprimido',
      presentacion: 'Comprimidos 500 mg',
      ...datos,
    },
  });
}

/** Paciente internado en una cama nueva de la sala indicada (asignación activa). */
export async function internarPaciente(
  creadoPorId: number,
  { sala = 'Sala A', cama }: { sala?: string; cama?: string } = {},
) {
  const nueva = await crearCama(sala, cama);
  const paciente = await crearPacienteBasico(creadoPorId);
  await prisma.asignacionCama.create({
    data: {
      pacienteId: paciente.id,
      camaId: nueva.id,
      motivo: 'INGRESO',
      fechaDesde: paciente.fechaIngreso,
      asignadoPorId: creadoPorId,
    },
  });
  return { paciente, cama: nueva };
}

/** Prescripción vigente cada 8 h de un medicamento nuevo, salvo lo que se indique. */
export async function crearPrescripcionBasica(
  pacienteId: number,
  prescriptorId: number,
  datos: Partial<Prisma.PrescripcionUncheckedCreateInput> = {},
) {
  const insumoId = datos.insumoId ?? (await crearInsumo()).id;
  const fechaInicio = datos.fechaInicio ?? new Date();
  return prisma.prescripcion.create({
    data: {
      pacienteId,
      insumoId,
      dosis: 500,
      unidadDosis: 'mg',
      frecuenciaHoras: 8,
      via: 'ORAL',
      prescriptorId,
      ...datos,
      fechaInicio,
      // Sin re-anclar (D112): la agenda se cuenta desde el inicio.
      agendaDesde: datos.agendaDesde ?? fechaInicio,
    },
  });
}

export async function crearTipoEstudio(
  datos: Partial<Prisma.TipoEstudioUncheckedCreateInput> = {},
) {
  return prisma.tipoEstudio.create({ data: { nombre: `Estudio ${siguiente()}`, ...datos } });
}

/** Estudio PROGRAMADO de un tipo nuevo, salvo lo que se indique. */
export async function crearEstudio(
  pacienteId: number,
  creadoPorId: number,
  datos: Partial<Prisma.EstudioUncheckedCreateInput> = {},
) {
  const tipoEstudioId = datos.tipoEstudioId ?? (await crearTipoEstudio()).id;
  return prisma.estudio.create({
    data: {
      pacienteId,
      tipoEstudioId,
      nombre: 'Rx de tórax',
      fechaHora: new Date(Date.now() + 3_600_000),
      creadoPorId,
      ...datos,
    },
  });
}
