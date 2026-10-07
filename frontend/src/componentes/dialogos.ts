/**
 * `onClose` para un diálogo con formulario o captura: Escape lo cierra, pero tocar afuera no,
 * porque un toque accidental en la tablet borraría lo escrito o la foto tomada.
 */
export const cerrarSinTocarAfuera =
  (alCerrar: () => void) => (_evento: object, razon: 'backdropClick' | 'escapeKeyDown') => {
    if (razon !== 'backdropClick') alCerrar();
  };
