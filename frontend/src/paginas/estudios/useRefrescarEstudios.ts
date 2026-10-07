import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CLAVE_ESTUDIOS, type Estudio } from '../../api/estudios';
import { CLAVE_RECORDATORIOS } from '../../api/recordatorios';
import type { TipoAlerta } from '../../componentes/Alerta';
import { MENSAJE_NO_PROGRAMADO } from './etiquetas';

/** Cómo terminó una acción sobre un estudio, para avisarlo en la pantalla que la abrió. */
export interface ResultadoEstudio {
  tipo: TipoAlerta;
  texto: string;
  /** El estudio como quedó (no viene si otra persona ya lo había cerrado). */
  estudio?: Estudio;
}

/** 409 ESTUDIO_NO_PROGRAMADO: no se reintenta; se avisa, se recarga y se remite al historial. */
export const RESULTADO_NO_PROGRAMADO: ResultadoEstudio = {
  tipo: 'advertencia',
  texto: `${MENSAJE_NO_PROGRAMADO}. Revise el historial.`,
};

/**
 * Después de programar, reprogramar, cancelar o confirmar: vuelve a pedir los estudios (de todos
 * los pacientes y el detalle), el historial del paciente y los recordatorios, que pudieron
 * cancelarse o atenderse con el estudio.
 */
export function useRefrescarEstudios() {
  const clienteQuery = useQueryClient();
  return useCallback(
    (estudio?: Pick<Estudio, 'id' | 'pacienteId'>) => {
      void clienteQuery.invalidateQueries({ queryKey: [CLAVE_ESTUDIOS] });
      void clienteQuery.invalidateQueries({ queryKey: [CLAVE_RECORDATORIOS] });
      if (estudio) {
        void clienteQuery.invalidateQueries({ queryKey: ['estudio', estudio.id] });
        void clienteQuery.invalidateQueries({ queryKey: ['historial', estudio.pacienteId] });
      }
    },
    [clienteQuery],
  );
}
