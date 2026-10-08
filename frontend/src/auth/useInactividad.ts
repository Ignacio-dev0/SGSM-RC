import { useCallback, useEffect, useRef, useState } from 'react';

const EVENTOS_DE_ACTIVIDAD = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;

interface Opciones {
  /** Cuántos segundos antes de cerrar se avisa (por defecto, 60). */
  avisoSegundos?: number;
  /**
   * Se llama cuando hay actividad, como mucho una vez cada `cadaMsActividad`: sirve para
   * renovar la sesión del servidor mientras la persona usa la tablet sin hacer pedidos (por
   * ejemplo, leyendo una ficha).
   */
  alHaberActividad?: () => void;
  cadaMsActividad?: number;
}

/**
 * Ejecuta `alVencer` si pasan `minutos` sin que el usuario toque la pantalla ni use el teclado
 * (T105 · RNF05). Complementa al backend, que también vence la sesión: así la tablet no queda
 * mostrando datos clínicos de una sesión abandonada. Con `minutos` en null no hace nada.
 *
 * Durante el último minuto devuelve `segundosRestantes` para mostrar el aviso; cualquier
 * actividad, o `seguir()`, reinicia la cuenta.
 */
export function useInactividad(
  minutos: number | null,
  alVencer: () => void,
  { avisoSegundos = 60, alHaberActividad, cadaMsActividad = 2 * 60_000 }: Opciones = {},
) {
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null);
  const alVencerRef = useRef(alVencer);
  alVencerRef.current = alVencer;
  const alHaberActividadRef = useRef(alHaberActividad);
  alHaberActividadRef.current = alHaberActividad;
  const reiniciarRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (minutos === null) return;
    const totalMs = minutos * 60_000;
    const avisoMs = Math.min(avisoSegundos * 1000, totalMs);
    let vence = 0;
    let ultimaActividadAvisada = -Infinity;
    let temporizadorAviso: ReturnType<typeof setTimeout>;
    let temporizadorCierre: ReturnType<typeof setTimeout>;
    let cuentaRegresiva: ReturnType<typeof setInterval> | undefined;

    const actualizarCuenta = () =>
      setSegundosRestantes(Math.max(0, Math.ceil((vence - Date.now()) / 1000)));

    const detener = () => {
      clearTimeout(temporizadorAviso);
      clearTimeout(temporizadorCierre);
      clearInterval(cuentaRegresiva);
    };

    const reiniciar = () => {
      detener();
      setSegundosRestantes(null);
      vence = Date.now() + totalMs;
      temporizadorAviso = setTimeout(() => {
        actualizarCuenta();
        cuentaRegresiva = setInterval(actualizarCuenta, 1000);
      }, totalMs - avisoMs);
      temporizadorCierre = setTimeout(() => {
        detener();
        setSegundosRestantes(null);
        alVencerRef.current();
      }, totalMs);
    };

    const alActuar = () => {
      reiniciar();
      const ahora = Date.now();
      if (ahora - ultimaActividadAvisada >= cadaMsActividad) {
        ultimaActividadAvisada = ahora;
        alHaberActividadRef.current?.();
      }
    };

    reiniciarRef.current = reiniciar;
    reiniciar();
    for (const e of EVENTOS_DE_ACTIVIDAD) window.addEventListener(e, alActuar, { passive: true });
    return () => {
      detener();
      reiniciarRef.current = () => {};
      for (const e of EVENTOS_DE_ACTIVIDAD) window.removeEventListener(e, alActuar);
    };
  }, [minutos, avisoSegundos, cadaMsActividad]);

  const seguir = useCallback(() => reiniciarRef.current(), []);

  return { segundosRestantes, seguir };
}
