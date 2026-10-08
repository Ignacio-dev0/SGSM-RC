// Audio y vibración falsos para las pruebas de los avisos de recordatorios.

/** Web Audio y vibración falsos: cuentan las notas y las vibraciones. */
export function simularAudioYVibracion() {
  const notas: number[] = [];
  class ContextoFalso {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = async () => {};
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect: (d: unknown) => d,
      };
    }
    createOscillator() {
      const frecuencia = { value: 0 };
      return {
        type: 'sine',
        frequency: frecuencia,
        connect: (d: unknown) => d,
        start: () => notas.push(frecuencia.value),
        stop() {},
      };
    }
  }
  vi.stubGlobal('AudioContext', ContextoFalso);
  const vibrar = vi.fn(() => true);
  Object.defineProperty(navigator, 'vibrate', { value: vibrar, configurable: true });
  return { notas, vibrar };
}
