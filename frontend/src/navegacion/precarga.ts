import { useEffect } from 'react';

/** Una sección del menú y cómo descargar de antemano el código de sus pantallas. */
export interface SeccionPrecargable {
  ruta: string;
  precargar: () => void;
}

/** Las secciones a las que lleva una ruta: la propia y sus subpantallas (/usuarios/3/permisos). */
export const seccionesDe = (ruta: string, secciones: SeccionPrecargable[]) =>
  secciones.filter((s) => ruta === s.ruta || ruta.startsWith(`${s.ruta}/`));

/**
 * Al pasar el puntero o llegar con el teclado a un enlace interno (menú, tareas del Inicio,
 * listas), descarga el código de la pantalla a la que lleva: así abre sin esperar (T702 ·
 * RNF03). Escucha en el documento para no tocar cada enlace; cada sección se pide una sola vez.
 */
export function usePrecargaAlApuntar(secciones: SeccionPrecargable[]) {
  useEffect(() => {
    const pedidas = new Set<SeccionPrecargable>();
    const alApuntar = (evento: Event) => {
      const enlace = (evento.target as Element | null)?.closest?.('a[href]');
      if (!(enlace instanceof HTMLAnchorElement) || enlace.origin !== window.location.origin) {
        return;
      }
      for (const seccion of seccionesDe(enlace.pathname, secciones)) {
        if (pedidas.has(seccion)) continue;
        pedidas.add(seccion);
        seccion.precargar();
      }
    };
    document.addEventListener('pointerover', alApuntar);
    document.addEventListener('focusin', alApuntar);
    return () => {
      document.removeEventListener('pointerover', alApuntar);
      document.removeEventListener('focusin', alApuntar);
    };
  }, [secciones]);
}
