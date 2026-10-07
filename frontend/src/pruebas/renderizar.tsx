// Renderiza la aplicación completa en una ruta, con la API simulada por MSW.
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import type { UsuarioSesion } from '../api/tipos';
import { ProveedorSesion } from '../auth/ContextoSesion';
import { RutasApp } from '../RutasApp';
import { tema } from '../tema';
import { servidor } from './servidor';

export function simularSesion(usuario: UsuarioSesion | null) {
  servidor.use(
    http.get('*/api/auth/sesion', () =>
      usuario
        ? HttpResponse.json({ data: usuario })
        : HttpResponse.json(
            { error: { codigo: 'NO_AUTENTICADO', mensaje: 'Sesión no iniciada o vencida' } },
            { status: 401 },
          ),
    ),
    http.get('*/api/notificaciones', () => HttpResponse.json({ data: [], meta: { noLeidas: 0 } })),
  );
}

export function renderizarApp(ruta: string, usuario: UsuarioSesion | null) {
  simularSesion(usuario);
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={cliente}>
      <ThemeProvider theme={tema}>
        <MemoryRouter initialEntries={[ruta]}>
          <ProveedorSesion>
            <RutasApp />
          </ProveedorSesion>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}
