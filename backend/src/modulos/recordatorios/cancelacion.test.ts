import { prisma } from '../../db';
import { crearPrescripcionBasica, internarPaciente } from '../../../tests/soporte/fabricas';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { bus } from '../tiempo-real/bus';

const HORA = 3_600_000;

type Sesion = Awaited<ReturnType<typeof agenteConRol>>;

/**
 * Los cambios que cancelan recordatorios pendientes (prescripciones y egreso, T210) avisan al
 * tiempo real DESPUÉS de confirmar su transacción (T505 · D10).
 */
describe('aviso al tiempo real cuando se cancelan recordatorios', () => {
  let medico: Sesion;
  let pacienteId: number;
  let prescripcionId: number;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    medico = await agenteConRol('MEDICO');
    pacienteId = (await internarPaciente(medico.usuario.id)).paciente.id;
    prescripcionId = (
      await crearPrescripcionBasica(pacienteId, medico.usuario.id, {
        fechaInicio: new Date(Date.now() - HORA),
      })
    ).id;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  const recordarPendiente = () =>
    prisma.recordatorio.create({
      data: {
        tipo: 'MEDICAMENTO',
        pacienteId,
        prescripcionId,
        fechaHoraObjetivo: new Date(Date.now() + 7 * HORA),
        prioridad: 'BAJA',
      },
    });

  /** Espía el bus y cuenta, desde otra conexión, los cancelados que ya se ven al avisar. */
  const espiarBus = () => {
    const vistos: Promise<number>[] = [];
    const publicar = jest.spyOn(bus, 'publicar').mockImplementation(() => {
      vistos.push(prisma.recordatorio.count({ where: { estado: 'CANCELADO' } }));
    });
    return { publicar, vistos };
  };

  const cambios: [string, () => Promise<{ status: number }>][] = [
    [
      'suspender la prescripción',
      () =>
        medico.agente
          .post(`/api/prescripciones/${prescripcionId}/estado`)
          .send({ estado: 'SUSPENDIDA', motivo: 'Hipotensión' }),
    ],
    [
      'finalizar la prescripción',
      () =>
        medico.agente
          .post(`/api/prescripciones/${prescripcionId}/estado`)
          .send({ estado: 'FINALIZADA', motivo: 'Fin del tratamiento' }),
    ],
    [
      'cambiar la frecuencia',
      () =>
        medico.agente
          .patch(`/api/prescripciones/${prescripcionId}`)
          .send({ frecuenciaHoras: 12, motivo: 'Ajuste de dosis' }),
    ],
    [
      'egresar al paciente',
      () =>
        medico.agente.post(`/api/pacientes/${pacienteId}/egresar`).send({ motivo: 'Alta médica' }),
    ],
  ];

  it.each(cambios)('%s cancela el pendiente y avisa una vez, ya confirmado', async (_c, hacer) => {
    await recordarPendiente();
    const { publicar, vistos } = espiarBus();

    expect((await hacer()).status).toBe(200);

    expect(publicar).toHaveBeenCalledTimes(1);
    expect(publicar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'recordatorios', nuevos: 0, vencidos: 0 }),
    );
    expect(await Promise.all(vistos)).toEqual([1]);
  });

  it.each(cambios)('%s sin recordatorios pendientes no avisa', async (_c, hacer) => {
    const { publicar } = espiarBus();
    expect((await hacer()).status).toBe(200);
    expect(publicar).not.toHaveBeenCalled();
  });

  /**
   * D30: una transacción toma el candado del ciclo y crea un recordatorio pendiente sin
   * confirmar, como un ciclo que lo está generando. El cambio tiene que esperar a que termine y
   * cancelar también ese; si no esperara, quedaría un pendiente de algo que ya no corresponde.
   */
  it.each(cambios)('%s espera al ciclo que está generando un recordatorio', async (_c, hacer) => {
    let generado!: () => void;
    const listo = new Promise<void>((r) => (generado = r));
    let soltar!: () => void;
    const suelto = new Promise<void>((r) => (soltar = r));
    const ciclo = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(50501::bigint)`;
        await tx.recordatorio.create({
          data: {
            tipo: 'MEDICAMENTO',
            pacienteId,
            prescripcionId,
            fechaHoraObjetivo: new Date(Date.now() + 7 * HORA),
            prioridad: 'BAJA',
          },
        });
        generado();
        await suelto;
      },
      { timeout: 10_000 },
    );
    await listo;

    const resultado = hacer().then((r) => r.status);
    await new Promise((r) => setTimeout(r, 300));
    soltar();
    await ciclo;

    expect(await resultado).toBe(200);
    const [r] = await prisma.recordatorio.findMany();
    expect(r?.estado).toBe('CANCELADO');
  });

  it('un cambio que no toca la agenda (la dosis) no cancela ni avisa', async () => {
    await recordarPendiente();
    const { publicar } = espiarBus();

    await medico.agente
      .patch(`/api/prescripciones/${prescripcionId}`)
      .send({ dosis: 750, motivo: 'Dolor persistente' });

    expect(publicar).not.toHaveBeenCalled();
    expect((await prisma.recordatorio.findFirstOrThrow()).estado).toBe('PENDIENTE');
  });
});
