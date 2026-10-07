import {
  tomasParaRecordar,
  ventanaDeGeneracion,
  type PrescripcionParaRecordar,
} from './generacion';

const a = (hora: string) => new Date(`2026-10-07T${hora}:00Z`);

const prescripcion = (datos: Partial<PrescripcionParaRecordar> = {}): PrescripcionParaRecordar => ({
  id: 1,
  pacienteId: 10,
  fechaInicio: a('08:00'),
  frecuenciaHoras: 8,
  fechaFin: null,
  administraciones: [],
  ...datos,
});

const horas = (tomas: { fechaHoraObjetivo: Date }[]) =>
  tomas.map((t) => t.fechaHoraObjetivo.toISOString().slice(11, 16));

describe('qué tomas se recuerdan (T502 · S9)', () => {
  it('la ventana va de 30 min antes a 30 min después de ahora', () => {
    expect(ventanaDeGeneracion(a('10:00'))).toEqual({ desde: a('09:30'), hasta: a('10:30') });
  });

  it('una toma se recuerda desde 30 min antes de su hora', () => {
    expect(tomasParaRecordar([prescripcion()], a('07:29'))).toEqual([]);
    expect(tomasParaRecordar([prescripcion()], a('07:30'))).toEqual([
      { prescripcionId: 1, pacienteId: 10, fechaHoraObjetivo: a('08:00') },
    ]);
  });

  it('tras una caída solo se recuperan las tomas de los últimos 30 min', () => {
    expect(horas(tomasParaRecordar([prescripcion()], a('08:30')))).toEqual(['08:00']);
    expect(tomasParaRecordar([prescripcion()], a('08:31'))).toEqual([]);
  });

  it('con una frecuencia corta puede haber dos tomas en la ventana', () => {
    const cadaHora = prescripcion({ fechaInicio: a('00:30'), frecuenciaHoras: 1 });
    expect(horas(tomasParaRecordar([cadaHora], a('08:00')))).toEqual(['07:30', '08:30']);
  });

  it('no recuerda una toma que ya se administró, aunque se haya dado antes de hora', () => {
    const desde0 = prescripcion({ fechaInicio: a('00:00') });
    expect(horas(tomasParaRecordar([desde0], a('07:40')))).toEqual(['08:00']);
    // 04:01 está más cerca de las 08:00 que de las 00:00: cuenta para la toma de las 08:00.
    const dada = { ...desde0, administraciones: [a('04:01')] };
    expect(tomasParaRecordar([dada], a('07:40'))).toEqual([]);
    const otraToma = { ...desde0, administraciones: [a('00:10')] };
    expect(horas(tomasParaRecordar([otraToma], a('07:40')))).toEqual(['08:00']);
  });

  it('no recuerda tomas después del fin del tratamiento', () => {
    expect(tomasParaRecordar([prescripcion({ fechaFin: a('07:59') })], a('07:45'))).toEqual([]);
  });

  it('junta las tomas de varias prescripciones', () => {
    const otra = prescripcion({ id: 2, pacienteId: 11, fechaInicio: a('07:50') });
    expect(
      tomasParaRecordar([prescripcion(), otra], a('07:40')).map((t) => t.prescripcionId),
    ).toEqual([1, 2]);
  });
});
