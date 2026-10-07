import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ADMIN } from '../../pruebas/datos';
import {
  ENTRADAS,
  entrada,
  PACIENTES,
  paginaDeAuditoria,
  prepararAuditoria,
} from '../../pruebas/datosAuditoria';
import { errorInterno, restaurarReportes, simularPantalla } from '../../pruebas/datosReportes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

afterEach(restaurarReportes);

const busqueda = (r: ReturnType<typeof renderizarApp>) =>
  new URLSearchParams(r.router.state.location.search);

/** Las filas de datos de la tabla (sin la cabecera), cuando ya llegaron. */
async function filasDeLaTabla() {
  const tabla = await screen.findByRole('table', { name: 'Movimientos' });
  await within(tabla).findAllByRole('row', { name: /Ver el detalle/ });
  return within(tabla).getAllByRole('row').slice(1);
}

describe('consulta de la auditoría (T607 · CU35)', () => {
  it('lista quién hizo qué y cuándo: hora de 24 h, usuario o "Sistema", acción en palabras, sobre qué y paciente', async () => {
    prepararAuditoria();
    renderizarApp('/auditoria', ADMIN);

    expect(await screen.findByRole('heading', { name: 'Auditoría', level: 1 })).toBeInTheDocument();
    const [traslado, generado] = await filasDeLaTabla();
    const cabecera = within(screen.getByRole('table', { name: 'Movimientos' })).getAllByRole(
      'columnheader',
    );
    expect(cabecera.map((c) => c.textContent)).toEqual(
      expect.arrayContaining(['Fecha y hora', 'Usuario', 'Acción', 'Sobre qué', 'Paciente']),
    );
    // 02:30 UTC es 23:30 del día anterior en Argentina.
    expect(traslado).toHaveTextContent(
      /01\/10\/2026 23:30.*López, Lucas.*Trasladó.*Paciente n.º 12.*Alvarez, Ana.*DNI 30111222/,
    );
    expect(generado).toHaveTextContent(/01\/10\/2026 23:00.*Sistema.*Generó.*Recordatorio n.º 301/);
  });

  it('una acción que todavía no tiene nombre se muestra con su código', async () => {
    prepararAuditoria([entrada({ accion: 'ARCHIVAR' })]);
    renderizarApp('/auditoria', ADMIN);

    const [fila] = await filasDeLaTabla();
    expect(fila).toHaveTextContent('ARCHIVAR');
  });

  it('los filtros viajan en el pedido y quedan en la URL; las opciones se leen en palabras', async () => {
    const pedidos = prepararAuditoria();
    const app = renderizarApp('/auditoria?desde=2026-10-01&accion=TRASLADAR', ADMIN);
    await filasDeLaTabla();
    expect(pedidos.at(-1)?.get('desde')).toBe('2026-10-01');
    expect(pedidos.at(-1)?.get('accion')).toBe('TRASLADAR');

    // Las acciones y lo que se tocó, como están en la base, con sus nombres (o el código).
    const accion = screen.getByLabelText('Acción');
    await within(accion).findByRole('option', { name: 'Trasladó' });
    expect(accion).toHaveValue('TRASLADAR');
    expect(within(accion).getByRole('option', { name: 'ARCHIVAR' })).toBeInTheDocument();
    expect(within(accion).getByRole('option', { name: 'Exportó' })).toBeInTheDocument();
    // E6-08: "Sobre qué", la misma palabra en el filtro y en la columna.
    const sobreQue = screen.getByLabelText('Sobre qué');
    expect(within(sobreQue).getByRole('option', { name: 'Todo' })).toBeInTheDocument();
    expect(within(sobreQue).getByRole('option', { name: 'Prescripción' })).toBeInTheDocument();

    await userEvent.selectOptions(sobreQue, 'Prescripción');
    await waitFor(() => expect(pedidos.at(-1)?.get('entidad')).toBe('Prescripcion'));
    expect(busqueda(app).get('entidad')).toBe('Prescripcion');

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-05' } });
    await waitFor(() => expect(pedidos.at(-1)?.get('hasta')).toBe('2026-10-05'));
  });

  it('valida que "hasta" no sea anterior a "desde" antes de pedir, con el mensaje del servidor', async () => {
    const pedidos = prepararAuditoria();
    renderizarApp('/auditoria?desde=2026-10-05', ADMIN);
    await filasDeLaTabla();
    const antes = pedidos.length;

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });

    expect(
      await screen.findByText('La fecha "hasta" no puede ser anterior a "desde"'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
    expect(pedidos.length).toBe(antes);
    expect(screen.queryByRole('table', { name: 'Movimientos' })).not.toBeInTheDocument();
  });

  it('sin movimientos dice con qué filtros se buscó y deja quitarlos', async () => {
    prepararAuditoria([]);
    const app = renderizarApp(
      '/auditoria?accion=TRASLADAR&desde=2026-10-01&hasta=2026-10-05',
      ADMIN,
    );

    expect(
      await screen.findByText(
        'No hay movimientos de personas con la acción "Trasladó" entre el 01/10/2026 y el 05/10/2026. Cambie Acción a Todas, o amplíe las fechas.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    await waitFor(() => expect(busqueda(app).toString()).toBe(''));
  });

  it('sin ningún movimiento de personas, dice cómo ver los del sistema', async () => {
    prepararAuditoria([]);
    renderizarApp('/auditoria', ADMIN);

    expect(
      await screen.findByText(
        'Todavía no hay movimientos de personas. Para ver los del sistema, cambie Origen a Todos.',
      ),
    ).toBeInTheDocument();
  });

  it('si no carga lo dice (no "no hay movimientos") y deja reintentar', async () => {
    prepararAuditoria();
    let fallar = true;
    servidor.use(
      http.get('*/api/auditoria', () => (fallar ? errorInterno() : paginaDeAuditoria(ENTRADAS))),
    );
    renderizarApp('/auditoria', ADMIN);

    expect(
      await screen.findByText(/No se pudo cargar la auditoría. El servidor tuvo un problema/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No hay movimientos/)).not.toBeInTheDocument();
    fallar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await filasDeLaTabla()).toHaveLength(2);
  });
});

// ESC2: por defecto se ven los movimientos de las personas; los del sistema, a pedido.
describe('origen de los movimientos', () => {
  it('por defecto pide los de personas; "Sistema" y "Todos" cambian el pedido y la URL', async () => {
    const pedidos = prepararAuditoria();
    const app = renderizarApp('/auditoria', ADMIN);
    await filasDeLaTabla();

    const origen = screen.getByLabelText('Origen');
    expect(origen).toHaveValue('personas');
    expect(
      within(origen)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Personas', 'Sistema', 'Todos']);
    expect(pedidos.at(-1)?.get('origen')).toBe('personas');
    expect(busqueda(app).has('origen')).toBe(false);

    await userEvent.selectOptions(origen, 'Sistema');
    await waitFor(() => expect(pedidos.at(-1)?.get('origen')).toBe('sistema'));
    expect(busqueda(app).get('origen')).toBe('sistema');

    // Todos: sin el parámetro, el servidor devuelve los dos.
    await userEvent.selectOptions(origen, 'Todos');
    await waitFor(() => expect(pedidos.at(-1)?.has('origen')).toBe(false));
    expect(busqueda(app).get('origen')).toBe('');
  });

  it('un enlace con origen=sistema abre así, y "Quitar filtros" vuelve a Personas', async () => {
    const pedidos = prepararAuditoria([]);
    const app = renderizarApp('/auditoria?origen=sistema', ADMIN);

    expect(await screen.findByText(/No hay movimientos del sistema/)).toBeInTheDocument();
    expect(pedidos.at(-1)?.get('origen')).toBe('sistema');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('origen')).toBe('personas'));
    expect(busqueda(app).has('origen')).toBe(false);
  });
});

