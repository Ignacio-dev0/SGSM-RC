import { prisma } from '../../db';
import { reloj } from '../../comun/reloj';
import {
  crearEstudio,
  crearInsumo,
  crearPrescripcionBasica,
  crearTipoEstudio,
  internarPaciente,
} from '../../../tests/soporte/fabricas';
import { crearUsuario, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { bus } from '../tiempo-real/bus';
import { ejecutarCiclo } from './ciclo.servicio';

const a = (hora: string) => new Date(`2026-10-07T${hora}:00Z`);

/**
 * Ciclo del temporizador contra la base, con el reloj simulado (T501–T503 · T508 · T514).
 * La prescripción de prueba empieza a las 08:00 UTC (05:00 en Argentina) y es cada 8 h.
 */
describe('ciclo de recordatorios (T501 · T502 · T503 · T508 · T514)', () => {
  let medicoId: number;
  let pacienteId: number;
  let prescripcionId: number;
  let ahora: jest.SpyInstance<Date, []>;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    medicoId = (await crearUsuario('MEDICO')).id;
    const { paciente } = await internarPaciente(medicoId, { cama: 'A-01' });
    pacienteId = paciente.id;
    const paracetamol = await crearInsumo({ nombre: 'Paracetamol' });
    prescripcionId = (
      await crearPrescripcionBasica(pacienteId, medicoId, {
        insumoId: paracetamol.id,
        fechaInicio: a('08:00'),
      })
    ).id;
    ahora = jest.spyOn(reloj, 'ahora');
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  const ciclo = (hora: string) => {
    ahora.mockReturnValue(a(hora));
    return ejecutarCiclo();
  };
  const recordatorios = () => prisma.recordatorio.findMany({ orderBy: { id: 'asc' } });

  describe('generación', () => {
    it('genera el recordatorio 30 min antes de la toma, una sola vez', async () => {
      expect((await ciclo('07:29')).nuevos).toBe(0);
      expect(await recordatorios()).toEqual([]);

      expect(await ciclo('07:30')).toEqual({
        ejecutado: true,
        nuevos: 1,
        vencidos: 0,
        repriorizados: 0,
      });
      expect((await ciclo('07:31')).nuevos).toBe(0);

      const [r, ...otros] = await recordatorios();
      expect(otros).toEqual([]);
      expect(r).toMatchObject({
        tipo: 'MEDICAMENTO',
        pacienteId,
        prescripcionId,
        fechaHoraObjetivo: a('08:00'),
        generadoEn: a('07:30'),
        prioridad: 'BAJA',
        estado: 'PENDIENTE',
      });
      const auditoria = await prisma.auditoria.findMany({ where: { entidad: 'Recordatorio' } });
      expect(auditoria).toEqual([
        expect.objectContaining({
          accion: 'GENERAR',
          entidadId: String(r!.id),
          pacienteId,
          usuarioId: null,
        }),
      ]);
    });

    it('no recuerda una toma que ya se administró', async () => {
      await prisma.suministro.create({
        data: {
          pacienteId,
          usuarioId: medicoId,
          tipo: 'MEDICAMENTO',
          prescripcionId,
          fechaHora: a('07:50'),
        },
      });
      expect((await ciclo('07:55')).nuevos).toBe(0);
    });

    it.each([
      ['08:20', 1],
      ['08:31', 0],
    ])(
      'tras una caída, al volver a las %s recupera solo las tomas de los últimos 30 min',
      async (hora, cantidad) => {
        expect((await ciclo(hora)).nuevos).toBe(cantidad);
        if (cantidad > 0) expect((await recordatorios())[0]?.prioridad).toBe('ALTA');
      },
    );

    it('una toma cancelada se vuelve a recordar (al reanudar o modificar la prescripción)', async () => {
      await prisma.recordatorio.create({
        data: {
          tipo: 'MEDICAMENTO',
          pacienteId,
          prescripcionId,
          fechaHoraObjetivo: a('08:00'),
          generadoEn: a('07:30'),
          prioridad: 'BAJA',
          estado: 'CANCELADO',
        },
      });
      expect((await ciclo('07:40')).nuevos).toBe(1);
      expect((await recordatorios()).map((r) => r.estado)).toEqual(['CANCELADO', 'PENDIENTE']);
    });

    it('no recuerda prescripciones suspendidas ni pacientes egresados', async () => {
      await prisma.prescripcion.update({
        where: { id: prescripcionId },
        data: { estado: 'SUSPENDIDA' },
      });
      const { paciente: egresado } = await internarPaciente(medicoId);
      await crearPrescripcionBasica(egresado.id, medicoId, { fechaInicio: a('08:00') });
      await prisma.paciente.update({
        where: { id: egresado.id },
        data: { estado: 'EGRESADO', fechaEgreso: a('07:00'), motivoEgreso: 'Alta' },
      });

      expect((await ciclo('07:40')).nuevos).toBe(0);
    });
  });

  describe('prioridad y vencimiento', () => {
    it('sube la prioridad a medida que se acerca la toma, sin auditarla (D12)', async () => {
      await ciclo('07:30');
      expect((await ciclo('07:46')).repriorizados).toBe(1);
      expect((await recordatorios())[0]?.prioridad).toBe('MEDIA');
      await ciclo('07:55');
      expect((await recordatorios())[0]?.prioridad).toBe('ALTA');

      const acciones = await prisma.auditoria.findMany({ where: { entidad: 'Recordatorio' } });
      expect(acciones.map((x) => x.accion)).toEqual(['GENERAR']);
    });

    it('vence a los 60 min de generado, lo audita y avisa a cada administrador activo (T508)', async () => {
      const admin = await crearUsuario('ADMINISTRADOR');
      await crearUsuario('ADMINISTRADOR', { activo: false });
      await ciclo('07:30');
      expect((await ciclo('08:29')).vencidos).toBe(0);

      expect((await ciclo('08:30')).vencidos).toBe(1);

      const [r] = await recordatorios();
      expect(r).toMatchObject({ estado: 'VENCIDO', vencidoEn: a('08:30'), prioridad: 'ALTA' });
      const notificaciones = await prisma.notificacion.findMany();
      expect(notificaciones).toEqual([
        expect.objectContaining({
          destinatarioId: admin.id,
          tipo: 'RECORDATORIO_VENCIDO',
          leida: false,
        }),
      ]);
      // 08:00 UTC son las 05:00 en Argentina.
      expect(notificaciones[0]?.mensaje).toMatch(/Paracetamol.*05:00.*Prueba\d+.*A-01/);
      expect(notificaciones[0]?.datos).toMatchObject({ recordatorioId: r!.id, pacienteId });
      expect(
        await prisma.auditoria.count({ where: { accion: 'VENCER', entidadId: String(r!.id) } }),
      ).toBe(1);

      // Un vencido no vuelve a vencer ni se duplica aunque su toma siga en la ventana.
      expect(await ciclo('08:31')).toMatchObject({ nuevos: 0, vencidos: 0 });
      expect(await prisma.recordatorio.count()).toBe(1);
      expect(await prisma.notificacion.count()).toBe(1);
    });
  });

  describe('estudios (T504)', () => {
    let estudioId: number;

    beforeEach(async () => {
      // Sin la prescripción: solo cuentan los recordatorios del estudio.
      await prisma.prescripcion.update({
        where: { id: prescripcionId },
        data: { estado: 'FINALIZADA' },
      });
      const tipo = await crearTipoEstudio({ nombre: 'Radiografía' });
      estudioId = (
        await crearEstudio(pacienteId, medicoId, {
          tipoEstudioId: tipo.id,
          nombre: 'Rx de tórax',
          fechaHora: a('10:00'),
        })
      ).id;
    });

    it('recuerda el estudio 30 min antes, una sola vez, siempre con prioridad MEDIA', async () => {
      expect((await ciclo('09:29')).nuevos).toBe(0);
      expect((await ciclo('09:30')).nuevos).toBe(1);
      expect((await ciclo('09:31')).nuevos).toBe(0);

      const [r, ...otros] = await recordatorios();
      expect(otros).toEqual([]);
      expect(r).toMatchObject({
        tipo: 'ESTUDIO',
        pacienteId,
        estudioId,
        prescripcionId: null,
        fechaHoraObjetivo: a('10:00'),
        generadoEn: a('09:30'),
        prioridad: 'MEDIA',
        estado: 'PENDIENTE',
      });
      expect(
        await prisma.auditoria.findFirst({ where: { accion: 'GENERAR', entidad: 'Recordatorio' } }),
      ).toMatchObject({
        entidadId: String(r!.id),
        pacienteId,
        usuarioId: null,
        valorNuevo: expect.objectContaining({ tipo: 'ESTUDIO', estudioId, prioridad: 'MEDIA' }),
      });

      // La prioridad no cambia a medida que se acerca la hora.
      expect((await ciclo('09:58')).repriorizados).toBe(0);
      expect((await recordatorios())[0]?.prioridad).toBe('MEDIA');
    });

    it('vence a los 60 min de generado y avisa a los administradores con el nombre del estudio', async () => {
      await crearUsuario('ADMINISTRADOR');
      await ciclo('09:30');

      expect((await ciclo('10:30')).vencidos).toBe(1);

      expect((await recordatorios())[0]).toMatchObject({
        estado: 'VENCIDO',
        vencidoEn: a('10:30'),
        prioridad: 'MEDIA',
      });
      // 10:00 UTC son las 07:00 en Argentina.
      expect((await prisma.notificacion.findFirstOrThrow()).mensaje).toMatch(
        /estudio Rx de tórax de las 07:00.*A-01/,
      );
      expect((await ciclo('10:31')).nuevos).toBe(0);
    });

    it.each([
      ['10:20', 1],
      ['10:31', 0],
    ])(
      'tras una caída, al volver a las %s recupera solo los de los últimos 30 min',
      async (hora, n) => {
        expect((await ciclo(hora)).nuevos).toBe(n);
      },
    );

    it('no recuerda estudios cancelados o realizados ni de pacientes egresados', async () => {
      await prisma.estudio.update({
        where: { id: estudioId },
        data: { estado: 'CANCELADO', motivoCancelacion: 'Turno suspendido' },
      });
      await crearEstudio(pacienteId, medicoId, {
        fechaHora: a('10:00'),
        estado: 'REALIZADO',
        realizadoEn: a('09:00'),
        confirmadoPorId: medicoId,
      });
      const { paciente: egresado } = await internarPaciente(medicoId);
      await crearEstudio(egresado.id, medicoId, { fechaHora: a('10:00') });
      await prisma.paciente.update({
        where: { id: egresado.id },
        data: { estado: 'EGRESADO', fechaEgreso: a('07:00'), motivoEgreso: 'Alta' },
      });

      expect((await ciclo('09:40')).nuevos).toBe(0);
    });

    it('un estudio reprogramado (recordatorio viejo cancelado) se recuerda en su hora nueva', async () => {
      await ciclo('09:30');
      await prisma.recordatorio.updateMany({ data: { estado: 'CANCELADO' } });
      await prisma.estudio.update({ where: { id: estudioId }, data: { fechaHora: a('11:00') } });

      expect((await ciclo('09:45')).nuevos).toBe(0);
      expect((await ciclo('10:30')).nuevos).toBe(1);
      expect((await recordatorios()).map((r) => [r.estado, r.fechaHoraObjetivo])).toEqual([
        ['CANCELADO', a('10:00')],
        ['PENDIENTE', a('11:00')],
      ]);
    });

    it('genera tomas y estudios en el mismo ciclo, con un solo aviso', async () => {
      await prisma.prescripcion.update({
        where: { id: prescripcionId },
        data: { estado: 'VIGENTE', fechaInicio: a('10:00') },
      });
      const publicar = jest.spyOn(bus, 'publicar').mockImplementation(() => undefined);

      expect((await ciclo('09:30')).nuevos).toBe(2);
      expect((await recordatorios()).map((r) => r.tipo).sort()).toEqual(['ESTUDIO', 'MEDICAMENTO']);
      expect(publicar).toHaveBeenCalledTimes(1);
      expect(publicar).toHaveBeenCalledWith(expect.objectContaining({ nuevos: 2 }));
    });
  });

  describe('tiempo real', () => {
    it('avisa una vez por ciclo, después de confirmar, y solo si algo cambió', async () => {
      let confirmados: Promise<number> | undefined;
      const publicar = jest.spyOn(bus, 'publicar').mockImplementation(() => {
        // Otra conexión ve los recordatorios: el aviso sale después del commit.
        confirmados = prisma.recordatorio.count();
      });

      await ciclo('07:30');
      expect(publicar).toHaveBeenCalledTimes(1);
      expect(publicar).toHaveBeenCalledWith({
        tipo: 'recordatorios',
        nuevos: 1,
        vencidos: 0,
        momento: a('07:30').toISOString(),
      });
      expect(await confirmados).toBe(1);

      await ciclo('07:31');
      expect(publicar).toHaveBeenCalledTimes(1);

      await ciclo('08:30');
      expect(publicar).toHaveBeenLastCalledWith(
        expect.objectContaining({ nuevos: 0, vencidos: 1 }),
      );
    });
  });

  describe('concurrencia (D11)', () => {
    it('dos ciclos a la vez no duplican recordatorios, auditoría ni notificaciones', async () => {
      await crearUsuario('ADMINISTRADOR');
      for (let i = 0; i < 2; i++) {
        const { paciente } = await internarPaciente(medicoId);
        await crearPrescripcionBasica(paciente.id, medicoId, { fechaInicio: a('08:00') });
      }
      ahora.mockReturnValue(a('07:40'));

      const resultados = await Promise.all([ejecutarCiclo(), ejecutarCiclo(), ejecutarCiclo()]);

      expect(resultados.reduce((total, r) => total + r.nuevos, 0)).toBe(3);
      expect(resultados.some((r) => r.ejecutado)).toBe(true);
      expect(await prisma.recordatorio.count()).toBe(3);
      expect(await prisma.auditoria.count({ where: { accion: 'GENERAR' } })).toBe(3);

      ahora.mockReturnValue(a('08:40'));
      await Promise.all([ejecutarCiclo(), ejecutarCiclo()]);
      expect(await prisma.recordatorio.count({ where: { estado: 'VENCIDO' } })).toBe(3);
      expect(await prisma.notificacion.count()).toBe(3);
      expect(await prisma.auditoria.count({ where: { accion: 'VENCER' } })).toBe(3);
    });
  });
});
