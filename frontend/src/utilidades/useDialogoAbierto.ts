import { useEffect, useState } from 'react';

const SELECTOR_DIALOGO = '[role="dialog"], [role="alertdialog"]';

/** El diálogo de más arriba (el último que se abrió), o null si no hay ninguno. */
function dialogoDeArriba(): HTMLElement | null {
  const abiertos = document.querySelectorAll<HTMLElement>(SELECTOR_DIALOGO);
  return abiertos[abiertos.length - 1] ?? null;
}

/**
 * El diálogo abierto de más arriba, o null. Los diálogos de MUI se montan como hijos directos del
 * body (portal) y se quitan al cerrarse, así que alcanza con mirar los hijos del body. Sirve para
 * lo que vive fuera de la pantalla actual: el aviso de recordatorios nuevos no corre su tiempo
 * mientras un diálogo lo tapa, y su región aria-live se anuncia desde adentro del diálogo.
 */
export function useDialogoAbierto() {
  const [dialogo, setDialogo] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const revisar = () => setDialogo(dialogoDeArriba());
    revisar();
    const observador = new MutationObserver(revisar);
    observador.observe(document.body, { childList: true });
    return () => observador.disconnect();
  }, []);

  return dialogo;
}
