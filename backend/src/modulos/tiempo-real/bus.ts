import { reloj } from '../../comun/reloj';

/**
 * Bus de avisos en memoria (T505 · D10). Los servicios publican DESPUÉS de confirmar su
 * transacción y el servidor de tiempo real reenvía cada aviso a las conexiones abiertas. Vive en
 * el proceso: con varias instancias haría falta LISTEN/NOTIFY de PostgreSQL (riesgo R2).
 */

/** Aviso de que los recordatorios cambiaron: solo cantidades, nunca datos del paciente (D18). */
export interface AvisoRecordatorios {
  tipo: 'recordatorios';
  /** Recordatorios que aparecieron con este cambio (tono y vibración para quien atiende). */
  nuevos: number;
  /** Recordatorios que vencieron con este cambio (el administrador recarga sus notificaciones). */
  vencidos: number;
  /** Hora del servidor (ISO). */
  momento: string;
}

type Oyente = (aviso: AvisoRecordatorios) => void;

const oyentes = new Set<Oyente>();

export const bus = {
  /** Devuelve la función que da de baja la suscripción. */
  suscribir(oyente: Oyente): () => void {
    oyentes.add(oyente);
    return () => {
      oyentes.delete(oyente);
    };
  },

  publicar(aviso: AvisoRecordatorios) {
    for (const oyente of oyentes) {
      try {
        oyente(aviso);
      } catch (e) {
        console.error('Un suscriptor del tiempo real falló', e);
      }
    }
  },
};

/** Avisa que los recordatorios cambiaron. Llamarlo después del commit, nunca adentro. */
export function avisarCambioRecordatorios(cambios: { nuevos?: number; vencidos?: number } = {}) {
  bus.publicar({
    tipo: 'recordatorios',
    nuevos: cambios.nuevos ?? 0,
    vencidos: cambios.vencidos ?? 0,
    momento: reloj.ahora().toISOString(),
  });
}
