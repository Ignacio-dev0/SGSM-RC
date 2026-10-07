import type { PrismaClient } from '@prisma/client';
import { cifrarContrasena } from '../modulos/auth/contrasenas';
import type { CodigoRol } from '../modulos/seguridad/catalogo-permisos';

/**
 * Usuarios de prueba, uno por rol, SOLO para desarrollo y demostración (T103).
 * Las contraseñas son públicas: nunca ejecutar esta semilla en producción.
 */
export const USUARIOS_DE_PRUEBA: {
  nombreUsuario: string;
  contrasena: string;
  rol: CodigoRol;
  dni: string;
  nombre: string;
  apellido: string;
  matricula?: string;
}[] = [
  {
    nombreUsuario: 'admin',
    contrasena: 'Admin2026',
    rol: 'ADMINISTRADOR',
    dni: '20111111',
    nombre: 'Laura',
    apellido: 'Méndez',
  },
  {
    nombreUsuario: 'medico',
    contrasena: 'Medico2026',
    rol: 'MEDICO',
    dni: '20222222',
    nombre: 'Martín',
    apellido: 'Ferreyra',
    matricula: 'MP 45123',
  },
  {
    nombreUsuario: 'enfermero',
    contrasena: 'Enfermero2026',
    rol: 'ENFERMERO',
    dni: '20333333',
    nombre: 'Sofía',
    apellido: 'Acosta',
    matricula: 'ME 10234',
  },
];

export async function sembrarUsuariosDePrueba(prisma: PrismaClient) {
  for (const u of USUARIOS_DE_PRUEBA) {
    const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: u.rol } });
    await prisma.usuario.upsert({
      where: { nombreUsuario: u.nombreUsuario },
      update: {},
      create: {
        nombreUsuario: u.nombreUsuario,
        contrasenaHash: await cifrarContrasena(u.contrasena),
        dni: u.dni,
        nombre: u.nombre,
        apellido: u.apellido,
        matricula: u.matricula ?? null,
        rolId: rol.id,
      },
    });
  }
}
