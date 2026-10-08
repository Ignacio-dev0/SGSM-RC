import { z } from 'zod';
import { esquemaPaginacion } from '../../comun/paginacion';
import { CODIGOS_PERMISO, ROLES, type CodigoRol } from '../seguridad/catalogo-permisos';

const CODIGOS_ROL = Object.keys(ROLES) as [CodigoRol, ...CodigoRol[]];

/** Texto opcional: '' y null se guardan como null. */
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const esquemaDni = z
  .string()
  .trim()
  .regex(/^\d{7,8}$/, 'El DNI debe tener 7 u 8 dígitos, sin puntos');

/** Reglas de la contraseña: las usan el alta, la modificación y el instalador (T803). */
export const esquemaContrasena = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña puede tener hasta 72 caracteres')
  .regex(/[A-Za-z]/, 'La contraseña debe tener al menos una letra')
  .regex(/\d/, 'La contraseña debe tener al menos un número');

const camposUsuario = {
  nombreUsuario: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9._-]{3,30}$/,
      // Dice cada carácter que acepta: sin tildes ni ñ (D111).
      'El usuario debe tener de 3 a 30 caracteres: letras sin tildes ni ñ, números, punto (.), guion (-) o guion bajo (_), sin espacios',
    ),
  dni: esquemaDni,
  nombre: z.string().trim().min(2, 'Ingrese el nombre').max(80),
  apellido: z.string().trim().min(2, 'Ingrese el apellido').max(80),
  email: z
    .union([z.literal(''), z.email('El email no es válido').max(120)])
    .nullish()
    .transform((v) => (v ? v : null)),
  matricula: textoOpcional(30),
  rol: z.enum(CODIGOS_ROL, { error: 'El rol no es válido' }),
};

export const esquemaAltaUsuario = z.object({ ...camposUsuario, contrasena: esquemaContrasena });

export const esquemaModificacionUsuario = z
  .object({ ...camposUsuario, contrasena: esquemaContrasena })
  .partial();

export const esquemaBusquedaUsuarios = esquemaPaginacion.extend({
  texto: z.string().trim().max(80).optional(),
  rol: z.enum(CODIGOS_ROL).optional(),
  activo: z.enum(['true', 'false']).optional(),
});

export const esquemaPermisosAdicionales = z.object({
  permisos: z.array(
    z.enum(CODIGOS_PERMISO as [string, ...string[]], { error: 'Permiso inexistente' }),
  ),
});

export type AltaUsuario = z.infer<typeof esquemaAltaUsuario>;
export type ModificacionUsuario = z.infer<typeof esquemaModificacionUsuario>;
export type BusquedaUsuarios = z.infer<typeof esquemaBusquedaUsuarios>;
