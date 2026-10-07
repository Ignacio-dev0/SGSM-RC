import { config } from '../../config';
import { tomaMasCercana, tomasEntre, type DatosAgenda } from '../prescripciones/agenda';

/**
 * Qué tomas se recuerdan (T502 · S9). Funciones puras sobre la agenda de las prescripciones:
 * las tomas entre `anticipación` minutos antes y después de ahora que todavía no tienen una
 * administración (una administración cuenta para su toma más cercana, como en el historial).
 * Las de más atrás no se recuperan: tras una caída solo vuelven las de los últimos 30 min.
 */

export interface PrescripcionParaRecordar extends DatosAgenda {
  id: number;
  pacienteId: number;
  /** Momentos de las administraciones registradas de la prescripción. */
  administraciones: Date[];
}

export interface TomaParaRecordar {
  prescripcionId: number;
  pacienteId: number;
  fechaHoraObjetivo: Date;
}

export function ventanaDeGeneracion(ahora: Date) {
  const margen = config.recordatorios.anticipacionMinutos * 60_000;
  return {
    desde: new Date(ahora.getTime() - margen),
    hasta: new Date(ahora.getTime() + margen),
  };
}

export function tomasParaRecordar(
  prescripciones: PrescripcionParaRecordar[],
  ahora: Date,
): TomaParaRecordar[] {
  const { desde, hasta } = ventanaDeGeneracion(ahora);
  return prescripciones.flatMap((p) => {
    const dadas = new Set(p.administraciones.map((a) => tomaMasCercana(p, a)?.getTime()));
    return tomasEntre(p, desde, hasta)
      .filter((toma) => !dadas.has(toma.getTime()))
      .map((toma) => ({ prescripcionId: p.id, pacienteId: p.pacienteId, fechaHoraObjetivo: toma }));
  });
}
