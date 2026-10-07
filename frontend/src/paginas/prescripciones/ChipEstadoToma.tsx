import { Chip } from '@mui/material';
import type { Prescripcion } from '../../api/tipos';
import { colorEstadoToma, estadoToma, textoEstadoToma } from '../suministros/estadoToma';

/**
 * En qué punto está la toma de una prescripción vigente ("Toca ahora", "Atrasada 1 h"…), para
 * verlo sin abrirla. Una prescripción suspendida o finalizada no tiene tomas: no muestra nada.
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
      // Lo que ya pasó o toca ahora va lleno; lo que todavía falta, solo con contorno.
      variant={estado.tipo === 'falta' || estado.tipo === 'sin-tomas' ? 'outlined' : 'filled'}
    />
  );
}
