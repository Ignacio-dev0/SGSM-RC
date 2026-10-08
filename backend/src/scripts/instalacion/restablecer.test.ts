import { prisma } from '../../db';
import { crearUsuario, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { verificarContrasena } from '../../modulos/auth/contrasenas';
import { ejecutarInstalador } from './instalador';
import type { Preguntador } from './terminal';

const NUEVA = 'Recuperada2026';

/** Respuestas armadas para la terminal; anota cada pregunta (las ocultas, marcadas). */
function terminalFalsa(respuestas: string[]) {
  const preguntas: string[] = [];
  const responder = async (texto: string) => {
    preguntas.push(texto);
    const r = respuestas.shift();
    if (r === undefined) throw new Error('Instalación cancelada');
    return r;
  };
  const terminal: Preguntador & { preguntas: string[] } = {
    preguntas,
    preguntar: responder,
    preguntarOculto: (texto) => responder(`[oculta] ${texto}`),
    cerrar: () => {},
  };
  return terminal;
}

/**
 * --restablecer-clave (D118 · docs/despliegue.md, "Si el administrador olvidó la contraseña"):
 * nueva contraseña para un Administrador activo, con las reglas del alta, desbloqueando la cuenta
 * y auditado sin actor.
 */
describe('instalador: restablecer la contraseña de un administrador (D118)', () => {
  beforeEach(() => prepararBaseConSeguridad());
  afterAll(() => prisma.$disconnect());

  async function instalar(
    args: string[],
    { env = {}, terminal = null }: { env?: NodeJS.ProcessEnv; terminal?: Preguntador | null } = {},
  ) {
    const salida: string[] = [];
    const errores: string[] = [];
    const codigo = await ejecutarInstalador(args, {
      env,
      preguntador: terminal,
      consola: { info: (l) => salida.push(l), error: (l) => errores.push(l) },
    });
    return { codigo, salida, errores, todo: [...salida, ...errores].join('\n') };
  }

  const bloqueado = () =>
    crearUsuario('ADMINISTRADOR', { nombreUsuario: 'lmendez' }).then((u) =>
      prisma.usuario.update({
        where: { id: u.id },
        data: { bloqueadoHasta: new Date(Date.now() + 15 * 60_000), intentosFallidos: 2 },
      }),
    );

  it('con INSTALAR_ADMIN_CLAVE: la guarda, desbloquea la cuenta y lo audita sin actor', async () => {
    const u = await bloqueado();

    const r = await instalar(['--restablecer-clave', ' LMendez '], {
      env: { INSTALAR_ADMIN_CLAVE: NUEVA },
    });

    expect(r.codigo).toBe(0);
    expect(r.salida).toEqual([
      `Contraseña restablecida para "lmendez" (${u.apellido}, ${u.nombre}). La cuenta estaba bloqueada y quedó desbloqueada.`,
    ]);
    expect(r.todo).not.toContain(NUEVA);
    const db = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
    expect(await verificarContrasena(NUEVA, db.contrasenaHash)).toBe(true);
    expect(db).toMatchObject({ bloqueadoHasta: null, intentosFallidos: 0 });
    const a = await prisma.auditoria.findFirstOrThrow({ where: { entidad: 'Usuario' } });
    expect(a).toMatchObject({
      usuarioId: null,
      accion: 'MODIFICAR',
      entidadId: String(u.id),
      detalle: 'Instalador: restablecer contraseña',
      valorAnterior: { bloqueadoHasta: u.bloqueadoHasta!.toISOString() },
      valorNuevo: { bloqueadoHasta: null },
    });
    expect(JSON.stringify(a)).not.toContain(NUEVA);
  });

  it('con terminal la pregunta sin eco y dos veces; si no estaba bloqueada no lo dice', async () => {
    const u = await crearUsuario('ADMINISTRADOR', { nombreUsuario: 'lmendez' });
    const terminal = terminalFalsa(['corta', NUEVA, 'Otra2026', NUEVA, NUEVA]);

    const r = await instalar(['--restablecer-clave', 'lmendez'], { terminal });

    expect(r.codigo).toBe(0);
    expect(terminal.preguntas.every((p) => p.startsWith('[oculta]'))).toBe(true);
    expect(r.errores).toEqual([
      '  La contraseña debe tener al menos 8 caracteres',
      '  Las contraseñas no coinciden',
    ]);
    expect(r.salida).toEqual([
      `Contraseña restablecida para "lmendez" (${u.apellido}, ${u.nombre}).`,
    ]);
    const a = await prisma.auditoria.findFirstOrThrow({ where: { entidad: 'Usuario' } });
    expect(a).toMatchObject({ valorAnterior: null, valorNuevo: null });
  });

  it('con terminal la pregunta aunque INSTALAR_ADMIN_CLAVE haya quedado definida, y lo avisa', async () => {
    const u = await crearUsuario('ADMINISTRADOR', { nombreUsuario: 'lmendez' });
    const terminal = terminalFalsa([NUEVA, NUEVA]);

    const r = await instalar(['--restablecer-clave', 'lmendez'], {
      env: { INSTALAR_ADMIN_CLAVE: 'Inicial2026' },
      terminal,
    });

    expect(r.codigo).toBe(0);
    expect(terminal.preguntas).toHaveLength(2);
    expect(r.salida[0]).toBe(
      'Se ignora INSTALAR_ADMIN_CLAVE: con una persona frente a la terminal, la contraseña nueva se pregunta.',
    );
    expect(r.todo).not.toContain('Inicial2026');
    const db = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
    expect(await verificarContrasena(NUEVA, db.contrasenaHash)).toBe(true);
    expect(await verificarContrasena('Inicial2026', db.contrasenaHash)).toBe(false);
  });

  it('una contraseña que no cumple las reglas del alta: no cambia nada ni la muestra', async () => {
    const u = await bloqueado();
    const r = await instalar(['--restablecer-clave', 'lmendez'], {
      env: { INSTALAR_ADMIN_CLAVE: 'sinnumeros' },
    });
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain(
      '  INSTALAR_ADMIN_CLAVE: La contraseña debe tener al menos un número',
    );
    expect(r.todo).not.toContain('sinnumeros');
    const db = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
    expect(db.contrasenaHash).toBe(u.contrasenaHash);
    expect(db.bloqueadoHasta).not.toBeNull();
    expect(await prisma.auditoria.count()).toBe(0);
  });

  it('sin variable y sin terminal dice qué falta', async () => {
    await crearUsuario('ADMINISTRADOR', { nombreUsuario: 'lmendez' });
    const r = await instalar(['--restablecer-clave', 'lmendez']);
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain(
      '  Falta INSTALAR_ADMIN_CLAVE: indíquela o corra el instalador en una terminal interactiva',
    );
  });

  it.each([
    ['no existe', 'nadie', 'No hay ningún usuario "nadie"'],
    [
      'está dado de baja',
      'baja',
      'El usuario "baja" está dado de baja: reactívelo desde Usuarios con otro administrador, o cree uno nuevo con el instalador si no queda ninguno activo',
    ],
    [
      'no es Administrador',
      'enfermero',
      'El usuario "enfermero" no es Administrador: su contraseña la cambia un administrador desde Usuarios',
    ],
  ])('si el usuario %s, no cambia nada', async (_caso, usuario, mensaje) => {
    await crearUsuario('ADMINISTRADOR', { nombreUsuario: 'baja', activo: false });
    await crearUsuario('ENFERMERO', { nombreUsuario: 'enfermero' });

    const r = await instalar(['--restablecer-clave', usuario], {
      env: { INSTALAR_ADMIN_CLAVE: NUEVA },
    });

    expect(r.codigo).toBe(1);
    expect(r.errores).toEqual([
      'No se cargó nada. Corrija lo siguiente y vuelva a correr el instalador:',
      `  ${mensaje}`,
    ]);
    expect(await prisma.auditoria.count()).toBe(0);
  });

  it.each([
    [['--restablecer-clave'], /Falta el usuario: --restablecer-clave USUARIO/],
    [['--restablecer-clave', ''], /Falta el usuario: --restablecer-clave USUARIO/],
    [['--restablecer-clave', 'lmendez', '--salas', 'salas.csv'], /--restablecer-clave va sola/],
  ])('%j es un error de uso (código 2)', async (args, mensaje) => {
    const r = await instalar(args);
    expect(r.codigo).toBe(2);
    expect(r.errores.join('\n')).toMatch(mensaje);
  });

  it('la ayuda lo explica', async () => {
    const r = await instalar(['--ayuda']);
    expect(r.salida.join('\n')).toMatch(/--restablecer-clave USUARIO/);
  });
});
