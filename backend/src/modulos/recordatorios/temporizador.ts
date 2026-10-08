import { config } from '../../config';
import { ejecutarCiclo } from './ciclo.servicio';

/**
 * Temporizador de recordatorios (T501): corre un ciclo al iniciar y otro cada
 * `RECORDATORIOS_INTERVALO_SEG`, sin superponerse (si el anterior sigue, saltea el turno). Lo
 * arranca `servidor.ts`, nunca `crearApp()`: las pruebas de la API no lo arrancan.
 */

export interface Temporizador {
  /** Deja de programar ciclos y espera el que esté en curso. */
  detener(): Promise<void>;
}

export function iniciarTemporizador({
  ciclo = () => ejecutarCiclo(),
  intervaloMs = config.recordatorios.intervaloSegundos * 1000,
}: { ciclo?: () => Promise<unknown>; intervaloMs?: number } = {}): Temporizador {
  let enCurso: Promise<void> | null = null;

  const correr = () => {
    if (enCurso) return;
    enCurso = ciclo()
      .then(
        () => undefined,
        (e: unknown) => console.error('Falló el ciclo de recordatorios', e),
      )
      .finally(() => {
        enCurso = null;
      });
  };

  correr();
  const intervalo = setInterval(correr, intervaloMs);

  return {
    async detener() {
      clearInterval(intervalo);
      await enCurso;
    },
  };
}
