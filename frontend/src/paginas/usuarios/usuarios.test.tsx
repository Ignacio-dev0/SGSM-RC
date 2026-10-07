import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Permiso, Rol, Usuario } from '../../api/tipos';
import { ADMIN } from '../../pruebas/datos';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

const ROLES: Rol[] = [
  { codigo: 'ADMINISTRADOR', nombre: 'Administrador', descripcion: null, permisos: [] },
  {
    codigo: 'ENFERMERO',
    nombre: 'Enfermero',
    descripcion: null,
    permisos: ['pacientes.ver', 'suministros.registrar'],
  },
  { codigo: 'MEDICO', nombre: 'Médico', descripcion: null, permisos: ['pacientes.ver'] },
];

const PERMISOS: Permiso[] = [
  { codigo: 'pacientes.gestionar', modulo: 'pacientes', descripcion: 'Registrar pacientes' },
  { codigo: 'pacientes.ver', modulo: 'pacientes', descripcion: 'Buscar pacientes' },
  { codigo: 'suministros.registrar', modulo: 'suministros', descripcion: 'Registrar suministros' },
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
  permisosDelRol: ['pacientes.ver', 'suministros.registrar'],
  permisosAdicionales: [],
  ...extra,
});

const lista = (data: Usuario[]) =>
  HttpResponse.json({
    data,
    meta: { pagina: 1, porPagina: 20, total: data.length, totalPaginas: 1 },
  });

beforeEach(() => {
  servidor.use(
    http.get('*/api/roles', () => HttpResponse.json({ data: ROLES })),
    http.get('*/api/permisos', () => HttpResponse.json({ data: PERMISOS })),
  );
});

