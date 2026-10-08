import {
  anclaAlReanudar,
  anclaPorCambioDeFrecuencia,
  esTomaDeLaAgenda,
  proximaToma,
  proximaTomaPendiente,
  tomaMasCercana,
  tomasDadas,
  tomasEntre,
} from './agenda';

const h = (iso: string) => new Date(`2026-10-07T${iso}:00.000Z`);
const dia2 = (iso: string) => new Date(`2026-10-08T${iso}:00.000Z`);
const horas = (fechas: Date[]) => fechas.map((f) => f.toISOString().slice(5, 16));

const cada8 = {
  fechaInicio: h('08:00'),
  agendaDesde: h('08:00'),
  frecuenciaHoras: 8,
  fechaFin: null,
};

describe('cálculo de horarios de administración (T302 · RF07)', () => {
  describe('tomasEntre', () => {
    it('genera la agenda desde el inicio cada N horas, incluyendo los extremos', () => {
      expect(horas(tomasEntre(cada8, h('08:00'), dia2('08:00')))).toEqual([
        '10-07T08:00',
        '10-07T16:00',
        '10-08T00:00',
        '10-08T08:00',
      ]);
    });

    it('si la ventana empieza antes del inicio, la primera toma es la de inicio', () => {
      expect(horas(tomasEntre(cada8, h('00:00'), h('12:00')))).toEqual(['10-07T08:00']);
    });

    it('si la ventana empieza a mitad de camino, salta a la siguiente toma', () => {
      expect(horas(tomasEntre(cada8, h('10:00'), dia2('01:00')))).toEqual([
        '10-07T16:00',
        '10-08T00:00',
      ]);
    });

    it('no genera tomas después de la fecha de fin del tratamiento', () => {
      const conFin = { ...cada8, fechaFin: h('20:00') };
      expect(horas(tomasEntre(conFin, h('00:00'), dia2('23:00')))).toEqual([
        '10-07T08:00',
        '10-07T16:00',
      ]);
    });

    it('funciona con frecuencias que no dividen el día (cada 5 horas)', () => {
      const cada5 = {
        fechaInicio: h('06:00'),
        agendaDesde: h('06:00'),
        frecuenciaHoras: 5,
        fechaFin: null,
      };
      expect(horas(tomasEntre(cada5, h('06:00'), dia2('06:00')))).toEqual([
        '10-07T06:00',
        '10-07T11:00',
        '10-07T16:00',
        '10-07T21:00',
        '10-08T02:00',
      ]);
    });

    it('devuelve una lista vacía si la ventana es inválida', () => {
      expect(tomasEntre(cada8, dia2('00:00'), h('00:00'))).toEqual([]);
    });
  });

  describe('proximaToma', () => {
    const vigente = { ...cada8, estado: 'VIGENTE' as const };

    it('es la siguiente toma a partir de ahora', () => {
      expect(proximaToma(vigente, h('09:30'))?.toISOString()).toBe(h('16:00').toISOString());
    });

    it('una toma que corresponde justo ahora sigue siendo la próxima', () => {
      expect(proximaToma(vigente, h('16:00'))?.toISOString()).toBe(h('16:00').toISOString());
    });

    it('antes del inicio, la próxima es la primera', () => {
      expect(proximaToma(vigente, h('01:00'))?.toISOString()).toBe(h('08:00').toISOString());
    });

    it('no hay próxima toma si el tratamiento terminó o no está vigente', () => {
      expect(proximaToma({ ...vigente, fechaFin: h('20:00') }, h('21:00'))).toBeNull();
      expect(proximaToma({ ...vigente, estado: 'SUSPENDIDA' }, h('09:00'))).toBeNull();
    });
  });

  describe('tomaMasCercana', () => {
    it('asocia un momento a la toma programada más próxima', () => {
      expect(tomaMasCercana(cada8, h('15:20'))?.toISOString()).toBe(h('16:00').toISOString());
      expect(tomaMasCercana(cada8, h('11:00'))?.toISOString()).toBe(h('08:00').toISOString());
    });

    it('antes del inicio no hay toma asociada', () => {
      expect(tomaMasCercana(cada8, h('03:00'))).toBeNull();
    });

    it('la primera toma del tratamiento se puede adelantar hasta media frecuencia', () => {
      expect(tomaMasCercana(cada8, h('04:30'))?.toISOString()).toBe(h('08:00').toISOString());
    });
  });
});

