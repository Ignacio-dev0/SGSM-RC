import { CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ProveedorSesion } from './auth/ContextoSesion';
import { RutasApp } from './RutasApp';
import { CLAVE_TEMA, tema } from './tema';

const clienteQuery = new QueryClient({
  defaultOptions: {
    // Errores de permisos o validación no se arreglan reintentando.
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

// Router "de datos": hace falta para poder frenar la navegación con useBlocker cuando hay un
// formulario sin guardar (useCambiosSinGuardar). Una sola ruta comodín: el mapa de pantallas
// sigue en RutasApp.
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <ProveedorSesion>
        <RutasApp />
      </ProveedorSesion>
    ),
  },
]);

export function App() {
  return (
    <QueryClientProvider client={clienteQuery}>
      <ThemeProvider theme={tema} modeStorageKey={CLAVE_TEMA} defaultMode="system">
        <CssBaseline />
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
