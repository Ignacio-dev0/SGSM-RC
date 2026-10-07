import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ADMIN, ENFERMERO, MEDICO } from '../../pruebas/datos';
import {
  errorInterno,
  prepararReportes,
  reporte,
  restaurarReportes,
  simularPantalla,
  fijarHoy,
} from '../../pruebas/datosReportes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(() => fijarHoy());
afterEach(restaurarReportes);

/** Escribe una fecha (el valor completo de una vez) sin confirmarla todavía. */
const escribirFecha = (etiqueta: 'Desde' | 'Hasta', valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

/** Elige una fecha y sale del campo, que es cuando se confirma (E6-13). */
const elegirFecha = (etiqueta: 'Desde' | 'Hasta', valor: string) => {
  escribirFecha(etiqueta, valor);
  fireEvent.blur(screen.getByLabelText(etiqueta));
};

const busqueda = (r: ReturnType<typeof renderizarApp>) =>
  new URLSearchParams(r.router.state.location.search);

describe('reporte de suministros (T605 · CU32)', () => {
  it('abre con los últimos 7 días agrupados por paciente, con su total general', async () => {
    const pedidos = prepararReportes();
    renderizarApp('/reportes', ADMIN);

    expect(await screen.findByRole('heading', { name: 'Reportes', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Suministros' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const tabla = await screen.findByRole('table', {
      name: 'Reporte de suministros por paciente',
    });
    await within(tabla).findByText('Alvarez, Ana');
    const filas = within(tabla).getAllByRole('row');
    expect(filas[0]).toHaveTextContent(/Paciente.*Suministros.*Volumen/);
    expect(filas[1]).toHaveTextContent(/Alvarez, Ana.*3.*502/);
    expect(filas[2]).toHaveTextContent(/Benítez, Rosa.*2.*504/);
    // El total general es el del servidor: suministros distintos (D43).
    expect(filas.at(-1)).toHaveTextContent(/Total.*5.*1006/);

    expect(
      screen.getAllByText(/Del 01\/10\/2026 al 07\/10\/2026 \(7 días\)/).length,
    ).toBeGreaterThan(0);
    const pedido = pedidos.reporte.at(-1)!;
    expect(pedido.get('desde')).toBe('2026-10-01');
    expect(pedido.get('hasta')).toBe('2026-10-07');
    expect(pedido.get('agruparPor')).toBe('paciente');
    expect(pedido.has('salaId')).toBe(false);
    expect(pedido.has('tipo')).toBe(false);
  });

  it('los atajos del período cambian las fechas, el pedido y la URL', async () => {
    const pedidos = prepararReportes();
    const app = renderizarApp('/reportes', ADMIN);
    await screen.findByRole('table', { name: /Reporte de suministros/ });

    const periodo = screen.getByRole('group', { name: 'Período' });
    expect(within(periodo).getByRole('button', { name: '7 días' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(within(periodo).getByRole('button', { name: 'Hoy' }));
    await waitFor(() => expect(pedidos.reporte.at(-1)?.get('desde')).toBe('2026-10-07'));
    expect(pedidos.reporte.at(-1)?.get('hasta')).toBe('2026-10-07');
    expect(within(periodo).getByRole('button', { name: 'Hoy' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(busqueda(app).get('periodo')).toBe('hoy');

    await userEvent.click(within(periodo).getByRole('button', { name: '30 días' }));
    await waitFor(() => expect(pedidos.reporte.at(-1)?.get('desde')).toBe('2026-09-08'));
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-09-08');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-10-07');
    expect(busqueda(app).get('periodo')).toBe('30');

    // Volver al período por defecto deja la URL limpia.
    await userEvent.click(within(periodo).getByRole('button', { name: '7 días' }));
    await waitFor(() => expect(pedidos.reporte.at(-1)?.get('desde')).toBe('2026-10-01'));
    expect(busqueda(app).has('periodo')).toBe(false);
  });

  it('las fechas, la sala, el tipo y la agrupación viajan en el pedido y quedan en la URL', async () => {
    const pedidos = prepararReportes();
    const app = renderizarApp(
      '/reportes?desde=2026-09-01&hasta=2026-09-15&salaId=2&tipo=INSUMO&agruparPor=insumo',
      ADMIN,
    );

    await screen.findByRole('table', { name: 'Reporte de suministros por medicamento o insumo' });
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-09-15');
    expect(await screen.findByRole('option', { name: 'Sala B' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sala')).toHaveValue('2');
    expect(screen.getByLabelText('Tipo')).toHaveValue('INSUMO');
    expect(screen.getByLabelText('Agrupar por')).toHaveValue('insumo');
    // Con fechas elegidas ningún atajo queda marcado.
    for (const atajo of ['Hoy', '7 días', '30 días']) {
      expect(screen.getByRole('button', { name: atajo })).toHaveAttribute('aria-pressed', 'false');
    }
    expect(Object.fromEntries(pedidos.reporte.at(-1)!)).toMatchObject({
      desde: '2026-09-01',
      hasta: '2026-09-15',
      salaId: '2',
      tipo: 'INSUMO',
      agruparPor: 'insumo',
    });

    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Medicamentos');
    await waitFor(() => expect(pedidos.reporte.at(-1)?.get('tipo')).toBe('MEDICAMENTO'));
    expect(busqueda(app).get('tipo')).toBe('MEDICAMENTO');

    elegirFecha('Hasta', '2026-09-20');
    await waitFor(() => expect(pedidos.reporte.at(-1)?.get('hasta')).toBe('2026-09-20'));
    expect(busqueda(app).get('hasta')).toBe('2026-09-20');
  });

  it('elegir una fecha estando en un atajo fija las dos fechas del período', async () => {
    const pedidos = prepararReportes();
    const app = renderizarApp('/reportes', ADMIN);
    await screen.findByRole('table', { name: /Reporte de suministros/ });

    elegirFecha('Desde', '2026-09-25');

    await waitFor(() => expect(pedidos.reporte.at(-1)?.get('desde')).toBe('2026-09-25'));
    expect(pedidos.reporte.at(-1)?.get('hasta')).toBe('2026-10-07');
    expect(busqueda(app).get('desde')).toBe('2026-09-25');
    expect(busqueda(app).get('hasta')).toBe('2026-10-07');
    expect(screen.getByRole('button', { name: '7 días' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('valida el período antes de pedirlo, con los mensajes del servidor', async () => {
    const pedidos = prepararReportes();
    renderizarApp('/reportes', ADMIN);
    await screen.findByRole('table', { name: /Reporte de suministros/ });
    const antes = pedidos.reporte.length;

    // El error va bajo el campo que se cambió (E6-13), dicho desde ese campo.
    elegirFecha('Desde', '2026-10-10');
    expect(
      await screen.findByText('La fecha "desde" no puede ser posterior a "hasta"'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Hasta')).not.toHaveAttribute('aria-invalid', 'true');

    elegirFecha('Desde', '2025-10-01');
    expect(await screen.findByText('El período puede tener hasta 366 días')).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toHaveAttribute('aria-invalid', 'true');

    // Ningún pedido con un período inválido, ni una tabla que no corresponde a lo elegido.
    expect(pedidos.reporte.length).toBe(antes);
    expect(screen.queryByRole('table', { name: /Reporte de suministros/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Corrija el período para ver el reporte/)).toBeInTheDocument();
  });

  it('si igual llega un 400 o un 404, muestra el mensaje del servidor junto al campo o arriba', async () => {
    prepararReportes();
    servidor.use(
      http.get('*/api/reportes/suministros', ({ request }) =>
        new URL(request.url).searchParams.get('salaId')
          ? HttpResponse.json(
              { error: { codigo: 'NO_ENCONTRADO', mensaje: 'La sala no existe' } },
              { status: 404 },
            )
          : HttpResponse.json(
              {
                error: {
                  codigo: 'VALIDACION',
                  mensaje: 'Los datos enviados no son válidos',
                  detalles: [{ campo: 'desde', mensaje: 'El período puede tener hasta 366 días' }],
                },
              },
              { status: 400 },
            ),
      ),
    );
    renderizarApp('/reportes', ADMIN);

    expect(await screen.findByText('El período puede tener hasta 366 días')).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toHaveAttribute('aria-invalid', 'true');

    await screen.findByRole('option', { name: 'Sala B' });
    await userEvent.selectOptions(screen.getByLabelText('Sala'), 'Sala B');
    expect(await screen.findByText(/La sala no existe/)).toBeInTheDocument();
  });

  it.each([
    // E6-04: los medicamentos también están; "Insumo" es solo lo no medicinal.
    ['Medicamento o insumo', 'insumo', 'Medicamento o insumo'],
    ['Personal', 'usuario', 'Personal'],
    ['Día', 'dia', 'Día'],
  ])('agrupa por %s', async (opcion, agruparPor, columna) => {
    const pedidos = prepararReportes();
    const app = renderizarApp('/reportes', ADMIN);
    await screen.findByRole('table', { name: /por paciente/ });

    await userEvent.selectOptions(screen.getByLabelText('Agrupar por'), opcion);

    const tabla = await screen.findByRole('table', {
      name: `Reporte de suministros por ${opcion.toLowerCase()}`,
    });
    expect(within(tabla).getAllByRole('columnheader')[0]).toHaveTextContent(columna);
    expect(pedidos.reporte.at(-1)?.get('agruparPor')).toBe(agruparPor);
    expect(busqueda(app).get('agruparPor')).toBe(agruparPor);
  });

  it('por insumo muestra el tipo y la unidad, y no suma unidades distintas en el total (D42 · D43)', async () => {
    prepararReportes();
    renderizarApp('/reportes?agruparPor=insumo', ADMIN);

    const tabla = await screen.findByRole('table', {
      name: 'Reporte de suministros por medicamento o insumo',
    });
    await within(tabla).findByText(/Gasa estéril/);
    const filas = within(tabla).getAllByRole('row');
    expect(filas[0]).toHaveTextContent(/Medicamento o insumo.*Tipo.*Suministros.*Unidades/);
    expect(filas[1]).toHaveTextContent(/Gasa estéril · Sobre x\s1.*Insumo.*2.*5\sunidad/);
    expect(filas[2]).toHaveTextContent(
      /Paracetamol · Comprimidos 500\smg.*Medicamento.*1.*1\scomprimido/,
    );
    expect(filas[3]).toHaveTextContent(/Paracetamol.*2.*1000\smg/);
    // Cada unidad por separado: 1006 sería sumar miligramos con comprimidos y gasas.
    const total = filas.at(-1)!;
    expect(total).toHaveTextContent(/Total/);
    expect(total).toHaveTextContent(/5\sunidad/);
    expect(total).toHaveTextContent(/1\scomprimido/);
    expect(total).toHaveTextContent(/1000\smg/);
    expect(total).not.toHaveTextContent('1006');
    expect(screen.getByText(/cuenta en cada fila y una sola vez en el total/)).toBeInTheDocument();
  });

  // E6-05: por paciente, personal o día la columna suma cantidades de distinta unidad.
  it.each([
    ['paciente', 'Reporte de suministros por paciente'],
    ['usuario', 'Reporte de suministros por personal'],
    ['dia', 'Reporte de suministros por día'],
  ])(
    'agrupado por %s, la columna es el volumen, lo explica arriba y lleva a ver cada unidad',
    async (agruparPor, nombre) => {
      const pedidos = prepararReportes();
      const app = renderizarApp(
        `/reportes?agruparPor=${agruparPor}&tipo=INSUMO&salaId=2&periodo=30`,
        ADMIN,
      );

      const tabla = await screen.findByRole('table', { name: nombre });
      const cabecera = within(tabla).getAllByRole('columnheader');
      expect(cabecera.at(-1)).toHaveTextContent('Volumen (suma de cantidades de distinta unidad)');
      expect(within(tabla).queryByRole('columnheader', { name: 'Unidades' })).toBeNull();
      // La nota va antes de la tabla: se lee antes que los números.
      const nota = await screen.findByText(/suman cantidades de distinta unidad/);
      expect(nota.compareDocumentPosition(tabla) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      const enlace = screen.getByRole('link', { name: 'Ver cada unidad por separado' });
      await userEvent.click(enlace);

      await screen.findByRole('table', { name: 'Reporte de suministros por medicamento o insumo' });
      expect(busqueda(app).get('agruparPor')).toBe('insumo');
      expect(busqueda(app).get('tipo')).toBe('INSUMO');
      expect(busqueda(app).get('salaId')).toBe('2');
      expect(busqueda(app).get('periodo')).toBe('30');
      expect(pedidos.reporte.at(-1)?.get('agruparPor')).toBe('insumo');
    },
  );

  it('sin suministros dice qué período y qué filtros se usaron, y deja quitarlos', async () => {
    prepararReportes({ filas: [] });
    const app = renderizarApp('/reportes?tipo=INSUMO&salaId=2', ADMIN);

    expect(
      await screen.findByText(
        'No hay suministros de insumos en Sala B del 01/10/2026 al 07/10/2026. Amplíe el período, cambie Tipo a Todos, o elija otra sala.',
      ),
    ).toBeInTheDocument();
    // Un período vacío no ofrece descargar un archivo vacío.
    expect(screen.queryByRole('button', { name: 'Descargar PDF' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));

    await waitFor(() => expect(busqueda(app).has('tipo')).toBe(false));
    expect(busqueda(app).has('salaId')).toBe(false);
    expect(screen.getByLabelText('Tipo')).toHaveValue('');
  });

  it('si el reporte no carga lo dice (no "no hay datos") y deja reintentar', async () => {
    prepararReportes();
    let fallar = true;
    servidor.use(
      http.get('*/api/reportes/suministros', ({ request }) =>
        fallar ? errorInterno() : HttpResponse.json(reporte(new URL(request.url).searchParams)),
      ),
    );
    renderizarApp('/reportes', ADMIN);

    expect(
      await screen.findByText(
        /No se pudo cargar el reporte de suministros. El servidor tuvo un problema/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No hay suministros/)).not.toBeInTheDocument();

    fallar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('table', { name: /Reporte de suministros/ }),
    ).toBeInTheDocument();
  });
});

// E6-13: el campo de fecha nativo cambia de valor con cada dígito del año; se pide al confirmar.
describe('fechas del período (E6-13)', () => {
  it('una fecha se pide recién al salir del campo o con Enter, no mientras se escribe', async () => {
    const pedidos = prepararReportes();
    const app = renderizarApp('/reportes', ADMIN);
    await screen.findByRole('table', { name: /Reporte de suministros/ });
    const antes = pedidos.reporte.length;

    escribirFecha('Desde', '0002-09-25');
    escribirFecha('Desde', '2026-09-25');
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-09-25');
    expect(pedidos.reporte.length).toBe(antes);
    expect(busqueda(app).has('desde')).toBe(false);

    fireEvent.blur(screen.getByLabelText('Desde'));
    await waitFor(() => expect(pedidos.reporte.at(-1)?.get('desde')).toBe('2026-09-25'));
    expect(pedidos.reporte.slice(antes).map((p) => p.get('desde'))).not.toContain('0002-09-25');

    escribirFecha('Hasta', '2026-09-30');
    fireEvent.keyDown(screen.getByLabelText('Hasta'), { key: 'Enter' });
    await waitFor(() => expect(pedidos.reporte.at(-1)?.get('hasta')).toBe('2026-09-30'));
    expect(busqueda(app).get('hasta')).toBe('2026-09-30');
  });

  it('una fecha borrada no se repone sola: pide elegirla y no muestra datos de otro período', async () => {
    const pedidos = prepararReportes();
    renderizarApp('/reportes', ADMIN);
    await screen.findByRole('table', { name: /Reporte de suministros/ });
    const antes = pedidos.reporte.length;

    elegirFecha('Desde', '');

    expect(await screen.findByText('Elija la fecha "desde"')).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toHaveValue('');
    expect(screen.getByLabelText('Desde')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('table', { name: /Reporte de suministros/ })).not.toBeInTheDocument();
    expect(pedidos.reporte.length).toBe(antes);

    // Un atajo resuelve el período entero.
    await userEvent.click(screen.getByRole('button', { name: '30 días' }));
    expect(
      await screen.findByRole('table', { name: /Reporte de suministros/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-09-08');
    expect(screen.queryByText('Elija la fecha "desde"')).not.toBeInTheDocument();
  });

  it('el límite de 366 días se dice bajo "Hasta" si fue la que se cambió', async () => {
    prepararReportes();
    renderizarApp('/reportes?desde=2025-01-01&hasta=2025-12-31', ADMIN);
    await screen.findByRole('table', { name: /Reporte de suministros/ });

    elegirFecha('Hasta', '2026-01-05');

    expect(await screen.findByText('El período puede tener hasta 366 días')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Desde')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('una fecha imposible en un enlace pide una fecha válida, no un formato', async () => {
    prepararReportes();
    renderizarApp('/reportes?desde=2026-13-45&hasta=2026-10-07', ADMIN);

    expect(await screen.findByText('Elija una fecha válida')).toBeInTheDocument();
    expect(screen.queryByText(/AAAA-MM-DD/)).not.toBeInTheDocument();
  });
});

// E6-16: un filtro que el servidor rechaza se puede quitar desde el mismo aviso.
describe('filtros que el servidor rechaza (E6-16)', () => {
  it('una sala que no existe se ve en el selector y el aviso ofrece quitar los filtros', async () => {
    prepararReportes();
    servidor.use(
      http.get('*/api/reportes/suministros', ({ request }) => {
        const p = new URL(request.url).searchParams;
        return p.get('salaId') === '99'
          ? HttpResponse.json(
              { error: { codigo: 'NO_ENCONTRADO', mensaje: 'La sala no existe' } },
              { status: 404 },
            )
          : HttpResponse.json(reporte(p));
      }),
    );
    const app = renderizarApp('/reportes?salaId=99', ADMIN);

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(
      'No se pudo armar el reporte de suministros. La sala no existe.',
    );
    expect(
      await screen.findByRole('option', { name: 'Sala n.º 99 (no existe)' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Sala')).toHaveValue('99');

    await userEvent.click(within(alerta).getByRole('button', { name: 'Quitar filtros' }));

    await waitFor(() => expect(busqueda(app).has('salaId')).toBe(false));
    expect(
      await screen.findByRole('table', { name: /Reporte de suministros/ }),
    ).toBeInTheDocument();
  });
});

describe('permisos de los reportes (S17)', () => {
  it('el médico ve el reporte pero no los botones de descarga', async () => {
    prepararReportes();
    renderizarApp('/reportes', MEDICO);

    expect(
      await screen.findByRole('table', { name: /Reporte de suministros/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Descargar/ })).not.toBeInTheDocument();
  });

  it('el administrador ve "Descargar PDF" y "Descargar Excel", sin ninguna acción llena', async () => {
    prepararReportes();
    renderizarApp('/reportes', ADMIN);

    const pdf = await screen.findByRole('button', { name: 'Descargar PDF' });
    const excel = screen.getByRole('button', { name: 'Descargar Excel' });
    for (const boton of [pdf, excel]) {
      expect(boton).not.toHaveClass('MuiButton-contained');
      expect(parseFloat(getComputedStyle(boton).minHeight)).toBeGreaterThanOrEqual(48);
    }
  });

  it('enfermería no ve Reportes en el menú', async () => {
    renderizarApp('/', ENFERMERO);
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' });
    expect(within(menu).queryByRole('link', { name: 'Reportes' })).not.toBeInTheDocument();
  });

  it('desde el menú el administrador llega a Reportes en un toque', async () => {
    prepararReportes();
    renderizarApp('/', ADMIN);
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' });

    await userEvent.click(within(menu).getByRole('link', { name: 'Reportes' }));

    expect(await screen.findByRole('heading', { name: 'Reportes', level: 1 })).toBeInTheDocument();
  });
});

describe('reportes en el teléfono', () => {
  it('las filas pasan a tarjetas y los atajos y botones miden al menos 48 px', async () => {
    simularPantalla({ telefono: true });
    prepararReportes();
    renderizarApp('/reportes', ADMIN);

    const lista = await screen.findByRole('list', { name: 'Reporte de suministros por paciente' });
    expect(within(lista).getAllByRole('listitem').at(-1)).toHaveTextContent(/Total/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    for (const nombre of ['Hoy', '7 días', '30 días', 'Descargar PDF', 'Descargar Excel']) {
      const boton = screen.getByRole('button', { name: nombre });
      expect(parseFloat(getComputedStyle(boton).minHeight)).toBeGreaterThanOrEqual(48);
    }
  });
});
