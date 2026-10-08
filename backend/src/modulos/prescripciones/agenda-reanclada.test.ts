import { prisma } from '../../db';
import { reloj } from '../../comun/reloj';
import { comprobanteDe, registrarRostro } from '../../../tests/soporte/biometria';
import { mientrasEspera, transaccionAbierta } from '../../../tests/soporte/concurrencia';
import { crearInsumo, crearPacienteBasico } from '../../../tests/soporte/fabricas';
import { agenteDe, crearUsuario, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { ejecutarCiclo } from '../recordatorios/ciclo.servicio';

const t = (hora: string, dia = 7) =>
  new Date(`2026-10-${String(dia).padStart(2, '0')}T${hora}:00.000Z`);
const iso = (hora: string, dia = 7) => t(hora, dia).toISOString();

/**
 * D112: reanudar una prescripción o cambiarle la frecuencia vuelve a anclar su agenda. Las tomas
 * siguientes se cuentan desde el cambio con la frecuencia vigente; los recordatorios pendientes
 * de la agenda vieja se cancelan y el temporizador genera los de la nueva.
 */
describe('agenda re-anclada al reanudar o cambiar la frecuencia (D112)', () => {
  let medicoId: number;
  let enfermeraId: number;
  let pacienteId: number;
  let insumoId: number;
  let ahora: jest.SpyInstance<Date, []>;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    ahora = jest.spyOn(reloj, 'ahora').mockReturnValue(t('00:00'));
    medicoId = (await crearUsuario('MEDICO', { nombreUsuario: 'medica' })).id;
    enfermeraId = (await crearUsuario('ENFERMERO', { nombreUsuario: 'enfermera' })).id;
    await registrarRostro(enfermeraId);
    pacienteId = (await crearPacienteBasico(medicoId)).id;
    insumoId = (await crearInsumo({ nombre: 'Ibuprofeno', unidadMedida: 'mg' })).id;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  /** Pone el reloj en esa hora y devuelve la sesión de la médica (recién iniciada). */
  async function medicaA(hora: string, dia = 7) {
    ahora.mockReturnValue(t(hora, dia));
    return agenteDe({ nombreUsuario: 'medica' });
  }

  async function prescribir(frecuenciaHoras: number) {
    const medica = await medicaA('00:00');
    const res = await medica.post(`/api/pacientes/${pacienteId}/prescripciones`).send({
      insumoId,
      dosis: 400,
      unidadDosis: 'mg',
      frecuenciaHoras,
      via: 'ORAL',
      fechaInicio: iso('00:00'),
    });
    expect(res.status).toBe(201);
    expect(res.body.data.agendaDesde).toBe(iso('00:00'));
    return res.body.data.id as number;
  }

  /**
   * Una dosis de la toma de esa hora, dada a tiempo (sin pasar por la validación facial, que no
   * es lo que se prueba). Guarda su toma como lo hace el registro (D121).
   */
  const dosisDada = (prescripcionId: number, hora: string) =>
    prisma.suministro.create({ data: datosDeDosis(prescripcionId, hora) });

  const datosDeDosis = (prescripcionId: number, hora: string) => ({
    pacienteId,
    usuarioId: enfermeraId,
    tipo: 'MEDICAMENTO' as const,
    prescripcionId,
    fechaHora: t(hora),
    tomaProgramada: t(hora),
    validadoBiometricamente: true,
    detalles: { create: [{ insumoId, cantidad: 400 }] },
  });

  /** Pone el reloj en esa hora y administra por la API, con el rostro de la enfermera. */
  async function administrarA(prescripcionId: number, hora: string, dia = 7) {
    ahora.mockReturnValue(t(hora, dia));
    const enfermera = await agenteDe({ nombreUsuario: 'enfermera' });
    const validacionToken = await comprobanteDe(enfermera);
    return enfermera
      .post('/api/suministros/medicamentos')
      .send({ pacienteId, prescripcionId, validacionToken });
  }

  const recordatoriosDe = (prescripcionId: number) =>
    prisma.recordatorio.findMany({
      where: { prescripcionId },
      orderBy: { id: 'asc' },
      select: { estado: true, fechaHoraObjetivo: true },
    });

  describe('cada 6 h con dosis a las 06:00 y 12:00; a las 13:00 pasa a cada 12 h', () => {
    let id: number;

    beforeEach(async () => {
      id = await prescribir(6);
      for (const hora of ['00:00', '06:00', '12:00']) await dosisDada(id, hora);
      // Un recordatorio de la agenda vieja que todavía estaba pendiente (la toma de las 18:00).
      await prisma.recordatorio.create({
        data: {
          tipo: 'MEDICAMENTO',
          pacienteId,
          prescripcionId: id,
          fechaHoraObjetivo: t('18:00'),
          generadoEn: t('12:59'),
          prioridad: 'BAJA',
        },
      });
      const medica = await medicaA('13:00');
      const res = await medica
        .patch(`/api/prescripciones/${id}`)
        .send({ frecuenciaHoras: 12, motivo: 'Mejor tolerancia' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        frecuenciaHoras: 12,
        agendaDesde: iso('12:00'),
        proximaToma: iso('00:00', 8),
      });
    });

    it('la próxima toma es 12 h después de la última dosis y las tomas de 24 h empiezan por ella', async () => {
      const medica = await medicaA('13:00');
      const res = await medica.get(`/api/prescripciones/${id}`);
      expect(res.body.data.proximaToma).toBe(iso('00:00', 8));
      expect(res.body.data.agenda).toEqual([iso('00:00', 8), iso('12:00', 8)]);

      // A la medianoche, sin darla todavía, la próxima sigue siendo la de las 00:00.
      const medianoche = await (await medicaA('00:10', 8)).get(`/api/prescripciones/${id}`);
      expect(medianoche.body.data.proximaToma).toBe(iso('00:00', 8));
      expect(medianoche.body.data.agenda[0]).toBe(iso('00:00', 8));
    });

    it('cancela el recordatorio de la agenda vieja y genera los de la nueva, sin saltear ninguna', async () => {
      expect(await recordatoriosDe(id)).toEqual([
        { estado: 'CANCELADO', fechaHoraObjetivo: t('18:00') },
      ]);
      ahora.mockReturnValue(t('17:45'));
      expect((await ejecutarCiclo()).nuevos).toBe(0);
      ahora.mockReturnValue(t('23:30'));
      expect((await ejecutarCiclo()).nuevos).toBe(1);
      expect((await recordatoriosDe(id)).at(-1)).toEqual({
        estado: 'PENDIENTE',
        fechaHoraObjetivo: t('00:00', 8),
      });
    });

    it('el ancla nueva queda en la auditoría del cambio', async () => {
      const a = await prisma.auditoria.findFirstOrThrow({
        where: { accion: 'MODIFICAR', entidad: 'Prescripcion' },
      });
      expect(a.valorAnterior).toEqual({ frecuenciaHoras: 6, agendaDesde: iso('00:00') });
      expect(a.valorNuevo).toEqual({ frecuenciaHoras: 12, agendaDesde: iso('12:00') });
    });
  });

  describe('cada 6 h con dosis a las 00:00 y 06:00 y la de las 12:00 vencida; a las 13:00 pasa a cada 12 h', () => {
    let id: number;

    beforeEach(async () => {
      id = await prescribir(6);
      for (const hora of ['00:00', '06:00']) await dosisDada(id, hora);
      await prisma.recordatorio.create({
        data: {
          tipo: 'MEDICAMENTO',
          pacienteId,
          prescripcionId: id,
          fechaHoraObjetivo: t('12:00'),
          generadoEn: t('11:30'),
          estado: 'VENCIDO',
          vencidoEn: t('12:30'),
          prioridad: 'ALTA',
        },
      });
      const res = await (
        await medicaA('13:00')
      )
        .patch(`/api/prescripciones/${id}`)
        .send({ frecuenciaHoras: 12, motivo: 'Mejor tolerancia' });
      expect(res.status).toBe(200);
      // D122: quedó una toma sin dar después de la última dosis: la agenda arranca ahora.
      expect(res.body.data).toMatchObject({ agendaDesde: iso('13:00'), proximaToma: iso('13:00') });
    });

    it('el vencido de la agenda vieja se cancela, conserva cuándo venció y queda en la auditoría', async () => {
      const [r, ...otros] = await prisma.recordatorio.findMany({ where: { prescripcionId: id } });
      expect(otros).toEqual([]);
      expect(r).toMatchObject({ estado: 'CANCELADO', vencidoEn: t('12:30') });
      const a = await prisma.auditoria.findFirstOrThrow({
        where: { accion: 'CANCELAR', entidad: 'Recordatorio', entidadId: String(r!.id) },
      });
      expect(a).toMatchObject({
        usuarioId: medicoId,
        valorAnterior: { estado: 'VENCIDO' },
        valorNuevo: { estado: 'CANCELADO' },
      });
    });

    it('la dosis tardía es de la toma de ahora y la siguiente, a la 01:00, se da sin aviso', async () => {
      const tarde = await administrarA(id, '13:10');
      expect(tarde.status).toBe(201);
      expect(tarde.body.data.tomaProgramada).toBe(iso('13:00'));

      const ficha = await (await medicaA('13:15')).get(`/api/prescripciones/${id}`);
      expect(ficha.body.data.proximaToma).toBe(iso('01:00', 8));
      expect(ficha.body.data.agenda).toEqual([iso('01:00', 8), iso('13:00', 8)]);

      // Cinco horas después de esa dosis, con una indicación de cada 12 h, pide confirmar.
      const otra = await administrarA(id, '18:00');
      expect(otra.status).toBe(409);
      expect(otra.body.error.codigo).toBe('TOMA_YA_DADA');

      const siguiente = await administrarA(id, '01:00', 8);
      expect(siguiente.status).toBe(201);
      expect(siguiente.body.data.tomaProgramada).toBe(iso('01:00', 8));
    });
  });

  it('el historial conserva la toma de cada dosis aunque la agenda se vuelva a anclar (D121)', async () => {
    const id = await prescribir(6);
    for (const hora of ['00:00', '06:00']) await dosisDada(id, hora);
    // La de las 12:00, tarde.
    expect((await administrarA(id, '12:40')).body.data.tomaProgramada).toBe(iso('12:00'));

    const res = await (
      await medicaA('13:00')
    )
      .patch(`/api/prescripciones/${id}`)
      .send({ frecuenciaHoras: 12, motivo: 'Ajuste' });
    // El ancla es la toma de esa dosis (12:00), no la hora en que se dio.
    expect(res.body.data).toMatchObject({
      agendaDesde: iso('12:00'),
      proximaToma: iso('00:00', 8),
    });
    expect(res.body.data.ultimasAdministraciones[0]).toMatchObject({
      fechaHora: iso('12:40'),
      tomaProgramada: iso('12:00'),
    });

    const historial = await (await medicaA('13:05')).get('/api/suministros').query({ pacienteId });
    expect(
      historial.body.data.map((s: { fechaHora: string; tomaProgramada: string | null }) => [
        s.fechaHora,
        s.tomaProgramada,
      ]),
    ).toEqual([
      [iso('12:40'), iso('12:00')],
      [iso('06:00'), iso('06:00')],
      [iso('00:00'), iso('00:00')],
    ]);
  });

  it('un cambio de frecuencia espera a la administración en curso y ancla en ella', async () => {
    const id = await prescribir(6);
    for (const hora of ['00:00', '06:00']) await dosisDada(id, hora);
    const medica = await medicaA('12:05');
    // Una enfermera está registrando la toma de las 12:00 (con la prescripción bloqueada).
    const enCurso = await transaccionAbierta(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM prescripciones WHERE id = ${id} FOR NO KEY UPDATE`;
      await tx.suministro.create({ data: datosDeDosis(id, '12:00') });
    });

    const cambio = await mientrasEspera(
      medica.patch(`/api/prescripciones/${id}`).send({ frecuenciaHoras: 12, motivo: 'Ajuste' }),
      enCurso,
    );

    expect(cambio.respondioAntes).toBe(false);
    expect(cambio.res.body.data).toMatchObject({
      agendaDesde: iso('12:00'),
      proximaToma: iso('00:00', 8),
    });
  });

  it('sin dosis dadas, el cambio de frecuencia ancla la agenda en ese momento', async () => {
    const id = await prescribir(8);
    const medica = await medicaA('09:30');
    const res = await medica
      .patch(`/api/prescripciones/${id}`)
      .send({ frecuenciaHoras: 6, motivo: 'Ajuste' });
    expect(res.body.data).toMatchObject({ agendaDesde: iso('09:30'), proximaToma: iso('09:30') });
  });

  it('cambiar otra cosa (la dosis) no mueve la agenda', async () => {
    const id = await prescribir(8);
    await dosisDada(id, '08:00');
    const medica = await medicaA('09:00');
    const res = await medica
      .patch(`/api/prescripciones/${id}`)
      .send({ dosis: 600, motivo: 'Ajuste' });
    expect(res.body.data).toMatchObject({ agendaDesde: iso('00:00'), proximaToma: iso('16:00') });
  });

  describe('reanudar a las 15:00 una de cada 8 h', () => {
    let id: number;

    beforeEach(async () => {
      id = await prescribir(8);
      await dosisDada(id, '08:00');
      const suspendida = await (
        await medicaA('10:00')
      )
        .post(`/api/prescripciones/${id}/estado`)
        .send({ estado: 'SUSPENDIDA', motivo: 'Hipotensión' });
      expect(suspendida.status).toBe(200);
      const res = await (
        await medicaA('15:00')
      )
        .post(`/api/prescripciones/${id}/estado`)
        .send({ estado: 'VIGENTE', motivo: 'Presión normalizada' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ agendaDesde: iso('15:00'), proximaToma: iso('15:00') });
    });

    it('la próxima toma es ahora y la siguiente a las 23:00', async () => {
      const res = await (await medicaA('15:00')).get(`/api/prescripciones/${id}`);
      expect(res.body.data.agenda.slice(0, 3)).toEqual([
        iso('15:00'),
        iso('23:00'),
        iso('07:00', 8),
      ]);
    });

    it('el temporizador recuerda la toma de las 15:00 aunque hubo una dosis a las 08:00', async () => {
      ahora.mockReturnValue(t('15:00'));
      expect((await ejecutarCiclo()).nuevos).toBe(1);
      expect(await recordatoriosDe(id)).toEqual([
        { estado: 'PENDIENTE', fechaHoraObjetivo: t('15:00') },
      ]);
    });

    it('el ancla queda en la auditoría de la reanudación', async () => {
      const a = await prisma.auditoria.findFirstOrThrow({ where: { accion: 'REANUDAR' } });
      expect(a.valorAnterior).toMatchObject({ estado: 'SUSPENDIDA', agendaDesde: iso('00:00') });
      expect(a.valorNuevo).toMatchObject({ estado: 'VIGENTE', agendaDesde: iso('15:00') });
    });
  });
});
