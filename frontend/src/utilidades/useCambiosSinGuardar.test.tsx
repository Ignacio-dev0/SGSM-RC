import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { Link, RouterProvider, createMemoryRouter, useNavigate } from 'react-router-dom';
import { tema } from '../tema';
import { useCambiosSinGuardar } from './useCambiosSinGuardar';

/** Un formulario mínimo: escribir algo es "tener cambios". */
function Formulario() {
  const [texto, setTexto] = useState('');
  const { dialogo, permitirSalida } = useCambiosSinGuardar(texto !== '');
  const navegar = useNavigate();
  return (
    <>
      <h1>Formulario</h1>
      <input aria-label="Texto" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <Link to="/otra">Ir a otra</Link>
      <Link to="/formulario?x=1">Cambiar la búsqueda</Link>
      <Link to="/ingresar">Cerrar sesión</Link>
      <button
        onClick={() => {
          permitirSalida();
          navegar('/otra');
        }}
      >
        Guardar y salir
      </button>
      {dialogo}
    </>
  );
}

function abrir() {
  const router = createMemoryRouter(
    [
      { path: '/formulario', element: <Formulario /> },
      { path: '/otra', element: <h1>Otra pantalla</h1> },
      { path: '/ingresar', element: <h1>Ingreso</h1> },
    ],
    { initialEntries: ['/formulario'] },
  );
  render(
    <ThemeProvider theme={tema}>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
  return router;
}

const titulo = (nombre: string) => screen.getByRole('heading', { name: nombre });

describe('useCambiosSinGuardar', () => {
  it('sin cambios no pregunta: la navegación sigue de largo', async () => {
    abrir();
    await userEvent.click(screen.getByRole('link', { name: 'Ir a otra' }));
    expect(titulo('Otra pantalla')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('con cambios pregunta "¿Descartar lo cargado?" y "Seguir editando" se queda con los datos', async () => {
    abrir();
    await userEvent.type(screen.getByLabelText('Texto'), 'a medio cargar');
    await userEvent.click(screen.getByRole('link', { name: 'Ir a otra' }));

    const dialogo = await screen.findByRole('dialog', { name: '¿Descartar lo cargado?' });
    expect(dialogo).toHaveTextContent('se pierde');
    await userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(titulo('Formulario')).toBeInTheDocument();
    expect(screen.getByLabelText('Texto')).toHaveValue('a medio cargar');
  });

  it('"Descartar" deja salir hacia donde se iba', async () => {
    abrir();
    await userEvent.type(screen.getByLabelText('Texto'), 'x');
    await userEvent.click(screen.getByRole('link', { name: 'Ir a otra' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));

    expect(titulo('Otra pantalla')).toBeInTheDocument();
  });

  it('el botón Atrás del navegador también pregunta', async () => {
    const router = abrir();
    await router.navigate('/otra');
    await router.navigate('/formulario');
    await userEvent.type(await screen.findByLabelText('Texto'), 'x');
    await router.navigate(-1);

    expect(await screen.findByRole('dialog', { name: '¿Descartar lo cargado?' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/formulario');
  });

  it('un cambio en la dirección de la misma pantalla (la búsqueda) también pregunta', async () => {
    abrir();
    await userEvent.type(screen.getByLabelText('Texto'), 'x');
    await userEvent.click(screen.getByRole('link', { name: 'Cambiar la búsqueda' }));

    expect(await screen.findByRole('dialog', { name: '¿Descartar lo cargado?' })).toBeVisible();
  });

  it('ir al ingreso (cerrar sesión o sesión vencida) nunca se bloquea', async () => {
    abrir();
    await userEvent.type(screen.getByLabelText('Texto'), 'x');
    await userEvent.click(screen.getByRole('link', { name: 'Cerrar sesión' }));

    expect(titulo('Ingreso')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('después de guardar (permitirSalida) la navegación no pregunta', async () => {
    abrir();
    await userEvent.type(screen.getByLabelText('Texto'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y salir' }));

    expect(titulo('Otra pantalla')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mientras hay cambios, cerrar la pestaña o recargar pide confirmación del navegador', async () => {
    abrir();
    const sinCambios = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(sinCambios);
    expect(sinCambios.defaultPrevented).toBe(false);

    await userEvent.type(screen.getByLabelText('Texto'), 'x');
    const conCambios = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(conCambios);
    expect(conCambios.defaultPrevented).toBe(true);

    await userEvent.clear(screen.getByLabelText('Texto'));
    const borrado = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(borrado);
    expect(borrado.defaultPrevented).toBe(false);
  });
});
