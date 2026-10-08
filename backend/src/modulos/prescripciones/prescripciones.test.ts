import request from 'supertest';
import { prisma } from '../../db';
import { crearInsumo, crearPacienteBasico } from '../../../tests/soporte/fabricas';
import { agenteConRol, obtenerApp, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

type Agente = Awaited<ReturnType<typeof agenteConRol>>['agente'];

const HORA = 3_600_000;

describe('API de prescripciones (T301 · T307 · CU17–CU19)', () => {
  let medico: Agente;
  let medicoId: number;
  let pacienteId: number;
  let paracetamol: number;
  let gasa: number;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    const m = await agenteConRol('MEDICO');
    medico = m.agente;
    medicoId = m.usuario.id;
    pacienteId = (await crearPacienteBasico(medicoId)).id;
    paracetamol = (
      await crearInsumo({
        nombre: 'Paracetamol',
        unidadMedida: 'mg',
        presentacion: 'Comprimidos 500 mg',
      })
    ).id;
    gasa = (
      await crearInsumo({
        nombre: 'Gasa',
        tipo: 'INSUMO',
        unidadMedida: 'unidad',
        presentacion: '',
      })
    ).id;
  });
  afterAll(() => prisma.$disconnect());

  const datos = (extra: Record<string, unknown> = {}) => ({
    insumoId: paracetamol,
    dosis: 500,
    unidadDosis: 'mg',
    frecuenciaHoras: 8,
    via: 'ORAL',
    fechaInicio: new Date(Date.now() - HORA).toISOString(),
    observaciones: 'Si temperatura mayor a 38 °C',
    ...extra,
  });
  const prescribir = (extra: Record<string, unknown> = {}, pid = pacienteId) =>
    medico.post(`/api/pacientes/${pid}/prescripciones`).send(datos(extra));

  describe('alta (CU17)', () => {
    it('registra la prescripción vigente con su próxima toma', async () => {
      const res = await prescribir();

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        pacienteId,
        medicamento: { id: paracetamol, nombre: 'Paracetamol', presentacion: 'Comprimidos 500 mg' },
        dosis: 500,
        unidadDosis: 'mg',
        frecuenciaHoras: 8,
        via: 'ORAL',
        estado: 'VIGENTE',
        prescriptor: expect.stringMatching(/MEDICO/),
      });
      const proxima = new Date(res.body.data.proximaToma).getTime();
      const inicio = new Date(res.body.data.fechaInicio).getTime();
      expect(proxima).toBe(inicio + 8 * HORA);
    });

    it('queda en la auditoría asociada al paciente', async () => {
      const res = await prescribir();
      const a = await prisma.auditoria.findFirstOrThrow({ where: { entidad: 'Prescripcion' } });
      expect(a).toMatchObject({
        accion: 'CREAR',
        entidadId: String(res.body.data.id),
        pacienteId,
        usuarioId: medicoId,
      });
    });

    it('solo se prescriben medicamentos activos del catálogo', async () => {
      const insumo = await prescribir({ insumoId: gasa });
      expect(insumo.status).toBe(422);
      expect(insumo.body.error.codigo).toBe('NO_ES_MEDICAMENTO');

      await prisma.insumo.update({ where: { id: paracetamol }, data: { activo: false } });
      expect((await prescribir()).body.error.codigo).toBe('MEDICAMENTO_NO_DISPONIBLE');
    });

    it('no prescribe a un paciente egresado', async () => {
      const egresado = await crearPacienteBasico(medicoId, {
        estado: 'EGRESADO',
        fechaEgreso: new Date(),
        motivoEgreso: 'Alta',
      });
      const res = await prescribir({}, egresado.id);
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('PACIENTE_NO_INTERNADO');
    });

    it('valida dosis, frecuencia, vía y fechas', async () => {
      const res = await prescribir({
        dosis: 0,
        frecuenciaHoras: 0,
        via: 'NASAL_MAGICA',
        fechaFin: new Date(Date.now() - 2 * HORA).toISOString(),
      });
      expect(res.status).toBe(400);
      const campos = res.body.error.detalles.map((d: { campo: string }) => d.campo);
      expect(campos).toEqual(
        expect.arrayContaining(['dosis', 'frecuenciaHoras', 'via', 'fechaFin']),
      );
    });

    it('T307: avisa si ya hay una prescripción vigente del mismo medicamento y deja decidir', async () => {
      const primera = await prescribir();

      const repetida = await prescribir({ dosis: 1000 });
      expect(repetida.status).toBe(409);
      expect(repetida.body.error).toMatchObject({
        codigo: 'PRESCRIPCION_DUPLICADA',
        detalles: {
          prescripciones: [expect.objectContaining({ id: primera.body.data.id, dosis: 500 })],
        },
      });

      const confirmada = await prescribir({ dosis: 1000, confirmarDuplicada: true });
      expect(confirmada.status).toBe(201);
      const a = await prisma.auditoria.findFirstOrThrow({
        where: { entidadId: String(confirmada.body.data.id), accion: 'CREAR' },
      });
      expect(a.detalle).toMatch(/duplicada/i);
    });

    it('T307: una prescripción suspendida del mismo medicamento no cuenta como duplicada', async () => {
      const { body } = await prescribir();
      await prisma.prescripcion.update({
        where: { id: body.data.id },
        data: { estado: 'SUSPENDIDA' },
      });
      expect((await prescribir()).status).toBe(201);
    });
  });

  describe('consulta (CU18)', () => {
    it('lista las prescripciones del paciente, las vigentes primero, filtrables por estado', async () => {
      const a = await prescribir();
      const b = await prescribir({ insumoId: (await crearInsumo({ nombre: 'Enalapril' })).id });
      await prisma.prescripcion.update({
        where: { id: a.body.data.id },
        data: { estado: 'FINALIZADA' },
      });

      const todas = await medico.get(`/api/pacientes/${pacienteId}/prescripciones`);
      expect(todas.body.data.map((p: { id: number }) => p.id)).toEqual([
        b.body.data.id,
        a.body.data.id,
      ]);
      expect(todas.body.data[1].proximaToma).toBeNull();

      const vigentes = await medico
        .get(`/api/pacientes/${pacienteId}/prescripciones`)
        .query({ estado: 'VIGENTE' });
      expect(vigentes.body.data).toHaveLength(1);
    });

    it('el detalle incluye la agenda de tomas de las próximas 24 horas', async () => {
      const { body } = await prescribir();
      const res = await medico.get(`/api/prescripciones/${body.data.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.agenda).toHaveLength(3);
      expect(res.body.data.ultimasAdministraciones).toEqual([]);
    });
  });

  describe('modificación y cambios de estado (CU19)', () => {
    it('modifica la dosis con motivo obligatorio y lo audita', async () => {
      const { body } = await prescribir();
      const sinMotivo = await medico
        .patch(`/api/prescripciones/${body.data.id}`)
        .send({ dosis: 1000 });
      expect(sinMotivo.status).toBe(400);

      const res = await medico
        .patch(`/api/prescripciones/${body.data.id}`)
        .send({ dosis: 1000, motivo: 'Dolor persistente' });

      expect(res.status).toBe(200);
      expect(res.body.data.dosis).toBe(1000);
      const a = await prisma.auditoria.findFirstOrThrow({
        where: { accion: 'MODIFICAR', entidad: 'Prescripcion' },
      });
      expect(a).toMatchObject({
        valorAnterior: { dosis: 500 },
        valorNuevo: { dosis: 1000 },
        detalle: 'Dolor persistente',
        pacienteId,
      });
    });

    it('suspende con motivo, cancela sus recordatorios pendientes y permite reanudar', async () => {
      const { body } = await prescribir();
      const id = body.data.id;
      await prisma.recordatorio.create({
        data: {
          tipo: 'MEDICAMENTO',
          pacienteId,
          prescripcionId: id,
          fechaHoraObjetivo: new Date(Date.now() + HORA),
          prioridad: 'MEDIA',
        },
      });

      const suspendida = await medico
        .post(`/api/prescripciones/${id}/estado`)
        .send({ estado: 'SUSPENDIDA', motivo: 'Hipotensión' });
      expect(suspendida.status).toBe(200);
      expect(suspendida.body.data).toMatchObject({
        estado: 'SUSPENDIDA',
        motivoCambioEstado: 'Hipotensión',
        proximaToma: null,
      });
      expect((await prisma.recordatorio.findFirstOrThrow()).estado).toBe('CANCELADO');

      const reanudada = await medico
        .post(`/api/prescripciones/${id}/estado`)
        .send({ estado: 'VIGENTE', motivo: 'Presión normalizada' });
      expect(reanudada.body.data.estado).toBe('VIGENTE');

      const acciones = (
        await prisma.auditoria.findMany({ where: { entidad: 'Prescripcion' } })
      ).map((a) => a.accion);
      expect(acciones).toEqual(['CREAR', 'SUSPENDER', 'REANUDAR']);
    });

    it('una prescripción finalizada ya no se modifica ni cambia de estado', async () => {
      const { body } = await prescribir();
      const id = body.data.id;
      await medico
        .post(`/api/prescripciones/${id}/estado`)
        .send({ estado: 'FINALIZADA', motivo: 'Fin del tratamiento' });

      const mod = await medico
        .patch(`/api/prescripciones/${id}`)
        .send({ dosis: 250, motivo: 'Ajuste de dosis' });
      expect(mod.status).toBe(409);
      expect(mod.body.error.codigo).toBe('PRESCRIPCION_NO_VIGENTE');

      const reanudar = await medico
        .post(`/api/prescripciones/${id}/estado`)
        .send({ estado: 'VIGENTE', motivo: 'Retomar tratamiento' });
      expect(reanudar.status).toBe(409);
      expect(reanudar.body.error.codigo).toBe('TRANSICION_INVALIDA');
    });
  });

  describe('control de acceso con los tres roles', () => {
    it('el enfermero consulta pero no prescribe ni modifica', async () => {
      const { body } = await prescribir();
      const { agente: enfermero } = await agenteConRol('ENFERMERO');
      expect((await enfermero.get(`/api/pacientes/${pacienteId}/prescripciones`)).status).toBe(200);
      expect((await enfermero.get(`/api/prescripciones/${body.data.id}`)).status).toBe(200);
      expect(
        (await enfermero.post(`/api/pacientes/${pacienteId}/prescripciones`).send(datos())).status,
      ).toBe(403);
      expect(
        (
          await enfermero
            .patch(`/api/prescripciones/${body.data.id}`)
            .send({ dosis: 1, motivo: 'x' })
        ).status,
      ).toBe(403);
    });

    it('el administrador también puede prescribir', async () => {
      const { agente: admin } = await agenteConRol('ADMINISTRADOR');
      expect(
        (await admin.post(`/api/pacientes/${pacienteId}/prescripciones`).send(datos())).status,
      ).toBe(201);
    });

    it('sin sesión responde 401', async () => {
      expect((await request(obtenerApp()).get('/api/prescripciones/1')).status).toBe(401);
    });
  });
});
