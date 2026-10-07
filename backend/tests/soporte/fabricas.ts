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
