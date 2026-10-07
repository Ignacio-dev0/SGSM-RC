import { useEffect, useRef } from 'react';

/** Programa `fn` cada `ms` y devuelve cómo cancelarla (el reloj se inyecta en las pruebas). */
export type ProgramarCada = (fn: () => void, ms: number) => () => void;

/** Cada cuánto se repite el tono mientras haya urgentes o vencidos sin atender (ESC3). */
export const REPETICION_TONO_MS = 5 * 60_000;

const programarConIntervalo: ProgramarCada = (fn, ms) => {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
};

/**
 * Repite `tocar` cada 5 min mientras `activo` (ESC3): lo urgente que sigue sin atender vuelve a
 * sonar aunque no lleguen recordatorios nuevos. El primero suena a los 5 min: el aviso de nuevos ya
 * sonó cuando apareció.
 */
export function useTonoRepetido(
  activo: boolean,
  tocar: () => void,
  {
    cadaMs = REPETICION_TONO_MS,
    programarCada = programarConIntervalo,
  }: { cadaMs?: number; programarCada?: ProgramarCada } = {},
) {
  const tocarRef = useRef(tocar);
  tocarRef.current = tocar;

  useEffect(() => {
    if (!activo) return;
    return programarCada(() => tocarRef.current(), cadaMs);
  }, [activo, cadaMs, programarCada]);
}