describe('gestión de usuarios (T110 · CU01–CU04)', () => {
  it('lista los usuarios y filtra por texto, rol y estado', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/usuarios', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return lista([usuario()]);
      }),
    );
    renderizarApp('/usuarios', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Usuarios' });
    expect(await within(tabla).findByText('Gómez, Lucía')).toBeInTheDocument();
    expect(within(tabla).getByText('lgomez')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Buscar/), 'gomez');
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'Enfermero');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Dados de baja');

    await waitFor(() => {
      const ultimo = pedidos.at(-1)!;
      expect(ultimo.get('texto')).toBe('gomez');
      expect(ultimo.get('rol')).toBe('ENFERMERO');
      expect(ultimo.get('activo')).toBe('false');
    });
  });

  it('registra un usuario nuevo', async () => {
    let enviado: Record<string, unknown> | undefined;
    servidor.use(
      http.get('*/api/usuarios', () => lista([])),
      http.post('*/api/usuarios', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: usuario() }, { status: 201 });
      }),
    );
    renderizarApp('/usuarios/nuevo', ADMIN);

    await userEvent.type(await screen.findByLabelText(/^Nombre\s*\*?$/), 'Lucía');
    await userEvent.type(screen.getByLabelText(/^Apellido/), 'Gómez');
    await userEvent.type(screen.getByLabelText(/^DNI/), '30111222');
    await userEvent.type(screen.getByLabelText(/^Nombre de usuario/), 'lgomez');
    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'Enfermero');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), 'Clave2026');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/creado/);
    expect(enviado).toMatchObject({
      nombre: 'Lucía',
      apellido: 'Gómez',
      dni: '30111222',
      nombreUsuario: 'lgomez',
      rol: 'ENFERMERO',
      contrasena: 'Clave2026',
    });
  });

  it('marca en el campo el DNI repetido que informa el servidor', async () => {
    servidor.use(
      http.post('*/api/usuarios', () =>
        HttpResponse.json(
          { error: { codigo: 'DNI_DUPLICADO', mensaje: 'Ya existe un usuario con ese DNI' } },
          { status: 409 },
        ),
      ),
    );
    renderizarApp('/usuarios/nuevo', ADMIN);

    await userEvent.type(await screen.findByLabelText(/^Nombre\s*\*?$/), 'Lucía');
    await userEvent.type(screen.getByLabelText(/^Apellido/), 'Gómez');
    await userEvent.type(screen.getByLabelText(/^DNI/), '30111222');
    await userEvent.type(screen.getByLabelText(/^Nombre de usuario/), 'lgomez');
    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'Enfermero');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), 'Clave2026');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByLabelText(/^DNI/)).toHaveAccessibleDescription(
      'Ya existe un usuario con ese DNI',
    );
  });

  it('valida en la tablet los campos obligatorios antes de enviar', async () => {
    renderizarApp('/usuarios/nuevo', ADMIN);
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(screen.getByLabelText(/^DNI/)).toHaveAccessibleDescription('Ingrese el DNI');
    expect(screen.getByLabelText(/^Contraseña/)).toHaveAccessibleDescription(
      'Ingrese una contraseña',
    );
  });

  it('modifica un usuario sin pedir de nuevo la contraseña', async () => {
    let enviado: Record<string, unknown> | undefined;
    servidor.use(
      http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario() })),
      http.patch('*/api/usuarios/10', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: usuario({ apellido: 'Gómez Paz' }) });
      }),
    );
    renderizarApp('/usuarios/10', ADMIN);

    const apellido = await screen.findByLabelText(/^Apellido/);
    await waitFor(() => expect(apellido).toHaveValue('Gómez'));
    await userEvent.clear(apellido);
    await userEvent.type(apellido, 'Gómez Paz');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/guardaron/);
    expect(enviado).toMatchObject({ apellido: 'Gómez Paz' });
    expect(enviado).not.toHaveProperty('contrasena');
  });

  it('a los usuarios desactivados los muestra como "Dado de baja", como dice el glosario', async () => {
    servidor.use(http.get('*/api/usuarios', () => lista([usuario({ activo: false })])));
    renderizarApp('/usuarios', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Usuarios' });
    expect(await within(tabla).findByText('Dado de baja')).toBeInTheDocument();
    expect(within(tabla).queryByText('Inactivo')).not.toBeInTheDocument();
  });

  it('si el usuario a editar no se puede cargar, no muestra el formulario vacío', async () => {
    servidor.use(
      http.get('*/api/usuarios/10', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 500 },
        ),
      ),
    );
    renderizarApp('/usuarios/10', ADMIN);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No se pudieron cargar los datos del usuario/,
    );
    expect(screen.queryByLabelText(/^Nombre/)).not.toBeInTheDocument();
  });

  it('da de baja un usuario con confirmación', async () => {
    const baja = vi.fn(() => HttpResponse.json({ data: usuario({ activo: false }) }));
    servidor.use(
      http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario() })),
      http.delete('*/api/usuarios/10', baja),
    );
    renderizarApp('/usuarios/10', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Dar de baja' }));
    const dialogo = screen.getByRole('dialog', { name: /Dar de baja/ });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Dar de baja' }));

    expect(await screen.findByText(/dado de baja/)).toBeInTheDocument();
    expect(baja).toHaveBeenCalledTimes(1);
  });
});

describe('permisos adicionales (T111 · CU05)', () => {
  it('muestra los permisos del rol fijos y guarda los adicionales marcados', async () => {
    let enviado: unknown;
    servidor.use(
      http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario() })),
      http.put('*/api/usuarios/10/permisos-adicionales', async ({ request }) => {
        enviado = await request.json();
        return HttpResponse.json({
          data: usuario({ permisosAdicionales: ['pacientes.gestionar'] }),
        });
      }),
    );
    renderizarApp('/usuarios/10/permisos', ADMIN);

    const delRol = await screen.findByRole('checkbox', { name: /Registrar suministros/ });
    expect(delRol).toBeChecked();
    expect(delRol).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: /Registrar pacientes/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar permisos' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/guardaron/);
    expect(enviado).toEqual({ permisos: ['pacientes.gestionar'] });
  });
});
