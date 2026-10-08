import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { servidor } from '../pruebas/servidor';
import { renderizarApp } from '../pruebas/renderizar';
import { ADMIN, ENFERMERO, MEDICO } from '../pruebas/datos';

const responderLogin = (respuesta: () => Response) =>
  servidor.use(http.post('*/api/auth/login', respuesta));

describe('pantalla de inicio de sesión (T107 · CU06)', () => {
  it('sin sesión, cualquier ruta lleva al ingreso', async () => {
    renderizarApp('/usuarios', null);
    expect(await screen.findByRole('heading', { name: /Ingresar/ })).toBeInTheDocument();
  });

  it('ingresa con usuario y contraseña y, si se pide, recuerda el usuario en la tablet', async () => {
    let enviado: unknown;
    responderLogin(() => HttpResponse.json({ data: ENFERMERO }));
    servidor.use(
      http.post('*/api/auth/login', async ({ request }) => {
        enviado = await request.json();
        return HttpResponse.json({ data: ENFERMERO });
      }),
    );
    renderizarApp('/', null);

    await userEvent.type(await screen.findByLabelText('Usuario'), 'enfermero');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Enfermero2026');
    await userEvent.click(screen.getByLabelText(/Recordar mi usuario/));
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('heading', { name: /Hola, Sofía/ })).toBeInTheDocument();
    expect(enviado).toEqual({ nombreUsuario: 'enfermero', contrasena: 'Enfermero2026' });
    expect(localStorage.getItem('sgsm.usuarioRecordado')).toBe('enfermero');
  });

  it('manda el usuario sin espacios alrededor y en minúsculas (el teclado de la tablet pone mayúscula)', async () => {
    let enviado: unknown;
    servidor.use(
      http.post('*/api/auth/login', async ({ request }) => {
        enviado = await request.json();
        return HttpResponse.json({ data: ENFERMERO });
      }),
    );
    renderizarApp('/', null);

    await userEvent.type(await screen.findByLabelText('Usuario'), '  Enfermero ');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Enfermero2026');
    await userEvent.click(screen.getByLabelText(/Recordar mi usuario/));
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    await screen.findByRole('heading', { name: /Hola, Sofía/ });
    expect(enviado).toEqual({ nombreUsuario: 'enfermero', contrasena: 'Enfermero2026' });
    expect(localStorage.getItem('sgsm.usuarioRecordado')).toBe('enfermero');
  });

  it('en una tablet nueva no recuerda el usuario salvo que se pida (las tablets son compartidas)', async () => {
    renderizarApp('/', null);
    expect(await screen.findByLabelText(/Recordar mi usuario/)).not.toBeChecked();
  });

  it('la pantalla tiene su región principal', async () => {
    renderizarApp('/', null);
    expect(await screen.findByRole('main')).toContainElement(
      screen.getByRole('heading', { name: /Ingresar/ }),
    );
  });

  it('completa el usuario recordado', async () => {
    localStorage.setItem('sgsm.usuarioRecordado', 'enfermero');
    renderizarApp('/', null);
    expect(await screen.findByLabelText('Usuario')).toHaveValue('enfermero');
  });

  it('no recuerda el usuario si se desmarca la opción', async () => {
    localStorage.setItem('sgsm.usuarioRecordado', 'enfermero');
    responderLogin(() => HttpResponse.json({ data: ENFERMERO }));
    renderizarApp('/', null);

    await userEvent.type(await screen.findByLabelText('Contraseña'), 'Enfermero2026');
    await userEvent.click(screen.getByLabelText(/Recordar mi usuario/));
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    await screen.findByRole('heading', { name: /Hola, Sofía/ });
    expect(localStorage.getItem('sgsm.usuarioRecordado')).toBeNull();
  });

  it('muestra el error de credenciales que devuelve el servidor', async () => {
    responderLogin(() =>
      HttpResponse.json(
        {
          error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Usuario o contraseña incorrectos' },
        },
        { status: 401 },
      ),
    );
    renderizarApp('/', null);

    await userEvent.type(await screen.findByLabelText('Usuario'), 'enfermero');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mal');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos');
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    // El foco vuelve a la contraseña para escribirla de nuevo.
    await waitFor(() => expect(screen.getByLabelText('Contraseña')).toHaveFocus());
  });

  it('informa cuando la cuenta está bloqueada', async () => {
    responderLogin(() =>
      HttpResponse.json(
        {
          error: {
            codigo: 'CUENTA_BLOQUEADA',
            mensaje: 'La cuenta está bloqueada por intentos fallidos hasta las 10:15',
          },
        },
        { status: 423 },
      ),
    );
    renderizarApp('/', null);

    await userEvent.type(await screen.findByLabelText('Usuario'), 'enfermero');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mal');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/bloqueada/);
  });

  it('pide completar los datos antes de enviar', async () => {
    const login = vi.fn(() => HttpResponse.json({ data: ENFERMERO }));
    responderLogin(login);
    renderizarApp('/', null);

    await userEvent.click(await screen.findByRole('button', { name: 'Ingresar' }));

    expect(screen.getByText('Ingrese su usuario')).toBeInTheDocument();
    expect(screen.getByText('Ingrese su contraseña')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Usuario')).toHaveFocus());
    await waitFor(() => expect(login).not.toHaveBeenCalled());
  });
});

describe('después del cierre por inactividad (ESC1)', () => {
  /** Una sesión que se cierra por inactividad enseguida (0,3 s), sin tocar nada. */
  function cerrarPorInactividad(usuario: typeof ENFERMERO) {
    servidor.use(
      http.post('*/api/auth/logout', () => HttpResponse.json({ data: { cerrada: true } })),
    );
    renderizarApp('/', { ...usuario, inactividadMinutos: 0.005 });
  }

  it('a quien atiende recordatorios le explica que los avisos quedaron apagados', async () => {
    cerrarPorInactividad(ENFERMERO);

    expect(await screen.findByRole('heading', { name: /Ingresar/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Se cerró la sesión por inactividad. Los avisos de recordatorios quedan apagados hasta que vuelva a ingresar.',
    );
  });

  it('a quien no recibe avisos le dice solo que vuelva a ingresar', async () => {
    cerrarPorInactividad(MEDICO);

    expect(await screen.findByRole('heading', { name: /Ingresar/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Se cerró la sesión por inactividad. Vuelva a ingresar.',
    );
    expect(screen.getByRole('status')).not.toHaveTextContent('recordatorios');
  });

  it('al administrador (no es personal de sala) tampoco le habla de los avisos (F8)', async () => {
    cerrarPorInactividad(ADMIN);

    expect(await screen.findByRole('heading', { name: /Ingresar/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Se cerró la sesión por inactividad. Vuelva a ingresar.',
    );
  });
});
