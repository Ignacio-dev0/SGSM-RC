/**
 * Reglas del nombre de usuario, las mismas que aplica el servidor (usuarios.esquemas.ts, D111):
 * sin espacios alrededor y en minúsculas, de 3 a 30 letras sin tildes ni ñ, números, punto, guion
 * o guion bajo. La prueba del formulario compara la ayuda y el mensaje con los del servidor (F20).
 */
const PATRON_NOMBRE_USUARIO = /^[a-z0-9._-]{3,30}$/;

/** Ayuda del campo, visible desde el principio. */
export const AYUDA_NOMBRE_USUARIO =
  'De 3 a 30 caracteres: letras sin tildes ni ñ, números, punto (.), guion (-) o guion bajo (_), sin espacios';

const MENSAJE_NOMBRE_USUARIO =
  'El usuario debe tener de 3 a 30 caracteres: letras sin tildes ni ñ, números, punto (.), guion (-) o guion bajo (_), sin espacios';

/** null si el servidor lo acepta; si no, el mismo mensaje que daría él. */
export function errorNombreUsuario(valor: string): string | null {
  const normalizado = valor.trim().toLowerCase();
  if (!normalizado) return 'Ingrese el nombre de usuario';
  return PATRON_NOMBRE_USUARIO.test(normalizado) ? null : MENSAJE_NOMBRE_USUARIO;
}
