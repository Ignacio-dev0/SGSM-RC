import { Box, Typography } from '@mui/material';
import type { DatosPaciente } from '../../api/pacientes';
import { CampoTexto } from '../../componentes/CampoTexto';
import { Selector } from '../../componentes/Selector';
import type { ErroresPaciente } from './datosPaciente';
import { SEXOS } from './etiquetas';

interface Props {
  datos: DatosPaciente;
  errores: ErroresPaciente;
  alCambiar: (campo: keyof DatosPaciente, valor: string) => void;
}

/**
 * Campos de datos personales, compartidos por el registro y la edición del paciente. Son datos
 * de otra persona, no de quien usa la tablet: ninguno se autocompleta (UX-20d), para que el
 * navegador no ofrezca ahí los datos de quien está usando el sistema.
 */
export function CamposPaciente({ datos, errores, alCambiar }: Props) {
  const campo = (c: keyof DatosPaciente) => ({
    valor: datos[c],
    alCambiar: (v: string) => alCambiar(c, v),
    error: errores[c],
    autoComplete: 'off',
  });
  const grilla = { display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } };

  return (
    <>
      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        Datos personales
      </Typography>
      <Box sx={grilla}>
        <CampoTexto
          etiqueta="DNI"
          {...campo('dni')}
          required
          // El formato se dice de entrada (UX-20a); si falla, el error toma el lugar de la ayuda.
          ayuda="7 u 8 dígitos, sin puntos"
          slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8 } }}
        />
        <CampoTexto etiqueta="Nombre" {...campo('nombre')} required />
        <CampoTexto etiqueta="Apellido" {...campo('apellido')} required />
        <CampoTexto
          etiqueta="Fecha de nacimiento"
          {...campo('fechaNacimiento')}
          type="date"
          required
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Selector
          etiqueta="Sexo"
          {...campo('sexo')}
          required
          textoVacio="Elegir…"
          opciones={SEXOS}
        />
        <CampoTexto etiqueta="Obra social" {...campo('obraSocial')} />
        <CampoTexto etiqueta="N.º de afiliado" {...campo('numeroAfiliado')} />
      </Box>

      <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 2 }}>
        Datos clínicos y contacto
      </Typography>
      <Box sx={grilla}>
        <CampoTexto etiqueta="Diagnóstico" {...campo('diagnostico')} multiline minRows={2} />
        <CampoTexto etiqueta="Observaciones" {...campo('observaciones')} multiline minRows={2} />
        <CampoTexto etiqueta="Contacto de emergencia" {...campo('contactoEmergenciaNombre')} />
        <CampoTexto
          etiqueta="Teléfono de emergencia"
          {...campo('contactoEmergenciaTelefono')}
          type="tel"
        />
      </Box>
    </>
  );
}
