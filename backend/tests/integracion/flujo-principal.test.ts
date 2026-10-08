import { prisma } from '../../src/db';
import { crearCama, crearInsumo } from '../soporte/fabricas';
import { agenteConRol, prepararBaseConSeguridad } from '../soporte/sesion';

/**
 * Flujo principal del prototipo de punta a punta, con los tres roles y la API real (T417):
 * el médico interna y prescribe, el administrador registra el rostro de la enfermera, la
 * enfermera valida su rostro y administra el medicamento y los insumos, lo corrige, y todo queda
 * en el historial y en la auditoría.
 */
describe('flujo principal: de la internación al suministro validado con el rostro', () => {
  beforeAll(() => prepararBaseConSeguridad());
  afterAll(() => prisma.$disconnect());

  it('recorre el circuito completo', async () => {
    const medico = await agenteConRol('MEDICO');
    const admin = await agenteConRol('ADMINISTRADOR');
    const enfermera = await agenteConRol('ENFERMERO');
    const cama = await crearCama('Sala A', 'A-01');
    const paracetamol = await crearInsumo({ nombre: 'Paracetamol', unidadMedida: 'mg' });
    const gasa = await crearInsumo({
      nombre: 'Gasa',
      tipo: 'INSUMO',
      unidadMedida: 'unidad',
      presentacion: '',
    });
    const rostro = Array.from({ length: 128 }, (_, i) => Math.sin(i) / 10);

    // 1. El médico interna al paciente en una cama (CU11 · CU15).
    const internacion = await medico.agente.post('/api/pacientes').send({
      dni: '30111222',
      nombre: 'Rosa',
      apellido: 'Benítez',
      fechaNacimiento: '1948-03-15',
      sexo: 'FEMENINO',
      camaId: cama.id,
    });
    expect(internacion.status).toBe(201);
    const pacienteId = internacion.body.data.id as number;

    // 2. Y carga la prescripción (CU17).
    const prescripcion = await medico.agente
      .post(`/api/pacientes/${pacienteId}/prescripciones`)
      .send({
        insumoId: paracetamol.id,
        dosis: 500,
        unidadDosis: 'mg',
        frecuenciaHoras: 8,
        via: 'ORAL',
        fechaInicio: new Date(Date.now() - 60_000).toISOString(),
      });
    expect(prescripcion.status).toBe(201);
    const prescripcionId = prescripcion.body.data.id as number;

    // 3. El administrador registra el rostro de la enfermera (CU07).
    const registro = await admin.agente
      .put(`/api/biometria/usuarios/${enfermera.usuario.id}`)
      .send({
        patron: rostro,
        foto: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      });
    expect(registro.status).toBe(200);

    // 4. La enfermera busca al paciente por la cama, como lo haría al lado de la cama (CU12).
    const busqueda = await enfermera.agente.get('/api/pacientes').query({ texto: 'a-01' });
    expect(busqueda.body.data[0]).toMatchObject({ id: pacienteId });

    // 5. Valida su rostro (CU10) y administra el medicamento (CU20).
    const validar = async () => {
      const r = await enfermera.agente
        .post('/api/biometria/validar')
        .send({ patron: rostro.map((v) => v + 0.001), operacion: 'Administración de medicamento' });
      expect(r.body.data.valido).toBe(true);
      return r.body.data.validacionToken as string;
    };
    const token1 = await validar();
    const administracion = await enfermera.agente
      .post('/api/suministros/medicamentos')
      .send({ pacienteId, prescripcionId, validacionToken: token1 });
    expect(administracion.status).toBe(201);

    // 6. Registra insumos no prescriptos en un solo movimiento (CU21).
    const token2 = await validar();
    const insumos = await enfermera.agente
      .post('/api/suministros/insumos')
      .send({ pacienteId, items: [{ insumoId: gasa.id, cantidad: 3 }], validacionToken: token2 });
    expect(insumos.status).toBe(201);

    // 7. Corrige la administración dentro de las 24 horas (CU23).
    const token3 = await validar();
    const correccion = await enfermera.agente
      .patch(`/api/suministros/${administracion.body.data.id}`)
      .send({ cantidad: 250, motivo: 'Se administró media dosis', validacionToken: token3 });
    expect(correccion.status).toBe(200);

    // 8. La prescripción muestra la última administración y el historial reúne todo (CU16 · CU22).
    const vigentes = await enfermera.agente.get(`/api/pacientes/${pacienteId}/prescripciones`);
    expect(vigentes.body.data[0].ultimasAdministraciones).toHaveLength(1);
    const historial = await medico.agente.get(`/api/pacientes/${pacienteId}/historial`);
    expect(historial.body.data.suministros).toHaveLength(2);
    expect(
      historial.body.data.suministros.find((s: { corregido: boolean }) => s.corregido),
    ).toBeTruthy();

    // 9. Todo quedó auditado, asociado al paciente.
    const acciones = (
      await prisma.auditoria.findMany({ where: { pacienteId }, orderBy: { id: 'asc' } })
    ).map((a) => `${a.accion} ${a.entidad}`);
    expect(acciones).toEqual([
      'CREAR Paciente',
      'ASIGNAR_CAMA AsignacionCama',
      'CREAR Prescripcion',
      'REGISTRAR Suministro',
      'REGISTRAR Suministro',
      'CORREGIR Suministro',
    ]);

    // 10. El egreso cierra el circuito: libera la cama y suspende la prescripción (CU14 · T210).
    const egreso = await medico.agente
      .post(`/api/pacientes/${pacienteId}/egresar`)
      .send({ motivo: 'Alta médica' });
    expect(egreso.body.data).toMatchObject({ estado: 'EGRESADO', cama: null });
    const suspendida = await enfermera.agente.get(`/api/prescripciones/${prescripcionId}`);
    expect(suspendida.body.data.estado).toBe('SUSPENDIDA');
  });
});
