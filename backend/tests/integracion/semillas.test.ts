import { prisma } from '../../src/db';
import {
  INSUMOS,
  SALAS,
  sembrarCatalogoDeDesarrollo,
  sembrarDatosBase,
  TIPOS_ESTUDIO,
} from '../../src/semillas/catalogo-base';
import { sembrarUsuariosDePrueba, USUARIOS_DE_PRUEBA } from '../../src/semillas/usuarios-prueba';
import { PERMISOS } from '../../src/modulos/seguridad/catalogo-permisos';
import { limpiarBase } from '../soporte/base';

const permisosDelRol = async (codigo: string) =>
  (
    await prisma.rolPermiso.findMany({
      where: { rol: { codigo } },
      include: { permiso: true },
    })
  ).map((rp) => rp.permiso.codigo);

describe('datos de prueba (T103)', () => {
  beforeAll(async () => {
    await limpiarBase();
    await sembrarCatalogoDeDesarrollo(prisma);
    await sembrarUsuariosDePrueba(prisma);
  });

  afterAll(() => prisma.$disconnect());

  it('crea los tres roles del sistema', async () => {
    const roles = await prisma.rol.findMany({ orderBy: { codigo: 'asc' } });
    expect(roles.map((r) => r.codigo)).toEqual(['ADMINISTRADOR', 'ENFERMERO', 'MEDICO']);
  });

  it('el administrador tiene todos los permisos del catálogo', async () => {
    expect((await permisosDelRol('ADMINISTRADOR')).sort()).toEqual(Object.keys(PERMISOS).sort());
  });

  it('el enfermero registra suministros pero no gestiona usuarios ni prescripciones', async () => {
    const permisos = await permisosDelRol('ENFERMERO');
    expect(permisos).toContain('suministros.registrar');
    expect(permisos).not.toContain('usuarios.gestionar');
    expect(permisos).not.toContain('prescripciones.gestionar');
  });

  // E5 (S14 · S15): ven los tres roles; atiende y confirma enfermería; programa el médico.
  it.each([
    ['ADMINISTRADOR', ['recordatorios.atender', 'estudios.gestionar', 'estudios.confirmar'], []],
    ['MEDICO', ['estudios.gestionar'], ['recordatorios.atender', 'estudios.confirmar']],
    ['ENFERMERO', ['recordatorios.atender', 'estudios.confirmar'], ['estudios.gestionar']],
  ])('E5: el rol %s ve recordatorios y estudios y actúa según su tarea', async (rol, si, no) => {
    const permisos = await permisosDelRol(rol);
    expect(permisos).toEqual(expect.arrayContaining(['recordatorios.ver', 'estudios.ver', ...si]));
    for (const codigo of no) expect(permisos).not.toContain(codigo);
  });

  // E6 (S17): ven reportes el administrador y el médico; exporta y audita solo el administrador.
  it.each([
    ['ADMINISTRADOR', ['reportes.ver', 'reportes.exportar', 'auditoria.ver'], []],
    ['MEDICO', ['reportes.ver'], ['reportes.exportar', 'auditoria.ver']],
    ['ENFERMERO', [], ['reportes.ver', 'reportes.exportar', 'auditoria.ver']],
  ])('E6: permisos de reportes y auditoría del rol %s', async (rol, si, no) => {
    const permisos = await permisosDelRol(rol);
    expect(permisos).toEqual(expect.arrayContaining(si));
    for (const codigo of no) expect(permisos).not.toContain(codigo);
  });

  it('carga salas con camas, medicamentos, insumos y tipos de estudio', async () => {
    expect(await prisma.sala.count()).toBeGreaterThanOrEqual(3);
    expect(await prisma.cama.count()).toBeGreaterThanOrEqual(20);
    expect(await prisma.insumo.count({ where: { tipo: 'MEDICAMENTO' } })).toBeGreaterThanOrEqual(
      10,
    );
    expect(await prisma.insumo.count({ where: { tipo: 'INSUMO' } })).toBeGreaterThanOrEqual(8);
    expect(await prisma.tipoEstudio.count()).toBeGreaterThanOrEqual(6);
  });

  it('crea un usuario de prueba por rol con la contraseña cifrada', async () => {
    for (const u of USUARIOS_DE_PRUEBA) {
      const usuario = await prisma.usuario.findUniqueOrThrow({
        where: { nombreUsuario: u.nombreUsuario },
        include: { rol: true },
      });
      expect(usuario.rol.codigo).toBe(u.rol);
      expect(usuario.contrasenaHash).not.toBe(u.contrasena);
      expect(usuario.contrasenaHash).toMatch(/^\$2[aby]\$/);
    }
  });

  it('se puede ejecutar dos veces sin duplicar datos', async () => {
    const antes = {
      permisos: await prisma.permiso.count(),
      camas: await prisma.cama.count(),
      insumos: await prisma.insumo.count(),
      usuarios: await prisma.usuario.count(),
    };
    await sembrarCatalogoDeDesarrollo(prisma);
    await sembrarUsuariosDePrueba(prisma);
    expect({
      permisos: await prisma.permiso.count(),
      camas: await prisma.cama.count(),
      insumos: await prisma.insumo.count(),
      usuarios: await prisma.usuario.count(),
    }).toEqual(antes);
  });

  it('volver a correrla no pisa lo que se corrigió a mano', async () => {
    const paracetamol = await prisma.insumo.findFirstOrThrow({ where: { nombre: 'Paracetamol' } });
    await prisma.insumo.update({
      where: { id: paracetamol.id },
      data: { unidadMedida: 'comprimido' },
    });
    const sala = await prisma.sala.findFirstOrThrow();
    await prisma.sala.update({ where: { id: sala.id }, data: { piso: '2' } });
    const tipo = await prisma.tipoEstudio.findFirstOrThrow({ where: { nombre: 'Radiografía' } });
    await prisma.tipoEstudio.update({
      where: { id: tipo.id },
      data: { preparacionPorDefecto: 'Retirar alhajas' },
    });

    await sembrarCatalogoDeDesarrollo(prisma);

    expect(
      (await prisma.insumo.findUniqueOrThrow({ where: { id: paracetamol.id } })).unidadMedida,
    ).toBe('comprimido');
    expect((await prisma.sala.findUniqueOrThrow({ where: { id: sala.id } })).piso).toBe('2');
    expect(
      (await prisma.tipoEstudio.findUniqueOrThrow({ where: { id: tipo.id } }))
        .preparacionPorDefecto,
    ).toBe('Retirar alhajas');
  });
});

