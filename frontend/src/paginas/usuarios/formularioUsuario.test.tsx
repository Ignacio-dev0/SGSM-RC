import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { Rol, Usuario } from '../../api/tipos';
import { ADMIN } from '../../pruebas/datos';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

const ROLES: Rol[] = [
  { codigo: 'ADMINISTRADOR', nombre: 'Administrador', descripcion: null, permisos: [] },
  { codigo: 'ENFERMERO', nombre: 'Enfermero', descripcion: null, permisos: ['pacientes.ver'] },
];

const usuario = (extra: Partial<Usuario> = {}): Usuario => ({
  id: 10,
  nombreUsuario: 'lgomez',
  dni: '30111222',
  nombre: 'Lucía',
  apellido: 'Gómez',
  email: null,
  matricula: 'ME 2001',
  rol: { codigo: 'ENFERMERO', nombre: 'Enfermero' },
  activo: true,
  fechaBaja: null,
  bloqueadoHasta: null,
  ultimoAcceso: null,
  tieneBiometria: false,
  permisosDelRol: ['pacientes.ver'],
  permisosAdicionales: [],
  ...extra,
});

beforeEach(() => {
  servidor.use(http.get('*/api/roles', () => HttpResponse.json({ data: ROLES })));
});

/** El chip (el recuadro de MUI) que contiene ese texto. */
const chipDe = (texto: string) => screen.getByText(texto).closest('.MuiChip-root') as HTMLElement;

describe('formulario de usuario: botonera (F31)', () => {
  it('en el alta, Cancelar va antes y la acción principal, Guardar, es la última del grupo', async () => {
    renderizarApp('/usuarios/nuevo', ADMIN);

    await screen.findByLabelText(/^DNI/);
    const botones = within(
      screen.getByRole('group', { name: 'Acciones del formulario' }),
    ).getAllByRole('button');
    expect(botones.map((b) => b.textContent)).toEqual(['Cancelar', 'Guardar']);
    expect(botones.at(-1)).toHaveAttribute('type', 'submit');
  });

  it('al editar, la botonera es la misma', async () => {
    servidor.use(http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario() })));
    renderizarApp('/usuarios/10', ADMIN);

    await screen.findByLabelText(/^DNI/);
    const botones = within(
      screen.getByRole('group', { name: 'Acciones del formulario' }),
    ).getAllByRole('button');
    expect(botones.map((b) => b.textContent)).toEqual(['Cancelar', 'Guardar']);
  });
});

describe('formulario de usuario: el estado "Dado de baja" es un ChipEstado (F30)', () => {
  it('un usuario dado de baja lo muestra como cerrado: relleno suave y neutro, no en rojo', async () => {
    servidor.use(
      http.get('*/api/usuarios/10', () =>
        HttpResponse.json({ data: usuario({ activo: false, fechaBaja: '2026-10-01T12:00:00Z' }) }),
      ),
    );
    renderizarApp('/usuarios/10', ADMIN);

    await screen.findByRole('button', { name: 'Reactivar' });
    const chip = chipDe('Dado de baja');
    expect(chip).toHaveClass('MuiChip-filled');
    expect(chip).toHaveClass('MuiChip-colorDefault');
    expect(chip).not.toHaveClass('MuiChip-colorError');
    // Mide lo mismo que todos los chips de estado: 28 px, no el tamaño chico de MUI.
    expect(chip).not.toHaveClass('MuiChip-sizeSmall');
  });

  it('un usuario activo no muestra ese chip', async () => {
    servidor.use(http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario() })));
    renderizarApp('/usuarios/10', ADMIN);

    await screen.findByRole('button', { name: 'Dar de baja' });
    expect(screen.queryByText('Dado de baja')).not.toBeInTheDocument();
  });
});

describe('formulario de usuario: ayuda del DNI (UX-20a)', () => {
  it('el DNI explica el formato desde el principio, también al editar', async () => {
    renderizarApp('/usuarios/nuevo', ADMIN);

    const dni = await screen.findByLabelText(/^DNI/);
    expect(dni).toHaveAccessibleDescription('7 u 8 dígitos, sin puntos');
    expect(screen.getByText('7 u 8 dígitos, sin puntos')).toBeVisible();
  });

  it('al editar, con el DNI cargado, la ayuda sigue ahí', async () => {
    servidor.use(http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario() })));
    renderizarApp('/usuarios/10', ADMIN);

    const dni = await screen.findByLabelText(/^DNI/);
    await waitFor(() => expect(dni).toHaveValue('30111222'));
    expect(dni).toHaveAccessibleDescription('7 u 8 dígitos, sin puntos');
  });
});
