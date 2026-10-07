import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ADMIN, MEDICO } from '../../pruebas/datos';
import {
  AHORA_REPORTES,
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
    renderizarApp('/reportes?tipo=INSUMO&agruparPor=insumo&periodo=30', ADMIN);

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
    // E6-15: el aviso dice de qué período es el archivo.
    expect(
      await screen.findByText('Se descargó reporte-suministros-20261007.pdf (08/09 al 07/10).'),
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
    renderizarApp('/reportes?pestana=estadisticas&salaId=2', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Descargar Excel' }));

    expect(
      await screen.findByText('Se descargó estadisticas-20261007.xlsx (01/10 al 07/10).'),
    ).toBeInTheDocument();
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
    renderizarApp('/reportes', ADMIN);

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

// E6-15: la descarga se entiende de principio a fin, también si tarda o si cambian los filtros.
describe('el recorrido de una descarga', () => {
  /** Un archivo que el servidor entrega recién cuando la prueba lo suelta. */
  function archivoQueTarda(ruta = '*/api/reportes/suministros/exportar') {
    let soltar!: () => void;
    const listo = new Promise<void>((r) => (soltar = r));
    servidor.use(
      http.get(ruta, async () => {
        await listo;
        return archivo('reporte-suministros-20261001-20261007.pdf');
      }),
    );
    return () => soltar();
  }

  it('el aviso de cómo terminó se va al cambiar los filtros', async () => {
    prepararReportes();
    servidor.use(
      http.get('*/api/reportes/suministros/exportar', () =>
        archivo('reporte-suministros-20261001-20261007.pdf'),
      ),
    );
    renderizarApp('/reportes', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Descargar PDF' }));
    expect(
      await screen.findByText(
        'Se descargó reporte-suministros-20261001-20261007.pdf (01/10 al 07/10).',
      ),
    ).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Insumos');

    await waitFor(() => expect(screen.queryByText(/Se descargó/)).not.toBeInTheDocument());
  });

  it('el botón de la descarga en curso no desaparece aunque cambien los filtros', async () => {
    prepararReportes();
    const soltar = archivoQueTarda();
    renderizarApp('/reportes', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Descargar PDF' }));
    await screen.findByRole('button', { name: 'Preparando el archivo…' });
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Insumos');

    expect(screen.getByRole('button', { name: 'Preparando el archivo…' })).toBeInTheDocument();
    soltar();
    // El aviso dice el período del archivo que se pidió, no el de los filtros nuevos.
    expect(await screen.findByText(/Se descargó .* \(01\/10 al 07\/10\)\./)).toBeInTheDocument();
    expect(descargas.enlaces).toHaveLength(1);
  });

  it('si tarda más de 10 s lo dice y deja cancelar, sin bajar nada después', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    vi.setSystemTime(new Date(AHORA_REPORTES));
    prepararReportes();
    const soltar = archivoQueTarda();
    renderizarApp('/reportes', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Descargar PDF' }));
    await screen.findByRole('button', { name: 'Preparando el archivo…' });
    expect(screen.queryByText(/Sigue preparándose/)).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(10_000);

    const aviso = await screen.findByText(/Sigue preparándose el PDF…/);
    const cancelar = within(aviso.closest('[role="status"]') as HTMLElement).getByRole('button', {
      name: 'Cancelar',
    });
    await userEvent.click(cancelar);

    expect(await screen.findByText('Se canceló la descarga.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled();
    soltar();
    await vi.advanceTimersByTimeAsync(100);
    expect(descargas.enlaces).toEqual([]);
  });

  it('sin datos en el período lo dice en lugar de los botones', async () => {
    prepararReportes({ filas: [] });
    renderizarApp('/reportes', ADMIN);

    expect(
      await screen.findByText('No hay datos para descargar en este período'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Descargar/ })).not.toBeInTheDocument();
  });

  it('el médico, que no descarga, sabe a quién pedírselo', async () => {
    prepararReportes();
    renderizarApp('/reportes', MEDICO);

    expect(
      await screen.findByText('Para descargar el archivo, pídaselo a un administrador.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Descargar/ })).not.toBeInTheDocument();
  });
});
