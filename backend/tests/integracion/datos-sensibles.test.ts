// Revisión de datos sensibles expuestos (T705): recorre las respuestas de la API con datos
// cargados en todos los módulos y verifica que nunca salgan hashes de contraseñas, el patrón
// facial, la foto (salvo por su endpoint con biometria.gestionar), tokens ni secretos.
import request from 'supertest';
import { prisma } from '../../src/db';
import { crearInsumo, crearTipoEstudio, internarPaciente } from '../soporte/fabricas';
import {
  agenteConRol,
  agenteDe,
  crearUsuario,
  obtenerApp,
  prepararBaseConSeguridad,
} from '../soporte/sesion';

// Valores fáciles de reconocer si se filtraran en una respuesta.
const PATRON = Array.from({ length: 128 }, (_, i) => 0.1234567 + i / 1_000_000);
const FOTO_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const CONTRASENA_NUEVA = 'Secreta2026x';

// "clave" no: los reportes la usan como clave de agrupación.
const CLAVE_SENSIBLE = /contrase(n|ñ)a|password|hash|patron|foto|token|secret|cifrad/i;

/** Rutas "a.b.c" de todas las claves de un JSON. */
function claves(valor: unknown, ruta = ''): string[] {
  if (Array.isArray(valor)) return valor.flatMap((v, i) => claves(v, `${ruta}[${i}]`));
  if (valor !== null && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([k, v]) => [
      `${ruta}${ruta ? '.' : ''}${k}`,
      ...claves(v, `${ruta}${ruta ? '.' : ''}${k}`),
    ]);
  }
  return [];
}

/** Lo que no puede aparecer en ninguna respuesta, ni como clave ni como valor. */
function expectSinDatosSensibles(
  endpoint: string,
  res: { status: number; text: string; body: unknown },
  permitidas: RegExp[] = [],
) {
  expect({ endpoint, status: res.status }).toEqual({ endpoint, status: expect.any(Number) });
  expect(res.status).toBeLessThan(400);
  const prohibidas = claves(res.body).filter((ruta) => {
    const clave = ruta
      .split('.')
      .pop()!
      .replace(/\[\d+\]$/, '');
    return CLAVE_SENSIBLE.test(clave) && !permitidas.some((p) => p.test(clave));
  });
  expect({ endpoint, prohibidas }).toEqual({ endpoint, prohibidas: [] });
  const texto = res.text;
  expect({ endpoint, hash: /\$2[aby]\$\d\d\$/.test(texto) }).toEqual({ endpoint, hash: false });
  expect({ endpoint, patron: texto.includes('0.123456') }).toEqual({ endpoint, patron: false });
  expect({ endpoint, foto: texto.includes(FOTO_PNG.slice(0, 20)) }).toEqual({
    endpoint,
    foto: false,
  });
  expect({ endpoint, contrasena: texto.includes(CONTRASENA_NUEVA) }).toEqual({
    endpoint,
    contrasena: false,
  });
  if (!permitidas.length) {
    // Ni el JWT de la sesión ni un comprobante (empiezan con el encabezado en base64url).
    expect({ endpoint, jwt: /eyJ[\w-]+\.eyJ/.test(texto) }).toEqual({ endpoint, jwt: false });
  }
}

