import { Box, Chip, Paper, Typography } from '@mui/material';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import type { Recordatorio } from '../../api/recordatorios';
import { Boton } from '../../componentes/Boton';
import { formatearHora, sinCortes } from '../../utilidades/formato';
import { ubicacionCama } from '../pacientes/etiquetas';
import { etiquetaVia, formatearDosis } from '../prescripciones/etiquetas';
import {
  ASPECTO_URGENCIA,
  minutosHasta,
  nivelDeUrgencia,
  nombrePaciente,
  textoTiempo,
  type NivelUrgencia,
} from './urgencia';

/** Chip de urgencia: mismo tamaño que ChipEstado (28 px, 14 px), con ícono y texto. */
function ChipUrgencia({ nivel }: { nivel: NivelUrgencia }) {
  const { etiqueta, color, variante, Icono } = ASPECTO_URGENCIA[nivel];
  return (
    <Chip
      icon={<Icono />}
      label={etiqueta}
      color={color}
      variant={variante}
      sx={{ height: 28, fontSize: '0.875rem', fontWeight: 700 }}
    />
  );
}

interface Props {
  r: Recordatorio;
  /** "Ahora" con la hora del servidor (corrige el reloj de la tablet, R6). */
  ahoraServidorMs: number;
  /** Quien atiende (`recordatorios.atender`) ve "No se administró". */
  atiende: boolean;
  /** Y "Administrar" si además puede registrar suministros. */
  administra: boolean;
  alAdministrar: (r: Recordatorio) => void;
  alNoAdministrar: (r: Recordatorio) => void;
}

/**
 * Una toma para atender: urgencia, hora grande y cuánto falta arriba (lo que se mira primero),
 * después quién (nombre, DNI y cama: el paciente siempre identificado) y qué se le da. Lo urgente y
 * lo vencido llevan además el borde de advertencia. Administrar (con contorno) va al final y "No se
 * administró", menos frecuente, como texto.
 */
export function TarjetaRecordatorio({
  r,
  ahoraServidorMs,
  atiende,
  administra,
  alAdministrar,
  alNoAdministrar,
}: Props) {
  const nivel = nivelDeUrgencia(r);
  const urgente = nivel === 'VENCIDA' || nivel === 'URGENTE';
  const hora = formatearHora(r.fechaHoraObjetivo);
  const paciente = nombrePaciente(r);
  const p = r.prescripcion;

  return (
    <Paper
      component="li"
      variant="outlined"
      aria-label={`Toma de las ${hora} · ${paciente}`}
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        minWidth: 0,
        ...(urgente && { borderColor: 'warning.main', borderWidth: 2 }),
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box>
          <Typography
            component="p"
            sx={{
              fontSize: '2.25rem',
              fontWeight: 700,
              lineHeight: 1.1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {hora}
          </Typography>
          <Typography sx={{ fontWeight: 700 }}>
            {textoTiempo(minutosHasta(r.fechaHoraObjetivo, ahoraServidorMs))}
          </Typography>
        </Box>
        <ChipUrgencia nivel={nivel} />
      </Box>

      <Box>
        <Typography variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>
          {paciente}
        </Typography>
        <Typography color="text.secondary">
          DNI {r.paciente.dni} · {r.cama ? ubicacionCama(r.cama) : 'Sin cama asignada'}
        </Typography>
      </Box>

      {p ? (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <MedicationOutlinedIcon sx={{ color: 'primary.main', mt: 0.25 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '1.125rem', overflowWrap: 'anywhere' }}>
              {sinCortes(p.medicamento)} {formatearDosis(p.dosis, p.unidadDosis)}
            </Typography>
            <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {etiquetaVia(p.via)}
              {p.presentacion && ` · ${sinCortes(p.presentacion)}`}
            </Typography>
          </Box>
        </Box>
      ) : (
        r.estudio && <Typography sx={{ fontWeight: 700 }}>Estudio: {r.estudio.nombre}</Typography>
      )}

      {atiende && p && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            mt: 'auto',
            pt: 0.5,
            // Si no entran en una fila se apilan a lo ancho: Administrar abajo, donde llega el pulgar.
            '& > *': { flex: '1 1 160px' },
          }}
        >
          <Boton
            variante="texto"
            aria-label={`No se administró ${p.medicamento} a ${paciente}`}
            onClick={() => alNoAdministrar(r)}
          >
            No se administró
          </Boton>
          {administra && (
            // Con contorno, como en la ficha: en un listado ninguna fila lleva la acción llena
            // (DESIGN.md: una sola acción llena por pantalla).
            <Boton
              variante="secundario"
              startIcon={<MedicationOutlinedIcon />}
              aria-label={`Administrar ${p.medicamento} a ${paciente}`}
              onClick={() => alAdministrar(r)}
            >
              Administrar
            </Boton>
          )}
        </Box>
      )}
    </Paper>
  );
}
