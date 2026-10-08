import { mensajeDeError } from '../../api/cliente';
import type { Recordatorio } from '../../api/recordatorios';
import { Alerta } from '../../componentes/Alerta';
import { ModalConfirmacion } from '../../componentes/ModalConfirmacion';
import { formatearHora, sinCortes } from '../../utilidades/formato';
import { formatearCama } from '../pacientes/etiquetas';
import { etiquetaVia, formatearDosis } from '../prescripciones/etiquetas';
import { nombrePaciente } from './urgencia';

/** Qué toma, de quién y que no se deshace: lo que hay que leer antes de confirmar. */
function mensaje(r: Recordatorio) {
  const p = r.prescripcion;
  const que = p
    ? `${sinCortes(p.medicamento)} ${formatearDosis(p.dosis, p.unidadDosis)}, ${etiquetaVia(p.via).toLowerCase()}`
    : 'La toma';
  const cama = r.cama ? `cama ${formatearCama(r.cama.numero)}` : 'sin cama asignada';
  return (
    `${que}, toma de las ${formatearHora(r.fechaHoraObjetivo)}, para ${nombrePaciente(r)} ` +
    `(DNI ${r.paciente.dni}, ${cama}). La toma queda atendida con el motivo y a su nombre; ` +
    'no se puede deshacer.'
  );
}

interface Props {
  /** La toma elegida; null con el diálogo cerrado. */
  recordatorio: Recordatorio | null;
  cargando: boolean;
  /** Un error que se puede reintentar desde el diálogo (sin conexión, validación…). */
  error: unknown;
  alConfirmar: (motivo: string) => void;
  alCancelar: () => void;
}

/**
 * "No se administró" (T507 · S12): la toma queda atendida con el motivo. No pide el rostro (queda
 * auditado con el usuario), pero sí el motivo, de 3 a 255 caracteres como el servidor.
 */
export function DialogoNoAdministrado({
  recordatorio,
  cargando,
  error,
  alConfirmar,
  alCancelar,
}: Props) {
  return (
    <ModalConfirmacion
      abierto={recordatorio !== null}
      titulo="No se administró"
      mensaje={recordatorio ? mensaje(recordatorio) : ''}
      textoConfirmar="Registrar"
      pedirMotivo
      etiquetaMotivo="Por qué no se administró"
      ayudaMotivo="Por ejemplo: en ayunas para un estudio, la rechazó, no estaba en la sala"
      cargando={cargando}
      alConfirmar={(motivo) => alConfirmar(motivo ?? '')}
      alCancelar={alCancelar}
    >
      {Boolean(error) && (
        <Alerta tipo="error" titulo="No se pudo registrar">
          {mensajeDeError(error)}
        </Alerta>
      )}
    </ModalConfirmacion>
  );
}
