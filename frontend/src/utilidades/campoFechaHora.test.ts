import { campoFechaHora, isoDeCampoFechaHora, msDeCampoFechaHora } from './campoFechaHora';

/**
 * Los campos datetime-local muestran y devuelven "AAAA-MM-DDTHH:mm" sin zona. La app muestra
 * todas las horas en hora de Argentina (formato.ts), así que el campo también: si la tablet
 * tuviera otra zona, el campo y el resto de la pantalla dirían horas distintas (E5-16).
 */
describe('campo de fecha y hora en hora de Argentina, sea cual sea la zona del proceso', () => {
  // La zona del sistema, para dejarla como estaba: borrar TZ deja UTC, no la del sistema.
  const original = process.env.TZ;
  const delSistema = Intl.DateTimeFormat().resolvedOptions().timeZone;
  afterEach(() => {
    process.env.TZ = original ?? delSistema;
  });

  describe.each(['Asia/Tokyo', 'UTC', 'America/Argentina/Buenos_Aires', 'Europe/Madrid'])(
    'con la zona %s',
    (zona) => {
      beforeEach(() => {
        process.env.TZ = zona;
      });

      it('un ISO se muestra en el campo con la hora de Argentina', () => {
        // 13:00 UTC = 10:00 en Argentina.
        expect(campoFechaHora('2026-10-08T13:00:00.000Z')).toBe('2026-10-08T10:00');
        // Cambia el día: 02:30 UTC del 9 = 23:30 del 8 en Argentina.
        expect(campoFechaHora('2026-10-09T02:30:00.000Z')).toBe('2026-10-08T23:30');
        expect(campoFechaHora(new Date('2026-10-08T13:00:42.500Z'))).toBe('2026-10-08T10:00');
      });

      it('lo elegido en el campo se manda como esa hora de Argentina', () => {
        expect(isoDeCampoFechaHora('2026-10-08T10:00')).toBe('2026-10-08T13:00:00.000Z');
        expect(isoDeCampoFechaHora('2026-10-08T23:30')).toBe('2026-10-09T02:30:00.000Z');
        expect(msDeCampoFechaHora('2026-10-08T10:00')).toBe(Date.parse('2026-10-08T13:00:00Z'));
      });

      it('ida y vuelta da lo mismo', () => {
        const iso = '2026-12-31T23:59:00.000Z';
        expect(isoDeCampoFechaHora(campoFechaHora(iso))).toBe(iso);
      });
    },
  );

  it('un valor vacío o mal formado no es una fecha', () => {
    expect(msDeCampoFechaHora('')).toBeNaN();
    expect(msDeCampoFechaHora('2026-13-40T99:00')).toBeNaN();
    expect(msDeCampoFechaHora('mañana')).toBeNaN();
    expect(isoDeCampoFechaHora('')).toBe('');
  });
});
