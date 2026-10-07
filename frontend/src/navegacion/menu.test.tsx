import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ADMIN, ENFERMERO, MEDICO } from '../pruebas/datos';
import { renderizarApp } from '../pruebas/renderizar';
import { servidor } from '../pruebas/servidor';
import { opcionesDelMenu } from './menu';

const etiquetas = (permisos: string[]) => opcionesDelMenu(permisos).map((o) => o.etiqueta);

describe('menú principal por rol (T108 · CU06 · RF15)', () => {
  afterEach(() => vi.unstubAllEnvs());

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

  it.each([
    ['administrador', ADMIN],
    ['médico', MEDICO],
    ['enfermero', ENFERMERO],
  ])('el %s ve Recordatorios, después de Inicio', (_rol, usuario) => {
    expect(etiquetas(usuario.permisos).slice(0, 2)).toEqual(['Inicio', 'Recordatorios']);
  });

  it('sin recordatorios.ver no ve Recordatorios', () => {
    const permisos = ENFERMERO.permisos.filter((p) => !p.startsWith('recordatorios.'));
    expect(etiquetas(permisos)).not.toContain('Recordatorios');
  });

  it('un permiso adicional habilita su opción aunque el rol no la traiga', () => {
    expect(etiquetas([...ENFERMERO.permisos, 'usuarios.gestionar'])).toContain('Usuarios');
  });

  it('muestra en pantalla solo las opciones habilitadas y el usuario de la sesión', async () => {
    renderizarApp('/', ENFERMERO);
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' });
    expect(within(menu).getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Recordatorios' })).toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(screen.getByText(/Sofía Acosta/)).toBeInTheDocument();
  });

  it('una ruta sin permiso muestra un aviso en lugar de la pantalla', async () => {
    renderizarApp('/usuarios', ENFERMERO);
    expect(await screen.findByText(/No tiene permiso para ver esta pantalla/)).toBeInTheDocument();
  });

  it('en modo de demostración lo avisa siempre, debajo de la barra superior', async () => {
    vi.stubEnv('VITE_BIOMETRIA_MODO', 'simulado');
    renderizarApp('/', ENFERMERO);

    expect(
      await screen.findByText(/Modo demostración: la validación facial se simula/),
    ).toBeInTheDocument();
  });

  it('el aviso de demostración es una franja fija de borde a borde que no se va con el scroll (F27)', async () => {
    vi.stubEnv('VITE_BIOMETRIA_MODO', 'simulado');
    renderizarApp('/', ENFERMERO);

    const franja = await screen.findByRole('note');
    expect(franja).toHaveTextContent(
      'Modo demostración: la validación facial se simula. No usar con pacientes reales.',
    );
    // Hija directa del contenido (no de su recuadro con margen) y pegada bajo la barra.
    expect(franja.parentElement).toBe(screen.getByRole('main'));
    const estilo = getComputedStyle(franja);
    expect(estilo.position).toBe('sticky');
    expect(estilo.top).toBe('56px');
    expect(estilo.borderRadius).not.toMatch(/[1-9]/);
  });

  it('con la cámara real no muestra el aviso de demostración', async () => {
    renderizarApp('/', ENFERMERO);
    await screen.findByRole('button', { name: /Salir/ });
    expect(screen.queryByText(/Modo demostración/)).not.toBeInTheDocument();
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
