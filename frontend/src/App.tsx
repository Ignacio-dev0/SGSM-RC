import { CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ProveedorSesion } from './auth/ContextoSesion';
import { RutasApp } from './RutasApp';
import { CLAVE_TEMA, tema } from './tema';

const clienteQuery = new QueryClient({
  defaultOptions: {
    // Errores de permisos o validación no se arreglan reintentando.
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export function App() {
  return (
    <QueryClientProvider client={clienteQuery}>
      <ThemeProvider theme={tema} modeStorageKey={CLAVE_TEMA} defaultMode="system">
        <CssBaseline />
        <BrowserRouter>
          <ProveedorSesion>
            <RutasApp />
          </ProveedorSesion>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
