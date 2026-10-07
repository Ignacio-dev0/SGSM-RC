import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  ADMIN_E6,
  archivo,
  errorInterno,
  fijarHoy,
  prepararReportes,
  restaurarReportes,
  simularDescargas,
} from '../../pruebas/datosReportes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';
import { bajarArchivo } from './Descargas';

let descargas: ReturnType<typeof simularDescargas>;
beforeEach(() => {
  fijarHoy();
  descargas = simularDescargas();
});
afterEach(() => {
  descargas.restaurar();
  restaurarReportes();
});

describe('bajar un archivo al navegador', () => {
  it('lo entrega con un enlace temporal con el nombre del servidor y después libera la memoria', () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });

    bajarArchivo({ blob, nombre: 'reporte-suministros-20261007.pdf' }, 1000);

    expect(descargas.creados).toEqual([blob]);
    expect(descargas.enlaces).toEqual([
      { href: 'blob:sgsm/1', download: 'reporte-suministros-20261007.pdf' },
    ]);
    // El enlace no queda en la página.
    expect(document.querySelector('a[download]')).toBeNull();
    expect(descargas.liberar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(descargas.liberar).toHaveBeenCalledWith('blob:sgsm/1');
  });
});

describe('descargas de los reportes (T603 · CU34)', () => {
  it('el PDF del reporte se pide con los parámetros a la vista y se baja con el nombre del servidor', async () => {
    prepararReportes();
    const pedidos: URL[] = [];
    let soltar!: () => void;
    const listo = new Promise<void>((r) => (soltar = r));
    servidor.use(
      http.get('*/api/reportes/suministros/exportar', async ({ request }) => {
        pedidos.push(new URL(request.url));
        await listo;
        return archivo('reporte-suministros-20261007.pdf');
      }),
    );
    renderizarApp('/reportes?tipo=INSUMO&agruparPor=insumo&periodo=30', ADMIN_E6);

    await userEvent.click(await screen.findByRole('button', { name: 'Descargar PDF' }));

    // Mientras el servidor arma el archivo, se dice y no se puede pedir otro.
    const preparando = await screen.findByRole('button', { name: 'Preparando el archivo…' });
    expect(preparando).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descargar Excel' })).toBeDisabled();
    // También para quien usa lector de pantalla, que no siempre oye el cambio de texto del botón.
    expect(
      within(screen.getByRole('group', { name: 'Descargar' })).getByRole('status'),
    ).toHaveTextContent('Preparando el archivo…');

    soltar();
    expect(
      await screen.findByText('Se descargó reporte-suministros-20261007.pdf.'),
    ).toBeInTheDocument();
    expect(descargas.enlaces).toEqual([
      { href: 'blob:sgsm/1', download: 'reporte-suministros-20261007.pdf' },
    ]);
    expect(await descargas.creados[0]?.text()).toBe('%PDF-1.7');
    const pedido = pedidos[0]!;
    expect(pedido.pathname).toBe('/api/reportes/suministros/exportar');
    expect(Object.fromEntries(pedido.searchParams)).toEqual({
      formato: 'pdf',
      desde: '2026-09-08',
      hasta: '2026-10-07',
      tipo: 'INSUMO',
      agruparPor: 'insumo',
    });
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled();
  });

  it('el Excel de las estadísticas se pide sin agrupación, con el período y los filtros', async () => {
    prepararReportes();
    const pedidos: URL[] = [];
    servidor.use(
      http.get('*/api/reportes/estadisticas/exportar', ({ request }) => {
        pedidos.push(new URL(request.url));
        return archivo('estadisticas-20261007.xlsx');
      }),
    );
    renderizarApp('/reportes?pestana=estadisticas&salaId=2', ADMIN_E6);

    await userEvent.click(await screen.findByRole('button', { name: 'Descargar Excel' }));

    expect(await screen.findByText('Se descargó estadisticas-20261007.xlsx.')).toBeInTheDocument();
    expect(descargas.enlaces.at(-1)?.download).toBe('estadisticas-20261007.xlsx');
    expect(Object.fromEntries(pedidos[0]!.searchParams)).toEqual({
      formato: 'xlsx',
      desde: '2026-10-01',
      hasta: '2026-10-07',
      salaId: '2',
    });
  });

  it.each([
    [
      'un 403',
      () =>
        HttpResponse.json(
          { error: { codigo: 'SIN_PERMISO', mensaje: 'No tiene permiso para esta acción' } },
          { status: 403 },
        ),
      'No se pudo descargar el PDF. No tiene permiso para esta acción',
    ],
    [
      'un error del servidor',
      errorInterno,
      'No se pudo descargar el PDF. El servidor tuvo un problema. Intente de nuevo en unos minutos; si sigue, avise al área de sistemas.',
    ],
  ])('si la descarga falla por %s, lo dice y no baja nada', async (_caso, respuesta, mensaje) => {
    prepararReportes();
    servidor.use(http.get('*/api/reportes/suministros/exportar', respuesta));
    renderizarApp('/reportes', ADMIN_E6);

    await userEvent.click(await screen.findByRole('button', { name: 'Descargar PDF' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(mensaje);
    expect(descargas.enlaces).toEqual([]);
    // Se puede volver a intentar.
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled();
    await userEvent.click(within(alerta).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
