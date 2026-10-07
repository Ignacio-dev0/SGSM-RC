import request from 'supertest';
import { prisma } from '../../db';
import { reloj } from '../../comun/reloj';
import { agenteConRol, obtenerApp, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { consumirValidacion } from './validacion.servicio';

const patron = (valor: number) => Array.from({ length: 128 }, () => valor);
const ROSTRO = patron(0.1);
const PARECIDO = patron(0.12); // distancia ≈ 0,23: el mismo rostro en otra captura
const OTRO = patron(0.3); // distancia ≈ 2,26: otra persona

async function enfermeroConRostro() {
  const sesion = await agenteConRol('ENFERMERO');
  await prisma.datoBiometrico.create({
    data: {
      usuarioId: sesion.usuario.id,
      patron: ROSTRO,
      fotoReferencia: Buffer.from('foto'),
      fotoTipo: 'image/jpeg',
      registradoPorId: sesion.usuario.id,
    },
  });
  return sesion;
}

describe('validación facial (CU10 · T404 · T407)', () => {
  beforeEach(() => prepararBaseConSeguridad());
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  const validar = (agente: Awaited<ReturnType<typeof enfermeroConRostro>>['agente'], p: number[]) =>
    agente
      .post('/api/biometria/validar')
      .send({ patron: p, operacion: 'Administración de medicamento' });

  it('valida el rostro del usuario de la sesión y entrega un comprobante de validación', async () => {
    const { agente } = await enfermeroConRostro();

    const res = await validar(agente, PARECIDO);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ valido: true, validacionToken: expect.any(String) });
    expect(res.body.data.similitud).toBeGreaterThan(0.5);
  });

  it('un rostro que no coincide se rechaza e informa los intentos que quedan', async () => {
    const { agente, usuario } = await enfermeroConRostro();

    const res = await validar(agente, OTRO);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ valido: false, intentosRestantes: 2, cancelada: false });
    expect(
      await prisma.auditoria.count({
        where: { accion: 'VALIDACION_FACIAL_FALLIDA', usuarioId: usuario.id },
      }),
    ).toBe(1);
  });

  it('T407: tres fallos cancelan la operación, quedan en la auditoría y avisan al administrador', async () => {
    const { usuario: admin } = await agenteConRol('ADMINISTRADOR');
    const { agente, usuario } = await enfermeroConRostro();

    await validar(agente, OTRO);
    await validar(agente, OTRO);
    const tercero = await validar(agente, OTRO);

    expect(tercero.body.data).toEqual({ valido: false, intentosRestantes: 0, cancelada: true });
    expect(
      await prisma.auditoria.count({
        where: { accion: 'OPERACION_CANCELADA', usuarioId: usuario.id },
      }),
    ).toBe(1);
    const aviso = await prisma.notificacion.findFirstOrThrow({
      where: { destinatarioId: admin.id },
    });
    expect(aviso.tipo).toBe('VALIDACION_FACIAL_FALLIDA');
    expect(aviso.mensaje).toMatch(usuario.nombreUsuario);
    expect(aviso.mensaje).toMatch(/Administración de medicamento/);

    // Tras la cancelación el contador vuelve a empezar.
    expect((await validar(agente, OTRO)).body.data.intentosRestantes).toBe(2);
  });

  it('una validación correcta reinicia el contador de fallos', async () => {
    const { agente } = await enfermeroConRostro();
    await validar(agente, OTRO);
    await validar(agente, OTRO);
    await validar(agente, PARECIDO);
    expect((await validar(agente, OTRO)).body.data.intentosRestantes).toBe(2);
  });

  it('sin rostro registrado no se puede validar', async () => {
    const { agente } = await agenteConRol('ENFERMERO');
    const res = await validar(agente, ROSTRO);
    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('SIN_BIOMETRIA');
  });

  it('rechaza un patrón mal formado y exige sesión', async () => {
    const { agente } = await enfermeroConRostro();
    expect((await validar(agente, [1, 2, 3])).status).toBe(400);
    expect(
      (await request(obtenerApp()).post('/api/biometria/validar').send({ patron: ROSTRO })).status,
    ).toBe(401);
  });

  describe('comprobante de validación', () => {
    it('sirve una sola vez y solo para el usuario validado', async () => {
      const { agente, usuario } = await enfermeroConRostro();
      const { body } = await validar(agente, PARECIDO);
      const token = body.data.validacionToken as string;

      expect(() => consumirValidacion(token, usuario.id + 1)).toThrow(/validación facial/);
      expect(() => consumirValidacion(token, usuario.id)).not.toThrow();
      expect(() => consumirValidacion(token, usuario.id)).toThrow(/validación facial/);
    });

    it('vence a los pocos minutos', async () => {
      const { agente, usuario } = await enfermeroConRostro();
      const { body } = await validar(agente, PARECIDO);

      jest.spyOn(reloj, 'ahora').mockReturnValue(new Date(Date.now() + 10 * 60_000));

      expect(() => consumirValidacion(body.data.validacionToken, usuario.id)).toThrow(
        /vencida|validación facial/,
      );
    });

    it('sin comprobante falla con un error entendible', () => {
      expect(() => consumirValidacion(undefined, 1)).toThrow(/validación facial/);
    });
  });
});
