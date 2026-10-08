import type { TipoRecordatorio } from '../../api/recordatorios';
import {
  ASPECTO_URGENCIA,
  contarUrgentes,
  minutosHasta,
  nivelDeUrgencia,
  textoTiempo,
} from './urgencia';

const NBSP = String.fromCharCode(160);

describe('nivel de urgencia de un recordatorio (escala de DESIGN.md)', () => {
  it.each([
    [{ estado: 'VENCIDO', prioridad: 'ALTA' }, 'VENCIDA'],
    [{ estado: 'VENCIDO', prioridad: 'BAJA' }, 'VENCIDA'],
    [{ estado: 'PENDIENTE', prioridad: 'ALTA' }, 'URGENTE'],
    [{ estado: 'PENDIENTE', prioridad: 'MEDIA' }, 'PRONTO'],
    [{ estado: 'PENDIENTE', prioridad: 'BAJA' }, 'PROGRAMADA'],
  ] as const)('%o → %s', (r, nivel) => {
    expect(nivelDeUrgencia(r)).toBe(nivel);
  });

  it.each([
    // Un estudio siempre llega con MEDIA ("Pronto"): atrasado ya es urgente (E5-02).
    [{ estado: 'PENDIENTE', prioridad: 'MEDIA' }, -3, 'URGENTE'],
    [{ estado: 'PENDIENTE', prioridad: 'BAJA' }, -1, 'URGENTE'],
    [{ estado: 'PENDIENTE', prioridad: 'MEDIA' }, 0, 'PRONTO'],
    [{ estado: 'PENDIENTE', prioridad: 'MEDIA' }, 3, 'PRONTO'],
    [{ estado: 'PENDIENTE', prioridad: 'BAJA' }, 25, 'PROGRAMADA'],
    [{ estado: 'VENCIDO', prioridad: 'MEDIA' }, -45, 'VENCIDA'],
  ] as const)(
    'con la hora del servidor, %o a %i min → %s (lo atrasado no espera al servidor)',
    (r, minutos, nivel) => {
      expect(nivelDeUrgencia(r, minutos)).toBe(nivel);
    },
  );

  it('cuenta como urgentes lo vencido, lo de prioridad alta y lo atrasado (aunque el servidor no lo cuente)', () => {
    const ahora = Date.parse('2026-10-07T15:00:00.000Z');
    const en = (min: number) => new Date(ahora + min * 60_000).toISOString();
    const lista = [
      { estado: 'VENCIDO', prioridad: 'BAJA', fechaHoraObjetivo: en(-45) },
      { estado: 'PENDIENTE', prioridad: 'ALTA', fechaHoraObjetivo: en(3) },
      // Estudio atrasado: el servidor lo deja en MEDIA y no lo cuenta en meta.urgentes.
      { estado: 'PENDIENTE', prioridad: 'MEDIA', fechaHoraObjetivo: en(-10) },
      { estado: 'PENDIENTE', prioridad: 'MEDIA', fechaHoraObjetivo: en(12) },
      { estado: 'PENDIENTE', prioridad: 'BAJA', fechaHoraObjetivo: en(25) },
    ] as const;
    expect(contarUrgentes(lista, ahora)).toBe(3);
    expect(contarUrgentes([], ahora)).toBe(0);
  });

  it('lo urgente y lo vencido van rellenos de advertencia; nunca verde ni rojo', () => {
    expect(ASPECTO_URGENCIA.VENCIDA).toMatchObject({ color: 'warning', variante: 'filled' });
    expect(ASPECTO_URGENCIA.URGENTE).toMatchObject({ color: 'warning', variante: 'filled' });
    for (const a of Object.values(ASPECTO_URGENCIA)) {
      expect(['warning', 'primary', 'default']).toContain(a.color);
    }
  });

  it('cada nivel tiene su texto y su ícono: nunca solo el color', () => {
    const etiquetas = (tipo: TipoRecordatorio) =>
      Object.values(ASPECTO_URGENCIA).map((a) => a.etiqueta[tipo]);
    expect(etiquetas('MEDICAMENTO')).toEqual(['Vencida', 'Urgente', 'Pronto', 'Programada']);
    // El estudio concuerda en masculino.
    expect(etiquetas('ESTUDIO')).toEqual(['Vencido', 'Urgente', 'Pronto', 'Programado']);
    const iconos = new Set(Object.values(ASPECTO_URGENCIA).map((a) => a.Icono));
    expect(iconos.size).toBe(4);
  });
});

describe('cuánto falta para la toma, con la hora del servidor', () => {
  const toma = '2026-10-07T12:00:00.000Z';
  const ms = (iso: string) => new Date(iso).getTime();

  it('cuenta minutos enteros hasta la toma (negativos si ya pasó)', () => {
    expect(minutosHasta(toma, ms('2026-10-07T11:48:00.000Z'))).toBe(12);
    expect(minutosHasta(toma, ms('2026-10-07T12:08:00.000Z'))).toBe(-8);
    expect(minutosHasta(toma, ms('2026-10-07T11:59:40.000Z'))).toBe(0);
  });

  it('"Faltan 12 min", "Atrasada 8 min", "Toca ahora", sin cortar número y unidad', () => {
    expect(textoTiempo(12)).toBe(`Faltan 12${NBSP}min`);
    expect(textoTiempo(-8)).toBe(`Atrasada 8${NBSP}min`);
    expect(textoTiempo(-65)).toBe(`Atrasada 1${NBSP}h 5${NBSP}min`);
    expect(textoTiempo(0)).toBe('Toca ahora');
  });

  it('lo vencido dice cuánto hace de la toma, no "Atrasada": el chip ya dice "Vencida" (E5-11)', () => {
    expect(textoTiempo(-45, 'MEDICAMENTO', true)).toBe(`Hace 45${NBSP}min`);
    expect(textoTiempo(-75, 'ESTUDIO', true)).toBe(`Hace 1${NBSP}h 15${NBSP}min`);
  });

  it('un estudio atrasado se dice en masculino: "Atrasado 8 min"', () => {
    expect(textoTiempo(-8, 'ESTUDIO')).toBe(`Atrasado 8${NBSP}min`);
    expect(textoTiempo(12, 'ESTUDIO')).toBe(`Faltan 12${NBSP}min`);
    expect(textoTiempo(0, 'ESTUDIO')).toBe('Toca ahora');
  });
});
