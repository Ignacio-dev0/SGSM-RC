import type { Prisma } from '@prisma/client';
import request from 'supertest';
import { prisma } from '../../db';
import { reloj } from '../../comun/reloj';
import { crearEstudio, crearTipoEstudio, internarPaciente } from '../../../tests/soporte/fabricas';
import { agenteConRol, obtenerApp, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { bus } from '../tiempo-real/bus';

const AHORA = new Date('2026-10-07T12:00:00Z');
const enMin = (m: number) => new Date(AHORA.getTime() + m * 60_000);
const DIA = 24 * 60;

type Sesion = Awaited<ReturnType<typeof agenteConRol>>;

/** Programar, consultar, reprogramar y cancelar estudios (T509–T512 · S15). */
describe('API de estudios (T509–T512 · S15)', () => {
  let medico: Sesion;
  let enfermera: Sesion;
  let pacienteId: number;
  let rx: number;
  let laboratorio: number;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    jest.spyOn(reloj, 'ahora').mockReturnValue(AHORA);
    medico = await agenteConRol('MEDICO');
    enfermera = await agenteConRol('ENFERMERO');
    pacienteId = (await internarPaciente(medico.usuario.id, { cama: 'A-01' })).paciente.id;
    rx = (await crearTipoEstudio({ nombre: 'Radiografía' })).id;
    laboratorio = (
      await crearTipoEstudio({
        nombre: 'Análisis de laboratorio',
        preparacionPorDefecto: 'Ayuno de 8 horas',
      })
    ).id;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  const programar = (cuerpo: Record<string, unknown> = {}, s = medico, id = pacienteId) =>
    s.agente
      .post(`/api/pacientes/${id}/estudios`)
      .send({ tipoEstudioId: rx, fechaHora: enMin(120).toISOString(), ...cuerpo });

  const estudio = (datos: Partial<Prisma.EstudioUncheckedCreateInput> = {}) =>
    crearEstudio(pacienteId, medico.usuario.id, {
      tipoEstudioId: rx,
      fechaHora: enMin(20),
      ...datos,
    });

  const recordar = (
    estudioId: number,
    datos: Partial<Prisma.RecordatorioUncheckedCreateInput> = {},
  ) =>
    prisma.recordatorio.create({
      data: {
        tipo: 'ESTUDIO',
        pacienteId,
        estudioId,
        fechaHoraObjetivo: enMin(20),
        generadoEn: enMin(-10),
        prioridad: 'MEDIA',
        ...datos,
      },
    });

  /** Espía el bus y cuenta, desde otra conexión, los recordatorios cancelados al avisar. */
  const espiarBus = () => {
    const vistos: Promise<number>[] = [];
    const publicar = jest.spyOn(bus, 'publicar').mockImplementation(() => {
      vistos.push(prisma.recordatorio.count({ where: { estado: 'CANCELADO' } }));
    });
    return { publicar, vistos };
  };

  describe('GET /api/tipos-estudio', () => {
    it('lista los tipos activos por nombre, con su preparación por defecto', async () => {
      await crearTipoEstudio({ nombre: 'Densitometría', activo: false });

      const res = await enfermera.agente.get('/api/tipos-estudio');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([
        {
          id: laboratorio,
          nombre: 'Análisis de laboratorio',
          preparacionPorDefecto: 'Ayuno de 8 horas',
        },
        { id: rx, nombre: 'Radiografía', preparacionPorDefecto: null },
      ]);
    });
  });

  describe('programar: POST /api/pacientes/:id/estudios (T511)', () => {
    it('programa el estudio con el nombre y la preparación del tipo y lo audita', async () => {
      const res = await programar({ tipoEstudioId: laboratorio });

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({
        id: expect.any(Number),
        pacienteId,
        tipoEstudio: { id: laboratorio, nombre: 'Análisis de laboratorio' },
        nombre: 'Análisis de laboratorio',
        fechaHora: enMin(120).toISOString(),
        preparacion: 'Ayuno de 8 horas',
        observaciones: null,
        estado: 'PROGRAMADO',
        motivoCancelacion: null,
        realizadoEn: null,
        confirmadoPor: null,
        observacionesRealizacion: null,
        creadoPor: { id: medico.usuario.id, nombre: `${medico.usuario.apellido}, Prueba` },
        creadoEn: expect.any(String),
      });
      const auditoria = await prisma.auditoria.findMany({ where: { entidad: 'Estudio' } });
      expect(auditoria).toEqual([
        expect.objectContaining({
          accion: 'PROGRAMAR',
          entidadId: String(res.body.data.id),
          usuarioId: medico.usuario.id,
          pacienteId,
          valorNuevo: expect.objectContaining({
            nombre: 'Análisis de laboratorio',
            fechaHora: enMin(120).toISOString(),
          }),
        }),
      ]);
      // El recordatorio lo genera el temporizador cuando el estudio entra en la ventana (D31).
      expect(await prisma.recordatorio.count()).toBe(0);
    });

    it('permite precisar el nombre, cambiar la preparación (o quitarla) y dejar observaciones', async () => {
      const res = await programar({
        tipoEstudioId: laboratorio,
        nombre: 'Hemograma y glucemia',
        preparacion: 'Ayuno de 12 horas',
        observaciones: 'Extraer en la cama',
      });
      expect(res.body.data).toMatchObject({
        nombre: 'Hemograma y glucemia',
        preparacion: 'Ayuno de 12 horas',
        observaciones: 'Extraer en la cama',
      });

      const sinPreparacion = await programar({ tipoEstudioId: laboratorio, preparacion: null });
      expect(sinPreparacion.body.data.preparacion).toBeNull();
    });

    it.each([
      ['5 min antes de ahora (tolerancia del reloj)', -5, 201],
      ['6 min antes de ahora', -6, 422],
      ['dentro de 90 días', 90 * DIA, 201],
      ['dentro de 90 días y 1 min', 90 * DIA + 1, 422],
    ])('con la fecha %s responde %i (D26)', async (_caso, minutos, estado) => {
      const res = await programar({ fechaHora: enMin(minutos).toISOString() });
      expect(res.status).toBe(estado);
      if (estado === 422) expect(res.body.error.codigo).toBe('FECHA_ESTUDIO_INVALIDA');
    });

    it('solo programa estudios a pacientes internados', async () => {
      await prisma.paciente.update({
        where: { id: pacienteId },
        data: { estado: 'EGRESADO', fechaEgreso: enMin(-60), motivoEgreso: 'Alta' },
      });
      const egresado = await programar();
      expect(egresado.status).toBe(409);
      expect(egresado.body.error.codigo).toBe('PACIENTE_NO_INTERNADO');

      expect((await programar({}, medico, pacienteId + 999)).status).toBe(404);
      expect(await prisma.estudio.count()).toBe(0);
    });

    it('rechaza un tipo inexistente (404) o dado de baja (422)', async () => {
      expect((await programar({ tipoEstudioId: rx + 999 })).status).toBe(404);

      await prisma.tipoEstudio.update({ where: { id: rx }, data: { activo: false } });
      const res = await programar();
      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('TIPO_ESTUDIO_NO_DISPONIBLE');
    });

    it('responde 400 con el campo que falla', async () => {
      const res = await programar({ fechaHora: 'mañana' });
      expect(res.status).toBe(400);
      expect(res.body.error.detalles[0].campo).toBe('fechaHora');
    });
  });

  describe('consultar: GET /api/pacientes/:id/estudios y /api/estudios/:id (T510)', () => {
    it('programados primero (el más próximo arriba), después el resto (el más reciente arriba)', async () => {
      const manana = await estudio({ fechaHora: enMin(DIA) });
      const hoy = await estudio({ fechaHora: enMin(60) });
      const realizadoAyer = await estudio({
        fechaHora: enMin(-DIA),
        estado: 'REALIZADO',
        realizadoEn: enMin(-DIA + 30),
        confirmadoPorId: enfermera.usuario.id,
      });
      const canceladoHoy = await estudio({
        fechaHora: enMin(-60),
        estado: 'CANCELADO',
        motivoCancelacion: 'Se suspendió el turno',
      });
      const otro = await internarPaciente(medico.usuario.id);
      await crearEstudio(otro.paciente.id, medico.usuario.id, { tipoEstudioId: rx });

      const res = await enfermera.agente.get(`/api/pacientes/${pacienteId}/estudios`);

      expect(res.status).toBe(200);
      expect(res.body.data.map((e: { id: number }) => e.id)).toEqual([
        hoy.id,
        manana.id,
        canceladoHoy.id,
        realizadoAyer.id,
      ]);
      expect(res.body.data[3].confirmadoPor).toEqual({
        id: enfermera.usuario.id,
        nombre: `${enfermera.usuario.apellido}, Prueba`,
      });

      const programados = await enfermera.agente.get(
        `/api/pacientes/${pacienteId}/estudios?estado=PROGRAMADO`,
      );
      expect(programados.body.data.map((e: { id: number }) => e.id)).toEqual([hoy.id, manana.id]);
    });

    it('un paciente inexistente responde 404 y un estado inválido 400', async () => {
      expect((await enfermera.agente.get(`/api/pacientes/${pacienteId + 9}/estudios`)).status).toBe(
        404,
      );
      expect(
        (await enfermera.agente.get(`/api/pacientes/${pacienteId}/estudios?estado=OTRO`)).status,
      ).toBe(400);
    });

    it('GET /api/estudios/:id devuelve el detalle o 404', async () => {
      const e = await estudio({ preparacion: 'Retirar alhajas' });

      const res = await enfermera.agente.get(`/api/estudios/${e.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: e.id,
        tipoEstudio: { id: rx, nombre: 'Radiografía' },
        nombre: 'Rx de tórax',
        preparacion: 'Retirar alhajas',
        estado: 'PROGRAMADO',
      });

      expect((await enfermera.agente.get(`/api/estudios/${e.id + 9}`)).status).toBe(404);
    });
  });

  describe('reprogramar: PATCH /api/estudios/:id (T512)', () => {
    it('cambia la hora, lo audita y cancela su recordatorio pendiente; avisa una vez tras el commit', async () => {
      const e = await estudio();
      const pendiente = await recordar(e.id);
      const { publicar, vistos } = espiarBus();

      const res = await medico.agente
        .patch(`/api/estudios/${e.id}`)
        .send({ fechaHora: enMin(180).toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        estado: 'PROGRAMADO',
        fechaHora: enMin(180).toISOString(),
      });
      expect(
        (await prisma.recordatorio.findUniqueOrThrow({ where: { id: pendiente.id } })).estado,
      ).toBe('CANCELADO');
      expect(publicar).toHaveBeenCalledTimes(1);
      expect(publicar).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'recordatorios', nuevos: 0, vencidos: 0 }),
      );
      expect(await Promise.all(vistos)).toEqual([1]);

      const acciones = await prisma.auditoria.findMany({
        where: { pacienteId, entidad: { in: ['Estudio', 'Recordatorio'] } },
        orderBy: { id: 'asc' },
      });
      expect(acciones).toEqual([
        expect.objectContaining({
          accion: 'REPROGRAMAR',
          entidad: 'Estudio',
          usuarioId: medico.usuario.id,
          valorAnterior: { fechaHora: enMin(20).toISOString() },
          valorNuevo: { fechaHora: enMin(180).toISOString() },
        }),
        expect.objectContaining({
          accion: 'CANCELAR',
          entidad: 'Recordatorio',
          entidadId: String(pendiente.id),
          usuarioId: medico.usuario.id,
        }),
      ]);
    });

    it('cancela también un recordatorio vencido de la hora vieja, que conserva vencidoEn (D28)', async () => {
      const e = await estudio({ fechaHora: enMin(-40) });
      const vencido = await recordar(e.id, {
        fechaHoraObjetivo: enMin(-40),
        generadoEn: enMin(-70),
        estado: 'VENCIDO',
        vencidoEn: enMin(-10),
      });

      await medico.agente
        .patch(`/api/estudios/${e.id}`)
        .send({ fechaHora: enMin(60).toISOString() });

      expect(
        await prisma.recordatorio.findUniqueOrThrow({ where: { id: vencido.id } }),
      ).toMatchObject({ estado: 'CANCELADO', vencidoEn: enMin(-10) });
    });

    it('sin recordatorios para cancelar no avisa al tiempo real', async () => {
      const e = await estudio();
      const { publicar } = espiarBus();
      expect(
        (
          await medico.agente
            .patch(`/api/estudios/${e.id}`)
            .send({ fechaHora: enMin(60).toISOString() })
        ).status,
      ).toBe(200);
      expect(publicar).not.toHaveBeenCalled();
    });

    it('solo reprograma un estudio programado, a otra hora razonable', async () => {
      const e = await estudio();
      const reprogramar = (id: number, fechaHora: Date) =>
        medico.agente.patch(`/api/estudios/${id}`).send({ fechaHora: fechaHora.toISOString() });

      const misma = await reprogramar(e.id, enMin(20));
      expect(misma.status).toBe(422);
      expect(misma.body.error.codigo).toBe('SIN_CAMBIOS');

      expect((await reprogramar(e.id, enMin(-60))).body.error.codigo).toBe(
        'FECHA_ESTUDIO_INVALIDA',
      );

      const cancelado = await estudio({
        estado: 'CANCELADO',
        motivoCancelacion: 'Turno suspendido',
      });
      const res = await reprogramar(cancelado.id, enMin(60));
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        codigo: 'ESTUDIO_NO_PROGRAMADO',
        detalles: { estado: 'CANCELADO' },
      });

      expect((await reprogramar(e.id + 99, enMin(60))).status).toBe(404);
    });
  });

  describe('cancelar: POST /api/estudios/:id/cancelar (T512)', () => {
    it('cancela con el motivo, lo audita, cancela su recordatorio y avisa tras el commit', async () => {
      const e = await estudio();
      const pendiente = await recordar(e.id);
      const { publicar, vistos } = espiarBus();

      const res = await medico.agente
        .post(`/api/estudios/${e.id}/cancelar`)
        .send({ motivo: '  Se suspendió el turno ' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        estado: 'CANCELADO',
        motivoCancelacion: 'Se suspendió el turno',
      });
      expect(
        (await prisma.recordatorio.findUniqueOrThrow({ where: { id: pendiente.id } })).estado,
      ).toBe('CANCELADO');
      expect(publicar).toHaveBeenCalledTimes(1);
      expect(await Promise.all(vistos)).toEqual([1]);
      expect(
        await prisma.auditoria.findFirst({ where: { accion: 'CANCELAR', entidad: 'Estudio' } }),
      ).toMatchObject({
        entidadId: String(e.id),
        usuarioId: medico.usuario.id,
        pacienteId,
        valorAnterior: { estado: 'PROGRAMADO' },
        valorNuevo: { estado: 'CANCELADO', motivoCancelacion: 'Se suspendió el turno' },
        detalle: 'Se suspendió el turno',
      });
    });

    it('un estudio cancelado o realizado no se vuelve a cancelar (409); sin motivo, 400', async () => {
      const realizado = await estudio({
        estado: 'REALIZADO',
        realizadoEn: enMin(-5),
        confirmadoPorId: enfermera.usuario.id,
      });
      const res = await medico.agente
        .post(`/api/estudios/${realizado.id}/cancelar`)
        .send({ motivo: 'Error de carga' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        codigo: 'ESTUDIO_NO_PROGRAMADO',
        detalles: { estado: 'REALIZADO' },
      });

      const e = await estudio();
      const sinMotivo = await medico.agente.post(`/api/estudios/${e.id}/cancelar`).send({});
      expect(sinMotivo.status).toBe(400);
      expect(sinMotivo.body.error.detalles[0].campo).toBe('motivo');
    });
  });

  describe('control de acceso con los tres roles (S15)', () => {
    it.each([
      ['MEDICO', 201],
      ['ADMINISTRADOR', 201],
      ['ENFERMERO', 403],
    ] as const)('el %s programa estudios: %i', async (rol, estado) => {
      expect((await programar({}, await agenteConRol(rol))).status).toBe(estado);
    });

    it('enfermería no reprograma ni cancela', async () => {
      const e = await estudio();
      expect(
        (await enfermera.agente.patch(`/api/estudios/${e.id}`).send({ fechaHora: enMin(60) }))
          .status,
      ).toBe(403);
      expect(
        (await enfermera.agente.post(`/api/estudios/${e.id}/cancelar`).send({ motivo: 'Turno' }))
          .status,
      ).toBe(403);
    });

    it.each(['ADMINISTRADOR', 'MEDICO', 'ENFERMERO'] as const)(
      'el %s ve los tipos y los estudios',
      async (rol) => {
        const { agente } = await agenteConRol(rol);
        const e = await estudio();
        expect((await agente.get('/api/tipos-estudio')).status).toBe(200);
        expect((await agente.get(`/api/pacientes/${pacienteId}/estudios`)).status).toBe(200);
        expect((await agente.get(`/api/estudios/${e.id}`)).status).toBe(200);
      },
    );

    it('sin sesión responde 401', async () => {
      expect((await request(obtenerApp()).get('/api/tipos-estudio')).status).toBe(401);
      expect((await request(obtenerApp()).get('/api/estudios/1')).status).toBe(401);
    });
  });
});
