import { booleano, config, lista } from './config';

describe('configuración (docs/entorno.md)', () => {
  afterEach(() => {
    delete process.env.PRUEBA_VARIABLE;
  });

  it('E5: recordatorios y tiempo real usan por defecto los valores del diseño', () => {
    expect(config.recordatorios).toEqual({
      temporizador: true,
      intervaloSegundos: 60,
      anticipacionMinutos: 30,
      vencimientoMinutos: 60,
      prioridadAltaMinutos: 5,
      prioridadMediaMinutos: 15,
      vencidosVisiblesHoras: 12,
    });
    expect(config.tiempoReal).toEqual({ latidoSegundos: 30, origenes: [] });
  });

  it('lee un interruptor true/false y rechaza otro valor', () => {
    expect(booleano('PRUEBA_VARIABLE', true)).toBe(true);
    process.env.PRUEBA_VARIABLE = 'false';
    expect(booleano('PRUEBA_VARIABLE', true)).toBe(false);
    process.env.PRUEBA_VARIABLE = 'true';
    expect(booleano('PRUEBA_VARIABLE', false)).toBe(true);
    process.env.PRUEBA_VARIABLE = 'si';
    expect(() => booleano('PRUEBA_VARIABLE', false)).toThrow(/PRUEBA_VARIABLE/);
  });

  it('lee una lista separada por comas, sin espacios ni elementos vacíos', () => {
    expect(lista('PRUEBA_VARIABLE')).toEqual([]);
    process.env.PRUEBA_VARIABLE = ' http://localhost:8080 , ,https://sgsm.hospital ';
    expect(lista('PRUEBA_VARIABLE')).toEqual(['http://localhost:8080', 'https://sgsm.hospital']);
  });
});
