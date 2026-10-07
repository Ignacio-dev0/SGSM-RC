import { reloj } from '../../comun/reloj';
import { avisarCambioRecordatorios, bus, type AvisoRecordatorios } from './bus';

const aviso: AvisoRecordatorios = {
  tipo: 'recordatorios',
  nuevos: 1,
  vencidos: 0,
  momento: '2026-10-07T11:00:00.000Z',
};

describe('bus de avisos del tiempo real (T505 · D10 · R2)', () => {
  const bajas: (() => void)[] = [];
  const suscribir = (oyente: (a: AvisoRecordatorios) => void) => {
    bajas.push(bus.suscribir(oyente));
  };

  afterEach(() => {
    bajas.splice(0).forEach((baja) => baja());
    jest.restoreAllMocks();
  });

  it('entrega cada aviso a todos los suscriptos', () => {
    const uno = jest.fn();
    const otro = jest.fn();
    suscribir(uno);
    suscribir(otro);

    bus.publicar(aviso);

    expect(uno).toHaveBeenCalledWith(aviso);
    expect(otro).toHaveBeenCalledWith(aviso);
  });

  it('quien se da de baja deja de recibir avisos', () => {
    const oyente = jest.fn();
    const baja = bus.suscribir(oyente);
    baja();

    bus.publicar(aviso);

    expect(oyente).not.toHaveBeenCalled();
  });

  it('un suscriptor que falla no les corta el aviso a los demás', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const sano = jest.fn();
    suscribir(() => {
      throw new Error('socket roto');
    });
    suscribir(sano);

    expect(() => bus.publicar(aviso)).not.toThrow();
    expect(sano).toHaveBeenCalledWith(aviso);
  });

  it('el aviso de cambio lleva solo cantidades y la hora del servidor (D18)', () => {
    jest.spyOn(reloj, 'ahora').mockReturnValue(new Date('2026-10-07T11:00:00Z'));
    const oyente = jest.fn();
    suscribir(oyente);

    avisarCambioRecordatorios({ nuevos: 2 });
    avisarCambioRecordatorios();

    expect(oyente.mock.calls).toEqual([
      [{ tipo: 'recordatorios', nuevos: 2, vencidos: 0, momento: '2026-10-07T11:00:00.000Z' }],
      [{ tipo: 'recordatorios', nuevos: 0, vencidos: 0, momento: '2026-10-07T11:00:00.000Z' }],
    ]);
  });
});
