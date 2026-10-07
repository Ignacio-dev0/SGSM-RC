import { prisma } from '../../db';
import { crearCama, crearInsumo } from '../../../tests/soporte/fabricas';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

describe('historial del paciente (T209 · CU16 · RF10)', () => {
  beforeEach(() => prepararBaseConSeguridad());
  afterAll(() => prisma.$disconnect());

  async function pacienteConMovimientos() {
    const { agente: medico, usuario } = await agenteConRol('MEDICO');
    const camaA = await crearCama('Sala A', 'A-01');
    const camaB = await crearCama('Sala B', 'B-01');
    const { body } = await medico.post('/api/pacientes').send({
      dni: '30111222',
      nombre: 'Rosa',
      apellido: 'Benítez',
      fechaNacimiento: '1948-03-15',
      sexo: 'FEMENINO',
      camaId: camaA.id,
    });
    const id = body.data.id as number;
    await medico.patch(`/api/pacientes/${id}`).send({ obraSocial: 'PAMI' });
    await medico.post(`/api/pacientes/${id}/trasladar`).send({ camaId: camaB.id });
    const gasa = await crearInsumo({ nombre: 'Gasa', tipo: 'INSUMO', unidadMedida: 'unidad' });
    await prisma.suministro.create({
      data: {
        pacienteId: id,
        usuarioId: usuario.id,
        tipo: 'INSUMOS',
        fechaHora: new Date(),
        validadoBiometricamente: true,
        detalles: { create: [{ insumoId: gasa.id, cantidad: 2 }] },
      },
    });
    return { medico, id };
  }

  it('reúne asignaciones de cama, modificaciones y suministros', async () => {
    const { medico, id } = await pacienteConMovimientos();

    const res = await medico.get(`/api/pacientes/${id}/historial`);

    expect(res.status).toBe(200);
    const { asignaciones, modificaciones, suministros } = res.body.data;
    expect(asignaciones).toEqual([
      expect.objectContaining({ cama: 'Sala B · B-01', motivo: 'TRASLADO', fechaHasta: null }),
      expect.objectContaining({
        cama: 'Sala A · A-01',
        motivo: 'INGRESO',
        fechaHasta: expect.any(String),
      }),
    ]);
    expect(asignaciones[0].asignadoPor).toMatch(/MEDICO/);
    expect(modificaciones.map((m: { accion: string }) => m.accion)).toEqual(
      expect.arrayContaining(['CREAR', 'MODIFICAR', 'TRASLADAR']),
    );
    const modificacion = modificaciones.find((m: { accion: string }) => m.accion === 'MODIFICAR');
    expect(modificacion).toMatchObject({
      valorAnterior: { obraSocial: null },
      valorNuevo: { obraSocial: 'PAMI' },
      usuario: expect.stringMatching(/MEDICO/),
    });
    expect(suministros).toEqual([
      expect.objectContaining({
        tipo: 'INSUMOS',
        detalles: [expect.objectContaining({ insumo: 'Gasa', cantidad: 2, unidad: 'unidad' })],
      }),
    ]);
  });

  it('filtra por rango de fechas', async () => {
    const { medico, id } = await pacienteConMovimientos();
    const manana = new Date(Date.now() + 24 * 3_600_000).toISOString();

    const res = await medico.get(`/api/pacientes/${id}/historial`).query({ desde: manana });

    expect(res.body.data.modificaciones).toEqual([]);
    expect(res.body.data.suministros).toEqual([]);
    // La cama actual sigue vigente, así que se superpone con cualquier rango futuro.
    expect(res.body.data.asignaciones).toHaveLength(1);
  });

  it('el enfermero puede consultar el historial', async () => {
    const { id } = await pacienteConMovimientos();
    const { agente } = await agenteConRol('ENFERMERO');
    expect((await agente.get(`/api/pacientes/${id}/historial`)).status).toBe(200);
  });
});
