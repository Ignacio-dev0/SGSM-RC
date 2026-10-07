// Renderiza la aplicación completa en una ruta, con la API simulada por MSW.
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
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
  // Router de datos, como en App.tsx: así las pantallas pueden usar useBlocker.
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <ProveedorSesion>
            <RutasApp />
          </ProveedorSesion>
        ),
      },
    ],
    { initialEntries: [ruta] },
  );
  const pantalla = render(
    <QueryClientProvider client={cliente}>
      <ThemeProvider theme={tema}>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  // El router queda a mano para probar el botón Atrás del navegador (router.navigate(-1)).
  return Object.assign(pantalla, { router });
}
