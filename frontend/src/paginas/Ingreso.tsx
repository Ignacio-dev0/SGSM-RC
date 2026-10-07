import { useState, type FormEvent } from 'react';
import {
  Box,
  Checkbox,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Paper,
  Typography,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { mensajeDeError } from '../api/cliente';
import { useSesion } from '../auth/useSesion';
import { Alerta } from '../componentes/Alerta';
import { Boton } from '../componentes/Boton';
import { CampoTexto } from '../componentes/CampoTexto';
import { SelectorTema } from '../componentes/SelectorTema';

const CLAVE_RECORDADO = 'sgsm.usuarioRecordado';

function leerRecordado() {
  try {
    return localStorage.getItem(CLAVE_RECORDADO);
  } catch {
    return null;
  }
}

function guardarRecordado(nombreUsuario: string | null) {
  try {
    if (nombreUsuario) localStorage.setItem(CLAVE_RECORDADO, nombreUsuario);
    else localStorage.removeItem(CLAVE_RECORDADO);
  } catch {
    // Almacenamiento no disponible: simplemente no se recuerda.
  }
}

/** Pantalla de inicio de sesión (T107 · CU06). Solo recuerda el usuario, nunca la contraseña. */
export function Ingreso() {
  const { usuario, iniciarSesion, aviso } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const recordado = leerRecordado();

  const [nombreUsuario, setNombreUsuario] = useState(recordado ?? '');
  const [contrasena, setContrasena] = useState('');
  const [recordar, setRecordar] = useState(true);
  const [verContrasena, setVerContrasena] = useState(false);
  const [errores, setErrores] = useState<{ usuario?: string; contrasena?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/" replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const faltan = {
      ...(nombreUsuario.trim() ? {} : { usuario: 'Ingrese su usuario' }),
      ...(contrasena ? {} : { contrasena: 'Ingrese su contraseña' }),
    };
    setErrores(faltan);
    if (Object.keys(faltan).length > 0) return;

    setEnviando(true);
    setError(null);
    try {
      await iniciarSesion(nombreUsuario.trim(), contrasena);
      guardarRecordado(recordar ? nombreUsuario.trim() : null);
      const desde = (ubicacion.state as { desde?: string } | null)?.desde;
      navegar(desde && desde !== '/ingresar' ? desde : '/', { replace: true });
    } catch (err) {
      setError(mensajeDeError(err));
      setContrasena('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
        p: 2,
        position: 'relative',
      }}
    >
      <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
        <SelectorTema />
      </Box>
      <Paper
        component="form"
        noValidate
        onSubmit={enviar}
        elevation={0}
        variant="outlined"
        sx={{ width: '100%', maxWidth: 440, p: { xs: 3, sm: 5 }, display: 'grid', gap: 2.5 }}
      >
        <Box sx={{ textAlign: 'center' }}>
          <LocalHospitalOutlinedIcon color="primary" sx={{ fontSize: 56 }} />
          <Typography variant="h4" component="h1">
            Ingresar
          </Typography>
          <Typography color="text.secondary">SGSM-RC · Hospital El Dique</Typography>
        </Box>

        {aviso && <Alerta tipo="info">{aviso}</Alerta>}
        {error && <Alerta tipo="error">{error}</Alerta>}

        <CampoTexto
          etiqueta="Usuario"
          valor={nombreUsuario}
          alCambiar={setNombreUsuario}
          error={errores.usuario}
          autoComplete="username"
          autoCapitalize="none"
          autoFocus={!recordado}
        />
        <CampoTexto
          etiqueta="Contraseña"
          valor={contrasena}
          alCambiar={setContrasena}
          error={errores.contrasena}
          type={verContrasena ? 'text' : 'password'}
          autoComplete="current-password"
          autoFocus={Boolean(recordado)}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setVerContrasena((v) => !v)}
                    edge="end"
                  >
                    {verContrasena ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <FormControlLabel
          control={<Checkbox checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />}
          label="Recordar mi usuario en esta tablet"
        />
        <Boton type="submit" cargando={enviando} fullWidth>
          Ingresar
        </Boton>
      </Paper>
    </Box>
  );
}