// E6-09: el paciente o la persona se buscan en el servidor, no en una lista de 100.
describe('buscar al paciente y al usuario', () => {
  it('el paciente se busca por apellido en el servidor, también entre los que ya se fueron', async () => {
    const pedidos = prepararAuditoria();
    const app = renderizarApp('/auditoria', ADMIN);
    await filasDeLaTabla();

    const paciente = screen.getByRole('combobox', { name: 'Paciente' });
    await userEvent.type(paciente, 'ben');

    // Se busca lo escrito, sin "estado": la auditoría es de toda la historia, también de los egresados.
    await waitFor(() => expect(pedidos.pacientes.at(-1)?.get('texto')).toBe('ben'));
    expect(pedidos.pacientes.at(-1)?.has('estado')).toBe(false);
    await waitFor(() =>
      expect(
        screen.queryByRole('option', { name: 'Alvarez, Ana · DNI 30111222' }),
      ).not.toBeInTheDocument(),
    );
    const opcion = screen.getByRole('option', { name: 'Benítez, Rosa · DNI 20333444' });

    await userEvent.click(opcion);
    await waitFor(() => expect(pedidos.at(-1)?.get('pacienteId')).toBe('7'));
    expect(busqueda(app).get('pacienteId')).toBe('7');
    expect(paciente).toHaveValue('Benítez, Rosa · DNI 20333444');
  });

  it('el usuario se busca en el servidor y se puede volver a "todos" borrándolo', async () => {
    const pedidos = prepararAuditoria();
    const app = renderizarApp('/auditoria', ADMIN);
    await filasDeLaTabla();

    const usuario = screen.getByRole('combobox', { name: 'Usuario' });
    await userEvent.type(usuario, 'lóp');
    await waitFor(() => expect(pedidos.personal.at(-1)?.get('texto')).toBe('lóp'));
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Acosta, Sofía' })).not.toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('option', { name: 'López, Lucas' }));

    await waitFor(() => expect(pedidos.at(-1)?.get('usuarioId')).toBe('4'));

    await userEvent.click(screen.getByRole('button', { name: 'Borrar Usuario' }));
    await waitFor(() => expect(pedidos.at(-1)?.has('usuarioId')).toBe(false));
    expect(busqueda(app).has('usuarioId')).toBe(false);
  });

  it('si hay más pacientes que sugerencias, la ayuda lo dice', async () => {
    prepararAuditoria();
    servidor.use(
      http.get('*/api/pacientes', () =>
        HttpResponse.json({
          data: PACIENTES,
          meta: { pagina: 1, porPagina: 10, total: 230, totalPaginas: 23 },
        }),
      ),
    );
    renderizarApp('/auditoria', ADMIN);
    await filasDeLaTabla();

    await userEvent.click(screen.getByRole('combobox', { name: 'Paciente' }));

    expect(await screen.findByText(/Se muestran 2 de 230\./)).toBeInTheDocument();
  });

  it('un paciente elegido desde un enlace se nombra con lo que trajeron los movimientos', async () => {
    prepararAuditoria();
    renderizarApp('/auditoria?pacienteId=12', ADMIN);
    await filasDeLaTabla();

    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue(
      'Alvarez, Ana · DNI 30111222',
    );
  });
});

