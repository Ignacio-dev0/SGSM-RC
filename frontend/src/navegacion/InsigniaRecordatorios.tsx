import { Badge, Box, IconButton } from '@mui/material';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import WifiOffOutlinedIcon from '@mui/icons-material/WifiOffOutlined';
import { Link as EnlaceRouter } from 'react-router-dom';
import { useRecordatorios } from '../api/recordatorios';
import { AyudaFlotante } from '../componentes/AyudaFlotante';
import { contarUrgentes } from '../paginas/recordatorios/urgencia';
import { useTiempoReal } from '../tiempoReal/contexto';
import { useAhora } from '../utilidades/useAhora';

/** Lo atrasado se vuelve urgente con el paso del tiempo: se recalcula cada tanto. */
const REFRESCO_MS = 30_000;

/** "Recordatorios: 7 para atender, 2 urgentes" (o solo "Recordatorios" mientras carga). */
function etiquetaInsignia(meta: { total: number; urgentes: number } | undefined) {
  if (!meta) return 'Recordatorios';
  const urgentes = meta.urgentes === 1 ? '1 urgente' : `${meta.urgentes} urgentes`;
  return `Recordatorios: ${meta.total} para atender, ${urgentes}`;
}

/**
 * Recordatorios en la barra superior (T506): cuántos hay para atender en todo el hospital y un
 * toque para ir a la lista. Usa la misma consulta que la lista sin filtros, así el tiempo real
 * actualiza las dos juntas. Con urgentes, la cantidad va rellena de advertencia; sin urgentes,
 * con contorno neutro (la diferencia no depende solo del color). Sin tiempo real lleva abajo el
 * ícono de sin señal y lo dice (E5-03): se ve en cualquier pantalla, no solo en el panel.
 */
export function InsigniaRecordatorios() {
  const { data } = useRecordatorios();
  const { desfaseMs, estado } = useTiempoReal();
  const sinTiempoReal = estado === 'sin-conexion';
  const ahoraServidorMs = useAhora(REFRESCO_MS).getTime() + desfaseMs;
  const total = data?.meta.total ?? 0;
  // Con la misma regla que el chip de las tarjetas: lo atrasado también es urgente (E5-02).
  const urgentes = data ? contarUrgentes(data.data, ahoraServidorMs) : 0;
  const hayUrgentes = urgentes > 0;

  return (
    <AyudaFlotante
      texto={sinTiempoReal ? 'Recordatorios (sin avisos en tiempo real)' : 'Recordatorios'}
    >
      <IconButton
        component={EnlaceRouter}
        to="/recordatorios"
        color="inherit"
        aria-label={`${etiquetaInsignia(data && { total, urgentes })}${sinTiempoReal ? '; sin avisos en tiempo real' : ''}`}
      >
        <Badge
          badgeContent={total}
          max={99}
          color={hayUrgentes ? 'warning' : 'default'}
          sx={
            hayUrgentes
              ? undefined
              : {
                  '& .MuiBadge-badge': {
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    border: 1,
                    borderColor: 'text.secondary',
                  },
                }
          }
        >
          <AlarmOutlinedIcon />
        </Badge>
        {sinTiempoReal && (
          // Abajo a la izquierda, lejos de la cantidad; con fondo propio para leerse en la barra.
          <Box
            component="span"
            sx={{
              position: 'absolute',
              left: 2,
              bottom: 2,
              display: 'grid',
              placeItems: 'center',
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: 1,
              borderColor: 'warning.main',
              bgcolor: 'background.paper',
              color: 'warning.main',
            }}
          >
            <WifiOffOutlinedIcon sx={{ fontSize: 14 }} />
          </Box>
        )}
      </IconButton>
    </AyudaFlotante>
  );
}
