// La agenda de la pantalla dice lo mismo que la del servidor (backend prescripciones/agenda.ts).
import { anclaAlCambiarFrecuencia, anclaAlReanudar, tomaMasCercana } from './agenda';

const h = (hora: string) => new Date(`2026-10-07T${hora}:00.000Z`);
const iso = (hora: string) => h(hora).toISOString();

const cada8 = {
  fechaInicio: iso('08:00'),
  agendaDesde: iso('08:00'),
  frecuenciaHoras: 8,
  fechaFin: null,
};

const dosis = (fechaHora: string, toma: string) => ({
  id: 1,
  fechaHora: iso(fechaHora),
  tomaProgramada: iso(toma),
  cantidad: 1,
  usuario: 'Acosta, Sofía',
});

describe('tomaMasCercana (D121)', () => {
  it('es la toma de la agenda más cercana al momento', () => {
    expect(tomaMasCercana(cada8, h('10:00'))).toBe(h('08:00').getTime());
    expect(tomaMasCercana(cada8, h('13:00'))).toBe(h('16:00').getTime());
  });

  it('la primera toma se puede adelantar hasta media frecuencia; antes no hay toma (RN07)', () => {
    expect(tomaMasCercana(cada8, h('04:00'))).toBe(h('08:00').getTime());
    expect(tomaMasCercana(cada8, h('03:59'))).toBeNull();
  });

  it('en una agenda re-anclada, lo anterior al ancla es de su toma 0', () => {
    const reanudada = { ...cada8, agendaDesde: iso('15:00') };
    expect(tomaMasCercana(reanudada, h('09:00'))).toBe(h('15:00').getTime());
  });

  it('no pasa de la fecha de fin', () => {
    const conFin = { ...cada8, fechaFin: iso('16:00') };
    expect(tomaMasCercana(conFin, h('23:00'))).toBe(h('16:00').getTime());
  });
});

describe('desde dónde se cuentan las tomas (D112 · D122)', () => {
  it('al reanudar, desde ahora; si el tratamiento no empezó, desde su inicio', () => {
    expect(anclaAlReanudar(cada8, h('10:00'))).toEqual({ desde: 'ahora' });
    expect(anclaAlReanudar(cada8, h('07:00'))).toEqual({ desde: 'inicio' });
  });

  it('al cambiar la frecuencia, desde la toma de la última dosis de la agenda vigente', () => {
    const p = { ...cada8, ultimasAdministraciones: [dosis('08:20', '08:00')] };
    expect(anclaAlCambiarFrecuencia(p, h('12:00'))).toEqual({ desde: 'dosis', toma: iso('08:00') });
  });

  it('una dosis de antes de volver a anclar no cuenta', () => {
    const p = {
      ...cada8,
      agendaDesde: iso('15:00'),
      ultimasAdministraciones: [dosis('08:20', '08:00')],
    };
    expect(anclaAlCambiarFrecuencia(p, h('15:30'))).toEqual({ desde: 'ahora' });
  });

  it('si después de esa toma quedó otra sin dar, desde ahora', () => {
    const p = { ...cada8, ultimasAdministraciones: [dosis('08:20', '08:00')] };
    expect(anclaAlCambiarFrecuencia(p, h('16:00'))).toEqual({ desde: 'ahora' });
  });

  it('una dosis sin toma guardada no sirve de ancla', () => {
    const p = {
      ...cada8,
      ultimasAdministraciones: [{ ...dosis('08:20', '08:00'), tomaProgramada: null }],
    };
    expect(anclaAlCambiarFrecuencia(p, h('12:00'))).toEqual({ desde: 'ahora' });
  });
});
