import { config } from '../../config';
import { tomasDadas, tomasEntre, type DatosAgenda } from '../prescripciones/agenda';

/**
 * Qué tomas se recuerdan (T502 · S9). Funciones puras sobre la agenda de las prescripciones:
 * las tomas entre `anticipación` minutos antes y después de ahora que todavía no tienen una
 * administración (cada una cuenta para la toma que guardó al registrarse, D121).
 * Las de más atrás no se recuperan: tras una caída solo vuelven las de los últimos 30 min.
 */

export interface PrescripcionParaRecordar extends DatosAgenda {
  id: number;
  pacienteId: number;
  /** Tomas que ya tienen una administración: las que guardaron al registrarse (D121). */
  tomasDadas: Date[];
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
    const dadas = tomasDadas(p.tomasDadas);
    return tomasEntre(p, desde, hasta)
      .filter((toma) => !dadas.has(toma.getTime()))
      .map((toma) => ({ prescripcionId: p.id, pacienteId: p.pacienteId, fechaHoraObjetivo: toma }));
  });
}
