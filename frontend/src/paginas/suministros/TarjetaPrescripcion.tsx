import { Box, Card, CardActionArea, CardContent, Chip, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { Prescripcion } from '../../api/tipos';
import { formatearFechaHora, formatearHora } from '../../utilidades/formato';
import { etiquetaVia, formatearDosis, formatearFrecuencia } from '../prescripciones/etiquetas';
import { colorEstadoToma, estadoToma, textoEstadoToma } from './estadoToma';

/** Prescripción vigente para elegir al lado de la cama, con el estado de su toma. */
export function TarjetaPrescripcion({
  p,
  elegida,
  ahora,
  alElegir,
}: {
  p: Prescripcion;
  elegida: boolean;
  ahora: Date;
  alElegir: () => void;
}) {
  const ultima = p.ultimasAdministraciones[0];
  const estado = estadoToma(p, ahora);
  return (
    <Card
      variant="outlined"
      sx={{
        borderWidth: 2,
        borderColor: elegida ? 'primary.main' : 'divider',
        bgcolor: elegida ? 'action.selected' : undefined,
      }}
    >
      <CardActionArea onClick={alElegir} aria-pressed={elegida} sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" component="p">
                {p.medicamento.nombre} {formatearDosis(p.dosis, p.unidadDosis)}
              </Typography>
              <Chip
                label={textoEstadoToma(estado)}
                color={colorEstadoToma(estado)}
                variant={
                  estado.tipo === 'falta' || estado.tipo === 'sin-tomas' ? 'outlined' : 'filled'
                }
              />
            </Box>
            <Typography color="text.secondary">
              {etiquetaVia(p.via)} · {formatearFrecuencia(p.frecuenciaHoras)}
              {p.observaciones ? ` · ${p.observaciones}` : ''}
            </Typography>
            <Typography sx={{ mt: 0.5 }}>
              Próxima toma: <strong>{p.proximaToma ? formatearHora(p.proximaToma) : '—'}</strong>
              {ultima && ` · Última: ${formatearFechaHora(ultima.fechaHora)} (${ultima.usuario})`}
            </Typography>
          </Box>
          {elegida && <CheckCircleIcon color="primary" sx={{ fontSize: 36 }} />}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
