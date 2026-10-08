import { z } from 'zod';

/**
 * POST /api/auth/login (T106). Los usuarios se guardan en minúsculas: el que se escribe se
 * compara sin los espacios de alrededor y en minúsculas (D111).
 */
export const esquemaLogin = z.object({
  nombreUsuario: z.string().trim().toLowerCase().min(1, 'Ingrese el usuario').max(30),
  contrasena: z.string().min(1, 'Ingrese la contraseña').max(100),
});
