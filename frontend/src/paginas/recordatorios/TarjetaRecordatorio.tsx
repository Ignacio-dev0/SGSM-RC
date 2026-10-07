import type { ReactNode } from 'react';
import { Box, Chip, Paper, Typography } from '@mui/material';
import BiotechOutlinedIcon from '@mui/icons-material/BiotechOutlined';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import type { Recordatorio, TipoRecordatorio } from '../../api/recordatorios';
import { Boton } from '../../componentes/Boton';
import { formatearHora, sinCortes } from '../../utilidades/formato';
import { ubicacionCama } from '../pacientes/etiquetas';
import { etiquetaVia, formatearDosis } from '../prescripciones/etiquetas';
import {
  ASPECTO_URGENCIA,
  esUrgente,
  minutosHasta,
  nivelDeUrgencia,
  nombrePaciente,
  textoTiempo,
  type NivelUrgencia,
} from './urgencia';

/** Chip de urgencia: mismo tamaño que ChipEstado (28 px, 14 px), con ícono y texto. */
function ChipUrgencia({ nivel, tipo }: { nivel: NivelUrgencia; tipo: TipoRecordatorio }) {
  const { etiqueta, color, variante, Icono } = ASPECTO_URGENCIA[nivel];
  return (
    <Chip
      icon={<Icono />}
      label={etiqueta[tipo]}
      color={color}
      variant={variante}
      sx={{ height: 28, fontSize: '0.875rem', fontWeight: 700 }}
    />
  );
}

/** Qué hay que hacer (el medicamento o el estudio), con su ícono a la izquierda. */
function QueSeHace({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
      {icono}
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

const ESTILO_ICONO = { color: 'primary.main', mt: 0.25 } as const;
const ESTILO_QUE = { fontWeight: 700, fontSize: '1.125rem', overflowWrap: 'anywhere' } as const;

/** Botonera de la tarjeta: si no entran en una fila se apilan a lo ancho, la acción abajo. */
function Acciones({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        mt: 'auto',
        pt: 0.5,
        '& > *': { flex: '1 1 160px' },
      }}
    >
      {children}
    </Box>
  );
}

interface Props {
  r: Recordatorio;
  /** "Ahora" con la hora del servidor (corrige el reloj de la tablet, R6). */
  ahoraServidorMs: number;
  /** Quien atiende (`recordatorios.atender`) ve "No se administró" en las tomas. */
  atiende: boolean;
  /** Y "Administrar" si además puede registrar suministros. */
  administra: boolean;
  /** Quien confirma estudios (`estudios.confirmar`) ve "Confirmar que se realizó" en los estudios. */
  confirmaEstudios: boolean;
  alAdministrar: (r: Recordatorio) => void;
  alNoAdministrar: (r: Recordatorio) => void;
  alConfirmarEstudio: (r: Recordatorio) => void;
}

/**
 * Una toma o un estudio para atender: urgencia, hora grande y cuánto falta arriba (lo que se mira
 * primero), después quién (nombre, DNI y cama: el paciente siempre identificado) y qué se hace,
 * con el ícono del medicamento o del estudio. Lo urgente y lo vencido llevan además el borde de
 * advertencia. La acción (Administrar o Confirmar que se realizó, con contorno) va al final; "No
 * se administró", menos frecuente y solo en las tomas, como texto.
 */
export function TarjetaRecordatorio({
  r,
  ahoraServidorMs,
  atiende,
  administra,
  confirmaEstudios,
  alAdministrar,
  alNoAdministrar,
  alConfirmarEstudio,
}: Props) {
  const minutos = minutosHasta(r.fechaHoraObjetivo, ahoraServidorMs);
  const nivel = nivelDeUrgencia(r, minutos);
  const urgente = esUrgente(nivel);
  const hora = formatearHora(r.fechaHoraObjetivo);
  const paciente = nombrePaciente(r);
  const p = r.prescripcion;
  const e = r.estudio;

  return (
    <Paper
      component="li"
      variant="outlined"
      aria-label={`${r.tipo === 'ESTUDIO' ? 'Estudio' : 'Toma'} de las ${hora} · ${paciente}`}
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
            {textoTiempo(minutos, r.tipo, nivel === 'VENCIDA')}
          </Typography>
        </Box>
        <ChipUrgencia nivel={nivel} tipo={r.tipo} />
      </Box>

      <Box>
        <Typography variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>
          {paciente}
        </Typography>
        <Typography color="text.secondary">
          DNI {r.paciente.dni} · {r.cama ? ubicacionCama(r.cama) : 'Sin cama asignada'}
        </Typography>
      </Box>

      {p && (
        <QueSeHace icono={<MedicationOutlinedIcon sx={ESTILO_ICONO} />}>
          <Typography sx={ESTILO_QUE}>
            {sinCortes(p.medicamento)} {formatearDosis(p.dosis, p.unidadDosis)}
          </Typography>
          <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {etiquetaVia(p.via)}
            {p.presentacion && ` · ${sinCortes(p.presentacion)}`}
          </Typography>
        </QueSeHace>
      )}
      {e && (
        <QueSeHace icono={<BiotechOutlinedIcon sx={ESTILO_ICONO} />}>
          <Typography sx={ESTILO_QUE}>{e.nombre}</Typography>
          {e.tipoEstudio !== e.nombre && (
            <Typography color="text.secondary">{e.tipoEstudio}</Typography>
          )}
          {e.preparacion && (
            // Lo que hay que tener listo antes (ayuno, retirar alhajas): se lee sin abrir nada.
            <Typography sx={{ overflowWrap: 'anywhere' }}>
              <Box component="span" sx={{ color: 'text.secondary' }}>
                Preparación:
              </Box>{' '}
              {e.preparacion}
            </Typography>
          )}
        </QueSeHace>
      )}

      {atiende && p && (
        <Acciones>
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
        </Acciones>
      )}
      {confirmaEstudios && e && (
        // Un estudio se atiende confirmándolo con el rostro; "No se administró" no corresponde
        // (el servidor responde 422 NO_ES_TOMA).
        <Acciones>
          <Boton
            variante="secundario"
            startIcon={<FaceRetouchingNaturalIcon />}
            aria-label={`Confirmar que se realizó ${e.nombre} a ${paciente}`}
            onClick={() => alConfirmarEstudio(r)}
          >
            Confirmar que se realizó
          </Boton>
        </Acciones>
      )}
    </Paper>
  );
}