describe('ninguna respuesta de la API expone datos sensibles (T705)', () => {
  beforeAll(async () => {
    await prepararBaseConSeguridad();
  });
  afterAll(() => prisma.$disconnect());

  it('recorre todos los listados, detalles y altas con datos de todos los módulos', async () => {
    const admin = await agenteConRol('ADMINISTRADOR');
    const medico = await agenteConRol('MEDICO');
    const enfermera = await agenteConRol('ENFERMERO');
    const visitas: [string, Awaited<ReturnType<typeof admin.agente.get>>][] = [];
    const ver = async (agente: typeof admin.agente, url: string) => {
      const res = await agente.get(url);
      visitas.push([`GET ${url}`, res]);
      return res;
    };

    // Rostro de la enfermera, cargado por el administrador.
    const registro = await admin.agente
      .put(`/api/biometria/usuarios/${enfermera.usuario.id}`)
      .send({ patron: PATRON, foto: `data:image/png;base64,${FOTO_PNG}` });
    visitas.push(['PUT /api/biometria/usuarios/:id', registro]);

    // Usuario nuevo y cambio de contraseña.
    const alta = await admin.agente.post('/api/usuarios').send({
      nombreUsuario: 'nuevo.usuario',
      contrasena: 'Inicial2026',
      dni: '30111222',
      nombre: 'Nuevo',
      apellido: 'Usuario',
      rol: 'ENFERMERO',
    });
    visitas.push(['POST /api/usuarios', alta]);
    const cambio = await admin.agente
      .patch(`/api/usuarios/${alta.body.data.id}`)
      .send({ contrasena: CONTRASENA_NUEVA });
    visitas.push(['PATCH /api/usuarios/:id', cambio]);

    // Una cuenta bloqueada deja notificaciones al administrador.
    const bloqueado = await crearUsuario('ENFERMERO');
    for (let i = 0; i < 3; i++) {
      await request(obtenerApp())
        .post('/api/auth/login')
        .send({ nombreUsuario: bloqueado.nombreUsuario, contrasena: 'Incorrecta1' });
    }

    // Paciente internado, prescripción, administración con rostro y estudio.
    const { paciente } = await internarPaciente(medico.usuario.id);
    const insumo = await crearInsumo({ nombre: 'Paracetamol', unidadMedida: 'mg' });
    const prescripcion = await medico.agente
      .post(`/api/pacientes/${paciente.id}/prescripciones`)
      .send({
        insumoId: insumo.id,
        dosis: 500,
        unidadDosis: 'mg',
        frecuenciaHoras: 8,
        via: 'ORAL',
        fechaInicio: new Date(Date.now() - 60_000).toISOString(),
      });
    visitas.push(['POST /api/pacientes/:id/prescripciones', prescripcion]);
    const validacion = await enfermera.agente
      .post('/api/biometria/validar')
      .send({ patron: PATRON, operacion: 'Administración de medicamento' });
    // El único lugar donde sale un comprobante: la respuesta de /validar.
    expectSinDatosSensibles('POST /api/biometria/validar', validacion, [/^validacionToken$/]);
    const suministro = await enfermera.agente.post('/api/suministros/medicamentos').send({
      pacienteId: paciente.id,
      prescripcionId: prescripcion.body.data.id,
      validacionToken: validacion.body.data.validacionToken,
    });
    visitas.push(['POST /api/suministros/medicamentos', suministro]);
    const tipo = await crearTipoEstudio();
    const estudio = await medico.agente
      .post(`/api/pacientes/${paciente.id}/estudios`)
      .send({ tipoEstudioId: tipo.id, fechaHora: new Date(Date.now() + 3_600_000).toISOString() });
    visitas.push(['POST /api/pacientes/:id/estudios', estudio]);
    await prisma.recordatorio.create({
      data: {
        tipo: 'MEDICAMENTO',
        pacienteId: paciente.id,
        prescripcionId: prescripcion.body.data.id,
        fechaHoraObjetivo: new Date(Date.now() + 10 * 60_000),
        prioridad: 'MEDIA',
      },
    });

    const a = admin.agente;
    for (const url of [
      '/api/auth/sesion',
      '/api/usuarios',
      `/api/usuarios/${enfermera.usuario.id}`,
      `/api/usuarios/${alta.body.data.id}`,
      '/api/roles',
      '/api/permisos',
      '/api/notificaciones',
      '/api/camas',
      '/api/salas',
      '/api/pacientes',
      `/api/pacientes/${paciente.id}`,
      `/api/pacientes/${paciente.id}/historial`,
      '/api/insumos',
      `/api/pacientes/${paciente.id}/prescripciones`,
      `/api/prescripciones/${prescripcion.body.data.id}`,
      '/api/biometria/usuarios',
      `/api/biometria/usuarios/${enfermera.usuario.id}`,
      '/api/suministros',
      '/api/suministros/responsables',
      `/api/suministros/${suministro.body.data.id}`,
      '/api/recordatorios',
      '/api/tipos-estudio',
      `/api/pacientes/${paciente.id}/estudios`,
      `/api/estudios/${estudio.body.data.id}`,
      '/api/reportes/suministros',
      '/api/reportes/estadisticas',
      '/api/auditoria?tamano=100',
      '/api/auditoria/opciones',
    ]) {
      await ver(a, url);
    }
    await ver(enfermera.agente, '/api/auth/sesion');
    await ver(enfermera.agente, '/api/recordatorios');

    expect(visitas.length).toBeGreaterThan(30);
    for (const [endpoint, res] of visitas) expectSinDatosSensibles(endpoint, res);
    // La auditoría tiene entradas de todo lo anterior y aun así no muestra nada sensible.
    const auditoria = visitas.find(([e]) => e.startsWith('GET /api/auditoria?'))![1];
    expect(auditoria.body.data.length).toBeGreaterThan(10);
  }, 60_000);

  it('la foto de referencia sale solo por su endpoint, con biometria.gestionar', async () => {
    const admin = await agenteConRol('ADMINISTRADOR');
    const enfermera = await crearUsuario('ENFERMERO');
    await admin.agente
      .put(`/api/biometria/usuarios/${enfermera.id}`)
      .send({ patron: PATRON, foto: `data:image/png;base64,${FOTO_PNG}` });
    const url = `/api/biometria/usuarios/${enfermera.id}/foto`;

    const conPermiso = await admin.agente.get(url);
    expect(conPermiso.status).toBe(200);
    expect(conPermiso.headers['content-type']).toBe('image/png');
    expect(conPermiso.headers['cache-control']).toBe('no-store');
    expect(conPermiso.headers['x-content-type-options']).toBe('nosniff');

    for (const rol of ['MEDICO', 'ENFERMERO'] as const) {
      const { agente } = await agenteConRol(rol);
      expect((await agente.get(url)).status).toBe(403);
    }
    // Ni siquiera la persona dueña del rostro la ve.
    expect((await (await agenteDe(enfermera)).get(url)).status).toBe(403);
    expect((await request(obtenerApp()).get(url)).status).toBe(401);
  });
});
