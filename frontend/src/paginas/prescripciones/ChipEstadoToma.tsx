import { Chip } from '@mui/material';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import type { Prescripcion } from '../../api/tipos';
import {
  colorEstadoToma,
  estadoToma,
  textoEstadoToma,
  varianteEstadoToma,
} from '../suministros/estadoToma';

/**
 * En qué punto está la toma de una prescripción vigente ("Toca ahora", "Atrasada 1 h"…), para
 * verlo sin abrirla. Una prescripción suspendida o finalizada no tiene tomas: no muestra nada.
 * Se ve igual que en la tarjeta de Administrar: mismo color, variante e ícono.
 */
export function ChipEstadoToma({
  prescripcion: p,
  ahora,
  tamano = 'small',
}: {
  prescripcion: Prescripcion;
  ahora: Date;
  tamano?: 'small' | 'medium';
}) {
  if (p.estado !== 'VIGENTE') return null;
  const estado = estadoToma(p, ahora);
  return (
    <Chip
      size={tamano}
      label={textoEstadoToma(estado)}
      color={colorEstadoToma(estado)}
      variant={varianteEstadoToma(estado)}
      // Una toma ya dada avisa también con el ícono, no solo con el color.
      icon={estado.tipo === 'dada' ? <HistoryOutlinedIcon /> : undefined}
    />
  );
}
