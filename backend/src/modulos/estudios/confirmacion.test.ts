import type { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { reloj } from '../../comun/reloj';
import { crearEstudio, crearTipoEstudio, internarPaciente } from '../../../tests/soporte/fabricas';
import { comprobanteDe, registrarRostro } from '../../../tests/soporte/biometria';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { ejecutarCiclo } from '../recordatorios/ciclo.servicio';
import { bus } from '../tiempo-real/bus';

const AHORA = new Date('2026-10-07T12:00:00Z');
const enMin = (m: number) => new Date(AHORA.getTime() + m * 60_000);

type Sesion = Awaited<ReturnType<typeof agenteConRol>>;

/** Enfermería confirma con su rostro que el estudio se realizó y eso atiende su recordatorio. */
describe('confirmar un estudio con el rostro (T513 · S15)', () => {
  let medico: Sesion;
  let enfermera: Sesion;
  let pacienteId: number;
  let tipoEstudioId: number;
  let estudioId: number;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    jest.spyOn(reloj, 'ahora').mockReturnValue(AHORA);
    medico = await agenteConRol('MEDICO');
    enfermera = await agenteConRol('ENFERMERO');
    await registrarRostro(enfermera.usuario.id);
    pacienteId = (await internarPaciente(medico.usuario.id, { cama: 'A-01' })).paciente.id;
    tipoEstudioId = (await crearTipoEstudio({ nombre: 'Radiografía' })).id;
    estudioId = (await estudio()).id;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  function estudio(datos: Partial<Prisma.EstudioUncheckedCreateInput> = {}) {
    return crearEstudio(pacienteId, medico.usuario.id, {
      tipoEstudioId,
      fechaHora: enMin(10),
      ...datos,
    });
  }

  const recordar = (id = estudioId, datos: Partial<Prisma.RecordatorioUncheckedCreateInput> = {}) =>
    prisma.recordatorio.create({
      data: {
        tipo: 'ESTUDIO',
        pacienteId,
        estudioId: id,
        fechaHoraObjetivo: enMin(10),
        generadoEn: enMin(-20),
        prioridad: 'MEDIA',
        ...datos,
      },
    });

  const enviar = (cuerpo: Record<string, unknown>, id = estudioId, s = enfermera) =>
    s.agente.post(`/api/estudios/${id}/confirmar`).send(cuerpo);

  const confirmar = async (extra: Record<string, unknown> = {}, id = estudioId, s = enfermera) =>
    enviar({ validacionToken: await comprobanteDe(s.agente), ...extra }, id, s);

  it('pasa el estudio a REALIZADO con quién y cuándo, y atiende su recordatorio en la misma transacción', async () => {
    const pendiente = await recordar();
    let atendidoAlAvisar: Promise<string> | undefined;
    const publicar = jest.spyOn(bus, 'publicar').mockImplementation(() => {
      // Otra conexión ya ve el recordatorio atendido: el aviso sale después del commit.
      atendidoAlAvisar = prisma.recordatorio
        .findUniqueOrThrow({ where: { id: pendiente.id } })
        .then((r) => r.estado);
    });

    const res = await confirmar({ observaciones: 'Sin novedad' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: estudioId,
      estado: 'REALIZADO',
      realizadoEn: AHORA.toISOString(),
      confirmadoPor: {
        id: enfermera.usuario.id,
        nombre: `${enfermera.usuario.apellido}, Prueba`,
      },
      observacionesRealizacion: 'Sin novedad',
    });
    expect(
      await prisma.recordatorio.findUniqueOrThrow({ where: { id: pendiente.id } }),
    ).toMatchObject({
      estado: 'ATENDIDO',
      atendidoEn: AHORA,
      atendidoPorId: enfermera.usuario.id,
      suministroId: null,
      motivoNoAdministrado: null,
    });
    expect(publicar).toHaveBeenCalledTimes(1);
    expect(publicar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'recordatorios', nuevos: 0, vencidos: 0 }),
    );
    expect(await atendidoAlAvisar).toBe('ATENDIDO');

    const acciones = await prisma.auditoria.findMany({
      where: { pacienteId, entidad: { in: ['Estudio', 'Recordatorio'] } },
      orderBy: { id: 'asc' },
    });
    expect(acciones).toEqual([
      expect.objectContaining({
        accion: 'CONFIRMAR',
        entidad: 'Estudio',
        entidadId: String(estudioId),
        usuarioId: enfermera.usuario.id,
        valorAnterior: { estado: 'PROGRAMADO' },
        valorNuevo: expect.objectContaining({
          estado: 'REALIZADO',
          realizadoEn: AHORA.toISOString(),
          validadoBiometricamente: true,
        }),
        detalle: 'Sin novedad',
      }),
      expect.objectContaining({
        accion: 'ATENDER',
        entidad: 'Recordatorio',
        entidadId: String(pendiente.id),
        usuarioId: enfermera.usuario.id,
        valorAnterior: { estado: 'PENDIENTE' },
      }),
    ]);
  });

  it('atiende también un recordatorio vencido, que conserva vencidoEn', async () => {
    const vencido = await recordar(estudioId, { estado: 'VENCIDO', vencidoEn: enMin(-5) });

    expect((await confirmar()).status).toBe(200);

    expect(
      await prisma.recordatorio.findUniqueOrThrow({ where: { id: vencido.id } }),
    ).toMatchObject({ estado: 'ATENDIDO', vencidoEn: enMin(-5), atendidoEn: AHORA });
  });

  it('sin recordatorio (todavía no se generó) igual confirma, y no avisa al tiempo real (D29)', async () => {
    const lejano = await estudio({ fechaHora: enMin(5 * 60) });
    const publicar = jest.spyOn(bus, 'publicar');

    const res = await confirmar({}, lejano.id);

    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe('REALIZADO');
    expect(publicar).not.toHaveBeenCalled();
  });

  it('exige el comprobante facial vigente de quien confirma, y de un solo uso', async () => {
    const sin = await enviar({});
    expect(sin.status).toBe(403);
    expect(sin.body.error.codigo).toBe('VALIDACION_FACIAL_REQUERIDA');

    // El comprobante de otra persona no sirve (validación 1:1, S6).
    const admin = await agenteConRol('ADMINISTRADOR');
    await registrarRostro(admin.usuario.id);
    const ajeno = await enviar({ validacionToken: await comprobanteDe(admin.agente) });
    expect(ajeno.status).toBe(403);

    const token = await comprobanteDe(enfermera.agente);
    expect((await enviar({ validacionToken: token })).status).toBe(200);
    const otro = await estudio();
    const reusado = await enviar({ validacionToken: token }, otro.id);
    expect(reusado.status).toBe(403);
    expect(reusado.body.error.codigo).toBe('VALIDACION_FACIAL_REQUERIDA');
    expect((await prisma.estudio.findUniqueOrThrow({ where: { id: otro.id } })).estado).toBe(
      'PROGRAMADO',
    );
  });

  it('un estudio cancelado o ya realizado no se confirma (409) y no gasta el comprobante (D33)', async () => {
    const cancelado = await estudio({ estado: 'CANCELADO', motivoCancelacion: 'Turno suspendido' });
    const token = await comprobanteDe(enfermera.agente);

    const res = await enviar({ validacionToken: token }, cancelado.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      codigo: 'ESTUDIO_NO_PROGRAMADO',
      detalles: { estado: 'CANCELADO' },
    });

    // El mismo comprobante sigue sirviendo para la confirmación correcta.
    expect((await enviar({ validacionToken: token })).status).toBe(200);
    expect((await confirmar()).body.error.codigo).toBe('ESTUDIO_NO_PROGRAMADO');
    expect((await confirmar({}, estudioId + 99)).status).toBe(404);
  });

  it.each([
    ['MEDICO', 403],
    ['ADMINISTRADOR', 200],
  ] as const)('el %s confirma estudios: %i', async (rol, estado) => {
    const sesion = await agenteConRol(rol);
    await registrarRostro(sesion.usuario.id);
    expect((await confirmar({}, estudioId, sesion)).status).toBe(estado);
  });

  it('flujo completo: el médico programa, el temporizador recuerda y enfermería confirma', async () => {
    // El estudio de beforeEach, fuera de la ventana de generación.
    await prisma.estudio.update({ where: { id: estudioId }, data: { fechaHora: enMin(5 * 60) } });
    const programado = await medico.agente
      .post(`/api/pacientes/${pacienteId}/estudios`)
      .send({ tipoEstudioId, nombre: 'Rx de cadera', fechaHora: enMin(25).toISOString() });
    expect(programado.status).toBe(201);

    expect((await ejecutarCiclo()).nuevos).toBe(1);
    const panel = await enfermera.agente.get('/api/recordatorios?tipo=ESTUDIO');
    expect(panel.body.data).toEqual([
      expect.objectContaining({
        tipo: 'ESTUDIO',
        prioridad: 'MEDIA',
        fechaHoraObjetivo: enMin(25).toISOString(),
        prescripcion: null,
        estudio: {
          id: programado.body.data.id,
          nombre: 'Rx de cadera',
          tipoEstudio: 'Radiografía',
          preparacion: null,
        },
      }),
    ]);

    expect((await confirmar({}, programado.body.data.id)).status).toBe(200);
    expect((await enfermera.agente.get('/api/recordatorios')).body.meta.total).toBe(0);
  });

  describe('candado del ciclo (D30)', () => {
    /**
     * Una transacción toma el candado del ciclo y crea el recordatorio del estudio sin confirmar,
     * como un ciclo que lo está generando. La operación tiene que esperar a que termine y
     * resolver también ese recordatorio; si no esperara, quedaría un pendiente huérfano.
     */
    it.each([
      [
        'cancelar',
        'CANCELADO',
        () =>
          medico.agente
            .post(`/api/estudios/${estudioId}/cancelar`)
            .send({ motivo: 'Turno suspendido' }),
      ],
      [
        'reprogramar',
        'CANCELADO',
        () =>
          medico.agente
            .patch(`/api/estudios/${estudioId}`)
            .send({ fechaHora: enMin(90).toISOString() }),
      ],
      ['confirmar', 'ATENDIDO', () => confirmar()],
    ] as const)(
      '%s espera al ciclo que está generando el recordatorio',
      async (_op, esperado, hacer) => {
        let generado!: () => void;
        const listo = new Promise<void>((r) => (generado = r));
        let soltar!: () => void;
        const suelto = new Promise<void>((r) => (soltar = r));
        const ciclo = prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(50501::bigint)`;
            await tx.recordatorio.create({
              data: {
                tipo: 'ESTUDIO',
                pacienteId,
                estudioId,
                fechaHoraObjetivo: enMin(10),
                generadoEn: AHORA,
                prioridad: 'MEDIA',
              },
            });
            generado();
            await suelto;
          },
          { timeout: 10_000 },
        );
        await listo;

        const operacion = hacer();
        const resultado = operacion.then((r) => r.status);
        await new Promise((r) => setTimeout(r, 300));
        soltar();
        await ciclo;

        expect(await resultado).toBe(200);
        const [r] = await prisma.recordatorio.findMany();
        expect(r?.estado).toBe(esperado);
      },
    );
  });
});
