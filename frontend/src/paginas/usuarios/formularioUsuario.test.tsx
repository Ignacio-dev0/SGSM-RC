import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Rol, Usuario } from '../../api/tipos';
import { ADMIN } from '../../pruebas/datos';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';
import { esquemaAltaUsuario } from '../../../../backend/src/modulos/usuarios/usuarios.esquemas';
import { errorNombreUsuario } from './validacion';

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

describe('formulario de usuario: ver la contraseña (F17)', () => {
  it('como en el Ingreso, un botón muestra y oculta la contraseña', async () => {
    renderizarApp('/usuarios/nuevo', ADMIN);

    const contrasena = await screen.findByLabelText(/^Contraseña/);
    expect(contrasena).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(contrasena).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(contrasena).toHaveAttribute('type', 'password');
  });

  it('al editar también está, junto a la contraseña nueva', async () => {
    servidor.use(http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario() })));
    renderizarApp('/usuarios/10', ADMIN);

    const contrasena = await screen.findByLabelText(/^Contraseña nueva/);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(contrasena).toHaveAttribute('type', 'text');
  });
});

describe('formulario de usuario: el nombre de usuario (F20)', () => {
  /** El mensaje con que el servidor rechaza un nombre de usuario (B2 · D111). */
  const mensajeDelServidor = () =>
    esquemaAltaUsuario.shape.nombreUsuario.safeParse('?').error!.issues[0]!.message;

  it('dice desde el principio qué acepta el servidor, con sus mismas palabras', async () => {
    renderizarApp('/usuarios/nuevo', ADMIN);

    // "El usuario debe tener de 3 a 30…" → "De 3 a 30…".
    const ayuda = mensajeDelServidor().replace(/^El usuario debe tener d/, 'D');
    expect(await screen.findByLabelText(/^Nombre de usuario/)).toHaveAccessibleDescription(ayuda);
  });

  it.each([
    ['lg', 'muy corto'],
    ['lucia gomez', 'con un espacio en el medio'],
    ['lucía', 'con tilde'],
    ['l@gomez', 'con un símbolo'],
  ])('rechaza «%s» (%s) con el mismo mensaje que el servidor, sin mandarlo', async (valor) => {
    const crear = vi.fn(() => HttpResponse.json({ data: usuario() }, { status: 201 }));
    servidor.use(http.post('*/api/usuarios', crear));
    renderizarApp('/usuarios/nuevo', ADMIN);

    await userEvent.type(await screen.findByLabelText(/^Nombre de usuario/), valor);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const resultado = esquemaAltaUsuario.shape.nombreUsuario.safeParse(valor);
    expect(resultado.success).toBe(false);
    expect(screen.getByLabelText(/^Nombre de usuario/)).toHaveAccessibleDescription(
      resultado.error!.issues[0]!.message,
    );
    expect(crear).not.toHaveBeenCalled();
  });

  it('acepta mayúsculas y espacios alrededor, como el servidor (los guarda en minúsculas)', () => {
    for (const valor of ['LGomez', '  lgomez  ', 'l.gomez-2', 'l_gomez']) {
      expect(esquemaAltaUsuario.shape.nombreUsuario.safeParse(valor).success).toBe(true);
      expect(errorNombreUsuario(valor)).toBeNull();
    }
  });
});

describe('formulario de usuario: uno mismo (D110 del servidor)', () => {
  const yo = () =>
    usuario({
      id: 1,
      nombreUsuario: 'admin',
      nombre: 'Laura',
      apellido: 'Méndez',
      rol: { codigo: 'ADMINISTRADOR', nombre: 'Administrador' },
    });
  const AYUDA_ROL = 'Nadie puede cambiar su propio rol: se lo cambia otro administrador.';

  it('el rol propio se lee pero no se cambia, y la ayuda dice por qué', async () => {
    servidor.use(http.get('*/api/usuarios/1', () => HttpResponse.json({ data: yo() })));
    renderizarApp('/usuarios/1', ADMIN);

    const rol = await screen.findByLabelText(/^Rol/);
    await waitFor(() => expect(rol).toHaveValue('Administrador'));
    expect(rol).toHaveAttribute('readonly');
    expect(rol).toHaveAccessibleDescription(AYUDA_ROL);
  });

  it('al guardar sus datos no manda el rol (el servidor rechazaría cambiarlo)', async () => {
    let enviado: Record<string, unknown> | undefined;
    servidor.use(
      http.get('*/api/usuarios/1', () => HttpResponse.json({ data: yo() })),
      http.patch('*/api/usuarios/1', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: yo() });
      }),
    );
    renderizarApp('/usuarios/1', ADMIN);

    const email = await screen.findByLabelText(/^Email/);
    await waitFor(() => expect(screen.getByLabelText(/^DNI/)).toHaveValue('30111222'));
    await userEvent.type(email, 'lmendez@hospital.test');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(enviado).toBeDefined());
    expect(enviado).not.toHaveProperty('rol');
    expect(enviado).toMatchObject({ email: 'lmendez@hospital.test' });
  });

  it('el de otro usuario sí se elige', async () => {
    servidor.use(http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario() })));
    renderizarApp('/usuarios/10', ADMIN);

    const rol = await screen.findByLabelText(/^Rol/);
    await waitFor(() => expect(rol).toHaveValue('ENFERMERO'));
    expect(rol).not.toHaveAttribute('readonly');
    expect(rol.tagName).toBe('SELECT');
  });
});