describe('proximaTomaPendiente', () => {
  const vigente = { ...cada8, estado: 'VIGENTE' as const };
  const pendiente = (ahora: Date, administraciones: Date[] = []) =>
    proximaTomaPendiente(vigente, ahora, administraciones)?.toISOString();

  it('una toma de hace pocos minutos que no se dio sigue siendo la próxima', () => {
    expect(pendiente(h('08:10'))).toBe(h('08:00').toISOString());
  });

  it('si esa toma ya se administró, la próxima es la siguiente', () => {
    // La administración de las 08:05 guardó la toma de las 08:00 (D121).
    expect(pendiente(h('08:10'), [h('08:00')])).toBe(h('16:00').toISOString());
  });

  it('una toma atrasada más de media hora ya no se muestra como próxima', () => {
    expect(pendiente(h('08:45'))).toBe(h('16:00').toISOString());
  });

  it('no hay próxima toma si la prescripción no está vigente', () => {
    expect(proximaTomaPendiente({ ...vigente, estado: 'FINALIZADA' }, h('08:10'), [])).toBeNull();
  });
});

/**
 * D112 · D122: al reanudar o cambiar la frecuencia, la agenda se vuelve a anclar (agendaDesde) y
 * las tomas se cuentan desde ahí con la frecuencia vigente. D121: lo ya dado se sabe por la toma
 * que guardó cada administración al registrarse, así que el historial no cambia.
 */
