import {
  CLAVE_SONIDO,
  crearAvisador,
  crearAvisosAgrupados,
  guardarPreferenciaSonido,
  leerPreferenciaSonido,
  textoNuevos,
} from './avisos';

describe('texto del aviso de recordatorios nuevos', () => {
  it('dice cuántos llegaron, en singular o plural', () => {
    expect(textoNuevos(1)).toBe('1 recordatorio nuevo');
    expect(textoNuevos(2)).toBe('2 recordatorios nuevos');
  });
});

describe('avisos agrupados: como mucho uno cada 10 s (S16)', () => {
  function preparar() {
    let ahora = 1_000_000;
    const avisos: number[] = [];
    const esperas: { fn: () => void; ms: number; cancelada: boolean }[] = [];
    const agrupados = crearAvisosAgrupados((n) => avisos.push(n), {
      intervalo: 10_000,
      ahora: () => ahora,
      programar: (fn, ms) => {
        const e = { fn, ms, cancelada: false };
        esperas.push(e);
        return () => {
          e.cancelada = true;
        };
      },
    });
    const pasar = (ms: number) => {
      ahora += ms;
    };
    const correrEspera = () => {
      const e = esperas.find((x) => !x.cancelada)!;
      e.cancelada = true;
      pasar(e.ms);
      e.fn();
    };
    return { agrupados, avisos, esperas, pasar, correrEspera };
  }

  it('el primero avisa enseguida', () => {
    const p = preparar();
    p.agrupados.sumar(2);
    expect(p.avisos).toEqual([2]);
  });

  it('lo que llega antes de los 10 s se junta y se avisa una sola vez al cumplirse', () => {
    const p = preparar();
    p.agrupados.sumar(1);
    p.pasar(3_000);
    p.agrupados.sumar(2);
    p.pasar(2_000);
    p.agrupados.sumar(1);
    expect(p.avisos).toEqual([1]);
    expect(p.esperas.filter((e) => !e.cancelada)).toHaveLength(1);
    expect(p.esperas[0]!.ms).toBe(7_000);

    p.correrEspera();
    expect(p.avisos).toEqual([1, 3]);
  });

  it('pasados los 10 s, el siguiente vuelve a avisar enseguida', () => {
    const p = preparar();
    p.agrupados.sumar(1);
    p.pasar(10_000);
    p.agrupados.sumar(1);
    expect(p.avisos).toEqual([1, 1]);
  });

  it('cero nuevos no avisa', () => {
    const p = preparar();
    p.agrupados.sumar(0);
    expect(p.avisos).toEqual([]);
  });

  it('detener() descarta lo pendiente', () => {
    const p = preparar();
    p.agrupados.sumar(1);
    p.agrupados.sumar(1);
    p.agrupados.detener();
    expect(p.esperas.every((e) => e.cancelada)).toBe(true);
    expect(p.avisos).toEqual([1]);
  });
});

describe('preferencia de sonido de la tablet', () => {
  afterEach(() => vi.restoreAllMocks());

  it('por defecto suena; se desactiva y se vuelve a activar en esta tablet', () => {
    expect(leerPreferenciaSonido()).toBe(true);
    guardarPreferenciaSonido(false);
    expect(localStorage.getItem(CLAVE_SONIDO)).toBe('no');
    expect(leerPreferenciaSonido()).toBe(false);
    guardarPreferenciaSonido(true);
    expect(leerPreferenciaSonido()).toBe(true);
  });

  it('sin almacenamiento disponible (modo privado, bloqueado) no falla y suena', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => guardarPreferenciaSonido(false)).not.toThrow();
    expect(leerPreferenciaSonido()).toBe(true);
  });
});

describe('tono y vibración', () => {
  /** Contexto de audio falso con lo mínimo que usa el tono. */
  function contextoFalso() {
    const osciladores: { frecuencia: number; inicio: number; fin: number }[] = [];
    const parametro = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    });
    const contexto = {
      state: 'suspended',
      currentTime: 5,
      destination: {},
      resume: vi.fn(async () => {
        contexto.state = 'running';
      }),
      createGain: () => ({ gain: parametro(), connect: (d: unknown) => d }),
      createOscillator: () => {
        const o = { frecuencia: 0, inicio: 0, fin: 0 };
        osciladores.push(o);
        return {
          type: 'sine',
          frequency: {
            set value(v: number) {
              o.frecuencia = v;
            },
          },
          connect: (d: unknown) => d,
          start: (t: number) => {
            o.inicio = t;
          },
          stop: (t: number) => {
            o.fin = t;
          },
        };
      },
    };
    return { contexto, osciladores };
  }

  it('el tono es corto (menos de 1 s) y reanuda el audio si el navegador lo había suspendido', () => {
    const { contexto, osciladores } = contextoFalso();
    const avisador = crearAvisador({
      crearContexto: () => contexto as unknown as AudioContext,
      vibrar: () => true,
    });
    avisador.tono();
    expect(contexto.resume).toHaveBeenCalled();
    expect(osciladores.length).toBeGreaterThan(0);
    const fin = Math.max(...osciladores.map((o) => o.fin));
    expect(fin - contexto.currentTime).toBeGreaterThan(0);
    expect(fin - contexto.currentTime).toBeLessThan(1);
  });

  it('crea un solo contexto de audio y lo reutiliza', () => {
    const { contexto } = contextoFalso();
    const crear = vi.fn(() => contexto as unknown as AudioContext);
    const avisador = crearAvisador({ crearContexto: crear, vibrar: () => true });
    avisador.desbloquear();
    avisador.tono();
    avisador.tono();
    expect(crear).toHaveBeenCalledTimes(1);
  });

  it('vibra con un patrón corto', () => {
    const vibrar = vi.fn((_patron: number[]) => true);
    crearAvisador({ crearContexto: () => null, vibrar }).vibrar();
    expect(vibrar).toHaveBeenCalledWith(expect.any(Array));
    const patron = vibrar.mock.calls[0]![0];
    expect(patron.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1_000);
  });

  it('sin Web Audio ni vibración (iOS, navegador viejo) no falla', () => {
    const avisador = crearAvisador({
      crearContexto: () => {
        throw new Error('sin audio');
      },
      vibrar: () => {
        throw new Error('sin vibración');
      },
    });
    expect(() => {
      avisador.desbloquear();
      avisador.tono();
      avisador.vibrar();
    }).not.toThrow();
  });
});
