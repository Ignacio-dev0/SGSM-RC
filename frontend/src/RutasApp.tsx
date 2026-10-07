import { Typography } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ConPermiso, RutaProtegida } from './auth/RutaProtegida';
import { Disposicion } from './navegacion/Disposicion';
import { Ingreso } from './paginas/Ingreso';
import { Inicio } from './paginas/Inicio';

/** Mapa de pantallas. Cada ruta con datos sensibles exige además su permiso. */
export function RutasApp() {
  return (
    <Routes>
      <Route path="/ingresar" element={<Ingreso />} />
      <Route
        element={
          <RutaProtegida>
            <Disposicion />
          </RutaProtegida>
        }
      >
        <Route index element={<Inicio />} />
        <Route
          path="usuarios/*"
          element={
            <ConPermiso permiso="usuarios.gestionar">
              <Typography variant="h4" component="h1">
                Usuarios
              </Typography>
            </ConPermiso>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
