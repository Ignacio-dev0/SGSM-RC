import request from 'supertest';
import { prisma } from '../../db';
import { crearCama, crearPacienteBasico } from '../../../tests/soporte/fabricas';
import { agenteConRol, obtenerApp, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { asignarCama, liberarCama } from './camas.servicio';

describe('API de camas (T201 · CU15 · RN02)', () => {
  beforeEach(() => prepararBaseConSeguridad());
  afterAll(() => prisma.$disconnect());

  async function escenario() {
    const { agente, usuario } = await agenteConRol('ENFERMERO');
    const a1 = await crearCama('Sala A', 'A-01');
    const a2 = await crearCama('Sala A', 'A-02');
    const b1 = await crearCama('Sala B', 'B-01');
    const fuera = await crearCama('Sala B', 'B-02');
    await prisma.cama.update({ where: { id: fuera.id }, data: { habilitada: false } });
    const paciente = await crearPacienteBasico(usuario.id, { apellido: 'Ruiz', dni: '30111222' });
    await prisma.asignacionCama.create({
      data: {
        pacienteId: paciente.id,
        camaId: a2.id,
        motivo: 'INGRESO',
        fechaDesde: new Date(),
        asignadoPorId: usuario.id,
      },
    });
    return { agente, a1, a2, b1, fuera, paciente };
  }

  it('lista las camas libres y habilitadas, con su sala', async () => {
    const { agente, a1, b1 } = await escenario();

    const res = await agente.get('/api/camas').query({ estado: 'libre' });

    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { id: number }) => c.id)).toEqual([a1.id, b1.id]);
    expect(res.body.data[0]).toMatchObject({
      numero: 'A-01',
      sala: { nombre: 'Sala A' },
      ocupada: false,
      paciente: null,
    });
  });

  it('lista las camas ocupadas con el paciente que las ocupa', async () => {
    const { agente, a2, paciente } = await escenario();

    const res = await agente.get('/api/camas').query({ estado: 'ocupada' });

    expect(res.body.data).toEqual([
      expect.objectContaining({
        id: a2.id,
        ocupada: true,
        paciente: { id: paciente.id, apellido: 'Ruiz', nombre: 'Paciente', dni: '30111222' },
      }),
    ]);
  });

  it('filtra por sala y muestra todas las camas sin filtro de estado', async () => {
    const { agente, b1, fuera } = await escenario();
    const salaB = await prisma.sala.findUniqueOrThrow({ where: { nombre: 'Sala B' } });

    const res = await agente.get('/api/camas').query({ salaId: salaB.id });

    expect(res.body.data.map((c: { id: number }) => c.id)).toEqual([b1.id, fuera.id]);
    expect(res.body.data[1]).toMatchObject({ habilitada: false });
  });

  it('lista las salas con su ocupación', async () => {
    const { agente } = await escenario();

    const res = await agente.get('/api/salas');

    expect(res.body.data).toEqual([
      expect.objectContaining({ nombre: 'Sala A', camas: 2, libres: 1 }),
      expect.objectContaining({ nombre: 'Sala B', camas: 2, libres: 1 }),
    ]);
  });

  it.each(['ADMINISTRADOR', 'MEDICO', 'ENFERMERO'] as const)(
    'el %s puede consultar las camas',
    async (rol) => {
      const { agente } = await agenteConRol(rol);
      expect((await agente.get('/api/camas')).status).toBe(200);
    },
  );

  it('sin sesión responde 401', async () => {
    expect((await request(obtenerApp()).get('/api/camas')).status).toBe(401);
  });
});

describe('asignación y liberación de camas (T201 · RN02)', () => {
  beforeEach(() => prepararBaseConSeguridad());
  afterAll(() => prisma.$disconnect());

  async function preparar() {
    const { usuario } = await agenteConRol('MEDICO');
    const cama = await crearCama('Sala A', 'A-01');
    const paciente = await crearPacienteBasico(usuario.id);
    return { usuario, cama, paciente };
  }

  it('asigna la cama guardando fecha y usuario, y lo audita', async () => {
    const { usuario, cama, paciente } = await preparar();

    await prisma.$transaction((tx) =>
      asignarCama(tx, {
        pacienteId: paciente.id,
        camaId: cama.id,
        motivo: 'INGRESO',
        usuarioId: usuario.id,
      }),
    );

    const [asignacion] = await prisma.asignacionCama.findMany();
    expect(asignacion).toMatchObject({
      camaId: cama.id,
      asignadoPorId: usuario.id,
      fechaHasta: null,
    });
    expect(asignacion?.fechaDesde).toBeInstanceOf(Date);
    expect(
      await prisma.auditoria.count({ where: { accion: 'ASIGNAR_CAMA', pacienteId: paciente.id } }),
    ).toBe(1);
  });

  it('no asigna una cama ocupada ni una fuera de servicio', async () => {
    const { usuario, cama, paciente } = await preparar();
    const otro = await crearPacienteBasico(usuario.id);
    const asignar = (pacienteId: number, camaId: number) =>
      prisma.$transaction((tx) =>
        asignarCama(tx, { pacienteId, camaId, motivo: 'INGRESO', usuarioId: usuario.id }),
      );
    await asignar(paciente.id, cama.id);

    await expect(asignar(otro.id, cama.id)).rejects.toMatchObject({ codigo: 'CAMA_OCUPADA' });

    const rota = await crearCama('Sala A', 'A-99');
    await prisma.cama.update({ where: { id: rota.id }, data: { habilitada: false } });
    await expect(asignar(otro.id, rota.id)).rejects.toMatchObject({ codigo: 'CAMA_NO_HABILITADA' });
  });

  it('libera la cama cerrando la asignación con fecha y usuario', async () => {
    const { usuario, cama, paciente } = await preparar();
    await prisma.$transaction((tx) =>
      asignarCama(tx, {
        pacienteId: paciente.id,
        camaId: cama.id,
        motivo: 'INGRESO',
        usuarioId: usuario.id,
      }),
    );

    const liberada = await prisma.$transaction((tx) =>
      liberarCama(tx, { pacienteId: paciente.id, usuarioId: usuario.id }),
    );

    expect(liberada?.id).toBe(cama.id);
    const [asignacion] = await prisma.asignacionCama.findMany();
    expect(asignacion?.fechaHasta).toBeInstanceOf(Date);
    expect(asignacion?.liberadoPorId).toBe(usuario.id);
  });
});
