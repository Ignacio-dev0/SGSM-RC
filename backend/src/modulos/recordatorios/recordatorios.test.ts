import type { Prisma } from '@prisma/client';
import request from 'supertest';
import { prisma } from '../../db';
import { reloj } from '../../comun/reloj';
import {
  crearInsumo,
  crearPrescripcionBasica,
  internarPaciente,
} from '../../../tests/soporte/fabricas';
import { agenteConRol, obtenerApp, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { bus } from '../tiempo-real/bus';

const AHORA = new Date('2026-10-07T12:00:00Z');
const enMin = (m: number) => new Date(AHORA.getTime() + m * 60_000);

type Sesion = Awaited<ReturnType<typeof agenteConRol>>;

describe('API de recordatorios (T506 · T507 · S12–S14)', () => {
  let medico: Sesion;
  let enfermera: Sesion;
  let pacienteId: number;
  let prescripcionId: number;
  let salaAId: number;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    jest.spyOn(reloj, 'ahora').mockReturnValue(AHORA);
    medico = await agenteConRol('MEDICO');
    enfermera = await agenteConRol('ENFERMERO');
    const internado = await internarPaciente(medico.usuario.id, { sala: 'Sala A', cama: 'A-01' });
    pacienteId = internado.paciente.id;
    salaAId = internado.cama.salaId;
    const paracetamol = await crearInsumo({ nombre: 'Paracetamol', presentacion: '500 mg' });
    prescripcionId = (
      await crearPrescripcionBasica(pacienteId, medico.usuario.id, {
        insumoId: paracetamol.id,
        fechaInicio: enMin(-24 * 60),
      })
    ).id;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  const recordar = (datos: Partial<Prisma.RecordatorioUncheckedCreateInput> = {}) =>
    prisma.recordatorio.create({
      data: {
        tipo: 'MEDICAMENTO',
        pacienteId,
        prescripcionId,
        fechaHoraObjetivo: enMin(10),
        generadoEn: enMin(-20),
        prioridad: 'MEDIA',
        ...datos,
      },
    });

  describe('GET /api/recordatorios', () => {
    it('lista los pendientes y los vencidos de las últimas 12 h, por urgencia', async () => {
      const baja = await recordar({ fechaHoraObjetivo: enMin(25), prioridad: 'BAJA' });
      const alta = await recordar({ fechaHoraObjetivo: enMin(3), prioridad: 'ALTA' });
      const vencido = await recordar({
        fechaHoraObjetivo: enMin(-40),
        prioridad: 'ALTA',
        estado: 'VENCIDO',
        vencidoEn: enMin(-10),
      });
      const media = await recordar({ fechaHoraObjetivo: enMin(10), prioridad: 'MEDIA' });
      await recordar({
        fechaHoraObjetivo: enMin(-13 * 60),
        prioridad: 'ALTA',
        estado: 'VENCIDO',
        vencidoEn: enMin(-12 * 60 - 1),
      });
      await recordar({
        fechaHoraObjetivo: enMin(-60),
        estado: 'ATENDIDO',
        atendidoEn: enMin(-55),
        motivoNoAdministrado: 'Paciente en ayunas',
      });
      await recordar({ fechaHoraObjetivo: enMin(-120), estado: 'CANCELADO' });

      const res = await enfermera.agente.get('/api/recordatorios');

      expect(res.status).toBe(200);
      expect(res.body.data.map((r: { id: number }) => r.id)).toEqual([
        vencido.id,
        alta.id,
        media.id,
        baja.id,
      ]);
      expect(res.body.meta).toEqual({ total: 4, urgentes: 2, ahora: AHORA.toISOString() });
    });

    it('cada recordatorio trae lo que necesita la tarjeta y "Administrar"', async () => {
      const r = await recordar({ prioridad: 'ALTA', fechaHoraObjetivo: enMin(4) });

      const res = await enfermera.agente.get('/api/recordatorios');

      const paciente = await prisma.paciente.findUniqueOrThrow({ where: { id: pacienteId } });
      expect(res.body.data[0]).toEqual({
        id: r.id,
        tipo: 'MEDICAMENTO',
        estado: 'PENDIENTE',
        prioridad: 'ALTA',
        fechaHoraObjetivo: enMin(4).toISOString(),
        generadoEn: enMin(-20).toISOString(),
        vencidoEn: null,
        paciente: {
          id: pacienteId,
          apellido: paciente.apellido,
          nombre: paciente.nombre,
          dni: paciente.dni,
        },
        cama: { numero: 'A-01', sala: { id: salaAId, nombre: 'Sala A' } },
        prescripcion: {
          id: prescripcionId,
          medicamento: 'Paracetamol',
          presentacion: '500 mg',
          dosis: 500,
          unidadDosis: 'mg',
          via: 'ORAL',
          frecuenciaHoras: 8,
        },
        estudio: null,
        atendidoEn: null,
        atendidoPor: null,
        suministroId: null,
        motivoNoAdministrado: null,
      });
    });

    it('no muestra los de pacientes egresados (D19)', async () => {
      await recordar({ estado: 'VENCIDO', vencidoEn: enMin(-5), fechaHoraObjetivo: enMin(-35) });
      await prisma.paciente.update({
        where: { id: pacienteId },
        data: { estado: 'EGRESADO', fechaEgreso: enMin(-1), motivoEgreso: 'Alta médica' },
      });

      const res = await enfermera.agente.get('/api/recordatorios');

      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toMatchObject({ total: 0, urgentes: 0 });
    });

    it('filtra por sala de la cama actual y por tipo', async () => {
      await recordar();
      const otro = await internarPaciente(medico.usuario.id, { sala: 'Sala B', cama: 'B-01' });
      const p2 = await crearPrescripcionBasica(otro.paciente.id, medico.usuario.id);
      const deB = await recordar({ pacienteId: otro.paciente.id, prescripcionId: p2.id });
      const tipo = await prisma.tipoEstudio.create({ data: { nombre: 'Radiografía' } });
      const estudio = await prisma.estudio.create({
        data: {
          pacienteId,
          tipoEstudioId: tipo.id,
          nombre: 'Rx de tórax',
          fechaHora: enMin(20),
          preparacion: 'Retirar alhajas',
          creadoPorId: medico.usuario.id,
        },
      });
      const deEstudio = await recordar({
        tipo: 'ESTUDIO',
        prescripcionId: null,
        estudioId: estudio.id,
        fechaHoraObjetivo: enMin(20),
      });

      const porSala = await enfermera.agente.get(`/api/recordatorios?salaId=${otro.cama.salaId}`);
      expect(porSala.body.data.map((r: { id: number }) => r.id)).toEqual([deB.id]);

      const estudios = await enfermera.agente.get('/api/recordatorios?tipo=ESTUDIO');
      expect(estudios.body.data).toHaveLength(1);
      expect(estudios.body.data[0]).toMatchObject({
        id: deEstudio.id,
        prescripcion: null,
        estudio: {
          id: estudio.id,
          nombre: 'Rx de tórax',
          tipoEstudio: 'Radiografía',
          preparacion: 'Retirar alhajas',
        },
      });

      const medicamentosDeA = await enfermera.agente.get(
        `/api/recordatorios?tipo=MEDICAMENTO&salaId=${salaAId}`,
      );
      expect(medicamentosDeA.body.meta.total).toBe(1);
    });

    it('rechaza filtros inválidos', async () => {
      const res = await enfermera.agente.get('/api/recordatorios?tipo=VACUNA');
      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
    });
  });

  describe('POST /api/recordatorios/:id/no-administrar ("No se administró")', () => {
    const noAdministrar = (id: number, motivo: unknown = 'Paciente en ayunas', s = enfermera) =>
      s.agente.post(`/api/recordatorios/${id}/no-administrar`).send({ motivo });

    it('atiende la toma con el motivo, quién y cuándo; lo audita y avisa', async () => {
      const r = await recordar();
      const publicar = jest.spyOn(bus, 'publicar');

      const res = await noAdministrar(r.id, '  Paciente en ayunas para un estudio  ');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: r.id,
        estado: 'ATENDIDO',
        atendidoEn: AHORA.toISOString(),
        atendidoPor: {
          id: enfermera.usuario.id,
          nombre: `${enfermera.usuario.apellido}, ${enfermera.usuario.nombre}`,
        },
        motivoNoAdministrado: 'Paciente en ayunas para un estudio',
        suministroId: null,
      });
      const auditoria = await prisma.auditoria.findFirstOrThrow({
        where: { accion: 'NO_ADMINISTRAR' },
      });
      expect(auditoria).toMatchObject({
        usuarioId: enfermera.usuario.id,
        entidad: 'Recordatorio',
        entidadId: String(r.id),
        pacienteId,
        detalle: 'Paciente en ayunas para un estudio',
      });
      expect(publicar).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'recordatorios', nuevos: 0, vencidos: 0 }),
      );
    });

    it('un vencido se puede atender tarde y conserva cuándo venció', async () => {
      const r = await recordar({ estado: 'VENCIDO', vencidoEn: enMin(-5) });

      const res = await noAdministrar(r.id);

      expect(res.body.data).toMatchObject({
        estado: 'ATENDIDO',
        vencidoEn: enMin(-5).toISOString(),
      });
    });

    it.each([
      ['ATENDIDO', { atendidoEn: enMin(-1), motivoNoAdministrado: 'Otro motivo' }, /atendido/],
      ['CANCELADO', {}, /cancelado/],
    ] as const)('un recordatorio %s no se vuelve a atender (409)', async (estado, extra, msj) => {
      const r = await recordar({ estado, ...extra });

      const res = await noAdministrar(r.id);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        codigo: 'RECORDATORIO_NO_PENDIENTE',
        detalles: { estado },
      });
      expect(res.body.error.mensaje).toMatch(msj);
    });

    it('un recordatorio de estudio se atiende confirmando el estudio (422)', async () => {
      const tipo = await prisma.tipoEstudio.create({ data: { nombre: 'Ecografía' } });
      const estudio = await prisma.estudio.create({
        data: {
          pacienteId,
          tipoEstudioId: tipo.id,
          nombre: 'Eco abdominal',
          fechaHora: enMin(20),
          creadoPorId: medico.usuario.id,
        },
      });
      const r = await recordar({ tipo: 'ESTUDIO', prescripcionId: null, estudioId: estudio.id });

      const res = await noAdministrar(r.id);

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('NO_ES_TOMA');
    });

    it('exige el motivo y responde 404 si el recordatorio no existe', async () => {
      const r = await recordar();
      const sinMotivo = await noAdministrar(r.id, '');
      expect(sinMotivo.status).toBe(400);
      expect(sinMotivo.body.error.detalles[0].campo).toBe('motivo');

      expect((await noAdministrar(r.id + 999)).status).toBe(404);
      expect((await prisma.recordatorio.findUniqueOrThrow({ where: { id: r.id } })).estado).toBe(
        'PENDIENTE',
      );
    });
  });

  describe('control de acceso con los tres roles (S14)', () => {
    it.each(['ADMINISTRADOR', 'MEDICO', 'ENFERMERO'] as const)(
      'el %s ve los recordatorios',
      async (rol) => {
        const { agente } = await agenteConRol(rol);
        expect((await agente.get('/api/recordatorios')).status).toBe(200);
      },
    );

    it.each([
      ['ADMINISTRADOR', 200],
      ['ENFERMERO', 200],
      ['MEDICO', 403],
    ] as const)('el %s registra "No se administró": %i', async (rol, estado) => {
      const r = await recordar();
      const { agente } = await agenteConRol(rol);

      const res = await agente
        .post(`/api/recordatorios/${r.id}/no-administrar`)
        .send({ motivo: 'Paciente en ayunas' });

      expect(res.status).toBe(estado);
    });

    it('sin sesión responde 401', async () => {
      expect((await request(obtenerApp()).get('/api/recordatorios')).status).toBe(401);
    });
  });
});
