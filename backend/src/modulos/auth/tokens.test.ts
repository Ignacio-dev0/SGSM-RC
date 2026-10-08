import jwt from 'jsonwebtoken';
import { reloj } from '../../comun/reloj';
import { ErrorApi } from '../../comun/errores';
import { config } from '../../config';
import { emitirToken, verificarToken } from './tokens';

const MIN = 60_000;
const base = new Date('2026-10-07T10:00:00Z');
const enMinutos = (m: number) => new Date(base.getTime() + m * MIN);

describe('tokens de sesión (T105)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('emite un token que identifica al usuario y la hora de inicio de sesión', () => {
    jest.spyOn(reloj, 'ahora').mockReturnValue(base);
    const token = emitirToken({ usuarioId: 7, inicio: base });
    expect(verificarToken(token)).toEqual({ usuarioId: 7, inicio: base });
  });

  it('el token vence tras el período de inactividad configurado', () => {
    jest.spyOn(reloj, 'ahora').mockReturnValue(base);
    const token = emitirToken({ usuarioId: 7, inicio: base });

    jest.spyOn(reloj, 'ahora').mockReturnValue(enMinutos(config.sesion.inactividadMinutos - 1));
    expect(() => verificarToken(token)).not.toThrow();

    jest.spyOn(reloj, 'ahora').mockReturnValue(enMinutos(config.sesion.inactividadMinutos + 1));
    expect(() => verificarToken(token)).toThrow(/inactividad/);
  });

  it('rechaza una sesión que superó la duración máxima aunque se haya renovado', () => {
    const tarde = enMinutos(config.sesion.maximaHoras * 60 + 1);
    jest.spyOn(reloj, 'ahora').mockReturnValue(tarde);
    const renovado = emitirToken({ usuarioId: 7, inicio: base });
    expect(() => verificarToken(renovado)).toThrow(ErrorApi);
  });

  it('rechaza un token adulterado o firmado con otra clave', () => {
    jest.spyOn(reloj, 'ahora').mockReturnValue(base);
    const ajeno = jwt.sign({ sub: '7', inicio: base.toISOString() }, 'otra-clave');
    expect(() => verificarToken(ajeno)).toThrow(ErrorApi);
    expect(() => verificarToken('basura')).toThrow(ErrorApi);
  });
});
