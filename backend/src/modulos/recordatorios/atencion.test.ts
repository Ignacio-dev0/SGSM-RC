import type { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { reloj } from '../../comun/reloj';
import { crearPrescripcionBasica, internarPaciente } from '../../../tests/soporte/fabricas';
import { comprobanteDe, registrarRostro } from '../../../tests/soporte/biometria';
import { agenteConRol, agenteDe, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import * as auditoria from '../auditoria/auditoria.servicio';
import { bus } from '../tiempo-real/bus';

const a = (hora: string) => new Date(`2026-10-07T${hora}:00Z`);

type Sesion = Awaited<ReturnType<typeof agenteConRol>>;

/**
 * Atender por administración (T507): registrar la toma marca ATENDIDO el recordatorio de su
 * toma más cercana, dentro de la misma transacción del suministro. La prescripción es cada 8 h
 * con tomas a las 04:00, 12:00 y 20:00 UTC.
 */
describe('la administración atiende el recordatorio de su toma (T507)', () => {
  let enfermera: Sesion;
  let pacienteId: number;
  let prescripcionId: number;
  let ahora: jest.SpyInstance<Date, []>;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    ahora = jest.spyOn(reloj, 'ahora').mockReturnValue(a('12:05'));
    const medico = await agenteConRol('MEDICO');
    enfermera = await agenteConRol('ENFERMERO');
    await registrarRostro(enfermera.usuario.id);
    pacienteId = (await internarPaciente(medico.usuario.id)).paciente.id;
    prescripcionId = (
      await crearPrescripcionBasica(pacienteId, medico.usuario.id, { fechaInicio: a('04:00') })
    ).id;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  const recordar = (hora: string, datos: Partial<Prisma.RecordatorioUncheckedCreateInput> = {}) =>
    prisma.recordatorio.create({
      data: {
        tipo: 'MEDICAMENTO',
        pacienteId,
        prescripcionId,
        fechaHoraObjetivo: a(hora),
        generadoEn: new Date(a(hora).getTime() - 30 * 60_000),
        prioridad: 'ALTA',
        ...datos,
      },
    });

  const administrar = async () => {
    const validacionToken = await comprobanteDe(enfermera.agente);
    return enfermera.agente
      .post('/api/suministros/medicamentos')
      .send({ pacienteId, prescripcionId, validacionToken });
  };

  const estadoDe = (id: number) => prisma.recordatorio.findUniqueOrThrow({ where: { id } });

  it('atiende el pendiente con la administración, quién y cuándo, lo audita y avisa', async () => {
    const r = await recordar('12:00');
    const publicar = jest.spyOn(bus, 'publicar');

    const res = await administrar();

    expect(res.status).toBe(201);
    expect(await estadoDe(r.id)).toMatchObject({
      estado: 'ATENDIDO',
      suministroId: res.body.data.id,
      atendidoPorId: enfermera.usuario.id,
      atendidoEn: a('12:05'),
      motivoNoAdministrado: null,
    });
    expect(await prisma.auditoria.findFirstOrThrow({ where: { accion: 'ATENDER' } })).toMatchObject(
      {
        usuarioId: enfermera.usuario.id,
        entidad: 'Recordatorio',
        entidadId: String(r.id),
        pacienteId,
      },
    );
    expect(publicar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'recordatorios', nuevos: 0, vencidos: 0 }),
    );
  });

  it('una administración tardía atiende el vencido y conserva cuándo venció', async () => {
    const r = await recordar('12:00', { estado: 'VENCIDO', vencidoEn: a('12:30') });
    ahora.mockReturnValue(a('12:40'));
    // 35 min después la sesión cerró por inactividad: la enfermera vuelve a ingresar.
    enfermera = { ...enfermera, agente: await agenteDe(enfermera.usuario) };

    await administrar();

    expect(await estadoDe(r.id)).toMatchObject({ estado: 'ATENDIDO', vencidoEn: a('12:30') });
  });

  it('solo atiende el de la toma más cercana', async () => {
    const anterior = await recordar('04:00', { estado: 'VENCIDO', vencidoEn: a('04:30') });
    const actual = await recordar('12:00');

    await administrar();

    expect((await estadoDe(anterior.id)).estado).toBe('VENCIDO');
    expect((await estadoDe(actual.id)).estado).toBe('ATENDIDO');
  });

  it('si la toma no tiene recordatorio, registra igual y no avisa', async () => {
    const yaAtendido = await recordar('12:00', {
      estado: 'ATENDIDO',
      atendidoEn: a('11:50'),
      motivoNoAdministrado: 'Se pospuso por un estudio',
    });
    const publicar = jest.spyOn(bus, 'publicar');

    expect((await administrar()).status).toBe(201);

    expect(await estadoDe(yaAtendido.id)).toMatchObject({
      motivoNoAdministrado: 'Se pospuso por un estudio',
      suministroId: null,
    });
    expect(publicar).not.toHaveBeenCalled();
  });

  it('es la misma transacción: si falla la atención, tampoco queda el suministro', async () => {
    const r = await recordar('12:00');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const original = auditoria.registrarAuditoria;
    jest.spyOn(auditoria, 'registrarAuditoria').mockImplementation((db, entrada) => {
      if (entrada.accion === 'ATENDER') throw new Error('falla simulada');
      return original(db, entrada);
    });

    expect((await administrar()).status).toBe(500);

    expect(await prisma.suministro.count()).toBe(0);
    expect((await estadoDe(r.id)).estado).toBe('PENDIENTE');
  });
});
