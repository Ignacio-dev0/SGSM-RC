import { renderHook } from '@testing-library/react';
import { REPETICION_TONO_MS, useTonoRepetido, type ProgramarCada } from './useTonoRepetido';

/** Reloj falso: guarda lo programado y lo ejecuta cuando la prueba lo pide. */
function relojFalso() {
  const programados: { fn: () => void; ms: number; activo: boolean }[] = [];
  const programarCada: ProgramarCada = (fn, ms) => {
    const p = { fn, ms, activo: true };
    programados.push(p);
    return () => {
      p.activo = false;
    };
  };
  const tic = () => programados.filter((p) => p.activo).forEach((p) => p.fn());
  return { programarCada, programados, tic };
}

describe('tono repetido mientras haya urgentes sin atender (ESC3)', () => {
  it('cada 5 min, mientras esté activo', () => {
    const reloj = relojFalso();
    const tocar = vi.fn();
    renderHook(() => useTonoRepetido(true, tocar, { programarCada: reloj.programarCada }));

    expect(reloj.programados).toEqual([expect.objectContaining({ ms: REPETICION_TONO_MS })]);
    expect(REPETICION_TONO_MS).toBe(5 * 60_000);
    expect(tocar).not.toHaveBeenCalled();
    reloj.tic();
    reloj.tic();
    expect(tocar).toHaveBeenCalledTimes(2);
  });

  it('inactivo no programa nada; al apagarse deja de sonar', () => {
    const reloj = relojFalso();
    const tocar = vi.fn();
    const { rerender } = renderHook(
      ({ activo }) => useTonoRepetido(activo, tocar, { programarCada: reloj.programarCada }),
      { initialProps: { activo: false } },
    );
    expect(reloj.programados).toHaveLength(0);

    rerender({ activo: true });
    reloj.tic();
    rerender({ activo: false });
    reloj.tic();

    expect(tocar).toHaveBeenCalledTimes(1);
  });

  it('usa siempre la última función (por ejemplo, con otro avisador) sin reprogramar', () => {
    const reloj = relojFalso();
    const primera = vi.fn();
    const segunda = vi.fn();
    const { rerender } = renderHook(
      ({ tocar }) => useTonoRepetido(true, tocar, { programarCada: reloj.programarCada }),
      { initialProps: { tocar: primera } },
    );

    rerender({ tocar: segunda });
    reloj.tic();

    expect(reloj.programados).toHaveLength(1);
    expect(primera).not.toHaveBeenCalled();
    expect(segunda).toHaveBeenCalledTimes(1);
  });
});
