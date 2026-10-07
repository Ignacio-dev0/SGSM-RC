import { Badge, IconButton } from '@mui/material';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import { Link as EnlaceRouter } from 'react-router-dom';
import { useRecordatorios } from '../api/recordatorios';
import { AyudaFlotante } from '../componentes/AyudaFlotante';

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
 * con contorno neutro (la diferencia no depende solo del color).
 */
export function InsigniaRecordatorios() {
  const { data } = useRecordatorios();
  const total = data?.meta.total ?? 0;
  const hayUrgentes = (data?.meta.urgentes ?? 0) > 0;

  return (
    <AyudaFlotante texto="Recordatorios">
      <IconButton
        component={EnlaceRouter}
        to="/recordatorios"
        color="inherit"
        aria-label={etiquetaInsignia(data?.meta)}
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
      </IconButton>
    </AyudaFlotante>
  );
}
