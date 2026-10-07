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
    // El foco va al primer campo con error, para corregirlo sin buscarlo.
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-invalid', 'true'));
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
    expect(dialogo).toHaveTextContent(/Lucía Gómez \(lgomez\)/);
    expect(dialogo).toHaveTextContent(/se puede reactivar/);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Dar de baja' }));

    expect(await screen.findByText(/dado de baja/)).toBeInTheDocument();
    expect(baja).toHaveBeenCalledTimes(1);
  });
});

describe('desde la ficha del usuario se llega a su rostro', () => {
  it('ofrece Rostro a quien gestiona la biometría', async () => {
    servidor.use(http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario() })));
    renderizarApp('/usuarios/10', ADMIN);

    const rostro = await screen.findByRole('link', { name: /Rostro/ });
    expect(rostro).toHaveAttribute('href', '/biometria/10');
  });
});

describe('reactivación de un usuario dado de baja', () => {
  it('ofrece Reactivar en lugar de Dar de baja y lo vuelve a activar', async () => {
    const reactivar = vi.fn(() => HttpResponse.json({ data: usuario({ activo: true }) }));
    servidor.use(
      http.get('*/api/usuarios/10', () =>
        HttpResponse.json({ data: usuario({ activo: false, fechaBaja: '2026-10-01T12:00:00Z' }) }),
      ),
      http.post('*/api/usuarios/10/reactivar', reactivar),
    );
    renderizarApp('/usuarios/10', ADMIN);

    expect(await screen.findByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reactivar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/puede volver a ingresar/);
    expect(reactivar).toHaveBeenCalledTimes(1);
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

describe('el listado de usuarios recuerda lo que se buscó (queda en la URL)', () => {
  const sinResultadosSiHayTexto = http.get('*/api/usuarios', ({ request }) =>
    new URL(request.url).searchParams.get('texto') ? lista([]) : lista([usuario()]),
  );
  const OPCIONES = { name: 'Qué puede hacer ahora' };

  it('restaura de la URL el texto, el rol, el estado y la página, y los pide a la API', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/usuarios', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return lista([usuario()]);
      }),
    );
    renderizarApp('/usuarios?texto=gomez&rol=ENFERMERO&activo=false&pagina=2', ADMIN);

    await screen.findByRole('table', { name: 'Usuarios' });
    expect(screen.getByLabelText(/Buscar/)).toHaveValue('gomez');
    expect(screen.getByLabelText('Estado')).toHaveValue('false');
    await waitFor(() => expect(screen.getByLabelText('Rol')).toHaveValue('ENFERMERO'));
    expect(pedidos[0]?.get('texto')).toBe('gomez');
    expect(pedidos[0]?.get('rol')).toBe('ENFERMERO');
    expect(pedidos[0]?.get('activo')).toBe('false');
    expect(pedidos[0]?.get('pagina')).toBe('2');
  });

  it('con filtros dice por qué no hay nada y qué probar, y permite quitarlos', async () => {
    servidor.use(sinResultadosSiHayTexto);
    renderizarApp('/usuarios', ADMIN);

    await userEvent.type(await screen.findByLabelText(/Buscar/), 'zzz');
    expect(
      await screen.findByText(
        'No hay usuarios activos que coincidan con «zzz». Pruebe con otro apellido, usuario o DNI, o cambie Estado a Todos.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole('group', OPCIONES)).getByRole('button', { name: 'Quitar filtros' }),
    );

    expect(screen.getByLabelText(/Buscar/)).toHaveValue('');
    // El botón desaparece: el foco queda en el campo para buscar de nuevo.
    expect(screen.getByLabelText(/Buscar/)).toHaveFocus();
    const tabla = screen.getByRole('table', { name: 'Usuarios' });
    expect(await within(tabla).findByText('Gómez, Lucía')).toBeInTheDocument();
    expect(screen.queryByRole('group', OPCIONES)).not.toBeInTheDocument();
  });

  it('nombra el rol elegido en el mensaje', async () => {
    servidor.use(http.get('*/api/usuarios', () => lista([])));
    renderizarApp('/usuarios?rol=ENFERMERO&texto=Pérez&activo=', ADMIN);

    expect(
      await screen.findByText(
        'No hay usuarios con rol Enfermero que coincidan con «Pérez». Pruebe con otro apellido, usuario o DNI, o elija otro rol.',
      ),
    ).toBeInTheDocument();
  });

  it('quitar los filtros también vuelve a Activos si se habían pedido los dados de baja', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/usuarios', ({ request }) => {
        const parametros = new URL(request.url).searchParams;
        pedidos.push(parametros);
        return lista(parametros.get('activo') === 'false' ? [] : [usuario()]);
      }),
    );
    renderizarApp('/usuarios?activo=false', ADMIN);

    expect(
      await screen.findByText('No hay usuarios dados de baja. Cambie Estado a Todos.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));

    expect(screen.getByLabelText('Estado')).toHaveValue('true');
    await waitFor(() => expect(pedidos.at(-1)?.get('activo')).toBe('true'));
  });

  it('sin usuarios activos lo dice distinto, sin ofrecer quitar filtros que no hay', async () => {
    servidor.use(http.get('*/api/usuarios', () => lista([])));
    renderizarApp('/usuarios', ADMIN);

    expect(
      await screen.findByText(
        'No hay usuarios activos. Use «Nuevo usuario» para registrar al personal.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar filtros' })).not.toBeInTheDocument();
  });

  it('un fallo de carga no se lee como "no hay usuarios": avisa, deja reintentar y no muestra el vacío', async () => {
    let pedidos = 0;
    servidor.use(
      http.get('*/api/usuarios', () => {
        pedidos++;
        return pedidos === 1
          ? HttpResponse.json(
              { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
              { status: 500 },
            )
          : lista([usuario()]);
      }),
    );
    renderizarApp('/usuarios?texto=zzz', ADMIN);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudo cargar la lista de usuarios/);
    expect(aviso).toHaveTextContent(/El servidor tuvo un problema/);
    expect(screen.queryByText(/No hay usuarios/)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', OPCIONES)).not.toBeInTheDocument();

    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));

    const tabla = await screen.findByRole('table', { name: 'Usuarios' });
    expect(await within(tabla).findByText('Gómez, Lucía')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('permisos adicionales: carga, fallos y vacíos (UX-03)', () => {
  const falla = () =>
    HttpResponse.json(
      { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
      { status: 500 },
    );
  const verUsuario = http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario() }));

  it('mientras llegan los datos dice que está cargando, sin mostrar una lista vacía', async () => {
    let liberar!: () => void;
    const lenta = new Promise<void>((resolver) => (liberar = resolver));
    servidor.use(
      http.get('*/api/permisos', async () => {
        await lenta;
        return HttpResponse.json({ data: PERMISOS });
      }),
      verUsuario,
    );
    renderizarApp('/usuarios/10/permisos', ADMIN);

    expect(await screen.findByRole('status')).toHaveTextContent(/Cargando los permisos/);
    expect(screen.queryByRole('button', { name: 'Guardar permisos' })).not.toBeInTheDocument();

    liberar();
    expect(
      await screen.findByRole('checkbox', { name: /Registrar suministros/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Cargando los permisos/)).not.toBeInTheDocument();
  });

  it('si no se puede cargar al usuario, avisa y deja reintentar sin mostrar los permisos', async () => {
    let pedidos = 0;
    servidor.use(
      http.get('*/api/usuarios/10', () => {
        pedidos++;
        return pedidos === 1 ? falla() : HttpResponse.json({ data: usuario() });
      }),
    );
    renderizarApp('/usuarios/10/permisos', ADMIN);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudieron cargar los datos del usuario/);
    expect(aviso).toHaveTextContent(/El servidor tuvo un problema/);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar permisos' })).not.toBeInTheDocument();

    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));

    expect(
      await screen.findByRole('checkbox', { name: /Registrar suministros/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('si no se puede cargar la lista de permisos, avisa y no ofrece guardar a ciegas', async () => {
    let pedidos = 0;
    servidor.use(
      verUsuario,
      http.get('*/api/permisos', () => {
        pedidos++;
        return pedidos === 1 ? falla() : HttpResponse.json({ data: PERMISOS });
      }),
    );
    renderizarApp('/usuarios/10/permisos', ADMIN);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudo cargar la lista de permisos/);
    expect(aviso).toHaveTextContent(/El servidor tuvo un problema/);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar permisos' })).not.toBeInTheDocument();
    expect(screen.queryByText(/No hay permisos/)).not.toBeInTheDocument();

    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));

    expect(
      await screen.findByRole('checkbox', { name: /Registrar suministros/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar permisos' })).toBeEnabled();
  });

  it('si fallan las dos cargas, muestra cada aviso con su Reintentar', async () => {
    servidor.use(http.get('*/api/usuarios/10', falla), http.get('*/api/permisos', falla));
    renderizarApp('/usuarios/10/permisos', ADMIN);

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(2);
  });

  it('sin permisos para asignar, lo dice y explica qué hacer', async () => {
    servidor.use(
      verUsuario,
      http.get('*/api/permisos', () => HttpResponse.json({ data: [] })),
    );
    renderizarApp('/usuarios/10/permisos', ADMIN);

    expect(
      await screen.findByText(
        'No hay permisos adicionales para asignar. El usuario tiene los que trae su rol; vuelva a su ficha para revisarlo.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar permisos' })).not.toBeInTheDocument();
  });
});

describe('el listado de usuarios en tablet vertical (F28 · F32 · F48)', () => {
  it('los filtros van en una región de búsqueda con nombre', async () => {
    servidor.use(http.get('*/api/usuarios', () => lista([usuario()])));
    renderizarApp('/usuarios', ADMIN);

    const filtros = await screen.findByRole('search', { name: 'Filtros' });
    expect(within(filtros).getByLabelText(/Buscar/)).toBeInTheDocument();
    expect(within(filtros).getByLabelText('Rol')).toBeInTheDocument();
    expect(within(filtros).getByLabelText('Estado')).toBeInTheDocument();
  });

  it('los encabezados son cortos, para que no se partan en dos renglones', async () => {
    servidor.use(http.get('*/api/usuarios', () => lista([usuario()])));
    renderizarApp('/usuarios', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Usuarios' });
    const encabezados = within(tabla)
      .getAllByRole('columnheader')
      .map((e) => e.textContent?.trim());
    expect(encabezados.slice(0, 6)).toEqual([
      'Nombre',
      'Usuario',
      'DNI',
      'Rol',
      'Estado',
      'Rostro',
    ]);
  });

  it('la persona va en negrita y la fila dice qué abre', async () => {
    servidor.use(http.get('*/api/usuarios', () => lista([usuario()])));
    renderizarApp('/usuarios', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Usuarios' });
    const fila = await within(tabla).findByRole('row', { name: 'Abrir Gómez, Lucía' });
    expect(within(fila).getByText('Gómez, Lucía').tagName).toBe('STRONG');
  });

  it('mientras se filtra, las filas anteriores se ven atenuadas y el listado figura ocupado', async () => {
    let liberar!: () => void;
    const respuestaLenta = new Promise<void>((resolver) => (liberar = resolver));
    servidor.use(
      http.get('*/api/usuarios', async ({ request }) => {
        if (new URL(request.url).searchParams.get('activo') === 'false') await respuestaLenta;
        return lista([usuario()]);
      }),
    );
    renderizarApp('/usuarios', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Usuarios' });
    await within(tabla).findByText('Gómez, Lucía');
    const contenedor = tabla.closest('[aria-busy]')!;
    expect(contenedor).toHaveAttribute('aria-busy', 'false');

    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Dados de baja');

    await waitFor(() => expect(contenedor).toHaveAttribute('aria-busy', 'true'));
    expect(contenedor).toHaveStyle({ opacity: '0.5' });
    expect(within(tabla).getByText('Gómez, Lucía')).toBeInTheDocument();

    liberar();
    await waitFor(() => expect(contenedor).toHaveAttribute('aria-busy', 'false'));
  });
});
