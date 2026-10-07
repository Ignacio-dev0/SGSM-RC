import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ADMIN, ENFERMERO, MEDICO } from '../pruebas/datos';
import { renderizarApp } from '../pruebas/renderizar';
import { servidor } from '../pruebas/servidor';
import { opcionesDelMenu } from './menu';

const etiquetas = (permisos: string[]) => opcionesDelMenu(permisos).map((o) => o.etiqueta);

describe('menú principal por rol (T108 · CU06 · RF15)', () => {
  it('el administrador ve la gestión de usuarios', () => {
    expect(etiquetas(ADMIN.permisos)).toEqual(expect.arrayContaining(['Inicio', 'Usuarios']));
  });

  it.each([
    ['médico', MEDICO],
    ['enfermero', ENFERMERO],
  ])('el %s no ve la gestión de usuarios', (_rol, usuario) => {
    expect(etiquetas(usuario.permisos)).toContain('Inicio');
    expect(etiquetas(usuario.permisos)).not.toContain('Usuarios');
  });

  it('un permiso adicional habilita su opción aunque el rol no la traiga', () => {
    expect(etiquetas([...ENFERMERO.permisos, 'usuarios.gestionar'])).toContain('Usuarios');
  });

  it('muestra en pantalla solo las opciones habilitadas y el usuario de la sesión', async () => {
    renderizarApp('/', ENFERMERO);
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' });
    expect(within(menu).getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(screen.getByText(/Sofía Acosta/)).toBeInTheDocument();
  });

  it('una ruta sin permiso muestra un aviso en lugar de la pantalla', async () => {
    renderizarApp('/usuarios', ENFERMERO);
    expect(await screen.findByText(/No tiene permiso para ver esta pantalla/)).toBeInTheDocument();
  });

  it('cierra la sesión desde la barra superior', async () => {
    servidor.use(
      http.post('*/api/auth/logout', () => HttpResponse.json({ data: { cerrada: true } })),
    );
    renderizarApp('/', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Salir/ }));

    expect(await screen.findByRole('heading', { name: /Ingresar/ })).toBeInTheDocument();
  });
});
