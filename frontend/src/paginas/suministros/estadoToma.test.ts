import { duracion, estadoToma, textoEstadoToma } from './estadoToma';

const AHORA = new Date('2026-10-07T18:00:00.000Z');
const en = (minutos: number) => new Date(AHORA.getTime() + minutos * 60_000).toISOString();

const prescripcion = (
  proximaToma: string | null,
  ultimas: { fechaHora: string; usuario: string }[] = [],
) => ({
  frecuenciaHoras: 8,
  proximaToma,
  ultimasAdministraciones: ultimas.map((u, i) => ({ id: i + 1, cantidad: 1, ...u })),
});

describe('duracion', () => {
  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [60, '1 h'],
    [185, '3 h 5 min'],
  ])('%i minutos → %s', (minutos, texto) => expect(duracion(minutos)).toBe(texto));
});

describe('estado de la toma de una prescripción', () => {
  it('toca ahora si la toma es dentro de la próxima media hora', () => {
    expect(estadoToma(prescripcion(en(30)), AHORA)).toMatchObject({ tipo: 'ahora' });
    expect(estadoToma(prescripcion(en(0)), AHORA)).toMatchObject({ tipo: 'ahora' });
  });

  it('está atrasada si la toma pendiente ya pasó', () => {
    expect(estadoToma(prescripcion(en(-20)), AHORA)).toMatchObject({
      tipo: 'atrasada',
      minutos: 20,
    });
  });

  it('falta si la toma es en más de media hora', () => {
    const e = estadoToma(prescripcion(en(185)), AHORA);
    expect(e).toMatchObject({ tipo: 'falta', minutos: 185 });
    expect(textoEstadoToma(e)).toBe('Faltan 3 h 5 min');
  });

  it('ya se dio si la última administración cae en la misma toma (menos de media frecuencia)', () => {
    const e = estadoToma(
      prescripcion(en(470), [{ fechaHora: en(-10), usuario: 'Acosta, Sofía' }]),
      AHORA,
    );
    expect(e).toMatchObject({ tipo: 'dada', minutos: 10, usuario: 'Acosta, Sofía' });
    expect(textoEstadoToma(e)).toBe('Ya se dio hace 10 min');
  });

  it('una administración de la toma anterior no cuenta como dada', () => {
    const e = estadoToma(
      prescripcion(en(5), [{ fechaHora: en(-475), usuario: 'Acosta, Sofía' }]),
      AHORA,
    );
    expect(e).toMatchObject({ tipo: 'ahora' });
  });

  it('sin próxima toma (tratamiento terminado)', () => {
    expect(textoEstadoToma(estadoToma(prescripcion(null), AHORA))).toBe('Sin más tomas');
  });
});
