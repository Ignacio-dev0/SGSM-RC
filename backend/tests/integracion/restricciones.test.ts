import { prisma } from '../../src/db';
import { limpiarBase } from '../soporte/base';
import {
  crearCama,
  crearInsumo,
  crearPacienteBasico,
  crearUsuarioBasico,
} from '../soporte/fabricas';

describe('restricciones de negocio en la base (T102)', () => {
  let usuarioId: number;

  beforeEach(async () => {
    await limpiarBase();
    usuarioId = (await crearUsuarioBasico()).id;
  });

  afterAll(() => prisma.$disconnect());

  const asignar = (pacienteId: number, camaId: number, fechaHasta: Date | null = null) =>
    prisma.asignacionCama.create({
      data: {
        pacienteId,
        camaId,
        motivo: 'INGRESO',
        fechaDesde: new Date(),
        fechaHasta,
        asignadoPorId: usuarioId,
      },
    });

  it('RN02: una cama no puede tener dos pacientes activos', async () => {
    const cama = await crearCama();
    const p1 = await crearPacienteBasico(usuarioId);
    const p2 = await crearPacienteBasico(usuarioId);
    await asignar(p1.id, cama.id);

    await expect(asignar(p2.id, cama.id)).rejects.toThrow(/Unique constraint/);
  });

  it('RN02: la cama se puede volver a asignar cuando la asignación anterior se cerró', async () => {
    const cama = await crearCama();
    const p1 = await crearPacienteBasico(usuarioId);
    const p2 = await crearPacienteBasico(usuarioId);
    await asignar(p1.id, cama.id, new Date());

    await expect(asignar(p2.id, cama.id)).resolves.toMatchObject({ camaId: cama.id });
  });

  it('RN02: un paciente no puede ocupar dos camas a la vez', async () => {
    const [c1, c2] = [await crearCama(), await crearCama()];
    const p = await crearPacienteBasico(usuarioId);
    await asignar(p.id, c1.id);

    await expect(asignar(p.id, c2.id)).rejects.toThrow(/Unique constraint/);
  });

  it('RN08: no puede haber dos pacientes con el mismo DNI', async () => {
    await crearPacienteBasico(usuarioId, { dni: '30111222' });
    await expect(crearPacienteBasico(usuarioId, { dni: '30111222' })).rejects.toThrow(
      /Unique constraint/,
    );
  });

  it('un egreso necesita fecha y motivo', async () => {
    await expect(
      crearPacienteBasico(usuarioId, { estado: 'EGRESADO', fechaEgreso: null }),
    ).rejects.toThrow(/pacientes_egreso_completo/);
  });

  it('la dosis y la frecuencia de una prescripción tienen que ser válidas', async () => {
    const p = await crearPacienteBasico(usuarioId);
    const insumo = await crearInsumo();
    const prescribir = (dosis: number, frecuenciaHoras: number) =>
      prisma.prescripcion.create({
        data: {
          pacienteId: p.id,
          insumoId: insumo.id,
          dosis,
          unidadDosis: 'mg',
          frecuenciaHoras,
          via: 'ORAL',
          fechaInicio: new Date(),
          prescriptorId: usuarioId,
        },
      });

    await expect(prescribir(0, 8)).rejects.toThrow(/prescripciones_dosis_positiva/);
    await expect(prescribir(500, 0)).rejects.toThrow(/prescripciones_frecuencia_valida/);
  });

  it('la cantidad suministrada tiene que ser positiva', async () => {
    const p = await crearPacienteBasico(usuarioId);
    const insumo = await crearInsumo();
    await expect(
      prisma.suministro.create({
        data: {
          pacienteId: p.id,
          usuarioId,
          tipo: 'INSUMOS',
          fechaHora: new Date(),
          detalles: { create: [{ insumoId: insumo.id, cantidad: -1 }] },
        },
      }),
    ).rejects.toThrow(/detalles_suministro_cantidad_positiva/);
  });

  it('el patrón facial tiene exactamente 128 valores', async () => {
    await expect(
      prisma.datoBiometrico.create({
        data: {
          usuarioId,
          patron: [0.1, 0.2],
          fotoReferencia: Buffer.from('x'),
          fotoTipo: 'image/jpeg',
          registradoPorId: usuarioId,
        },
      }),
    ).rejects.toThrow(/datos_biometricos_patron_128/);
  });
});
