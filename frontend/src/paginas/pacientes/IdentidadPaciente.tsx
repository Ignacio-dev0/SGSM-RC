import { useId } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import type { Paciente } from '../../api/tipos';
import { edad } from '../../utilidades/formato';
import { ubicacionCama } from './etiquetas';

/**
 * Identificación del paciente en las pantallas donde se actúa sobre él (administrar, prescribir):
 * nombre, DNI, edad y cama, siempre juntos. La validación facial identifica a quien registra,
 * no al paciente; esta tarjeta es la que evita equivocarse de paciente.
 */
export function IdentidadPaciente({ paciente: p }: { paciente: Paciente }) {
  const titulo = useId();
  return (
    <Paper component="section" aria-labelledby={titulo} variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography id={titulo} variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
        Paciente
      </Typography>
      <Typography variant="h5" component="p">
        {p.apellido}, {p.nombre}
      </Typography>
      <Box
        component="p"
        sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mt: 0.5, mb: 0 }}
      >
        <span>DNI {p.dni}</span>
        <span>{edad(p.fechaNacimiento)} años</span>
        <strong>{p.cama ? ubicacionCama(p.cama) : 'Sin cama asignada'}</strong>
      </Box>
    </Paper>
  );
}
