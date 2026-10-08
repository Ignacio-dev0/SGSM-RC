import {
  tomasParaRecordar,
  ventanaDeGeneracion,
  type PrescripcionParaRecordar,
} from './generacion';

const a = (hora: string) => new Date(`2026-10-07T${hora}:00Z`);

/** Sin agendaDesde, la agenda original: anclada en la fecha de inicio. */
const prescripcion = (datos: Partial<PrescripcionParaRecordar> = {}): PrescripcionParaRecordar => {
  const fechaInicio = datos.fechaInicio ?? a('08:00');
  return {
    id: 1,
    pacienteId: 10,
    fechaInicio,
    agendaDesde: fechaInicio,
    frecuenciaHoras: 8,
    fechaFin: null,
    tomasDadas: [],
    ...datos,
  };
};

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
    // Una dosis de las 04:01 guardó la toma de las 08:00 (la más cercana, D121).
    const dada = { ...desde0, tomasDadas: [a('08:00')] };
    expect(tomasParaRecordar([dada], a('07:40'))).toEqual([]);
    const otraToma = { ...desde0, tomasDadas: [a('00:00')] };
    expect(horas(tomasParaRecordar([otraToma], a('07:40')))).toEqual(['08:00']);
  });

  it('no recuerda tomas después del fin del tratamiento', () => {
    expect(tomasParaRecordar([prescripcion({ fechaFin: a('07:59') })], a('07:45'))).toEqual([]);
  });

  it('D112: con la agenda re-anclada, se recuerda desde el ancla aunque haya dosis de antes', () => {
    // Reanudada a las 15:00; la última dosis fue la de las 08:00, antes de suspenderla.
    const reanudada = prescripcion({
      fechaInicio: a('00:00'),
      agendaDesde: a('15:00'),
      tomasDadas: [a('08:00')],
    });
    expect(horas(tomasParaRecordar([reanudada], a('15:00')))).toEqual(['15:00']);
    expect(horas(tomasParaRecordar([reanudada], a('22:40')))).toEqual(['23:00']);
  });

  it('junta las tomas de varias prescripciones', () => {
    const otra = prescripcion({ id: 2, pacienteId: 11, fechaInicio: a('07:50') });
    expect(
      tomasParaRecordar([prescripcion(), otra], a('07:40')).map((t) => t.prescripcionId),
    ).toEqual([1, 2]);
  });
});
