import { act, renderHook } from '@testing-library/react';
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

  it('un minuto antes de cerrar, avisa con la cuenta regresiva', () => {
    const { result } = renderHook(() => useInactividad(15, vi.fn()));
    expect(result.current.segundosRestantes).toBeNull();

    act(() => vi.advanceTimersByTime(14 * 60_000));
    expect(result.current.segundosRestantes).toBe(60);
    act(() => vi.advanceTimersByTime(15_000));
    expect(result.current.segundosRestantes).toBe(45);
  });

  it('"seguir" reinicia la cuenta y quita el aviso', () => {
    const alVencer = vi.fn();
    const { result } = renderHook(() => useInactividad(15, alVencer));

    act(() => vi.advanceTimersByTime(14 * 60_000 + 30_000));
    act(() => result.current.seguir());
    expect(result.current.segundosRestantes).toBeNull();
    act(() => vi.advanceTimersByTime(14 * 60_000));
    expect(alVencer).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60_000));
    expect(alVencer).toHaveBeenCalledTimes(1);
  });

  it('la actividad avisa como mucho cada 2 minutos, para mantener viva la sesión del servidor', () => {
    const alHaberActividad = vi.fn();
    renderHook(() => useInactividad(15, vi.fn(), { alHaberActividad }));

    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    window.dispatchEvent(new Event('scroll'));
    expect(alHaberActividad).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(2 * 60_000));
    window.dispatchEvent(new Event('pointerdown'));
    expect(alHaberActividad).toHaveBeenCalledTimes(2);
  });
});
