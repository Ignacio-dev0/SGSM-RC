import { prisma } from '../../db';
import { crearInsumo, crearPacienteBasico } from '../../../tests/soporte/fabricas';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { comprobanteDe, registrarRostro } from '../../../tests/soporte/biometria';

type Sesion = Awaited<ReturnType<typeof agenteConRol>>;
const HORA = 3_600_000;

describe('registro de suministros (T408 · T409 · T410 · CU20 · CU21 · RN07)', () => {
  let enfermera: Sesion;
  let pacienteId: number;
  let paracetamol: number;
  let prescripcionId: number;
  let gasa: number;
  let panal: number;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    const medico = await agenteConRol('MEDICO');
    enfermera = await agenteConRol('ENFERMERO');
    await registrarRostro(enfermera.usuario.id);
    pacienteId = (await crearPacienteBasico(medico.usuario.id)).id;
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
        presentacion: 'x10',
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
          fechaInicio: new Date(Date.now() - 2 * HORA),
          prescriptorId: medico.usuario.id,
        },
      })
    ).id;
  });
  afterAll(() => prisma.$disconnect());

  const administrar = async (extra: Record<string, unknown> = {}, sesion = enfermera) => {
    const validacionToken = await comprobanteDe(sesion.agente);
    return sesion.agente
      .post('/api/suministros/medicamentos')
      .send({ pacienteId, prescripcionId, validacionToken, ...extra });
  };

  describe('administración de medicamento (CU20 · T408)', () => {
    it('registra la toma asociada al paciente, la prescripción, el insumo y el usuario validado', async () => {
      const res = await administrar({ observaciones: 'Tolera bien' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        tipo: 'MEDICAMENTO',
        paciente: { id: pacienteId },
        prescripcion: { id: prescripcionId, medicamento: 'Paracetamol' },
        usuario: { id: enfermera.usuario.id },
        detalles: [{ insumoId: paracetamol, insumo: 'Paracetamol', cantidad: 500, unidad: 'mg' }],
        validadoBiometricamente: true,
        observaciones: 'Tolera bien',
        corregido: false,
      });
      // La toma de hace 2 h es la más cercana a ahora (la próxima es dentro de 6 h).
      const toma = new Date(res.body.data.tomaProgramada).getTime();
      expect(Math.abs(toma - (Date.now() - 2 * HORA))).toBeLessThan(60_000);
      expect(
        await prisma.auditoria.count({
          where: { accion: 'REGISTRAR', entidad: 'Suministro', pacienteId },
        }),
      ).toBe(1);
    });

    it('permite informar otra cantidad que la dosis prescripta', async () => {
      const res = await administrar({ cantidad: 250 });
      expect(res.body.data.detalles[0].cantidad).toBe(250);
    });

    it('exige la validación facial y no deja reutilizarla', async () => {
      const sin = await enfermera.agente
        .post('/api/suministros/medicamentos')
        .send({ pacienteId, prescripcionId });
      expect(sin.status).toBe(403);
      expect(sin.body.error.codigo).toBe('VALIDACION_FACIAL_REQUERIDA');

      const token = await comprobanteDe(enfermera.agente);
      const enviar = () =>
        enfermera.agente
          .post('/api/suministros/medicamentos')
          .send({ pacienteId, prescripcionId, validacionToken: token });
      expect((await enviar()).status).toBe(201);
      expect((await enviar()).status).toBe(403);
      expect(await prisma.suministro.count()).toBe(1);
    });

    it('RN07: no registra un medicamento sin prescripción vigente', async () => {
      await prisma.prescripcion.update({
        where: { id: prescripcionId },
        data: { estado: 'SUSPENDIDA' },
      });
      const res = await administrar();
      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('SIN_PRESCRIPCION_VIGENTE');
      expect(await prisma.suministro.count()).toBe(0);
    });

    it('RN07: la prescripción tiene que ser del mismo paciente y estar en curso', async () => {
      const otro = await crearPacienteBasico(enfermera.usuario.id);
      expect((await administrar({ pacienteId: otro.id })).body.error.codigo).toBe(
        'SIN_PRESCRIPCION_VIGENTE',
      );

      await prisma.prescripcion.update({
        where: { id: prescripcionId },
        data: { fechaInicio: new Date(Date.now() + 24 * HORA) },
      });
      expect((await administrar()).body.error.codigo).toBe('SIN_PRESCRIPCION_VIGENTE');
    });

    it('no registra suministros a un paciente egresado', async () => {
      await prisma.paciente.update({
        where: { id: pacienteId },
        data: { estado: 'EGRESADO', fechaEgreso: new Date(), motivoEgreso: 'Alta' },
      });
      const res = await administrar();
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('PACIENTE_NO_INTERNADO');
    });
  });

  describe('insumos no prescriptos (CU21 · T409)', () => {
    const registrar = async (items: unknown, sesion = enfermera) => {
      const validacionToken = await comprobanteDe(sesion.agente);
      return sesion.agente
        .post('/api/suministros/insumos')
        .send({ pacienteId, items, validacionToken });
    };

    it('registra varios insumos en un solo movimiento', async () => {
      const res = await registrar([
        { insumoId: gasa, cantidad: 4 },
        { insumoId: panal, cantidad: 2 },
      ]);

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        tipo: 'INSUMOS',
        prescripcion: null,
        tomaProgramada: null,
        detalles: [
          { insumo: 'Gasa', cantidad: 4, unidad: 'unidad' },
          { insumo: 'Pañal', cantidad: 2, unidad: 'unidad' },
        ],
      });
      expect(await prisma.suministro.count()).toBe(1);
      expect(await prisma.detalleSuministro.count()).toBe(2);
    });

    it('T410: un medicamento no se registra como insumo suelto', async () => {
      const res = await registrar([
        { insumoId: gasa, cantidad: 1 },
        { insumoId: paracetamol, cantidad: 500 },
      ]);
      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('SIN_PRESCRIPCION_VIGENTE');
      expect(await prisma.suministro.count()).toBe(0);
    });

    it('rechaza insumos dados de baja, repetidos, cantidades inválidas o una lista vacía', async () => {
      await prisma.insumo.update({ where: { id: panal }, data: { activo: false } });
      expect((await registrar([{ insumoId: panal, cantidad: 1 }])).body.error.codigo).toBe(
        'INSUMO_NO_DISPONIBLE',
      );
      expect((await registrar([])).status).toBe(400);
      expect((await registrar([{ insumoId: gasa, cantidad: 0 }])).status).toBe(400);
      expect(
        (
          await registrar([
            { insumoId: gasa, cantidad: 1 },
            { insumoId: gasa, cantidad: 2 },
          ])
        ).status,
      ).toBe(400);
    });
  });

  describe('control de acceso con los tres roles', () => {
    it('el médico no registra suministros; el administrador sí', async () => {
      const medico = await agenteConRol('MEDICO');
      await registrarRostro(medico.usuario.id);
      expect((await administrar({}, medico)).status).toBe(403);

      const admin = await agenteConRol('ADMINISTRADOR');
      await registrarRostro(admin.usuario.id);
      expect((await administrar({}, admin)).status).toBe(201);
    });
  });
});
