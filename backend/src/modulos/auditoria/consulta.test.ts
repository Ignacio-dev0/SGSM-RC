import type { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { crearPacienteBasico, crearUsuarioBasico } from '../../../tests/soporte/fabricas';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

type Sesion = Awaited<ReturnType<typeof agenteConRol>>;
type Entrada = { id: number; accion: string };

/**
 * Consulta de la auditoría con filtros (T604 · CU35). Las entradas se arman a mano en 2020, así
 * el inicio de sesión del administrador de la prueba (que se audita con la hora real) es siempre
 * la más reciente.
 */
describe('consulta de la auditoría (T604)', () => {
  let admin: Sesion;
  let sofia: { id: number };
  let lucas: { id: number };
  let ana: { id: number; dni: string };
  let beto: { id: number };
  let e: Record<'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'login', number>;

  beforeAll(async () => {
    await prepararBaseConSeguridad();
    sofia = await crearUsuarioBasico({ apellido: 'Suárez', nombre: 'Sofía' });
    lucas = await crearUsuarioBasico({ apellido: 'López', nombre: 'Lucas' });
    ana = await crearPacienteBasico(sofia.id, { apellido: 'Alvarez', nombre: 'Ana' });
    beto = await crearPacienteBasico(sofia.id, { apellido: 'Benítez', nombre: 'Beto' });
    const auditar = async (
      fecha: string,
      data: Omit<Prisma.AuditoriaUncheckedCreateInput, 'fechaHora'>,
    ) => (await prisma.auditoria.create({ data: { fechaHora: new Date(fecha), ...data } })).id;
    e = {
      e1: await auditar('2020-03-01T12:00:00Z', {
        usuarioId: sofia.id,
        accion: 'CREAR',
        entidad: 'Paciente',
        entidadId: String(ana.id),
        pacienteId: ana.id,
        valorNuevo: { apellido: 'Alvarez' },
      }),
      // 23:30 del 01/03 en Argentina (en UTC ya es el 02).
      e2: await auditar('2020-03-02T02:30:00Z', {
        usuarioId: lucas.id,
        accion: 'MODIFICAR',
        entidad: 'Paciente',
        entidadId: String(ana.id),
        pacienteId: ana.id,
        valorAnterior: { cama: 'A-01' },
        valorNuevo: { cama: 'A-02' },
        detalle: 'Traslado',
      }),
      // 00:30 del 02/03 en Argentina; sin usuario: lo hizo el sistema (el temporizador).
      e3: await auditar('2020-03-02T03:30:00Z', {
        accion: 'GENERAR',
        entidad: 'Recordatorio',
        entidadId: '7',
        pacienteId: beto.id,
      }),
      e4: await auditar('2020-03-03T12:00:00Z', {
        usuarioId: sofia.id,
        accion: 'REGISTRAR',
        entidad: 'Suministro',
        pacienteId: beto.id,
      }),
      e5: await auditar('2020-03-04T12:00:00Z', {
        usuarioId: lucas.id,
        accion: 'INICIAR_SESION',
        entidad: 'Usuario',
        entidadId: String(lucas.id),
      }),
      login: 0,
    };
    admin = await agenteConRol('ADMINISTRADOR');
    e.login = (
      await prisma.auditoria.findFirstOrThrow({ where: { usuarioId: admin.usuario.id } })
    ).id;
  });
  afterAll(() => prisma.$disconnect());

  const consultar = async (query: Record<string, string | number> = {}) => {
    const res = await admin.agente.get('/api/auditoria').query(query);
    expect(res.status).toBe(200);
    return res.body as {
      data: (Entrada & Record<string, unknown>)[];
      meta: Record<string, number>;
    };
  };
  const ids = (r: { data: Entrada[] }) => r.data.map((x) => x.id);

  it('sin filtros: de la más reciente a la más vieja, 50 por página', async () => {
    const r = await consultar();
    expect(ids(r)).toEqual([e.login, e.e5, e.e4, e.e3, e.e2, e.e1]);
    expect(r.meta).toEqual({ pagina: 1, porPagina: 50, total: 6, totalPaginas: 1 });
  });

  it('cada entrada trae usuario "Apellido, Nombre", paciente y los valores anterior y nuevo', async () => {
    const r = await consultar();
    expect(r.data.find((x) => x.id === e.e2)).toEqual({
      id: e.e2,
      fechaHora: '2020-03-02T02:30:00.000Z',
      accion: 'MODIFICAR',
      entidad: 'Paciente',
      entidadId: String(ana.id),
      usuario: { id: lucas.id, nombre: 'López, Lucas' },
      paciente: { id: ana.id, nombre: 'Alvarez, Ana', dni: ana.dni },
      valorAnterior: { cama: 'A-01' },
      valorNuevo: { cama: 'A-02' },
      detalle: 'Traslado',
    });
  });

  it('sin usuario la hizo el "Sistema"; sin paciente, paciente null', async () => {
    const r = await consultar();
    expect(r.data.find((x) => x.id === e.e3)).toMatchObject({
      usuario: { id: null, nombre: 'Sistema' },
      paciente: { id: beto.id, nombre: 'Benítez, Beto' },
      valorAnterior: null,
      valorNuevo: null,
      detalle: null,
    });
    expect(r.data.find((x) => x.id === e.e5)).toMatchObject({ paciente: null });
  });

  it('las fechas son días en hora de Argentina, con los dos extremos incluidos', async () => {
    expect(ids(await consultar({ desde: '2020-03-01', hasta: '2020-03-01' }))).toEqual([
      e.e2,
      e.e1,
    ]);
    expect(ids(await consultar({ desde: '2020-03-02', hasta: '2020-03-02' }))).toEqual([e.e3]);
    expect(ids(await consultar({ desde: '2020-03-03' }))).toEqual([e.login, e.e5, e.e4]);
    expect(ids(await consultar({ hasta: '2020-03-01' }))).toEqual([e.e2, e.e1]);
  });

  it('filtra por usuario, paciente, acción y entidad, y los combina', async () => {
    expect(ids(await consultar({ usuarioId: lucas.id }))).toEqual([e.e5, e.e2]);
    expect(ids(await consultar({ pacienteId: beto.id }))).toEqual([e.e4, e.e3]);
    expect(ids(await consultar({ accion: 'MODIFICAR' }))).toEqual([e.e2]);
    expect(ids(await consultar({ entidad: 'Paciente' }))).toEqual([e.e2, e.e1]);
    expect(ids(await consultar({ usuarioId: sofia.id, pacienteId: beto.id }))).toEqual([e.e4]);
    const nada = await consultar({ accion: 'BAJA' });
    expect(nada).toEqual({
      data: [],
      meta: { pagina: 1, porPagina: 50, total: 0, totalPaginas: 0 },
    });
  });

  it('origen: personas son las que tienen usuario; sistema, las que no (D101)', async () => {
    expect(ids(await consultar({ origen: 'personas' }))).toEqual([e.login, e.e5, e.e4, e.e2, e.e1]);
    const sistema = await consultar({ origen: 'sistema' });
    expect(ids(sistema)).toEqual([e.e3]);
    expect(sistema.data[0]).toMatchObject({ usuario: { id: null, nombre: 'Sistema' } });
    expect(sistema.meta).toEqual({ pagina: 1, porPagina: 50, total: 1, totalPaginas: 1 });
  });

  it('origen se combina con los otros filtros', async () => {
    expect(ids(await consultar({ origen: 'personas', pacienteId: beto.id }))).toEqual([e.e4]);
    expect(ids(await consultar({ origen: 'sistema', pacienteId: beto.id }))).toEqual([e.e3]);
    expect(ids(await consultar({ origen: 'personas', usuarioId: lucas.id }))).toEqual([e.e5, e.e2]);
    // Un usuario y "sin usuario" a la vez: no hay ninguna.
    expect(ids(await consultar({ origen: 'sistema', usuarioId: lucas.id }))).toEqual([]);
  });

  it('pagina con pagina y tamano (o porPagina)', async () => {
    const r = await consultar({ pagina: 2, tamano: 2 });
    expect(ids(r)).toEqual([e.e4, e.e3]);
    expect(r.meta).toEqual({ pagina: 2, porPagina: 2, total: 6, totalPaginas: 3 });
    expect(ids(await consultar({ pagina: 3, porPagina: 2 }))).toEqual([e.e2, e.e1]);
  });

  it('parámetros inválidos responden 400', async () => {
    const res = await admin.agente.get('/api/auditoria').query({ tamano: 500 });
    expect(res.status).toBe(400);
    expect(res.body.error.detalles[0].campo).toBe('tamano');
  });

  it.each(['todos', 'PERSONAS', ''])('origen "%s" no es válido: 400 VALIDACION', async (origen) => {
    const res = await admin.agente.get('/api/auditoria').query({ origen });
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
    expect(res.body.error.detalles).toEqual([
      { campo: 'origen', mensaje: 'El origen debe ser "personas" o "sistema"' },
    ]);
  });

  it('opciones: las acciones y entidades que hay en la base, ordenadas', async () => {
    const res = await admin.agente.get('/api/auditoria/opciones');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        acciones: ['CREAR', 'GENERAR', 'INICIAR_SESION', 'MODIFICAR', 'REGISTRAR'],
        entidades: ['Paciente', 'Recordatorio', 'Suministro', 'Usuario'],
      },
    });
  });

  it.each(['MEDICO', 'ENFERMERO'] as const)(
    'el %s no consulta la auditoría: 403 (S17)',
    async (rol) => {
      const { agente } = await agenteConRol(rol);
      expect((await agente.get('/api/auditoria')).status).toBe(403);
      expect((await agente.get('/api/auditoria/opciones')).status).toBe(403);
    },
  );

  it('oculta claves sensibles aunque una entrada las tuviera guardadas (revisión de T705)', async () => {
    // Armada a mano, sin pasar por registrarAuditoria (que ya las oculta al guardar).
    const fila = await prisma.auditoria.create({
      data: {
        fechaHora: new Date('2019-01-01T12:00:00Z'),
        accion: 'MODIFICAR',
        entidad: 'Usuario',
        valorAnterior: { nombre: 'Ana', contrasenaHash: '$2a$10$abc', contrasena: 'Secreta1' },
        valorNuevo: {
          nombre: 'Ana María',
          patron: [0.1, 0.2],
          fotoReferencia: 'aGVsbG8=',
          token: 'eyJhbGciOi',
          datos: { validacionToken: 'x', cama: 'A-01' },
          historial: [{ contrasena: 'vieja', fecha: '2019-01-01' }],
        },
      },
    });
    const r = await consultar({ hasta: '2019-01-01' });
    expect(r.data).toEqual([
      expect.objectContaining({
        id: fila.id,
        usuario: { id: null, nombre: 'Sistema' },
        valorAnterior: { nombre: 'Ana', contrasenaHash: '[oculto]', contrasena: '[oculto]' },
        valorNuevo: {
          nombre: 'Ana María',
          patron: '[oculto]',
          fotoReferencia: '[oculto]',
          token: '[oculto]',
          datos: { validacionToken: '[oculto]', cama: 'A-01' },
          historial: [{ contrasena: '[oculto]', fecha: '2019-01-01' }],
        },
      }),
    ]);
  });
});
