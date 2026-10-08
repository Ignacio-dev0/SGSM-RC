import { useState, type ComponentProps } from 'react';
import { IconButton, InputAdornment } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { CampoTexto } from './CampoTexto';

type Props = Omit<ComponentProps<typeof CampoTexto>, 'type' | 'slotProps'>;

/**
 * Campo de contraseña con el botón para mostrarla u ocultarla (Ingreso y formulario de usuario):
 * en la tablet, con guantes, es fácil errar una letra sin verla.
 */
export function CampoContrasena(props: Props) {
  const [ver, setVer] = useState(false);
  return (
    <CampoTexto
      {...props}
      type={ver ? 'text' : 'password'}
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setVer((v) => !v)}
                edge="end"
              >
                {ver ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
