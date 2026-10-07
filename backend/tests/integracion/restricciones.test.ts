import type { Prisma } from '@prisma/client';
import { cifrar } from '../../src/comun/cifrado';
import { config } from '../../src/config';
import { prisma } from '../../src/db';
import { patronABytes } from '../../src/modulos/biometria/cifrado-biometrico';
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

  it('el patrón facial (cifrado) tiene exactamente 128 valores', async () => {
    const llavero = config.biometria.llavero;
    await expect(
      prisma.datoBiometrico.create({
        data: {
          usuarioId,
          patronCifrado: cifrar(patronABytes([0.1, 0.2]), llavero.actual, 'prueba'),
          fotoCifrada: cifrar(Buffer.from('x'), llavero.actual, 'prueba'),
          fotoTipo: 'image/jpeg',
          registradoPorId: usuarioId,
        },
      }),
    ).rejects.toThrow(/datos_biometricos_patron_128/);
  });

  describe('recordatorios (E5 · D13)', () => {
    const toma = new Date('2026-10-07T08:00:00Z');
    let pacienteId: number;
    let prescripcionId: number;

    beforeEach(async () => {
      pacienteId = (await crearPacienteBasico(usuarioId)).id;
      const insumo = await crearInsumo();
      prescripcionId = (
        await prisma.prescripcion.create({
          data: {
            pacienteId,
            insumoId: insumo.id,
            dosis: 500,
            unidadDosis: 'mg',
            frecuenciaHoras: 8,
            via: 'ORAL',
            fechaInicio: toma,
            prescriptorId: usuarioId,
          },
        })
      ).id;
    });

    const recordar = (datos: Partial<Prisma.RecordatorioUncheckedCreateInput> = {}) =>
      prisma.recordatorio.create({
        data: {
          tipo: 'MEDICAMENTO',
          pacienteId,
          prescripcionId,
          fechaHoraObjetivo: toma,
          prioridad: 'MEDIA',
          ...datos,
        },
      });

    const estudioProgramado = async () => {
      const tipo = await prisma.tipoEstudio.create({ data: { nombre: 'Radiografía' } });
      return prisma.estudio.create({
        data: {
          pacienteId,
          tipoEstudioId: tipo.id,
          nombre: 'Rx de tórax',
          fechaHora: toma,
          creadoPorId: usuarioId,
        },
      });
    };

    it('una toma tiene un solo recordatorio que no esté cancelado', async () => {
      await recordar();
      await expect(recordar()).rejects.toThrow(/Unique constraint/);
      await expect(recordar({ estado: 'VENCIDO', vencidoEn: toma })).rejects.toThrow(
        /Unique constraint/,
      );
    });

    it('una toma cancelada se vuelve a recordar (al reanudar o modificar la prescripción)', async () => {
      await recordar({ estado: 'CANCELADO' });
      await expect(recordar()).resolves.toMatchObject({ estado: 'PENDIENTE' });
    });

    it('un estudio tiene un solo recordatorio activo por horario', async () => {
      const estudio = await estudioProgramado();
      const delEstudio = { tipo: 'ESTUDIO', prescripcionId: null, estudioId: estudio.id } as const;
      await recordar({ ...delEstudio, estado: 'CANCELADO' });
      await recordar(delEstudio);
      await expect(recordar(delEstudio)).rejects.toThrow(/Unique constraint/);
    });

    it('un recordatorio atendido dice cuándo y cómo se resolvió', async () => {
      const atender = (datos: Partial<Prisma.RecordatorioUncheckedCreateInput>) =>
        recordar({ estado: 'ATENDIDO', atendidoPorId: usuarioId, ...datos });
      const suministro = await prisma.suministro.create({
        data: { pacienteId, usuarioId, tipo: 'MEDICAMENTO', prescripcionId, fechaHora: toma },
      });

      await expect(atender({ motivoNoAdministrado: 'Paciente en ayunas' })).rejects.toThrow(
        /recordatorios_atendido_completo/,
      );
      await expect(atender({ atendidoEn: toma })).rejects.toThrow(
        /recordatorios_atendido_completo/,
      );
      await expect(
        atender({ atendidoEn: toma, suministroId: suministro.id, motivoNoAdministrado: 'Ambos' }),
      ).rejects.toThrow(/recordatorios_atendido_completo/);
      await expect(
        atender({ atendidoEn: toma, suministroId: suministro.id }),
      ).resolves.toMatchObject({ estado: 'ATENDIDO' });
    });

    it('un recordatorio vencido guarda cuándo venció', async () => {
      await expect(recordar({ estado: 'VENCIDO' })).rejects.toThrow(
        /recordatorios_vencido_con_fecha/,
      );
      await expect(recordar({ estado: 'VENCIDO', vencidoEn: toma })).resolves.toMatchObject({
        estado: 'VENCIDO',
      });
    });

    it('una toma recuerda una prescripción y un estudio recuerda un estudio', async () => {
      const estudio = await estudioProgramado();
      await expect(recordar({ prescripcionId: null })).rejects.toThrow(
        /recordatorios_origen_segun_tipo/,
      );
      await expect(recordar({ tipo: 'ESTUDIO' })).rejects.toThrow(
        /recordatorios_origen_segun_tipo/,
      );
      await expect(recordar({ estudioId: estudio.id })).rejects.toThrow(
        /recordatorios_origen_segun_tipo/,
      );
    });
  });

  describe('estudios (E5 · T512 · T513)', () => {
    let pacienteId: number;
    let tipoEstudioId: number;

    beforeEach(async () => {
      pacienteId = (await crearPacienteBasico(usuarioId)).id;
      tipoEstudioId = (await prisma.tipoEstudio.create({ data: { nombre: 'Radiografía' } })).id;
    });

    const estudio = (datos: Partial<Prisma.EstudioUncheckedCreateInput> = {}) =>
      prisma.estudio.create({
        data: {
          pacienteId,
          tipoEstudioId,
          nombre: 'Rx de tórax',
          fechaHora: new Date('2026-10-08T13:00:00Z'),
          creadoPorId: usuarioId,
          ...datos,
        },
      });

    it('un estudio realizado dice cuándo y quién lo confirmó con su rostro', async () => {
      const realizadoEn = new Date('2026-10-08T13:10:00Z');
      await expect(estudio({ estado: 'REALIZADO' })).rejects.toThrow(/estudios_realizado_completo/);
      await expect(estudio({ estado: 'REALIZADO', realizadoEn })).rejects.toThrow(
        /estudios_realizado_completo/,
      );
      await expect(estudio({ estado: 'REALIZADO', confirmadoPorId: usuarioId })).rejects.toThrow(
        /estudios_realizado_completo/,
      );
      await expect(
        estudio({ estado: 'REALIZADO', realizadoEn, confirmadoPorId: usuarioId }),
      ).resolves.toMatchObject({ estado: 'REALIZADO' });
    });

    it('un estudio cancelado dice por qué', async () => {
      await expect(estudio({ estado: 'CANCELADO' })).rejects.toThrow(
        /estudios_cancelado_con_motivo/,
      );
      await expect(
        estudio({ estado: 'CANCELADO', motivoCancelacion: 'Se suspendió el turno' }),
      ).resolves.toMatchObject({ estado: 'CANCELADO' });
    });

    it('guarda las observaciones de quien programa y de quien confirma', async () => {
      const e = await estudio({
        observaciones: 'Trasladar en silla de ruedas',
        estado: 'REALIZADO',
        realizadoEn: new Date('2026-10-08T13:10:00Z'),
        confirmadoPorId: usuarioId,
        observacionesRealizacion: 'Sin novedad',
      });
      expect(e).toMatchObject({
        observaciones: 'Trasladar en silla de ruedas',
        observacionesRealizacion: 'Sin novedad',
      });
      await expect(estudio({ observaciones: 'x'.repeat(501) })).rejects.toThrow(/too long/);
    });
  });
});
