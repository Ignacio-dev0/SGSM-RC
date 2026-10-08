import request from 'supertest';
import { prisma } from '../../db';
import {
  crearInsumo,
  crearPacienteBasico,
  crearPrescripcionBasica,
} from '../../../tests/soporte/fabricas';
import { comprobanteDe, registrarRostro } from '../../../tests/soporte/biometria';
import { mientrasEspera, transaccionAbierta } from '../../../tests/soporte/concurrencia';
import { agenteConRol, obtenerApp, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

const nuevo = (extra: Record<string, unknown> = {}) => ({
  nombre: 'Amoxicilina',
  tipo: 'MEDICAMENTO',
  unidadMedida: 'mg',
  presentacion: 'Cápsulas 500 mg',
  ...extra,
});

describe('catálogo de insumos y medicamentos (T303 · CU17 · CU21)', () => {
  beforeEach(() => prepararBaseConSeguridad());
  afterAll(() => prisma.$disconnect());

  it('lista el catálogo activo filtrando por tipo y texto, ordenado por nombre', async () => {
    const { agente } = await agenteConRol('ENFERMERO');
    await crearInsumo({ nombre: 'Paracetamol', presentacion: 'Comprimidos 500 mg' });
    await crearInsumo({ nombre: 'Ibuprofeno', presentacion: 'Comprimidos 400 mg' });
    await crearInsumo({ nombre: 'Gasa estéril', tipo: 'INSUMO', unidadMedida: 'unidad' });
    await crearInsumo({ nombre: 'Dipirona', activo: false });

    const medicamentos = await agente.get('/api/insumos').query({ tipo: 'MEDICAMENTO' });
    expect(medicamentos.status).toBe(200);
    expect(medicamentos.body.data.map((i: { nombre: string }) => i.nombre)).toEqual([
      'Ibuprofeno',
      'Paracetamol',
    ]);
    expect(medicamentos.body.data[0]).toMatchObject({
      tipo: 'MEDICAMENTO',
      unidadMedida: 'comprimido',
      presentacion: 'Comprimidos 400 mg',
      activo: true,
    });

    const porTexto = await agente.get('/api/insumos').query({ texto: 'gasa' });
    expect(porTexto.body.data.map((i: { nombre: string }) => i.nombre)).toEqual(['Gasa estéril']);
  });

  it('el administrador puede ver también los dados de baja', async () => {
    const { agente } = await agenteConRol('ADMINISTRADOR');
    await crearInsumo({ nombre: 'Dipirona', activo: false });
    const res = await agente.get('/api/insumos').query({ activo: 'false' });
    expect(res.body.data.map((i: { nombre: string }) => i.nombre)).toEqual(['Dipirona']);
  });

  it('da de alta un insumo y lo audita', async () => {
    const { agente, usuario } = await agenteConRol('ADMINISTRADOR');

    const res = await agente.post('/api/insumos').send(nuevo());

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      nombre: 'Amoxicilina',
      tipo: 'MEDICAMENTO',
      activo: true,
    });
    expect(
      await prisma.auditoria.count({
        where: { accion: 'CREAR', entidad: 'Insumo', usuarioId: usuario.id },
      }),
    ).toBe(1);
  });

  it('rechaza el mismo nombre con la misma presentación', async () => {
    const { agente } = await agenteConRol('ADMINISTRADOR');
    await agente.post('/api/insumos').send(nuevo());
    const res = await agente.post('/api/insumos').send(nuevo());
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('INSUMO_DUPLICADO');
    expect(
      (await agente.post('/api/insumos').send(nuevo({ presentacion: 'Suspensión 250 mg/5 ml' })))
        .status,
    ).toBe(201);
  });

  it('el aviso de duplicado dice si es un medicamento o un insumo, y si está dado de baja', async () => {
    const { agente } = await agenteConRol('ADMINISTRADOR');
    await agente.post('/api/insumos').send(nuevo());
    const medicamento = await agente.post('/api/insumos').send(nuevo());
    expect(medicamento.body.error.mensaje).toBe(
      'Ya existe un medicamento con ese nombre y presentación',
    );

    const gasa = { nombre: 'Gasa', tipo: 'INSUMO', unidadMedida: 'unidad', presentacion: 'Sobre' };
    const { body } = await agente.post('/api/insumos').send(gasa);
    expect((await agente.post('/api/insumos').send(gasa)).body.error.mensaje).toBe(
      'Ya existe un insumo con ese nombre y presentación',
    );

    await agente.delete(`/api/insumos/${body.data.id}`);
    const deBaja = await agente.post('/api/insumos').send(gasa);
    expect(deBaja.status).toBe(409);
    expect(deBaja.body.error.mensaje).toBe(
      'Ya existe un insumo con ese nombre y presentación, dado de baja: reactívelo en lugar de agregar otro',
    );

    // Al modificar, también.
    const otra = await agente.post('/api/insumos').send({ ...gasa, presentacion: 'Paquete' });
    const choca = await agente
      .patch(`/api/insumos/${otra.body.data.id}`)
      .send({ presentacion: 'Sobre' });
    expect(choca.body.error).toMatchObject({ codigo: 'INSUMO_DUPLICADO' });
    expect(choca.body.error.mensaje).toMatch(/^Ya existe un insumo con ese nombre y presentación/);
  });

  describe('en uso (D116)', () => {
    let admin: Awaited<ReturnType<typeof agenteConRol>>;
    let prescripto: number;
    let suministrado: number;
    let libre: number;
    let pacienteId: number;

    beforeEach(async () => {
      admin = await agenteConRol('ADMINISTRADOR');
      const paciente = await crearPacienteBasico(admin.usuario.id);
      pacienteId = paciente.id;
      prescripto = (await crearInsumo({ nombre: 'Enalapril', unidadMedida: 'mg' })).id;
      await crearPrescripcionBasica(paciente.id, admin.usuario.id, { insumoId: prescripto });
      suministrado = (await crearInsumo({ nombre: 'Gasa', tipo: 'INSUMO', unidadMedida: 'unidad' }))
        .id;
      await prisma.suministro.create({
        data: {
          pacienteId: paciente.id,
          usuarioId: admin.usuario.id,
          tipo: 'INSUMOS',
          fechaHora: new Date(),
          validadoBiometricamente: true,
          detalles: { create: [{ insumoId: suministrado, cantidad: 2 }] },
        },
      });
      libre = (await crearInsumo({ nombre: 'Ibuprofeno', unidadMedida: 'mg' })).id;
    });

    it('la lista y el detalle dicen si lo usa alguna prescripción o algún suministro', async () => {
      const lista = await admin.agente.get('/api/insumos');
      expect(
        Object.fromEntries(
          lista.body.data.map((i: { nombre: string; enUso: boolean }) => [i.nombre, i.enUso]),
        ),
      ).toEqual({ Enalapril: true, Gasa: true, Ibuprofeno: false });
      expect((await admin.agente.get(`/api/insumos/${prescripto}`)).body.data.enUso).toBe(true);
      expect((await admin.agente.get(`/api/insumos/${libre}`)).body.data.enUso).toBe(false);
    });

    it('no deja cambiar el tipo ni la unidad de medida de uno en uso', async () => {
      const tipo = await admin.agente.patch(`/api/insumos/${prescripto}`).send({ tipo: 'INSUMO' });
      expect(tipo.status).toBe(409);
      expect(tipo.body.error.codigo).toBe('INSUMO_EN_USO');
      expect(tipo.body.error.mensaje).toBe(
        'Este medicamento ya se usó en prescripciones o suministros: no se puede cambiar su tipo ni su unidad de medida. Si hace falta otro, agréguelo al catálogo.',
      );
      const unidad = await admin.agente
        .patch(`/api/insumos/${suministrado}`)
        .send({ unidadMedida: 'paquete' });
      expect(unidad.status).toBe(409);
      expect(unidad.body.error.mensaje).toMatch(/^Este insumo ya se usó/);
      const db = await prisma.insumo.findUniqueOrThrow({ where: { id: prescripto } });
      expect(db).toMatchObject({ tipo: 'MEDICAMENTO', unidadMedida: 'mg' });
    });

    it('lo demás se puede cambiar, y el tipo y la unidad si se mandan iguales', async () => {
      const res = await admin.agente
        .patch(`/api/insumos/${prescripto}`)
        .send({ nombre: 'Enalapril maleato', tipo: 'MEDICAMENTO', unidadMedida: 'mg' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ nombre: 'Enalapril maleato', enUso: true });
      expect((await admin.agente.delete(`/api/insumos/${prescripto}`)).status).toBe(200);
    });

    it('uno que nadie usó se puede corregir del todo', async () => {
      const res = await admin.agente
        .patch(`/api/insumos/${libre}`)
        .send({ tipo: 'INSUMO', unidadMedida: 'unidad' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ tipo: 'INSUMO', unidadMedida: 'unidad', enUso: false });
    });

    describe('a la vez que otra transacción (D116)', () => {
      it('cambiar el tipo espera a la prescripción que se está creando y entonces la ve', async () => {
        const otra = await transaccionAbierta((tx) =>
          tx.prescripcion.create({
            data: {
              pacienteId,
              insumoId: libre,
              dosis: 400,
              unidadDosis: 'mg',
              frecuenciaHoras: 8,
              via: 'ORAL',
              fechaInicio: new Date(),
              agendaDesde: new Date(),
              prescriptorId: admin.usuario.id,
            },
          }),
        );

        const cambio = await mientrasEspera(
          admin.agente.patch(`/api/insumos/${libre}`).send({ tipo: 'INSUMO' }),
          otra,
        );

        expect(cambio.respondioAntes).toBe(false);
        expect(cambio.res.status).toBe(409);
        expect(cambio.res.body.error.codigo).toBe('INSUMO_EN_USO');
      });

      it('una prescripción nueva espera al cambio de tipo en curso y no se crea sobre un insumo', async () => {
        const medico = await agenteConRol('MEDICO');
        const otra = await transaccionAbierta((tx) =>
          tx.insumo.update({ where: { id: libre }, data: { tipo: 'INSUMO' } }),
        );

        const alta = await mientrasEspera(
          medico.agente.post(`/api/pacientes/${pacienteId}/prescripciones`).send({
            insumoId: libre,
            dosis: 400,
            unidadDosis: 'mg',
            frecuenciaHoras: 8,
            via: 'ORAL',
            fechaInicio: new Date().toISOString(),
          }),
          otra,
        );

        expect(alta.respondioAntes).toBe(false);
        expect(alta.res.status).toBe(422);
        expect(alta.res.body.error.codigo).toBe('NO_ES_MEDICAMENTO');
        expect(await prisma.prescripcion.count({ where: { insumoId: libre } })).toBe(0);
      });

      it('un registro de insumos espera al cambio en curso y no registra un medicamento suelto', async () => {
        const enfermera = await agenteConRol('ENFERMERO');
        await registrarRostro(enfermera.usuario.id);
        const validacionToken = await comprobanteDe(enfermera.agente);
        const otra = await transaccionAbierta((tx) =>
          tx.insumo.update({ where: { id: suministrado }, data: { tipo: 'MEDICAMENTO' } }),
        );

        const registro = await mientrasEspera(
          enfermera.agente.post('/api/suministros/insumos').send({
            pacienteId,
            items: [{ insumoId: suministrado, cantidad: 1 }],
            validacionToken,
          }),
          otra,
        );

        expect(registro.respondioAntes).toBe(false);
        expect(registro.res.status).toBe(422);
        expect(registro.res.body.error.codigo).toBe('SIN_PRESCRIPCION_VIGENTE');
      });
    });
  });

  it('valida tipo, nombre y unidad de medida', async () => {
    const { agente } = await agenteConRol('ADMINISTRADOR');
    const res = await agente.post('/api/insumos').send({ tipo: 'OTRO' });
    expect(res.status).toBe(400);
    const campos = res.body.error.detalles.map((d: { campo: string }) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['nombre', 'tipo', 'unidadMedida']));
  });

  it('modifica y da de baja un insumo sin borrarlo', async () => {
    const { agente } = await agenteConRol('ADMINISTRADOR');
    const { body } = await agente.post('/api/insumos').send(nuevo());

    const mod = await agente
      .patch(`/api/insumos/${body.data.id}`)
      .send({ presentacion: 'Cápsulas 875 mg' });
    expect(mod.body.data.presentacion).toBe('Cápsulas 875 mg');

    const baja = await agente.delete(`/api/insumos/${body.data.id}`);
    expect(baja.status).toBe(200);
    expect(baja.body.data.activo).toBe(false);
    expect(await prisma.insumo.count()).toBe(1);
    const acciones = (await prisma.auditoria.findMany({ where: { entidad: 'Insumo' } })).map(
      (a) => a.accion,
    );
    expect(acciones).toEqual(['CREAR', 'MODIFICAR', 'BAJA']);
  });

  it.each(['MEDICO', 'ENFERMERO'] as const)(
    'el %s consulta pero no administra el catálogo',
    async (rol) => {
      const { agente } = await agenteConRol(rol);
      expect((await agente.get('/api/insumos')).status).toBe(200);
      expect((await agente.post('/api/insumos').send(nuevo())).status).toBe(403);
    },
  );

  it('sin sesión responde 401', async () => {
    expect((await request(obtenerApp()).get('/api/insumos')).status).toBe(401);
  });
});
