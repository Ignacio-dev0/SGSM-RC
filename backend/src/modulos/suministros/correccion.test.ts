import { prisma } from '../../db';
import { crearInsumo, crearPacienteBasico } from '../../../tests/soporte/fabricas';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { comprobanteDe, registrarRostro } from '../../../tests/soporte/biometria';

type Sesion = Awaited<ReturnType<typeof agenteConRol>>;
const HORA = 3_600_000;

describe('corrección de suministros (T412 · CU23)', () => {
  let enfermera: Sesion;
  let pacienteId: number;
  let paracetamol: number;
  let gasa: number;
  let panal: number;
  let prescripcionId: number;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    enfermera = await agenteConRol('ENFERMERO');
    await registrarRostro(enfermera.usuario.id);
    pacienteId = (await crearPacienteBasico(enfermera.usuario.id)).id;
    paracetamol = (await crearInsumo({ nombre: 'Paracetamol', unidadMedida: 'mg' })).id;
    gasa = (
      await crearInsumo({
        nombre: 'Gasa',
        tipo: 'INSUMO',
        unidadMedida: 'unidad',
        presentacion: '',
      })
    ).id;
    panal = (
      await crearInsumo({
        nombre: 'Pañal',
        tipo: 'INSUMO',
        unidadMedida: 'unidad',
        presentacion: '',
      })
    ).id;
    prescripcionId = (
      await prisma.prescripcion.create({
        data: {
          pacienteId,
          insumoId: paracetamol,
          dosis: 500,
          unidadDosis: 'mg',
          frecuenciaHoras: 8,
          via: 'ORAL',
          fechaInicio: new Date(Date.now() - 30 * HORA),
          prescriptorId: enfermera.usuario.id,
        },
      })
    ).id;
  });
  afterAll(() => prisma.$disconnect());

  const suministro = (tipo: 'MEDICAMENTO' | 'INSUMOS', haceHoras: number) =>
    prisma.suministro.create({
      data: {
        pacienteId,
        usuarioId: enfermera.usuario.id,
        tipo,
        prescripcionId: tipo === 'MEDICAMENTO' ? prescripcionId : null,
        fechaHora: new Date(Date.now() - haceHoras * HORA),
        validadoBiometricamente: true,
        detalles: {
          create:
            tipo === 'MEDICAMENTO'
              ? [{ insumoId: paracetamol, cantidad: 500 }]
              : [{ insumoId: gasa, cantidad: 4 }],
        },
      },
    });

  const corregir = async (id: number, cuerpo: Record<string, unknown>, sesion = enfermera) => {
    const validacionToken = await comprobanteDe(sesion.agente);
    return sesion.agente.patch(`/api/suministros/${id}`).send({ validacionToken, ...cuerpo });
  };

  it('corrige la cantidad de un medicamento con motivo y lo audita', async () => {
    const s = await suministro('MEDICAMENTO', 2);

    const res = await corregir(s.id, { cantidad: 250, motivo: 'Se administró media dosis' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      detalles: [{ cantidad: 250 }],
      corregido: true,
      motivoCorreccion: 'Se administró media dosis',
      corregidoPor: expect.stringMatching(/ENFERMERO/),
    });
    const a = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'CORREGIR', entidad: 'Suministro' },
    });
    expect(a).toMatchObject({
      pacienteId,
      valorAnterior: { detalles: 'Paracetamol × 500' },
      valorNuevo: { detalles: 'Paracetamol × 250' },
      detalle: 'Se administró media dosis',
    });
  });

  it('corrige la lista de insumos de un movimiento', async () => {
    const s = await suministro('INSUMOS', 1);

    const res = await corregir(s.id, {
      items: [
        { insumoId: gasa, cantidad: 2 },
        { insumoId: panal, cantidad: 1 },
      ],
      motivo: 'Se cargaron gasas de más y faltó el pañal',
    });

    expect(res.status).toBe(200);
    expect(
      res.body.data.detalles.map(
        (d: { insumo: string; cantidad: number }) => `${d.insumo} ${d.cantidad}`,
      ),
    ).toEqual(['Gasa 2', 'Pañal 1']);
  });

  it('corregir la cantidad no borra las observaciones del registro', async () => {
    const s = await suministro('MEDICAMENTO', 1);
    await prisma.suministro.update({ where: { id: s.id }, data: { observaciones: 'Tolera bien' } });

    const res = await corregir(s.id, { cantidad: 250, motivo: 'Media dosis' });

    expect(res.body.data.observaciones).toBe('Tolera bien');
  });

  it('pasadas las 24 horas no se puede corregir', async () => {
    const s = await suministro('MEDICAMENTO', 25);
    const res = await corregir(s.id, { cantidad: 250, motivo: 'Error de carga' });
    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('FUERA_DE_PLAZO');
  });

  it('exige motivo y validación facial', async () => {
    const s = await suministro('MEDICAMENTO', 1);
    expect((await corregir(s.id, { cantidad: 250 })).status).toBe(400);

    const sinValidar = await enfermera.agente
      .patch(`/api/suministros/${s.id}`)
      .send({ cantidad: 250, motivo: 'Error de carga' });
    expect(sinValidar.status).toBe(403);
    expect(sinValidar.body.error.codigo).toBe('VALIDACION_FACIAL_REQUERIDA');
  });

  it('rechaza correcciones que no corresponden al tipo de suministro o que no cambian nada', async () => {
    const med = await suministro('MEDICAMENTO', 1);
    const items = await corregir(med.id, {
      items: [{ insumoId: gasa, cantidad: 1 }],
      motivo: 'Error de carga',
    });
    expect(items.status).toBe(422);
    expect(items.body.error.codigo).toBe('CORRECCION_INVALIDA');

    const ins = await suministro('INSUMOS', 1);
    const conMedicamento = await corregir(ins.id, {
      items: [{ insumoId: paracetamol, cantidad: 1 }],
      motivo: 'Error de carga',
    });
    expect(conMedicamento.body.error.codigo).toBe('SIN_PRESCRIPCION_VIGENTE');

    const nada = await corregir(med.id, { motivo: 'Sin cambios' });
    expect(nada.status).toBe(422);
    expect(nada.body.error.codigo).toBe('SIN_CAMBIOS');
  });

  it('el médico no puede corregir suministros', async () => {
    const s = await suministro('MEDICAMENTO', 1);
    const medico = await agenteConRol('MEDICO');
    await registrarRostro(medico.usuario.id);
    expect((await corregir(s.id, { cantidad: 250, motivo: 'Error de carga' }, medico)).status).toBe(
      403,
    );
  });
});
