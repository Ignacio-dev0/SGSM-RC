import request from 'supertest';
import { prisma } from '../../db';
import { crearCama } from '../../../tests/soporte/fabricas';
import { agenteConRol, obtenerApp, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

type Agente = Awaited<ReturnType<typeof agenteConRol>>['agente'];

const datosPaciente = (camaId: number, extra: Record<string, unknown> = {}) => ({
  dni: '30111222',
  nombre: 'Rosa',
  apellido: 'Benítez',
  fechaNacimiento: '1948-03-15',
  sexo: 'FEMENINO',
  obraSocial: 'IOMA',
  diagnostico: 'ACV isquémico, rehabilitación motora',
  contactoEmergenciaNombre: 'Carlos Benítez (hijo)',
  contactoEmergenciaTelefono: '221 555-1234',
  camaId,
  ...extra,
});

describe('API de pacientes (T202 · T204 · CU11, CU13 · RN02, RN08)', () => {
  let medico: Agente;
  let medicoId: number;
  let camaA: number;
  let camaB: number;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    const m = await agenteConRol('MEDICO');
    medico = m.agente;
    medicoId = m.usuario.id;
    camaA = (await crearCama('Sala A', 'A-01')).id;
    camaB = (await crearCama('Sala A', 'A-02')).id;
  });
  afterAll(() => prisma.$disconnect());

  const internar = (extra: Record<string, unknown> = {}, cama = camaA) =>
    medico.post('/api/pacientes').send(datosPaciente(cama, extra));

  describe('alta con asignación de cama (CU11 · CU15)', () => {
    it('registra al paciente internado en la cama elegida', async () => {
      const res = await internar();

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        dni: '30111222',
        apellido: 'Benítez',
        fechaNacimiento: '1948-03-15',
        estado: 'INTERNADO',
        cama: { id: camaA, numero: 'A-01', sala: { nombre: 'Sala A' } },
      });
      expect(res.body.data.fechaIngreso).toEqual(expect.any(String));
    });

    it('audita el alta y la asignación de la cama', async () => {
      const res = await internar();
      const id = res.body.data.id;
      const acciones = await prisma.auditoria.findMany({
        where: { pacienteId: id },
        orderBy: { id: 'asc' },
      });
      expect(acciones.map((a) => a.accion)).toEqual(['CREAR', 'ASIGNAR_CAMA']);
      expect(acciones[0]).toMatchObject({ usuarioId: medicoId, entidad: 'Paciente' });
    });

    it('RN08: rechaza un DNI de un paciente internado', async () => {
      await internar();
      const res = await internar({ nombre: 'Otra' }, camaB);
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('DNI_DUPLICADO');
    });

    it('si el DNI es de un paciente egresado, ofrece registrar el reingreso', async () => {
      const { body } = await internar();
      await prisma.paciente.update({
        where: { id: body.data.id },
        data: { estado: 'EGRESADO', fechaEgreso: new Date(), motivoEgreso: 'Alta médica' },
      });

      const res = await internar({}, camaB);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        codigo: 'PACIENTE_EGRESADO',
        detalles: { pacienteId: body.data.id },
      });
    });

    it('RN02: no interna en una cama ocupada y no deja al paciente a medias', async () => {
      await internar();
      const res = await internar({ dni: '28999888' }, camaA);

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('CAMA_OCUPADA');
      expect(await prisma.paciente.count({ where: { dni: '28999888' } })).toBe(0);
    });

    it('valida los datos obligatorios y la fecha de nacimiento', async () => {
      const res = await medico.post('/api/pacientes').send({ fechaNacimiento: '2999-01-01' });
      expect(res.status).toBe(400);
      const campos = res.body.error.detalles.map((d: { campo: string }) => d.campo);
      expect(campos).toEqual(
        expect.arrayContaining(['dni', 'nombre', 'apellido', 'fechaNacimiento', 'sexo', 'camaId']),
      );
    });
  });

  describe('consulta y modificación (CU13)', () => {
    it('devuelve el paciente con su cama actual', async () => {
      const { body } = await internar();
      const res = await medico.get(`/api/pacientes/${body.data.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: body.data.id, cama: { numero: 'A-01' } });
    });

    it('responde 404 si no existe', async () => {
      expect((await medico.get('/api/pacientes/999')).status).toBe(404);
    });

    it('modifica los datos personales y audita solo lo que cambió', async () => {
      const { body } = await internar();

      const res = await medico
        .patch(`/api/pacientes/${body.data.id}`)
        .send({ obraSocial: 'PAMI', contactoEmergenciaTelefono: '221 555-9999' });

      expect(res.status).toBe(200);
      expect(res.body.data.obraSocial).toBe('PAMI');
      const a = await prisma.auditoria.findFirstOrThrow({
        where: { accion: 'MODIFICAR', pacienteId: body.data.id },
      });
      expect(a.valorAnterior).toEqual({
        obraSocial: 'IOMA',
        contactoEmergenciaTelefono: '221 555-1234',
      });
      expect(a.valorNuevo).toEqual({
        obraSocial: 'PAMI',
        contactoEmergenciaTelefono: '221 555-9999',
      });
    });

    it('no permite cambiar el DNI por el de otro paciente', async () => {
      await internar();
      const { body } = await internar({ dni: '28999888' }, camaB);
      const res = await medico.patch(`/api/pacientes/${body.data.id}`).send({ dni: '30111222' });
      expect(res.status).toBe(409);
    });
  });

  describe('reingreso (T204)', () => {
    it('vuelve a internar al paciente egresado en su misma ficha', async () => {
      const { body } = await internar();
      const id = body.data.id;
      await prisma.asignacionCama.updateMany({ data: { fechaHasta: new Date() } });
      await prisma.paciente.update({
        where: { id },
        data: { estado: 'EGRESADO', fechaEgreso: new Date(), motivoEgreso: 'Alta médica' },
      });

      const res = await medico
        .post(`/api/pacientes/${id}/reingresar`)
        .send({ camaId: camaB, diagnostico: 'Fractura de cadera' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id,
        estado: 'INTERNADO',
        fechaEgreso: null,
        motivoEgreso: null,
        diagnostico: 'Fractura de cadera',
        cama: { id: camaB },
      });
      const asignaciones = await prisma.asignacionCama.findMany({ where: { pacienteId: id } });
      expect(asignaciones.map((a) => a.motivo)).toEqual(['INGRESO', 'REINGRESO']);
    });

    it('no reingresa a un paciente que sigue internado', async () => {
      const { body } = await internar();
      const res = await medico
        .post(`/api/pacientes/${body.data.id}/reingresar`)
        .send({ camaId: camaB });
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('PACIENTE_INTERNADO');
    });
  });

  describe('control de acceso con los tres roles', () => {
    it('el enfermero consulta pero no registra ni modifica pacientes', async () => {
      const { body } = await internar();
      const { agente: enfermero } = await agenteConRol('ENFERMERO');

      expect((await enfermero.get(`/api/pacientes/${body.data.id}`)).status).toBe(200);
      expect((await enfermero.post('/api/pacientes').send(datosPaciente(camaB))).status).toBe(403);
      expect(
        (await enfermero.patch(`/api/pacientes/${body.data.id}`).send({ obraSocial: 'X' })).status,
      ).toBe(403);
    });

    it('el administrador puede registrar pacientes', async () => {
      const { agente: admin } = await agenteConRol('ADMINISTRADOR');
      expect((await admin.post('/api/pacientes').send(datosPaciente(camaB))).status).toBe(201);
    });

    it('sin sesión responde 401', async () => {
      expect((await request(obtenerApp()).get('/api/pacientes/1')).status).toBe(401);
    });
  });
});
