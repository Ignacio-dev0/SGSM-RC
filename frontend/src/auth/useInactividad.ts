import { useEffect, useRef } from 'react';

const EVENTOS_DE_ACTIVIDAD = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;

/**
 * Ejecuta `alVencer` si pasan `minutos` sin que el usuario toque la pantalla ni use el teclado
 * (T105 · RNF05). Complementa al backend, que también vence la sesión: así la tablet no queda
 * mostrando datos clínicos de una sesión abandonada. Con `minutos` en null no hace nada.
 */
export function useInactividad(minutos: number | null, alVencer: () => void) {
  const alVencerRef = useRef(alVencer);
  alVencerRef.current = alVencer;

  useEffect(() => {
    if (minutos === null) return;
    let temporizador: ReturnType<typeof setTimeout>;
    const reiniciar = () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => alVencerRef.current(), minutos * 60_000);
    };
    reiniciar();
    for (const e of EVENTOS_DE_ACTIVIDAD) window.addEventListener(e, reiniciar, { passive: true });
    return () => {
      clearTimeout(temporizador);
      for (const e of EVENTOS_DE_ACTIVIDAD) window.removeEventListener(e, reiniciar);
    };
  }, [minutos]);
}
