import bcrypt from 'bcryptjs';
import { config } from '../../config';

/** Cifra una contraseña con bcrypt (RNF05). El costo se configura con BCRYPT_COSTO. */
export const cifrarContrasena = (contrasena: string) => bcrypt.hash(contrasena, config.bcryptCosto);

export const verificarContrasena = (contrasena: string, hash: string) =>
  bcrypt.compare(contrasena, hash);