describe('agenda re-anclada (D112 · D121 · D122)', () => {
  const lista = (fechas: Date[]) => horas(fechas);
  const cada6 = {
    fechaInicio: h('00:00'),
    agendaDesde: h('00:00'),
    frecuenciaHoras: 6,
    fechaFin: null,
  };

  describe('cambio de frecuencia: cada 6 h con dosis a las 06:00 y 12:00, a las 13:00 pasa a cada 12 h', () => {
    // Las tomas que guardaron las administraciones (D121).
    const dadas = [h('00:00'), h('06:00'), h('12:00')];
    const ancla = anclaPorCambioDeFrecuencia(cada6, h('13:00'), h('12:00'));
    const cada12 = { ...cada6, agendaDesde: ancla, frecuenciaHoras: 12, estado: 'VIGENTE' };

    it('el ancla es la toma de la última dosis dada', () => {
      expect(ancla.toISOString()).toBe(h('12:00').toISOString());
    });

    it('la próxima toma es 12 h después de la última dosis (00:00), sin saltear ninguna', () => {
      expect(proximaTomaPendiente(cada12, h('13:00'), dadas)?.toISOString()).toBe(
        dia2('00:00').toISOString(),
      );
      // Pasadas las 00:00 sin darla, sigue siendo la próxima durante el margen.
      expect(proximaTomaPendiente(cada12, dia2('00:20'), dadas)?.toISOString()).toBe(
        dia2('00:00').toISOString(),
      );
    });

    it('las tomas de las próximas 24 h empiezan por la próxima', () => {
      expect(lista(tomasEntre(cada12, h('13:00'), dia2('13:00')))).toEqual([
        '10-08T00:00',
        '10-08T12:00',
      ]);
    });

    it('la toma de la última dosis es la toma 0 de la agenda nueva, ya dada', () => {
      expect(tomasDadas(dadas).has(cada12.agendaDesde.getTime())).toBe(true);
      // Una dosis de más a las 13:10 es de esa toma (la que ya se dio), no de la siguiente.
      expect(tomaMasCercana(cada12, h('13:10'))?.toISOString()).toBe(h('12:00').toISOString());
    });
  });

  it('una dosis tardía (12:40 de la toma de las 12:00) ancla en su toma, no en la hora en que se dio', () => {
    // La dosis guardó la toma de las 12:00 (D121): la agenda nueva sigue ese horario.
    const ancla = anclaPorCambioDeFrecuencia(cada6, h('13:00'), h('12:00'));
    expect(ancla.toISOString()).toBe(h('12:00').toISOString());
    const cada12 = { ...cada6, agendaDesde: ancla, frecuenciaHoras: 12, estado: 'VIGENTE' };
    expect(proximaTomaPendiente(cada12, h('13:00'), [h('12:00')])?.toISOString()).toBe(
      dia2('00:00').toISOString(),
    );
  });

  describe('con una toma sin dar después de la última dosis (la de las 12:00, vencida)', () => {
    // Dosis a las 00:00 y 06:00; a las 13:00 pasa a cada 12 h.
    const ancla = anclaPorCambioDeFrecuencia(cada6, h('13:00'), h('06:00'));
    const cada12 = { ...cada6, agendaDesde: ancla, frecuenciaHoras: 12, estado: 'VIGENTE' };

    it('el ancla es ahora: la toma atrasada se da ya', () => {
      expect(ancla.toISOString()).toBe(h('13:00').toISOString());
      expect(proximaTomaPendiente(cada12, h('13:00'), [h('00:00'), h('06:00')])).toEqual(
        h('13:00'),
      );
    });

    it('la dosis tardía de las 13:10 es de la toma de las 13:00 y la siguiente es a la 01:00', () => {
      expect(tomaMasCercana(cada12, h('13:10'))).toEqual(h('13:00'));
      expect(proximaTomaPendiente(cada12, h('13:10'), [h('06:00'), h('13:00')])).toEqual(
        dia2('01:00'),
      );
    });

    it('el recordatorio vencido de las 12:00 ya no es de la agenda nueva; el de la 01:00 sí', () => {
      expect(esTomaDeLaAgenda(cada12, h('12:00'))).toBe(false);
      expect(esTomaDeLaAgenda(cada12, dia2('01:00'))).toBe(true);
      expect(esTomaDeLaAgenda(cada12, h('19:00'))).toBe(false);
    });
  });

  it('una toma que todavía no llegó no cuenta como atrasada', () => {
    // Última dosis la de las 06:00; a las 11:50 la de las 12:00 todavía no venció.
    expect(anclaPorCambioDeFrecuencia(cada6, h('11:50'), h('06:00'))).toEqual(h('06:00'));
  });

  it('sin dosis dadas en la agenda vigente, el ancla es ahora', () => {
    expect(anclaPorCambioDeFrecuencia(cada6, h('13:00'), null).toISOString()).toBe(
      h('13:00').toISOString(),
    );
  });

  it('en la agenda original, una primera dosis adelantada (07:45) ancla en su toma (08:00)', () => {
    expect(anclaPorCambioDeFrecuencia(cada8, h('09:00'), h('08:00')).toISOString()).toBe(
      h('08:00').toISOString(),
    );
  });

  describe('antes de que empiece el tratamiento', () => {
    const futura = {
      fechaInicio: dia2('08:00'),
      agendaDesde: dia2('08:00'),
      frecuenciaHoras: 8,
      fechaFin: null,
    };

    it('reanudar o cambiar la frecuencia sin dosis dadas no adelanta el inicio', () => {
      expect(anclaAlReanudar(futura, h('15:00')).toISOString()).toBe(dia2('08:00').toISOString());
      expect(anclaPorCambioDeFrecuencia(futura, h('15:00'), null).toISOString()).toBe(
        dia2('08:00').toISOString(),
      );
    });

    it('ya empezado, reanudar ancla en ese momento', () => {
      expect(anclaAlReanudar(futura, dia2('15:00')).toISOString()).toBe(
        dia2('15:00').toISOString(),
      );
    });
  });

  describe('reanudar a las 15:00 una de cada 8 h', () => {
    // Iba desde las 00:00 cada 8 h; la última dosis antes de suspender fue la de las 08:00.
    const reanudada = {
      fechaInicio: h('00:00'),
      agendaDesde: h('15:00'),
      frecuenciaHoras: 8,
      fechaFin: null,
      estado: 'VIGENTE',
    };

    it('la próxima toma es ahora (15:00) y la siguiente a las 23:00', () => {
      expect(proximaTomaPendiente(reanudada, h('15:00'), [h('08:00')])?.toISOString()).toBe(
        h('15:00').toISOString(),
      );
      expect(lista(tomasEntre(reanudada, h('15:00'), dia2('07:00')))).toEqual([
        '10-07T15:00',
        '10-07T23:00',
        '10-08T07:00',
      ]);
    });

    it('lo dado antes de reanudar es de otra toma; un momento anterior al ancla es de la toma 0', () => {
      expect(tomasDadas([h('08:00')]).has(h('15:00').getTime())).toBe(false);
      expect(tomaMasCercana(reanudada, h('14:59'))).toEqual(h('15:00'));
      expect(tomaMasCercana(reanudada, h('15:10'))?.toISOString()).toBe(h('15:00').toISOString());
    });
  });
});
