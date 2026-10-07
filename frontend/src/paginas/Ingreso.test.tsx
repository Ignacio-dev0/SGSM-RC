import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { servidor } from '../pruebas/servidor';
import { renderizarApp } from '../pruebas/renderizar';
import { ENFERMERO } from '../pruebas/datos';

const responderLogin = (respuesta: () => Response) =>
  servidor.use(http.post('*/api/auth/login', respuesta));

describe('pantalla de inicio de sesión (T107 · CU06)', () => {
  it('sin sesión, cualquier ruta lleva al ingreso', async () => {
    renderizarApp('/usuarios', null);
    expect(await screen.findByRole('heading', { name: /Ingresar/ })).toBeInTheDocument();
  });

  it('ingresa con usuario y contraseña y recuerda el usuario en la tablet', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('heading', { name: /Hola, Sofía/ })).toBeInTheDocument();
    expect(enviado).toEqual({ nombreUsuario: 'enfermero', contrasena: 'Enfermero2026' });
    expect(localStorage.getItem('sgsm.usuarioRecordado')).toBe('enfermero');
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
    await waitFor(() => expect(login).not.toHaveBeenCalled());
  });
});
