import http from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { prisma } from '../../db';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';
import {
  crearPrescripcionBasica,
  crearRol,
  internarPaciente,
} from '../../../tests/soporte/fabricas';
import {
  agenteDe,
  crearUsuario,
  obtenerApp,
  prepararBaseConSeguridad,
} from '../../../tests/soporte/sesion';
import { emitirToken } from '../auth/tokens';
import { avisarCambioRecordatorios } from './bus';
import { iniciarTiempoReal, type TiempoReal } from './tiempo-real';

const AHORA = new Date('2026-10-07T12:00:00Z');
const MINUTO = 60_000;

type Mensaje = Record<string, unknown>;

describe('tiempo real por WebSocket (T505 · D10 · D14 · D16 · D17)', () => {
  let servidor: http.Server;
  let tiempoReal: TiempoReal;
  let puerto: number;
  let ahora: jest.SpyInstance<Date, []>;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    ahora = jest.spyOn(reloj, 'ahora').mockReturnValue(AHORA);
    servidor = http.createServer(obtenerApp());
    // El latido se dispara a mano en las pruebas.
    tiempoReal = iniciarTiempoReal(servidor, { latidoMs: 60 * MINUTO });
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
    puerto = (servidor.address() as AddressInfo).port;
  });
  afterEach(async () => {
    await tiempoReal.cerrar();
    servidor.closeAllConnections();
    await new Promise((ok) => servidor.close(ok));
    jest.restoreAllMocks();
  });
  afterAll(() => prisma.$disconnect());

  const cookieDe = (usuarioId: number) =>
    `sgsm_sesion=${emitirToken({ usuarioId, inicio: reloj.ahora() })}`;

  function conectar(
    cookie?: string,
    {
      origen,
      ruta = '/api/tiempo-real',
      autoPong = true,
    }: { origen?: string; ruta?: string; autoPong?: boolean } = {},
  ) {
    const ws = new WebSocket(`ws://127.0.0.1:${puerto}${ruta}`, {
      headers: cookie ? { Cookie: cookie } : {},
      ...(origen ? { origin: origen } : {}),
      autoPong,
    });
    const recibidos: Mensaje[] = [];
    const esperando: ((m: Mensaje) => void)[] = [];
    ws.on('message', (datos) => {
      const m = JSON.parse(String(datos)) as Mensaje;
      const quien = esperando.shift();
      if (quien) quien(m);
      else recibidos.push(m);
    });
    const error = new Promise<string>((ok) => ws.on('error', (e) => ok(e.message)));
    const cierre = new Promise<{ codigo: number; motivo: string }>((ok) =>
      ws.on('close', (codigo, motivo) => ok({ codigo, motivo: String(motivo) })),
    );
    const siguiente = () =>
      recibidos.length > 0
        ? Promise.resolve(recibidos.shift()!)
        : new Promise<Mensaje>((ok) => esperando.push(ok));
    return { ws, siguiente, cierre, error, recibidos };
  }

  /** Conexión abierta y ya saludada por el servidor. */
  async function conectado(usuarioId: number) {
    const c = conectar(cookieDe(usuarioId));
    expect(await c.siguiente()).toEqual({ tipo: 'conectado', momento: AHORA.toISOString() });
    return c;
  }

  describe('conexión', () => {
    it('con sesión y permiso se conecta y recibe "conectado" con la hora del servidor', async () => {
      const u = await crearUsuario('ENFERMERO');
      await conectado(u.id);
      expect(tiempoReal.conexiones()).toBe(1);
    });

    it.each([
      ['sin cookie', () => undefined],
      ['con un token inválido', () => 'sgsm_sesion=basura'],
    ])('%s abre y cierra con 4001', async (_caso, cookie) => {
      const c = conectar(cookie());
      expect((await c.cierre).codigo).toBe(4001);
      expect(tiempoReal.conexiones()).toBe(0);
    });

    it('un usuario dado de baja no se conecta (4001)', async () => {
      const u = await crearUsuario('ENFERMERO', { activo: false });
      expect((await conectar(cookieDe(u.id)).cierre).codigo).toBe(4001);
    });

    it('sin recordatorios.ver abre y cierra con 4003', async () => {
      const rol = await crearRol('SIN_PERMISOS');
      const u = await crearUsuario('ENFERMERO');
      await prisma.usuario.update({ where: { id: u.id }, data: { rolId: rol.id } });

      const c = conectar(cookieDe(u.id));

      expect(await c.cierre).toMatchObject({ codigo: 4003 });
      expect(c.recibidos).toEqual([]);
    });

    it('rechaza otro origen con 403 sin abrir la conexión; acepta el propio y los configurados', async () => {
      const u = await crearUsuario('ENFERMERO');
      const ajeno = conectar(cookieDe(u.id), { origen: 'http://otro-sitio.test' });
      expect(await ajeno.error).toMatch(/403/);

      const propio = conectar(cookieDe(u.id), { origen: `http://127.0.0.1:${puerto}` });
      expect(await propio.siguiente()).toMatchObject({ tipo: 'conectado' });

      jest.replaceProperty(config.tiempoReal, 'origenes', ['http://localhost:8080']);
      const configurado = conectar(cookieDe(u.id), { origen: 'http://localhost:8080' });
      expect(await configurado.siguiente()).toMatchObject({ tipo: 'conectado' });
    });

    it('no atiende otras rutas', async () => {
      const u = await crearUsuario('ENFERMERO');
      expect(await conectar(cookieDe(u.id), { ruta: '/api/otra-cosa' }).error).toMatch(/404/);
    });
  });

  describe('avisos', () => {
    it('reenvía cada aviso del bus a los usuarios de los tres roles', async () => {
      const conexiones = [];
      for (const rol of ['ADMINISTRADOR', 'MEDICO', 'ENFERMERO'] as const) {
        conexiones.push(await conectado((await crearUsuario(rol)).id));
      }

      avisarCambioRecordatorios({ nuevos: 2, vencidos: 1 });

      for (const c of conexiones) {
        expect(await c.siguiente()).toEqual({
          tipo: 'recordatorios',
          nuevos: 2,
          vencidos: 1,
          momento: AHORA.toISOString(),
        });
      }
    });

    it('"No se administró" en otra tablet llega como aviso sin datos del paciente', async () => {
      const enfermera = await crearUsuario('ENFERMERO');
      const { paciente } = await internarPaciente(enfermera.id);
      const p = await crearPrescripcionBasica(paciente.id, enfermera.id);
      const r = await prisma.recordatorio.create({
        data: {
          tipo: 'MEDICAMENTO',
          pacienteId: paciente.id,
          prescripcionId: p.id,
          fechaHoraObjetivo: AHORA,
          prioridad: 'ALTA',
        },
      });
      const c = await conectado(enfermera.id);
      const otraTablet = await agenteDe(enfermera);

      await otraTablet
        .post(`/api/recordatorios/${r.id}/no-administrar`)
        .send({ motivo: 'Paciente en ayunas' });

      expect(await c.siguiente()).toEqual({
        tipo: 'recordatorios',
        nuevos: 0,
        vencidos: 0,
        momento: AHORA.toISOString(),
      });
    });

    it('ignora lo que mande el cliente', async () => {
      const c = await conectado((await crearUsuario('ENFERMERO')).id);
      c.ws.send('hola');
      avisarCambioRecordatorios();
      expect(await c.siguiente()).toMatchObject({ tipo: 'recordatorios' });
      expect(c.ws.readyState).toBe(WebSocket.OPEN);
    });
  });

  describe('latido', () => {
    it('cierra con 4001 cuando vence la sesión de la conexión: no se renueva sola (D14)', async () => {
      const c = await conectado((await crearUsuario('ENFERMERO')).id);

      ahora.mockReturnValue(
        new Date(AHORA.getTime() + (config.sesion.inactividadMinutos - 1) * MINUTO),
      );
      await tiempoReal.latido();
      expect(c.ws.readyState).toBe(WebSocket.OPEN);

      ahora.mockReturnValue(
        new Date(AHORA.getTime() + (config.sesion.inactividadMinutos + 1) * MINUTO),
      );
      await tiempoReal.latido();
      expect((await c.cierre).codigo).toBe(4001);
    });

    it('cierra con 4003 si el usuario perdió el permiso y con 4001 si se dio de baja', async () => {
      const sinPermiso = await crearUsuario('ENFERMERO');
      const deBaja = await crearUsuario('ENFERMERO');
      const c1 = await conectado(sinPermiso.id);
      const c2 = await conectado(deBaja.id);
      const rol = await crearRol('SIN_PERMISOS');
      await prisma.usuario.update({ where: { id: sinPermiso.id }, data: { rolId: rol.id } });
      await prisma.usuario.update({ where: { id: deBaja.id }, data: { activo: false } });

      await tiempoReal.latido();

      expect((await c1.cierre).codigo).toBe(4003);
      expect((await c2.cierre).codigo).toBe(4001);
      expect(tiempoReal.conexiones()).toBe(0);
    });

    it('termina la conexión que no contesta el ping y mantiene la que contesta', async () => {
      const u = await crearUsuario('ENFERMERO');
      const viva = await conectado(u.id);
      const muda = conectar(cookieDe(u.id), { autoPong: false });
      await muda.siguiente();

      const pingRecibido = new Promise((ok) => viva.ws.once('ping', ok));
      await tiempoReal.latido();
      await pingRecibido;
      await new Promise((ok) => setTimeout(ok, 100));
      await tiempoReal.latido();

      expect((await muda.cierre).codigo).toBe(1006);
      expect(viva.ws.readyState).toBe(WebSocket.OPEN);
      expect(tiempoReal.conexiones()).toBe(1);
    });
  });

  it('al apagar el servidor, las conexiones cierran con 1001', async () => {
    const c = await conectado((await crearUsuario('ENFERMERO')).id);
    await tiempoReal.cerrar();
    expect((await c.cierre).codigo).toBe(1001);
  });
});
