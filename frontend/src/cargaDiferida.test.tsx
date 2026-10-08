import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ADMIN } from './pruebas/datos';
import { prepararAuditoria } from './pruebas/datosAuditoria';
import { renderizarApp } from './pruebas/renderizar';
import { servidor } from './pruebas/servidor';

// El código de la Auditoría y del Catálogo llega cuando la prueba lo libera: así se ve el estado
// intermedio.
const llegada = vi.hoisted(() => {
  const demorada = () => {
    let liberar = () => {};
    const promesa = new Promise<void>((r) => (liberar = r));
    return { promesa, liberar: () => liberar() };
  };
  return { auditoria: demorada(), catalogo: demorada() };
});
vi.mock('./paginas/auditoria/Auditoria', async (original) => {
  await llegada.auditoria.promesa;
  return original();
});
vi.mock('./paginas/catalogo/CatalogoInsumos', async (original) => {
  await llegada.catalogo.promesa;
  return original();
});

// La descarga del código de Reportes falla, como con la red cortada o tras publicar una versión
// nueva (el archivo viejo ya no está en el servidor).
vi.mock('./paginas/reportes/Reportes', () => {
  throw new TypeError('Failed to fetch dynamically imported module: /assets/Reportes-abc.js');
});

describe('carga diferida de pantallas (T702 · RNF03)', () => {
  it('mientras llega el código de una pantalla muestra el Cargando de siempre, con el menú a mano', async () => {
    prepararAuditoria();
    renderizarApp('/auditoria', ADMIN);

    const menu = await screen.findByRole('navigation', { name: 'Menú principal' });
    expect(await screen.findByRole('status')).toHaveTextContent('Cargando…');
    expect(within(menu).getByRole('link', { name: 'Auditoría' })).toBeInTheDocument();

    llegada.auditoria.liberar();
    expect(await screen.findByRole('heading', { name: 'Auditoría', level: 1 })).toBeInTheDocument();
  });

  it('al tocar una opción del menú cuyo código no llegó, responde enseguida con el Cargando', async () => {
    servidor.use(http.get('*/api/insumos', () => HttpResponse.json({ data: [] })));
    renderizarApp('/', ADMIN);
    await screen.findByRole('heading', { name: /Hola, Laura/ });

    const menu = screen.getByRole('navigation', { name: 'Menú principal' });
    await userEvent.click(within(menu).getByRole('link', { name: 'Catálogo' }));
    // No se queda mostrando el Inicio hasta que llegue: el toque tiene respuesta visible.
    expect(await screen.findByRole('status')).toHaveTextContent('Cargando…');
    expect(screen.queryByRole('heading', { name: /Hola, Laura/ })).not.toBeInTheDocument();

    llegada.catalogo.liberar();
    expect(
      await screen.findByRole('heading', { name: 'Catálogo de insumos y medicamentos', level: 1 }),
    ).toBeInTheDocument();
  });

  it('si no llega el código, lo explica y ofrece Reintentar; desde el menú se sigue trabajando', async () => {
    // React informa por consola el error que atrapa el límite: acá es esperado.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderizarApp('/reportes', ADMIN);

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No se pudo abrir esta pantalla');
    expect(within(alerta).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();

    const menu = screen.getByRole('navigation', { name: 'Menú principal' });
    await userEvent.click(within(menu).getByRole('link', { name: 'Inicio' }));
    expect(await screen.findByRole('heading', { name: /Hola, Laura/ })).toBeInTheDocument();
    expect(screen.queryByText(/No se pudo abrir esta pantalla/)).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
