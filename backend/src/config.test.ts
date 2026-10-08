import { randomBytes } from 'node:crypto';
import {
  CLAVE_BIOMETRIA_DESARROLLO,
  booleano,
  clavesBiometria,
  confianzaProxy,
  config,
  lista,
} from './config';

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

  describe('clave del cifrado biométrico (T705 · RNF06)', () => {
    const clave = randomBytes(32);

    it('en desarrollo y pruebas, sin variable, usa la clave de desarrollo documentada', () => {
      const llavero = clavesBiometria({}, false);
      expect(llavero.actual).toEqual(Buffer.from(CLAVE_BIOMETRIA_DESARROLLO, 'base64'));
      expect(llavero.anteriores).toEqual([]);
      expect(config.biometria.llavero.actual).toHaveLength(32);
    });

    it('lee BIOMETRIA_CLAVE y, para rotarla, BIOMETRIA_CLAVE_ANTERIOR', () => {
      const anterior = randomBytes(32);
      const llavero = clavesBiometria(
        {
          BIOMETRIA_CLAVE: clave.toString('base64'),
          BIOMETRIA_CLAVE_ANTERIOR: anterior.toString('hex'),
        },
        true,
      );
      expect(llavero).toEqual({ actual: clave, anteriores: [anterior] });
    });

    it('en producción, sin BIOMETRIA_CLAVE el servidor no arranca', () => {
      expect(() => clavesBiometria({}, true)).toThrow(
        /Falta la variable BIOMETRIA_CLAVE, obligatoria en producción/,
      );
    });

    it('en producción no acepta la clave de desarrollo', () => {
      expect(() => clavesBiometria({ BIOMETRIA_CLAVE: CLAVE_BIOMETRIA_DESARROLLO }, true)).toThrow(
        /clave de desarrollo/,
      );
    });

    it('rechaza una clave mal formada en cualquier entorno', () => {
      expect(() => clavesBiometria({ BIOMETRIA_CLAVE: 'corta' }, false)).toThrow(/32 bytes/);
      expect(() =>
        clavesBiometria(
          { BIOMETRIA_CLAVE: clave.toString('hex'), BIOMETRIA_CLAVE_ANTERIOR: 'x' },
          false,
        ),
      ).toThrow(/BIOMETRIA_CLAVE_ANTERIOR/);
    });
  });

  it('límite de intentos por IP: 10 fallidos en 15 minutos por defecto', () => {
    expect(config.login.ip).toEqual({ maxFallidos: 10, ventanaMinutos: 15 });
  });

  it('confianza en el proxy: un salto (nginx o Vite) por defecto, configurable', () => {
    expect(confianzaProxy(undefined)).toBe(1);
    expect(confianzaProxy('')).toBe(1);
    expect(confianzaProxy('false')).toBe(false);
    expect(confianzaProxy('2')).toBe(2);
    expect(confianzaProxy('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
    expect(config.confiarProxy).toBe(1);
  });
});