describe('paginación de la auditoría (E6-10)', () => {
  const conPaginas = (pedidos: URLSearchParams[]) =>
    servidor.use(
      http.get('*/api/auditoria', ({ request }) => {
        const p = new URL(request.url).searchParams;
        pedidos.push(p);
        const tamano = Number(p.get('tamano') ?? 50);
        return paginaDeAuditoria(ENTRADAS, {
          pagina: Number(p.get('pagina') ?? 1),
          porPagina: tamano,
          total: 120,
          totalPaginas: Math.ceil(120 / tamano),
        });
      }),
    );

  it('de a 50: dice la página, se pasa desde arriba o abajo, queda en la URL y la vista vuelve al título', async () => {
    const pedidos: URLSearchParams[] = [];
    prepararAuditoria();
    conPaginas(pedidos);
    const app = renderizarApp('/auditoria', ADMIN);
    await filasDeLaTabla();

    expect(pedidos.at(-1)?.get('tamano')).toBe('50');
    expect(screen.getAllByText('Página 1 de 3 · 1–50 de 120')).toHaveLength(2);

    const siguientes = screen.getAllByRole('button', { name: 'Página siguiente' });
    expect(siguientes).toHaveLength(2);
    await userEvent.click(siguientes.at(-1)!);

    await waitFor(() => expect(pedidos.at(-1)?.get('pagina')).toBe('2'));
    expect(busqueda(app).get('pagina')).toBe('2');
    expect(await screen.findAllByText('Página 2 de 3 · 51–100 de 120')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Movimientos', level: 2 })).toHaveFocus();

    await userEvent.click(screen.getAllByRole('button', { name: 'Última página' })[0]!);
    await waitFor(() => expect(pedidos.at(-1)?.get('pagina')).toBe('3'));
  });

  it('en el teléfono, de a 25', async () => {
    simularPantalla({ telefono: true });
    const pedidos: URLSearchParams[] = [];
    prepararAuditoria();
    conPaginas(pedidos);
    renderizarApp('/auditoria', ADMIN);

    await screen.findByRole('list', { name: 'Movimientos' });
    expect(pedidos.at(-1)?.get('tamano')).toBe('25');
    expect(await screen.findAllByText('Página 1 de 5 · 1–25 de 120')).toHaveLength(2);
  });
});

describe('permisos de la auditoría (S17)', () => {
  it('solo el administrador ve Auditoría en el menú', async () => {
    prepararAuditoria();
    renderizarApp('/', ADMIN);
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' });
    await userEvent.click(within(menu).getByRole('link', { name: 'Auditoría' }));
    expect(await screen.findByRole('heading', { name: 'Auditoría', level: 1 })).toBeInTheDocument();
  });

  it('sin usuarios.gestionar no busca en el personal (no tiene permiso) y el filtro no está', async () => {
    const soloAuditoria = {
      ...ADMIN,
      permisos: ADMIN.permisos.filter((p) => p !== 'usuarios.gestionar'),
    };
    const pedidos = prepararAuditoria();
    renderizarApp('/auditoria', soloAuditoria);
    await filasDeLaTabla();

    expect(screen.queryByRole('combobox', { name: 'Usuario' })).not.toBeInTheDocument();
    expect(pedidos.personal).toHaveLength(0);
  });
});
