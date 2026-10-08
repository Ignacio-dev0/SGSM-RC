import { randomBytes } from 'node:crypto';
import { config } from '../../config';
import { prisma } from '../../db';
import {
  agenteConRol,
  agenteDe,
  crearUsuario,
  prepararBaseConSeguridad,
} from '../../../tests/soporte/sesion';
import {
  cifrarDatoBiometrico,
  cifrarPendientes,
  descifrarFoto,
  descifrarPatron,
  patronABytes,
} from './cifrado-biometrico';

const PATRON = Array.from({ length: 128 }, (_, i) => 0.05 + i / 10_000);
// PNG de 1 × 1 píxel.
const FOTO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const FOTO = `data:image/png;base64,${FOTO_PNG.toString('base64')}`;

const comoBuffer = (b: Uint8Array) => Buffer.from(b);
const CLAVE_ACTUAL = config.biometria.llavero.actual;

async function filaDe(usuarioId: number) {
  const [fila] = await prisma.$queryRaw<{ patron_cifrado: Uint8Array; foto_cifrada: Uint8Array }[]>`
    SELECT patron_cifrado, foto_cifrada FROM datos_biometricos WHERE usuario_id = ${usuarioId}`;
  return { patron: comoBuffer(fila!.patron_cifrado), foto: comoBuffer(fila!.foto_cifrada) };
}

/** Lo que deja la migración biometria_cifrada en un registro viejo: formato 0, en claro. */
async function insertarComoLoDejaLaMigracion(usuarioId: number) {
  // Misma expresión que la migración: 128 double big-endian (float8send) detrás de un byte 0.
  await prisma.$executeRaw`
    INSERT INTO datos_biometricos
      (usuario_id, patron_cifrado, foto_cifrada, foto_tipo, registrado_por_id, actualizado_en)
    SELECT ${usuarioId},
      '\\x00'::bytea || (SELECT string_agg(float8send(t.v), ''::bytea ORDER BY t.i)
                         FROM unnest(${PATRON}::float8[]) WITH ORDINALITY AS t(v, i)),
      '\\x00'::bytea || ${FOTO_PNG},
      'image/png', ${usuarioId}, '2026-10-01T12:00:00Z'`;
}

