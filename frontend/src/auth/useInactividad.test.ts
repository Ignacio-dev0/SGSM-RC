import { renderHook } from '@testing-library/react';
import { useInactividad } from './useInactividad';

describe('cierre de sesión por inactividad en la tablet (T105)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('avisa cuando pasan los minutos indicados sin actividad', () => {
    const alVencer = vi.fn();
    renderHook(() => useInactividad(15, alVencer));

    vi.advanceTimersByTime(15 * 60_000 - 1000);
    expect(alVencer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(alVencer).toHaveBeenCalledTimes(1);
  });

  it('tocar la pantalla reinicia la cuenta', () => {
    const alVencer = vi.fn();
    renderHook(() => useInactividad(15, alVencer));

    vi.advanceTimersByTime(10 * 60_000);
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(10 * 60_000);
    expect(alVencer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5 * 60_000);
    expect(alVencer).toHaveBeenCalledTimes(1);
  });

  it('sin sesión no hace nada', () => {
    const alVencer = vi.fn();
    renderHook(() => useInactividad(null, alVencer));
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(alVencer).not.toHaveBeenCalled();
  });
});
