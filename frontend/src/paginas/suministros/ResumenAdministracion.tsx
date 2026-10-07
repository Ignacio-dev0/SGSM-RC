import { useId, type ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import type { Paciente, Prescripcion } from '../../api/tipos';
import { formatearHora } from '../../utilidades/formato';
import { formatearCama } from '../pacientes/etiquetas';
import { etiquetaVia, formatearDosis } from '../prescripciones/etiquetas';
import { duracion, type EstadoToma } from './estadoToma';

/** "Toma de las 08:00 · atrasada 1 h 15 min", con "(recordatorio)" si es la del recordatorio. */
function textoToma(e: EstadoToma, delRecordatorio: boolean) {
  const texto = textoEstado(e);
  return delRecordatorio && e.tipo !== 'dada' && e.tipo !== 'sin-tomas'
    ? `${texto} (recordatorio)`
    : texto;
}

function textoEstado(e: EstadoToma) {
  switch (e.tipo) {
    case 'dada':
      return `Ya se dio a las ${formatearHora(e.fechaHora)} (${e.usuario})`;
    case 'atrasada':
      return `Toma de las ${formatearHora(e.toma)} · atrasada ${duracion(e.minutos)}`;
    case 'ahora':
      return `Toma de las ${formatearHora(e.toma)} · toca ahora`;
    case 'falta':
      return `Toma de las ${formatearHora(e.toma)} · faltan ${duracion(e.minutos)}`;
    case 'sin-tomas':
      return 'Sin más tomas programadas';
  }
}

function Fila({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <>
      <Typography component="dt" color="text.secondary">
        {titulo}
      </Typography>
      <Typography component="dd" sx={{ m: 0, fontWeight: 700 }}>
        {children}
      </Typography>
    </>
  );
}

/** Lo que se va a registrar, para revisarlo de un vistazo antes de poner la cara. */
export function ResumenAdministracion({
  paciente: p,
  prescripcion,
  cantidad,
  observaciones,
  estado,
  tomaDelRecordatorio = false,
}: {
  paciente: Paciente;
  prescripcion: Prescripcion;
  cantidad: number;
  observaciones: string;
  estado: EstadoToma;
  /** La toma es la del recordatorio desde el que se llegó (E5-01): se aclara al lado. */
  tomaDelRecordatorio?: boolean;
}) {
  const titulo = useId();
  const distinta = cantidad !== prescripcion.dosis;
  return (
    <Box component="section" aria-labelledby={titulo}>
      {/* h2: cuelga del título de la pantalla (h1); un h3 saltaría un nivel. */}
      <Typography id={titulo} variant="h6" component="h2" sx={{ mb: 1 }}>
        Revise antes de confirmar
      </Typography>
      <Box
        component="dl"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' },
          columnGap: 2,
          rowGap: { xs: 0.25, sm: 1 },
          m: 0,
        }}
      >
        <Fila titulo="Paciente">
          {p.apellido}, {p.nombre}
          <Typography component="span" sx={{ display: 'block', fontWeight: 400 }}>
            DNI {p.dni}
            {p.cama ? ` · Cama ${formatearCama(p.cama.numero)}` : ''}
          </Typography>
        </Fila>
        <Fila titulo="Dar">
          {prescripcion.medicamento.nombre} {formatearDosis(cantidad, prescripcion.unidadDosis)}
          {distinta && (
            <Typography component="span" color="warning.main" sx={{ display: 'block' }}>
              Distinta de la prescripta (
              {formatearDosis(prescripcion.dosis, prescripcion.unidadDosis)})
            </Typography>
          )}
        </Fila>
        <Fila titulo="Vía">{etiquetaVia(prescripcion.via)}</Fila>
        <Fila titulo="Toma">{textoToma(estado, tomaDelRecordatorio)}</Fila>
        <Fila titulo="Observaciones">{observaciones.trim() || 'Sin observaciones'}</Fila>
      </Box>
    </Box>
  );
}