describe('patrón facial y foto cifrados en reposo (T705 · RNF06)', () => {
  beforeEach(() => prepararBaseConSeguridad());
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  async function registrarPorLaApi() {
    const { agente: admin } = await agenteConRol('ADMINISTRADOR');
    const enfermero = await crearUsuario('ENFERMERO');
    const res = await admin
      .put(`/api/biometria/usuarios/${enfermero.id}`)
      .send({ patron: PATRON, foto: FOTO });
    expect(res.status).toBe(200);
    return { admin, enfermero };
  }

  it('en la base solo quedan blobs cifrados, que no contienen el patrón ni la foto', async () => {
    const { enfermero } = await registrarPorLaApi();

    const columnas = (
      await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'datos_biometricos'`
    ).map((c) => c.column_name);
    expect(columnas).toEqual(expect.arrayContaining(['patron_cifrado', 'foto_cifrada']));
    expect(columnas).not.toEqual(expect.arrayContaining(['patron']));
    expect(columnas).not.toEqual(expect.arrayContaining(['foto_referencia']));

    const fila = await filaDe(enfermero.id);
    expect(fila.patron[0]).toBe(1);
    expect(fila.patron.includes(patronABytes(PATRON).subarray(0, 16))).toBe(false);
    for (const valor of PATRON) {
      const doble = Buffer.alloc(8);
      doble.writeDoubleBE(valor);
      expect(fila.patron.includes(doble)).toBe(false);
      doble.writeDoubleLE(valor);
      expect(fila.patron.includes(doble)).toBe(false);
    }
    expect(fila.patron.toString('latin1')).not.toContain('0.05');
    // Ni la firma del PNG ni sus datos.
    expect(fila.foto.includes(FOTO_PNG.subarray(0, 8))).toBe(false);
    expect(fila.foto.includes(FOTO_PNG.subarray(16, 40))).toBe(false);
  });

  it('con la clave del servidor se recupera el dato; con otra clave no se puede', async () => {
    const { enfermero } = await registrarPorLaApi();
    const dato = await prisma.datoBiometrico.findUniqueOrThrow({
      where: { usuarioId: enfermero.id },
    });

    expect(descifrarPatron(enfermero.id, dato.patronCifrado)).toEqual(PATRON);
    expect(descifrarFoto(enfermero.id, dato.fotoCifrada)).toEqual(FOTO_PNG);
    const otra = { actual: randomBytes(32) };
    expect(() => descifrarPatron(enfermero.id, dato.patronCifrado, otra)).toThrow();
    expect(() => descifrarFoto(enfermero.id, dato.fotoCifrada, otra)).toThrow();
  });

  it('registrar, validar, ver la foto y eliminar funcionan igual que antes', async () => {
    const { admin, enfermero } = await registrarPorLaApi();
    const agente = await agenteDe(enfermero);

    const validacion = await agente
      .post('/api/biometria/validar')
      .send({ patron: PATRON.map((v) => v + 0.001) });
    expect(validacion.body.data).toMatchObject({ valido: true });
    const foto = await admin.get(`/api/biometria/usuarios/${enfermero.id}/foto`);
    expect(foto.body).toEqual(FOTO_PNG);

    expect((await admin.delete(`/api/biometria/usuarios/${enfermero.id}`)).status).toBe(200);
    expect(await prisma.datoBiometrico.count()).toBe(0);
  });

  it('un blob alterado en la base no valida ni muestra la foto, y el registro no tiene datos', async () => {
    const { admin, enfermero } = await registrarPorLaApi();
    await prisma.$executeRaw`
      UPDATE datos_biometricos SET
        patron_cifrado = set_byte(patron_cifrado, 40, get_byte(patron_cifrado, 40) # 1),
        foto_cifrada = set_byte(foto_cifrada, 40, get_byte(foto_cifrada, 40) # 1)
      WHERE usuario_id = ${enfermero.id}`;
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const validacion = await (
      await agenteDe(enfermero)
    )
      .post('/api/biometria/validar')
      .send({ patron: PATRON });
    const foto = await admin.get(`/api/biometria/usuarios/${enfermero.id}/foto`);

    expect(validacion.status).toBe(500);
    expect(validacion.body.error).toEqual({
      codigo: 'BIOMETRIA_ILEGIBLE',
      mensaje: expect.stringMatching(/registre de nuevo/),
    });
    expect(foto.status).toBe(500);
    expect(foto.body.error.codigo).toBe('BIOMETRIA_ILEGIBLE');
    const registro = error.mock.calls.flat().map(String).join('\n');
    expect(registro).toMatch(/alterado/);
    expect(registro).not.toMatch(/0\.05|iVBOR/);
  });

  it('el rostro cifrado de otra persona copiado en la base no sirve para validar', async () => {
    const { enfermero } = await registrarPorLaApi();
    const intruso = await crearUsuario('ENFERMERO');
    await prisma.datoBiometrico.create({
      data: {
        usuarioId: intruso.id,
        ...cifrarDatoBiometrico(
          intruso.id,
          PATRON.map((v) => v + 1),
          FOTO_PNG,
        ),
        fotoTipo: 'image/png',
        registradoPorId: intruso.id,
      },
    });
    await prisma.$executeRaw`
      UPDATE datos_biometricos d SET patron_cifrado = o.patron_cifrado
      FROM datos_biometricos o WHERE d.usuario_id = ${intruso.id} AND o.usuario_id = ${enfermero.id}`;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await (
      await agenteDe(intruso)
    )
      .post('/api/biometria/validar')
      .send({ patron: PATRON });

    expect(res.body.error?.codigo).toBe('BIOMETRIA_ILEGIBLE');
  });

  describe('cifrado de los datos existentes y rotación (npm run biometria:cifrar)', () => {
    it('cifra lo que la migración dejó en claro, sin cambiar la fecha de actualización', async () => {
      const u = await crearUsuario('ENFERMERO');
      await insertarComoLoDejaLaMigracion(u.id);

      expect(await cifrarPendientes()).toEqual({ revisados: 1, cifrados: 1, ilegibles: [] });

      const dato = await prisma.datoBiometrico.findUniqueOrThrow({ where: { usuarioId: u.id } });
      expect(dato.patronCifrado[0]).toBe(1);
      // El parámetro de la consulta (no la migración) puede perder el último dígito del double.
      const patron = descifrarPatron(u.id, dato.patronCifrado);
      expect(Math.max(...patron.map((v, i) => Math.abs(v - PATRON[i]!)))).toBeLessThan(1e-12);
      expect(descifrarFoto(u.id, dato.fotoCifrada)).toEqual(FOTO_PNG);
      expect(dato.actualizadoEn.toISOString()).toBe('2026-10-01T12:00:00.000Z');
      const validacion = await (
        await agenteDe(u)
      )
        .post('/api/biometria/validar')
        .send({ patron: PATRON });
      expect(validacion.body.data.valido).toBe(true);
    });

    it('vuelve a cifrar con la clave actual lo cifrado con la anterior, una sola vez', async () => {
      const anterior = randomBytes(32);
      const u = await crearUsuario('ENFERMERO');
      await prisma.datoBiometrico.create({
        data: {
          usuarioId: u.id,
          ...cifrarDatoBiometrico(u.id, PATRON, FOTO_PNG, { actual: anterior }),
          fotoTipo: 'image/png',
          registradoPorId: u.id,
        },
      });
      const llavero = { actual: CLAVE_ACTUAL, anteriores: [anterior] };

      expect(await cifrarPendientes(prisma, llavero)).toEqual({
        revisados: 1,
        cifrados: 1,
        ilegibles: [],
      });
      expect(await cifrarPendientes(prisma, llavero)).toEqual({
        revisados: 0,
        cifrados: 0,
        ilegibles: [],
      });
      // Ya no hace falta la clave anterior.
      const dato = await prisma.datoBiometrico.findUniqueOrThrow({ where: { usuarioId: u.id } });
      expect(descifrarPatron(u.id, dato.patronCifrado, { actual: CLAVE_ACTUAL })).toEqual(PATRON);
    });

    it('informa los registros que no puede descifrar y no los toca', async () => {
      const u = await crearUsuario('ENFERMERO');
      const ajeno = cifrarDatoBiometrico(u.id, PATRON, FOTO_PNG, { actual: randomBytes(32) });
      await prisma.datoBiometrico.create({
        data: { usuarioId: u.id, ...ajeno, fotoTipo: 'image/png', registradoPorId: u.id },
      });

      expect(await cifrarPendientes()).toEqual({ revisados: 1, cifrados: 0, ilegibles: [u.id] });
      expect((await filaDe(u.id)).patron).toEqual(ajeno.patronCifrado);
    });
  });
});
