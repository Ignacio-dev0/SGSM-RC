import { prisma } from '../../db';
import { crearInsumo, crearPacienteBasico } from '../../../tests/soporte/fabricas';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { comprobanteDe, registrarRostro } from '../../../tests/soporte/biometria';
import { mientrasEspera, transaccionAbierta } from '../../../tests/soporte/concurrencia';

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
    const inicio = new Date(Date.now() - 2 * HORA);
    prescripcionId = (
      await prisma.prescripcion.create({
        data: {
          pacienteId,
          insumoId: paracetamol,
          dosis: 500,
          unidadDosis: 'mg',
          frecuenciaHoras: 8,
          via: 'ORAL',
          fechaInicio: inicio,
          agendaDesde: inicio,
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
      // D121: queda guardada con la administración.
      const db = await prisma.suministro.findUniqueOrThrow({ where: { id: res.body.data.id } });
      expect(db.tomaProgramada?.toISOString()).toBe(res.body.data.tomaProgramada);
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

      const manana = new Date(Date.now() + 24 * HORA);
      await prisma.prescripcion.update({
        where: { id: prescripcionId },
        data: { fechaInicio: manana, agendaDesde: manana },
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

  describe('una toma que ya se dio (D113)', () => {
    const responsable = async () => {
      const u = await prisma.usuario.findUniqueOrThrow({ where: { id: enfermera.usuario.id } });
      return `${u.apellido}, ${u.nombre}`;
    };

    it('responde 409 TOMA_YA_DADA con cuándo y quién la dio, sin registrar otra', async () => {
      const primera = await administrar();
      expect(primera.status).toBe(201);

      const segunda = await administrar();

      expect(segunda.status).toBe(409);
      expect(segunda.body.error).toMatchObject({
        codigo: 'TOMA_YA_DADA',
        // La misma toma ya tiene su administración (D113).
        detalles: {
          motivo: 'MISMA_TOMA',
          fechaHora: primera.body.data.fechaHora,
          usuario: await responsable(),
        },
      });
      expect(segunda.body.error.mensaje).toMatch(/ya se dio/);
      expect(await prisma.suministro.count()).toBe(1);
    });

    it('con otraToma la registra igual', async () => {
      await administrar();
      const otra = await administrar({ otraToma: true });
      expect(otra.status).toBe(201);
      expect(await prisma.suministro.count()).toBe(2);
      // Queda dicho en la auditoría que se marcó a propósito.
      const a = await prisma.auditoria.findFirstOrThrow({
        where: { accion: 'REGISTRAR', entidadId: String(otra.body.data.id) },
      });
      expect(a.detalle).toMatch(
        /^Se marcó que corresponde dar otra toma: la de las \d\d:\d\d ya se había dado/,
      );

      // Sin una administración previa, otraToma no deja nada dicho.
      await prisma.suministro.deleteMany();
      const sola = await administrar({ otraToma: true });
      const b = await prisma.auditoria.findFirstOrThrow({
        where: { accion: 'REGISTRAR', entidadId: String(sola.body.data.id) },
      });
      expect(b.detalle).toBeNull();
    });

    it('el 409 no gasta la validación facial: se reenvía con otraToma sin volver a validar', async () => {
      await administrar();
      const validacionToken = await comprobanteDe(enfermera.agente);
      const enviar = (extra: Record<string, unknown>) =>
        enfermera.agente
          .post('/api/suministros/medicamentos')
          .send({ pacienteId, prescripcionId, validacionToken, ...extra });

      expect((await enviar({})).status).toBe(409);
      expect((await enviar({ otraToma: true })).status).toBe(201);
    });

    /** Una dosis registrada en ese momento para esa toma (sin la validación facial). */
    const dosis = (fechaHora: Date, tomaProgramada: Date) =>
      prisma.suministro.create({
        data: {
          pacienteId,
          usuarioId: enfermera.usuario.id,
          tipo: 'MEDICAMENTO',
          prescripcionId,
          fechaHora,
          tomaProgramada,
          validadoBiometricamente: true,
          detalles: { create: [{ insumoId: paracetamol, cantidad: 500 }] },
        },
      });

    it('una administración de otra toma no cuenta', async () => {
      // La toma de hace 10 h ya se dio; la de hace 2 h (la de ahora) no.
      await prisma.prescripcion.update({
        where: { id: prescripcionId },
        data: {
          fechaInicio: new Date(Date.now() - 10 * HORA),
          agendaDesde: new Date(Date.now() - 10 * HORA),
        },
      });
      const p = await prisma.prescripcion.findUniqueOrThrow({ where: { id: prescripcionId } });
      await dosis(p.fechaInicio, p.fechaInicio);
      expect((await administrar()).status).toBe(201);
    });

    it('una dosis de hace menos de media frecuencia pide confirmar, aunque sea de antes de reanudar (D123)', async () => {
      const antes = new Date(Date.now() - 40 * 60_000);
      const p = await prisma.prescripcion.findUniqueOrThrow({ where: { id: prescripcionId } });
      await dosis(antes, p.fechaInicio);
      // Se reanudó hace 5 minutos: la toma de ahora es la primera de la agenda nueva.
      await prisma.prescripcion.update({
        where: { id: prescripcionId },
        data: { agendaDesde: new Date(Date.now() - 5 * 60_000) },
      });

      const res = await administrar();

      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        codigo: 'TOMA_YA_DADA',
        // Una dosis de otra toma, de hace menos de media frecuencia (D123).
        detalles: {
          motivo: 'DOSIS_RECIENTE',
          fechaHora: antes.toISOString(),
          usuario: await responsable(),
        },
      });
      expect(res.body.error.mensaje).toMatch(
        /^Ya se dio una dosis a las \d\d:\d\d \(.+\), hace 40 min, y la indicación es cada 8 h\. Si corresponde dar otra, márquelo y vuelva a confirmar\.$/,
      );
      const otra = await administrar({ otraToma: true });
      expect(otra.status).toBe(201);
      const a = await prisma.auditoria.findFirstOrThrow({
        where: { accion: 'REGISTRAR', entidadId: String(otra.body.data.id) },
      });
      expect(a.detalle).toMatch(
        /^Se marcó que corresponde dar otra toma: ya se había dado una dosis a las \d\d:\d\d/,
      );
    });

    it('dos enfermeras a la vez: una registra la toma y la otra recibe TOMA_YA_DADA', async () => {
      const otra = await agenteConRol('ENFERMERO');
      await registrarRostro(otra.usuario.id);
      const tokens = await Promise.all([
        comprobanteDe(enfermera.agente),
        comprobanteDe(otra.agente),
      ]);

      const respuestas = await Promise.all(
        [enfermera.agente, otra.agente].map((agente, i) =>
          agente
            .post('/api/suministros/medicamentos')
            .send({ pacienteId, prescripcionId, validacionToken: tokens[i] }),
        ),
      );

      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.suministro.count()).toBe(1);
    });

    it('decide con la agenda que confirma un cambio en curso, no con la que leyó antes (D121)', async () => {
      // Iba desde hace 10 h cada 8 h: la toma de ahora es la de hace 2 h, que ya se dio
      // adelantada hace 5 h 50 min.
      const inicio = new Date(Date.now() - 10 * HORA);
      await prisma.prescripcion.update({
        where: { id: prescripcionId },
        data: { fechaInicio: inicio, agendaDesde: inicio },
      });
      await dosis(new Date(Date.now() - 350 * 60_000), new Date(Date.now() - 2 * HORA));
      const validacionToken = await comprobanteDe(enfermera.agente);
      // En ese momento un médico la pasa a cada 4 h, anclada hace un minuto.
      const cambio = await transaccionAbierta((tx) =>
        tx.prescripcion.update({
          where: { id: prescripcionId },
          data: { frecuenciaHoras: 4, agendaDesde: new Date(Date.now() - 60_000) },
        }),
      );

      const r = await mientrasEspera(
        enfermera.agente
          .post('/api/suministros/medicamentos')
          .send({ pacienteId, prescripcionId, validacionToken }),
        cambio,
      );

      expect(r.respondioAntes).toBe(false);
      expect(r.res.status).toBe(201);
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
