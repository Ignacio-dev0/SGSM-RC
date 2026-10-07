import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  ADMIN_E6,
  ESTADISTICAS,
  ESTADISTICAS_VACIAS,
  errorInterno,
  fijarHoy,
  MEDICO_E6,
  parametrosDe,
  prepararReportes,
  restaurarReportes,
  simularPantalla,
} from '../../pruebas/datosReportes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(() => fijarHoy());
afterEach(restaurarReportes);

/** El valor de un indicador grande, por su nombre. */
const indicador = (nombre: string) =>
  screen.getByText(nombre, { selector: 'dt' }).nextElementSibling as HTMLElement;

/** La sección de un gráfico, por su título. */
const grafico = (titulo: string) => screen.getByRole('region', { name: titulo });

/** Abre "Ver como tabla" de un gráfico y devuelve las filas de su tabla (sin la cabecera). */
async function verComoTabla(titulo: string) {
  const seccion = grafico(titulo);
  const boton = within(seccion).getByRole('button', { name: 'Ver como tabla' });
  expect(boton).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(boton);
  expect(within(seccion).getByRole('button', { name: 'Ocultar la tabla' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const tabla = within(seccion).getByRole('table', { name: `${titulo} (tabla)` });
  return within(tabla).getAllByRole('row').slice(1);
}

describe('estadísticas del período (T606 · CU33)', () => {
  it('muestra los indicadores grandes arriba', async () => {
    prepararReportes();
    renderizarApp('/reportes?pestana=estadisticas', MEDICO_E6);

    expect(await screen.findByRole('tab', { name: 'Estadísticas' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await screen.findByText('Suministros', { selector: 'dt' });
    expect(indicador('Suministros')).toHaveTextContent('8');
    expect(indicador('Con medicamentos')).toHaveTextContent('3');
    expect(indicador('Con insumos')).toHaveTextContent('5');
    expect(indicador('Pacientes atendidos')).toHaveTextContent('3');
    expect(indicador('Recordatorios atendidos')).toHaveTextContent(/^80\s%/);
    expect(indicador('Recordatorios atendidos')).toHaveTextContent(/4 de 5/);
    expect(screen.getByText(/Del 01\/10\/2026 al 07\/10\/2026 \(7 días\)/)).toBeInTheDocument();
  });

  it('cada gráfico tiene título, y "Ver como tabla" muestra los mismos números', async () => {
    prepararReportes();
    renderizarApp('/reportes?pestana=estadisticas', MEDICO_E6);
    await screen.findByText('Suministros', { selector: 'dt' });

    for (const titulo of [
      'Insumos más usados',
      'Consumo por tipo',
      'Evolución diaria',
      'Recordatorios del período',
    ]) {
      expect(screen.getByRole('heading', { name: titulo, level: 2 })).toBeInTheDocument();
    }

    const insumos = await verComoTabla('Insumos más usados');
    expect(insumos).toHaveLength(ESTADISTICAS.insumosMasUsados.length);
    expect(insumos[0]).toHaveTextContent(/Pañal para adultos · Paquete x\s10.*Insumo.*4/);
    expect(insumos[1]).toHaveTextContent(/Paracetamol · Comprimidos 500\smg.*Medicamento.*3/);

    const consumo = await verComoTabla('Consumo por tipo');
    expect(consumo[0]).toHaveTextContent(/Medicamentos.*3.*37,5\s%/);
    expect(consumo[1]).toHaveTextContent(/Insumos.*5.*62,5\s%/);

    const evolucion = await verComoTabla('Evolución diaria');
    expect(evolucion).toHaveLength(3);
    expect(evolucion[1]).toHaveTextContent(/02\/10\/2026.*3.*2.*1/);
    // Los días en cero también están (D40: un punto por día).
    expect(evolucion[2]).toHaveTextContent(/03\/10\/2026.*0.*0.*0/);

    const recordatorios = await verComoTabla('Recordatorios del período');
    expect(recordatorios.map((f) => f.textContent)).toEqual([
      expect.stringMatching(/A tiempo.*2/),
      expect.stringMatching(/Tarde.*1/),
      expect.stringMatching(/No administrados.*1/),
      expect.stringMatching(/Vencidos sin atender.*1/),
    ]);
  });

  it('los gráficos dicen sus series con texto (leyenda), no solo con color', async () => {
    prepararReportes();
    renderizarApp('/reportes?pestana=estadisticas', MEDICO_E6);
    await screen.findByText('Suministros', { selector: 'dt' });

    expect(within(grafico('Consumo por tipo')).getByText(/Medicamentos: 3/)).toBeInTheDocument();
    expect(within(grafico('Consumo por tipo')).getByText(/Insumos: 5/)).toBeInTheDocument();
    const evolucion = grafico('Evolución diaria');
    for (const serie of ['Suministros', 'Con medicamentos', 'Con insumos']) {
      expect(within(evolucion).getByText(serie)).toBeInTheDocument();
    }
    const recordatorios = grafico('Recordatorios del período');
    for (const serie of [
      /A tiempo: 2/,
      /Tarde: 1/,
      /No administrados: 1/,
      /Vencidos sin atender: 1/,
    ]) {
      expect(within(recordatorios).getByText(serie)).toBeInTheDocument();
    }
  });

  it('cambiar de pestaña conserva los parámetros y pide las estadísticas con ellos', async () => {
    const pedidos = prepararReportes();
    const app = renderizarApp('/reportes?tipo=INSUMO&salaId=2&agruparPor=insumo', ADMIN_E6);
    await screen.findByRole('table', { name: /por insumo/ });

    await userEvent.click(screen.getByRole('tab', { name: 'Estadísticas' }));

    await waitFor(() => expect(pedidos.estadisticas.length).toBeGreaterThan(0));
    expect(Object.fromEntries(pedidos.estadisticas.at(-1)!)).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-07',
      salaId: '2',
      tipo: 'INSUMO',
    });
    const busqueda = new URLSearchParams(app.router.state.location.search);
    expect(busqueda.get('pestana')).toBe('estadisticas');
    expect(busqueda.get('tipo')).toBe('INSUMO');
    // Las estadísticas no se agrupan: el selector no está, pero la agrupación queda para volver.
    expect(screen.queryByLabelText('Agrupar por')).not.toBeInTheDocument();
    expect(busqueda.get('agruparPor')).toBe('insumo');

    await userEvent.click(screen.getByRole('tab', { name: 'Suministros' }));
    expect(await screen.findByLabelText('Agrupar por')).toHaveValue('insumo');
  });

  it('el médico no ve las descargas y el administrador sí', async () => {
    prepararReportes();
    renderizarApp('/reportes?pestana=estadisticas', MEDICO_E6);
    await screen.findByText('Suministros', { selector: 'dt' });
    expect(screen.queryByRole('button', { name: /Descargar/ })).not.toBeInTheDocument();
  });

  it('sin suministros ni recordatorios lo dice con el período, en lugar de gráficos vacíos', async () => {
    prepararReportes({ estadisticas: ESTADISTICAS_VACIAS });
    renderizarApp('/reportes?pestana=estadisticas&periodo=hoy', ADMIN_E6);

    await screen.findByText('Suministros', { selector: 'dt' });
    expect(indicador('Suministros')).toHaveTextContent('0');
    expect(indicador('Recordatorios atendidos')).toHaveTextContent('—');
    expect(
      screen.getByText('No hay suministros el 07/10/2026. Amplíe el período.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/No hubo recordatorios con hora el 07\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Insumos más usados' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Descargar/ })).not.toBeInTheDocument();
  });

  it('si no cargan, lo dice y deja reintentar', async () => {
    prepararReportes();
    let fallar = true;
    servidor.use(
      http.get('*/api/reportes/estadisticas', ({ request }) =>
        fallar
          ? errorInterno()
          : HttpResponse.json({
              data: ESTADISTICAS,
              meta: { parametros: parametrosDe(new URL(request.url).searchParams), dias: 7 },
            }),
      ),
    );
    renderizarApp('/reportes?pestana=estadisticas', ADMIN_E6);

    expect(
      await screen.findByText(
        /No se pudieron cargar las estadísticas. El servidor tuvo un problema/,
      ),
    ).toBeInTheDocument();
    fallar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Suministros', { selector: 'dt' })).toBeInTheDocument();
  });

  it('en el teléfono los gráficos ocupan el ancho de la pantalla y la tabla pasa a tarjetas', async () => {
    simularPantalla({ telefono: true });
    prepararReportes();
    renderizarApp('/reportes?pestana=estadisticas', MEDICO_E6);
    await screen.findByText('Suministros', { selector: 'dt' });

    const seccion = grafico('Insumos más usados');
    // Sin ancho fijo: el gráfico toma el de su contenedor (no hay scroll horizontal).
    expect(seccion.querySelector('svg[width]')).toBeNull();
    await userEvent.click(within(seccion).getByRole('button', { name: 'Ver como tabla' }));
    expect(
      within(seccion).getByRole('list', { name: 'Insumos más usados (tabla)' }),
    ).toBeInTheDocument();
    const boton = within(seccion).getByRole('button', { name: 'Ocultar la tabla' });
    expect(parseFloat(getComputedStyle(boton).minHeight)).toBeGreaterThanOrEqual(48);
  });
});
