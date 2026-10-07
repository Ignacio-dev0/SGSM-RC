import { prisma } from '../../src/db';
import { sembrarCatalogoBase } from '../../src/semillas/catalogo-base';
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
    await sembrarCatalogoBase(prisma);
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
    await sembrarCatalogoBase(prisma);
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

    await sembrarCatalogoBase(prisma);

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
