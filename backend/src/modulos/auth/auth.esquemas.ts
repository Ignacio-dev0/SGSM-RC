import { z } from 'zod';

/** POST /api/auth/login (T106). */
export const esquemaLogin = z.object({
  nombreUsuario: z.string().trim().min(1, 'Ingrese el usuario').max(30),
  contrasena: z.string().min(1, 'Ingrese la contraseña').max(100),
});
