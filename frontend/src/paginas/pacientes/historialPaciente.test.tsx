import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO } from '../../pruebas/datos';
import { HISTORIAL, paciente, simularCatalogosDePacientes } from '../../pruebas/datosPacientes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

/** Guion no separable (U+2011) y espacio no separable, como los escriben las pantallas. */
const GUION = String.fromCharCode(0x2011);
const NBSP = String.fromCharCode(160);

beforeEach(() => {
  simularCatalogosDePacientes();
  servidor.use(
    http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
  );
});

const VACIO = { asignaciones: [], modificaciones: [], suministros: [] };
const falla = () =>
  HttpResponse.json(
    { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
    { status: 500 },
  );

describe('historial del paciente: un fallo de carga no se lee como "no hay nada" (UX-03)', () => {
  const PESTANAS = [
    { nombre: /^Camas/, tabla: 'Asignaciones de cama', vacio: /Todavía no hay asignaciones/ },
    { nombre: /^Modificaciones/, tabla: 'Modificaciones', vacio: /Todavía no hay modificaciones/ },
    { nombre: /^Suministros/, tabla: 'Suministros', vacio: /Todavía no se registró/ },
  ];

  it.each(PESTANAS)(
    'en la pestaña $nombre avisa, deja reintentar y no muestra la tabla ni el vacío',
    async ({ nombre, tabla, vacio }) => {
      let pedidos = 0;
      servidor.use(
        http.get('*/api/pacientes/7/historial', () => {
          pedidos++;
          return pedidos === 1 ? falla() : HttpResponse.json({ data: HISTORIAL });
        }),
      );
      renderizarApp('/pacientes/7?pestana=historial', ENFERMERO);

      await userEvent.click(await screen.findByRole('tab', { name: nombre }));
      const aviso = await screen.findByRole('alert');
      expect(aviso).toHaveTextContent(/No se pudo cargar el historial del paciente/);
      expect(aviso).toHaveTextContent(/El servidor tuvo un problema/);
      expect(screen.queryByRole('table', { name: tabla })).not.toBeInTheDocument();
      expect(screen.queryByText(vacio)).not.toBeInTheDocument();
      expect(screen.queryByText(/^Sin /)).not.toBeInTheDocument();

      await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));

      expect(await screen.findByRole('table', { name: tabla })).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('las pestañas no afirman "(0)" cuando no se pudo saber cuántos registros hay', async () => {
    servidor.use(http.get('*/api/pacientes/7/historial', falla));
    renderizarApp('/pacientes/7?pestana=historial', ENFERMERO);

    await screen.findByRole('alert');
    for (const nombre of ['Camas', 'Modificaciones', 'Suministros']) {
      expect(screen.getByRole('tab', { name: nombre })).toBeInTheDocument();
    }
  });

  it('con datos, cada pestaña sigue contando sus registros', async () => {
    servidor.use(
      http.get('*/api/pacientes/7/historial', () => HttpResponse.json({ data: HISTORIAL })),
    );
    renderizarApp('/pacientes/7?pestana=historial', ENFERMERO);

    expect(await screen.findByRole('tab', { name: 'Camas (2)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Modificaciones (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Suministros (1)' })).toBeInTheDocument();
  });
});

describe('historial del paciente: los vacíos dicen la causa y el paso siguiente', () => {
  it('sin registros, cada pestaña explica cuándo va a aparecer algo', async () => {
    servidor.use(http.get('*/api/pacientes/7/historial', () => HttpResponse.json({ data: VACIO })));
    renderizarApp('/pacientes/7?pestana=historial', ENFERMERO);

    expect(
      await screen.findByText(
        'Todavía no hay asignaciones de cama. Aparecerán aquí cuando se interne o se traslade al paciente.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /^Modificaciones/ }));
    expect(
      await screen.findByText(
        'Todavía no hay modificaciones. Aparecerán aquí cuando se edite la ficha o se registre un movimiento del paciente.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /^Suministros/ }));
    expect(
      await screen.findByText(
        'Todavía no se registró ningún suministro. Aparecerán aquí cuando se administre un medicamento o se registren insumos.',
      ),
    ).toBeInTheDocument();
  });

  it('con fechas elegidas, nombra el período y propone ampliarlo', async () => {
    servidor.use(
      http.get('*/api/pacientes/7/historial', ({ request }) =>
        HttpResponse.json({
          data: new URL(request.url).searchParams.has('desde') ? VACIO : HISTORIAL,
        }),
      ),
    );
    renderizarApp('/pacientes/7?pestana=historial', ENFERMERO);

    await screen.findByRole('tab', { name: 'Camas (2)' });
    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-01');
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-10-05');

    expect(
      await screen.findByText(
        'No hay asignaciones de cama entre el 01/10/2026 y el 05/10/2026. Amplíe las fechas.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /^Suministros/ }));
    expect(
      await screen.findByText(
        'No hay suministros entre el 01/10/2026 y el 05/10/2026. Amplíe las fechas.',
      ),
    ).toBeInTheDocument();
  });
});

describe('historial del paciente: camas y cantidades que no se parten (F28), filas con nombre (F48)', () => {
  beforeEach(() => {
    servidor.use(
      http.get('*/api/pacientes/7/historial', () => HttpResponse.json({ data: HISTORIAL })),
    );
  });

  it('la cama de cada asignación lleva el guion que no permite cortar el renglón', async () => {
    renderizarApp('/pacientes/7?pestana=historial', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Asignaciones de cama' });
    expect(
      await within(tabla).findByText(`Sala B – Traumatología · B${GUION}01`),
    ).toBeInTheDocument();
    expect(
      within(tabla).getByText(`Sala A – Neurorrehabilitación · A${GUION}01`),
    ).toBeInTheDocument();
  });

  it('el insumo y su cantidad usan espacios que no separan el número de la unidad', async () => {
    renderizarApp('/pacientes/7?pestana=historial', ENFERMERO);

    await userEvent.click(await screen.findByRole('tab', { name: /^Suministros/ }));
    const tabla = await screen.findByRole('table', { name: 'Suministros' });
    const detalle = await within(tabla).findByText(/Gasa estéril/);
    expect(detalle.textContent).toContain(`Gasa estéril 10${NBSP}x${NBSP}10${NBSP}cm`);
    expect(detalle.textContent).toContain(`2${NBSP}unidad`);
  });

  it('cada suministro nombra lo que abre, con el día y la hora', async () => {
    renderizarApp('/pacientes/7?pestana=historial', ENFERMERO);

    await userEvent.click(await screen.findByRole('tab', { name: /^Suministros/ }));
    const tabla = await screen.findByRole('table', { name: 'Suministros' });
    expect(
      await within(tabla).findByRole('row', { name: 'Abrir el registro de 04/10 08:00' }),
    ).toBeInTheDocument();
  });

  it('al cambiar las fechas las filas anteriores se atenúan hasta que llegan las nuevas', async () => {
    let liberar!: () => void;
    const respuestaLenta = new Promise<void>((resolver) => (liberar = resolver));
    servidor.use(
      http.get('*/api/pacientes/7/historial', async ({ request }) => {
        if (new URL(request.url).searchParams.has('desde')) await respuestaLenta;
        return HttpResponse.json({ data: HISTORIAL });
      }),
    );
    renderizarApp('/pacientes/7?pestana=historial', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Asignaciones de cama' });
    const contenedor = tabla.closest('[aria-busy]')!;
    expect(contenedor).toHaveAttribute('aria-busy', 'false');

    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-02');

    await waitFor(() => expect(contenedor).toHaveAttribute('aria-busy', 'true'));
    expect(contenedor).toHaveStyle({ opacity: '0.5' });
    expect(within(tabla).getAllByRole('row').length).toBeGreaterThan(1);

    liberar();
    await waitFor(() => expect(contenedor).toHaveAttribute('aria-busy', 'false'));
  });
});
