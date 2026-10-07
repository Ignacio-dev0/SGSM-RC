import { iniciarTemporizador } from './temporizador';

const MINUTO = 60_000;

/** Una promesa que la prueba resuelve cuando quiere (un ciclo lento). */
function pendiente() {
  let resolver!: () => void;
  const promesa = new Promise<void>((r) => (resolver = r));
  return { promesa, resolver };
}

describe('temporizador de recordatorios (T501)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('corre un ciclo al iniciar y después uno por minuto', async () => {
    const ciclo = jest.fn().mockResolvedValue(undefined);
    const t = iniciarTemporizador({ ciclo });
    expect(ciclo).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(MINUTO - 1);
    expect(ciclo).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(ciclo).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(3 * MINUTO);
    expect(ciclo).toHaveBeenCalledTimes(5);

    await t.detener();
  });

  it('no superpone ciclos: si el anterior sigue, saltea ese turno', async () => {
    const lento = pendiente();
    const ciclo = jest.fn().mockReturnValueOnce(lento.promesa).mockResolvedValue(undefined);
    const t = iniciarTemporizador({ ciclo, intervaloMs: MINUTO });

    await jest.advanceTimersByTimeAsync(2 * MINUTO);
    expect(ciclo).toHaveBeenCalledTimes(1);

    lento.resolver();
    await jest.advanceTimersByTimeAsync(MINUTO);
    expect(ciclo).toHaveBeenCalledTimes(2);

    await t.detener();
  });

  it('un ciclo que falla queda en el log y el temporizador sigue', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const ciclo = jest
      .fn()
      .mockRejectedValueOnce(new Error('base caída'))
      .mockResolvedValue(undefined);
    const t = iniciarTemporizador({ ciclo });

    await jest.advanceTimersByTimeAsync(MINUTO);

    expect(log).toHaveBeenCalledWith(expect.stringMatching(/recordatorios/), expect.any(Error));
    expect(ciclo).toHaveBeenCalledTimes(2);
    await t.detener();
  });

  it('al detenerlo espera el ciclo en curso y no corre más', async () => {
    const lento = pendiente();
    const ciclo = jest.fn().mockReturnValueOnce(lento.promesa).mockResolvedValue(undefined);
    const t = iniciarTemporizador({ ciclo });

    let detenido = false;
    const deteniendo = t.detener().then(() => (detenido = true));
    await jest.advanceTimersByTimeAsync(0);
    expect(detenido).toBe(false);

    lento.resolver();
    await deteniendo;
    await jest.advanceTimersByTimeAsync(5 * MINUTO);
    expect(ciclo).toHaveBeenCalledTimes(1);
  });
});
