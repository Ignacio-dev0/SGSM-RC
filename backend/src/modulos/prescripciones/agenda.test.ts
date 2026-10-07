import { proximaToma, tomaMasCercana, tomasEntre } from './agenda';

const h = (iso: string) => new Date(`2026-10-07T${iso}:00.000Z`);
const dia2 = (iso: string) => new Date(`2026-10-08T${iso}:00.000Z`);
const horas = (fechas: Date[]) => fechas.map((f) => f.toISOString().slice(5, 16));

const cada8 = { fechaInicio: h('08:00'), frecuenciaHoras: 8, fechaFin: null };

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
      const cada5 = { fechaInicio: h('06:00'), frecuenciaHoras: 5, fechaFin: null };
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
  });
});
