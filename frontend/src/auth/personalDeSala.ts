import type { UsuarioSesion } from '../api/tipos';

/**
 * Personal de sala (F8): quien atiende recordatorios y no administra usuarios. Es quien tiene la
 * tablet a mano junto a la cama: a él le suenan los avisos por defecto y se le explica que, sin
 * sesión, dejan de sonar. El administrador también puede atender, pero no está en la sala: sus
 * avisos empiezan sin sonido (los puede encender).
 */
export const esPersonalDeSala = (usuario: Pick<UsuarioSesion, 'permisos'> | null | undefined) =>
  Boolean(
    usuario?.permisos.includes('recordatorios.atender') &&
    !usuario.permisos.includes('usuarios.gestionar'),
  );
