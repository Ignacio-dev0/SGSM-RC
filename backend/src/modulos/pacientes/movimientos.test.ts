import { prisma } from '../../db';
import { reloj } from '../../comun/reloj';
import { crearCama, crearInsumo, crearPacienteBasico } from '../../../tests/soporte/fabricas';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

type Agente = Awaited<ReturnType<typeof agenteConRol>>['agente'];

const DIA = 24 * 60 * 60_000;
const haceDias = (d: number) => new Date(Date.now() - d * DIA);

describe('traslado y egreso de pacientes (CU14 · CU15 · T210)', () => {
  let medico: Agente;
  let medicoId: number;
  let camaA: number;
  let camaB: number;
  let pacienteId: number;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    const m = await agenteConRol('MEDICO');
    medico = m.agente;
    medicoId = m.usuario.id;
    camaA = (await crearCama('Sala A', 'A-01')).id;
    camaB = (await crearCama('Sala B', 'B-01')).id;
    const p = await crearPacienteBasico(medicoId, { fechaIngreso: haceDias(6) });
    pacienteId = p.id;
    await prisma.asignacionCama.create({
      data: {
        pacienteId,
        camaId: camaA,
        motivo: 'INGRESO',
        fechaDesde: haceDias(6),
        asignadoPorId: medicoId,
      },
    });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  const camaActiva = () =>
    prisma.asignacionCama.findFirst({ where: { pacienteId, fechaHasta: null } });

  describe('traslado (CU15)', () => {
    it('cambia de cama y deja el traslado en el historial', async () => {
      const res = await medico
        .post(`/api/pacientes/${pacienteId}/trasladar`)
        .send({ camaId: camaB });

      expect(res.status).toBe(200);
      expect(res.body.data.cama).toMatchObject({ id: camaB, numero: 'B-01' });
      const historial = await prisma.asignacionCama.findMany({
        where: { pacienteId },
        orderBy: { id: 'asc' },
      });
      expect(historial).toEqual([
        expect.objectContaining({ camaId: camaA, motivo: 'INGRESO', fechaHasta: expect.any(Date) }),
        expect.objectContaining({ camaId: camaB, motivo: 'TRASLADO', fechaHasta: null }),
      ]);
      expect(await prisma.auditoria.count({ where: { accion: 'TRASLADAR', pacienteId } })).toBe(1);
    });

    it('si la cama nueva está ocupada no mueve al paciente', async () => {
      const otro = await crearPacienteBasico(medicoId);
      await prisma.asignacionCama.create({
        data: {
          pacienteId: otro.id,
          camaId: camaB,
          motivo: 'INGRESO',
          fechaDesde: new Date(),
          asignadoPorId: medicoId,
        },
      });

      const res = await medico
        .post(`/api/pacientes/${pacienteId}/trasladar`)
        .send({ camaId: camaB });

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('CAMA_OCUPADA');
      expect((await camaActiva())?.camaId).toBe(camaA);
    });

    it('rechaza trasladar a la misma cama', async () => {
      const res = await medico
        .post(`/api/pacientes/${pacienteId}/trasladar`)
        .send({ camaId: camaA });
      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('MISMA_CAMA');
    });
  });

  describe('egreso (CU14)', () => {
    it('da de baja al paciente con fecha, hora y motivo, y libera la cama', async () => {
      // El reloj se fija (sin alejarlo del login, para que la sesión siga vigente).
      const ahora = new Date();
      jest.spyOn(reloj, 'ahora').mockReturnValue(ahora);

      const res = await medico
        .post(`/api/pacientes/${pacienteId}/egresar`)
        .send({ motivo: 'Alta médica por objetivos cumplidos' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        estado: 'EGRESADO',
        fechaEgreso: ahora.toISOString(),
        motivoEgreso: 'Alta médica por objetivos cumplidos',
        cama: null,
      });
      expect(await camaActiva()).toBeNull();
      const libres = await medico.get('/api/camas').query({ estado: 'libre' });
      expect(libres.body.data.map((c: { id: number }) => c.id)).toContain(camaA);
    });

    it('acepta una fecha de egreso informada y valida que no sea anterior al ingreso', async () => {
      const informada = haceDias(2);
      informada.setMilliseconds(0);
      const ok = await medico
        .post(`/api/pacientes/${pacienteId}/egresar`)
        .send({ motivo: 'Derivación', fechaEgreso: informada.toISOString() });
      expect(ok.body.data.fechaEgreso).toBe(informada.toISOString());

      const otro = await crearPacienteBasico(medicoId, { fechaIngreso: haceDias(6) });
      const mal = await medico
        .post(`/api/pacientes/${otro.id}/egresar`)
        .send({ motivo: 'Derivación', fechaEgreso: haceDias(30).toISOString() });
      expect(mal.status).toBe(422);
      expect(mal.body.error.codigo).toBe('FECHA_EGRESO_INVALIDA');
    });

    it('exige el motivo y no egresa dos veces', async () => {
      expect((await medico.post(`/api/pacientes/${pacienteId}/egresar`).send({})).status).toBe(400);
      await medico.post(`/api/pacientes/${pacienteId}/egresar`).send({ motivo: 'Alta médica' });
      const segunda = await medico
        .post(`/api/pacientes/${pacienteId}/egresar`)
        .send({ motivo: 'Alta médica' });
      expect(segunda.status).toBe(409);
      expect(segunda.body.error.codigo).toBe('PACIENTE_NO_INTERNADO');
    });

    it('T210: suspende las prescripciones vigentes y cancela estudios y recordatorios pendientes', async () => {
      const insumo = await crearInsumo();
      const prescribir = (estado: 'VIGENTE' | 'FINALIZADA') =>
        prisma.prescripcion.create({
          data: {
            pacienteId,
            insumoId: insumo.id,
            dosis: 500,
            unidadDosis: 'mg',
            frecuenciaHoras: 8,
            via: 'ORAL',
            fechaInicio: new Date('2026-10-01T08:00:00Z'),
            prescriptorId: medicoId,
            estado,
          },
        });
      const vigente = await prescribir('VIGENTE');
      const finalizada = await prescribir('FINALIZADA');
      const tipo = await prisma.tipoEstudio.create({ data: { nombre: 'Radiografía' } });
      const estudio = (estado: 'PROGRAMADO' | 'REALIZADO') =>
        prisma.estudio.create({
          data: {
            pacienteId,
            tipoEstudioId: tipo.id,
            nombre: 'Rx de tórax',
            fechaHora: new Date('2026-10-10T10:00:00Z'),
            estado,
            creadoPorId: medicoId,
          },
        });
      const programado = await estudio('PROGRAMADO');
      const realizado = await estudio('REALIZADO');
      const pendiente = await prisma.recordatorio.create({
        data: {
          tipo: 'MEDICAMENTO',
          pacienteId,
          prescripcionId: vigente.id,
          fechaHoraObjetivo: new Date('2026-10-08T08:00:00Z'),
          prioridad: 'MEDIA',
        },
      });
      const atendido = await prisma.recordatorio.create({
        data: {
          tipo: 'MEDICAMENTO',
          pacienteId,
          prescripcionId: vigente.id,
          fechaHoraObjetivo: new Date('2026-10-07T08:00:00Z'),
          prioridad: 'MEDIA',
          estado: 'ATENDIDO',
        },
      });

      await medico.post(`/api/pacientes/${pacienteId}/egresar`).send({ motivo: 'Alta médica' });

      const estadoDe = async (modelo: 'prescripcion' | 'estudio' | 'recordatorio', id: number) =>
        // @ts-expect-error acceso genérico a tres modelos con el mismo campo estado
        (await prisma[modelo].findUniqueOrThrow({ where: { id } })).estado;
      expect(await estadoDe('prescripcion', vigente.id)).toBe('SUSPENDIDA');
      expect(await estadoDe('prescripcion', finalizada.id)).toBe('FINALIZADA');
      expect(await estadoDe('estudio', programado.id)).toBe('CANCELADO');
      expect(await estadoDe('estudio', realizado.id)).toBe('REALIZADO');
      expect(await estadoDe('recordatorio', pendiente.id)).toBe('CANCELADO');
      expect(await estadoDe('recordatorio', atendido.id)).toBe('ATENDIDO');

      const suspendida = await prisma.prescripcion.findUniqueOrThrow({ where: { id: vigente.id } });
      expect(suspendida.motivoCambioEstado).toMatch(/Egreso del paciente/);
      const acciones = (await prisma.auditoria.findMany({ where: { pacienteId } })).map(
        (a) => `${a.accion} ${a.entidad}`,
      );
      expect(acciones).toEqual(
        expect.arrayContaining([
          'EGRESAR Paciente',
          'LIBERAR_CAMA AsignacionCama',
          'SUSPENDER Prescripcion',
          'CANCELAR Estudio',
          'CANCELAR Recordatorio',
        ]),
      );
    });
  });

  it('el enfermero no puede trasladar ni dar de baja pacientes', async () => {
    const { agente: enfermero } = await agenteConRol('ENFERMERO');
    expect(
      (await enfermero.post(`/api/pacientes/${pacienteId}/trasladar`).send({ camaId: camaB }))
        .status,
    ).toBe(403);
    expect(
      (await enfermero.post(`/api/pacientes/${pacienteId}/egresar`).send({ motivo: 'Alta' }))
        .status,
    ).toBe(403);
  });
});