/**
 * Lo que necesita cualquier instalación (el instalador, T803) separado de lo inventado para
 * desarrollo y demostración (D102).
 */
describe('datos base y catálogo de demostración (T803 · D102)', () => {
  beforeAll(() => limpiarBase());
  afterAll(() => prisma.$disconnect());

  it('los datos base son roles, permisos y tipos de estudio: ni salas, ni insumos, ni usuarios', async () => {
    const resumen = await sembrarDatosBase(prisma);

    expect(resumen).toEqual({
      roles: 3,
      permisos: Object.keys(PERMISOS).length,
      tiposEstudio: { nuevos: TIPOS_ESTUDIO.length, existentes: 0 },
    });
    expect(await prisma.rol.count()).toBe(3);
    expect((await permisosDelRol('ADMINISTRADOR')).sort()).toEqual(Object.keys(PERMISOS).sort());
    expect(await prisma.tipoEstudio.count()).toBe(TIPOS_ESTUDIO.length);
    expect(await prisma.sala.count()).toBe(0);
    expect(await prisma.cama.count()).toBe(0);
    expect(await prisma.insumo.count()).toBe(0);
    expect(await prisma.usuario.count()).toBe(0);
  });

  it('otra vez: no duplica y cuenta los tipos de estudio que ya estaban', async () => {
    expect((await sembrarDatosBase(prisma)).tiposEstudio).toEqual({
      nuevos: 0,
      existentes: TIPOS_ESTUDIO.length,
    });
    expect(await prisma.tipoEstudio.count()).toBe(TIPOS_ESTUDIO.length);
  });

  it('la semilla de desarrollo suma las salas, camas e insumos inventados', async () => {
    await sembrarCatalogoDeDesarrollo(prisma);

    expect(await prisma.sala.count()).toBe(SALAS.length);
    expect(await prisma.cama.count()).toBe(SALAS.reduce((n, s) => n + s.camas, 0));
    expect(await prisma.insumo.count()).toBe(INSUMOS.length);
  });
});
