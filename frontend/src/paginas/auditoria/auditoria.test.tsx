import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  ENTRADAS,
  entrada,
  paginaDeAuditoria,
  prepararAuditoria,
} from '../../pruebas/datosAuditoria';
import {
  ADMIN_E6,
  errorInterno,
  restaurarReportes,
  simularPantalla,
} from '../../pruebas/datosReportes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

afterEach(restaurarReportes);

const busqueda = (r: ReturnType<typeof renderizarApp>) =>
  new URLSearchParams(r.router.state.location.search);

/** Las filas de datos de la tabla (sin la cabecera), cuando ya llegaron. */
async function filasDeLaTabla() {
  const tabla = await screen.findByRole('table', { name: 'Registros de auditoría' });
  await within(tabla).findAllByRole('row', { name: /Ver el detalle/ });
  return within(tabla).getAllByRole('row').slice(1);
}

describe('consulta de la auditoría (T607 · CU35)', () => {
  it('lista quién hizo qué y cuándo: hora de 24 h, usuario o "Sistema", acción en palabras, registro y paciente', async () => {
    prepararAuditoria();
    renderizarApp('/auditoria', ADMIN_E6);

    expect(await screen.findByRole('heading', { name: 'Auditoría', level: 1 })).toBeInTheDocument();
    const [traslado, generado] = await filasDeLaTabla();
    // 02:30 UTC es 23:30 del día anterior en Argentina.
    expect(traslado).toHaveTextContent(
      /01\/10\/2026 23:30.*López, Lucas.*Trasladó.*Paciente n.º 12.*Alvarez, Ana.*DNI 30111222/,
    );
    expect(generado).toHaveTextContent(/01\/10\/2026 23:00.*Sistema.*Generó.*Recordatorio n.º 301/);
  });

  it('una acción que todavía no tiene nombre se muestra con su código', async () => {
    prepararAuditoria([entrada({ accion: 'ARCHIVAR' })]);
    renderizarApp('/auditoria', ADMIN_E6);

    const [fila] = await filasDeLaTabla();
    expect(fila).toHaveTextContent('ARCHIVAR');
  });

  it('los filtros viajan en el pedido y quedan en la URL; las opciones se leen en palabras', async () => {
    const pedidos = prepararAuditoria();
    const app = renderizarApp('/auditoria?desde=2026-10-01&accion=TRASLADAR', ADMIN_E6);
    await filasDeLaTabla();
    expect(pedidos.at(-1)?.get('desde')).toBe('2026-10-01');
    expect(pedidos.at(-1)?.get('accion')).toBe('TRASLADAR');

    // Las acciones y entidades que hay en la base, con sus nombres (y el código si no lo tiene).
    const accion = screen.getByLabelText('Acción');
    await within(accion).findByRole('option', { name: 'Trasladó' });
    expect(accion).toHaveValue('TRASLADAR');
    expect(within(accion).getByRole('option', { name: 'ARCHIVAR' })).toBeInTheDocument();
    expect(within(accion).getByRole('option', { name: 'Exportó' })).toBeInTheDocument();
    const entidad = screen.getByLabelText('Entidad');
    expect(within(entidad).getByRole('option', { name: 'Prescripción' })).toBeInTheDocument();

    await userEvent.selectOptions(entidad, 'Prescripción');
    await waitFor(() => expect(pedidos.at(-1)?.get('entidad')).toBe('Prescripcion'));
    expect(busqueda(app).get('entidad')).toBe('Prescripcion');

    await screen.findByRole('option', { name: 'López, Lucas' });
    await userEvent.selectOptions(screen.getByLabelText('Usuario'), 'López, Lucas');
    await waitFor(() => expect(pedidos.at(-1)?.get('usuarioId')).toBe('4'));

    await screen.findByRole('option', { name: /Alvarez, Ana/ });
    await userEvent.selectOptions(screen.getByLabelText('Paciente'), 'Alvarez, Ana · DNI 30111222');
    await waitFor(() => expect(pedidos.at(-1)?.get('pacienteId')).toBe('12'));
    expect(busqueda(app).get('pacienteId')).toBe('12');

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-05' } });
    await waitFor(() => expect(pedidos.at(-1)?.get('hasta')).toBe('2026-10-05'));
  });

  it('también lista a los pacientes que ya se fueron', async () => {
    prepararAuditoria();
    renderizarApp('/auditoria', ADMIN_E6);
    expect(
      await screen.findByRole('option', { name: 'Benítez, Rosa · DNI 20333444' }),
    ).toBeInTheDocument();
  });

  it('valida que "hasta" no sea anterior a "desde" antes de pedir, con el mensaje del servidor', async () => {
    const pedidos = prepararAuditoria();
    renderizarApp('/auditoria?desde=2026-10-05', ADMIN_E6);
    await filasDeLaTabla();
    const antes = pedidos.length;

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });

    expect(
      await screen.findByText('La fecha "hasta" no puede ser anterior a "desde"'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
    expect(pedidos.length).toBe(antes);
    expect(screen.queryByRole('table', { name: 'Registros de auditoría' })).not.toBeInTheDocument();
  });

  it('pagina de a 50: "1–50 de 120" y la página siguiente se pide y queda en la URL', async () => {
    const pedidos: URLSearchParams[] = [];
    prepararAuditoria();
    servidor.use(
      http.get('*/api/auditoria', ({ request }) => {
        const p = new URL(request.url).searchParams;
        pedidos.push(p);
        return paginaDeAuditoria(ENTRADAS, {
          pagina: Number(p.get('pagina') ?? 1),
          total: 120,
          totalPaginas: 3,
        });
      }),
    );
    const app = renderizarApp('/auditoria', ADMIN_E6);
    await filasDeLaTabla();

    expect(screen.getByText('1–50 de 120')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    await waitFor(() => expect(pedidos.at(-1)?.get('pagina')).toBe('2'));
    expect(busqueda(app).get('pagina')).toBe('2');
    expect(await screen.findByText('51–100 de 120')).toBeInTheDocument();
  });

  it('sin registros dice con qué filtros se buscó y deja quitarlos', async () => {
    prepararAuditoria([]);
    const app = renderizarApp(
      '/auditoria?accion=TRASLADAR&desde=2026-10-01&hasta=2026-10-05',
      ADMIN_E6,
    );

    expect(
      await screen.findByText(
        'No hay registros de auditoría con la acción "Trasladó" entre el 01/10/2026 y el 05/10/2026. Cambie Acción a Todas, o amplíe las fechas.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    await waitFor(() => expect(busqueda(app).toString()).toBe(''));
  });

  it('si no carga lo dice (no "no hay registros") y deja reintentar', async () => {
    prepararAuditoria();
    let fallar = true;
    servidor.use(
      http.get('*/api/auditoria', () => (fallar ? errorInterno() : paginaDeAuditoria(ENTRADAS))),
    );
    renderizarApp('/auditoria', ADMIN_E6);

    expect(
      await screen.findByText(/No se pudo cargar la auditoría. El servidor tuvo un problema/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No hay registros/)).not.toBeInTheDocument();
    fallar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await filasDeLaTabla()).toHaveLength(2);
  });
});

describe('detalle de un registro: antes y después', () => {
  it('al abrir una fila muestra cada campo antes y después, con lo que cambió marcado con texto', async () => {
    prepararAuditoria([
      entrada({
        valorAnterior: { cama: 'Sala A · A-01', estado: 'INTERNADO', contrasena: '[oculto]' },
        valorNuevo: {
          cama: 'Sala A · A-02',
          estado: 'INTERNADO',
          contrasena: '[oculto]',
          dosis: { valor: 500, unidad: 'mg' },
        },
        detalle: 'Traslado por aislamiento',
      }),
    ]);
    renderizarApp('/auditoria', ADMIN_E6);
    const [fila] = await filasDeLaTabla();

    await userEvent.click(fila!);

    const dialogo = await screen.findByRole('dialog', { name: 'Trasladó · Paciente n.º 12' });
    expect(dialogo).toHaveTextContent(/01\/10\/2026 23:30/);
    expect(dialogo).toHaveTextContent(/López, Lucas/);
    expect(dialogo).toHaveTextContent(/Alvarez, Ana · DNI 30111222/);
    expect(dialogo).toHaveTextContent(/Traslado por aislamiento/);
    expect(dialogo).toHaveTextContent('Cambiaron 2 de 4 campos.');

    const tabla = within(dialogo).getByRole('table', { name: 'Antes y después' });
    const [cabecera, ...filas] = within(tabla).getAllByRole('row');
    expect(cabecera).toHaveTextContent(/Campo.*Antes.*Después/);
    const filaDe = (campo: string) => filas.find((f) => f.textContent?.startsWith(campo))!;

    expect(filaDe('Cama')).toHaveTextContent(/Sala A · A-01.*Sala A · A-02/);
    expect(within(filaDe('Cama')).getByText('Cambió')).toBeInTheDocument();
    expect(within(filaDe('Estado')).queryByText('Cambió')).not.toBeInTheDocument();
    // Un dato sensible llega oculto y se muestra tal cual (D49).
    expect(filaDe('Contraseña')).toHaveTextContent(/\[oculto\].*\[oculto\]/);
    // Un campo nuevo: antes no tenía valor; lo anidado se lee como pares.
    expect(filaDe('Dosis')).toHaveTextContent(/Sin valor.*Valor: 500.*Unidad: mg/);
    expect(within(filaDe('Dosis')).getByText('Cambió')).toBeInTheDocument();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('se abre también con el teclado', async () => {
    prepararAuditoria();
    renderizarApp('/auditoria', ADMIN_E6);
    const [fila] = await filasDeLaTabla();

    fila!.focus();
    await userEvent.keyboard('{Enter}');

    expect(
      await screen.findByRole('dialog', { name: 'Trasladó · Paciente n.º 12' }),
    ).toBeInTheDocument();
  });

  it('lo que se creó con la acción no tiene valores anteriores, y lo dice', async () => {
    prepararAuditoria();
    renderizarApp('/auditoria', ADMIN_E6);
    const [, generado] = await filasDeLaTabla();

    await userEvent.click(generado!);

    const dialogo = await screen.findByRole('dialog', { name: 'Generó · Recordatorio n.º 301' });
    expect(dialogo).toHaveTextContent(/No había valores anteriores/);
    expect(within(dialogo).getByRole('table', { name: 'Antes y después' })).toHaveTextContent(
      /Prioridad.*Sin valor.*MEDIA/,
    );
    expect(within(dialogo).queryByText('Cambió')).not.toBeInTheDocument();
  });

  it('en el teléfono las filas son tarjetas y el detalle ocupa toda la pantalla', async () => {
    simularPantalla({ telefono: true });
    prepararAuditoria();
    renderizarApp('/auditoria', ADMIN_E6);

    const lista = await screen.findByRole('list', { name: 'Registros de auditoría' });
    const [tarjeta] = await within(lista).findAllByRole('button', { name: /Ver el detalle/ });
    await userEvent.click(tarjeta!);

    const dialogo = await screen.findByRole('dialog', { name: 'Trasladó · Paciente n.º 12' });
    expect(dialogo.className).toMatch(/fullScreen/i);
    // Antes y después como pares, sin una tabla de tres columnas que desborde.
    const campos = within(dialogo).getByRole('list', { name: 'Antes y después' });
    expect(within(campos).getByText('Cambió')).toBeInTheDocument();
    const cerrar = within(dialogo).getByRole('button', { name: 'Cerrar' });
    expect(parseFloat(getComputedStyle(cerrar).minHeight)).toBeGreaterThanOrEqual(48);
  });
});

describe('permisos de la auditoría (S17)', () => {
  it('solo el administrador ve Auditoría en el menú', async () => {
    prepararAuditoria();
    renderizarApp('/', ADMIN_E6);
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' });
    await userEvent.click(within(menu).getByRole('link', { name: 'Auditoría' }));
    expect(await screen.findByRole('heading', { name: 'Auditoría', level: 1 })).toBeInTheDocument();
  });

  it('sin usuarios.gestionar no pide la lista del personal (no tiene permiso) y el filtro no está', async () => {
    const soloAuditoria = {
      ...ADMIN_E6,
      permisos: ADMIN_E6.permisos.filter((p) => p !== 'usuarios.gestionar'),
    };
    prepararAuditoria();
    let pidioUsuarios = false;
    servidor.use(
      http.get('*/api/usuarios', () => {
        pidioUsuarios = true;
        return HttpResponse.json(
          { error: { codigo: 'SIN_PERMISO', mensaje: 'x' } },
          { status: 403 },
        );
      }),
    );
    renderizarApp('/auditoria', soloAuditoria);
    await filasDeLaTabla();

    expect(screen.queryByLabelText('Usuario')).not.toBeInTheDocument();
    expect(pidioUsuarios).toBe(false);
  });
});
