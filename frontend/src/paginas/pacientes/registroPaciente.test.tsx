import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MEDICO } from '../../pruebas/datos';
import { paciente, simularCatalogosDePacientes } from '../../pruebas/datosPacientes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(simularCatalogosDePacientes);

/** Los botones de la botonera del formulario, en el orden en que se leen. */
const botonera = () =>
  within(screen.getByRole('group', { name: 'Acciones del formulario' })).getAllByRole('button');

async function completarDatosPersonales() {
  await userEvent.type(await screen.findByLabelText(/^DNI/), '30111222');
  await userEvent.type(screen.getByLabelText(/^Nombre/), 'Rosa');
  await userEvent.type(screen.getByLabelText(/^Apellido/), 'Benítez');
  await userEvent.type(screen.getByLabelText(/^Fecha de nacimiento/), '1948-03-15');
  await userEvent.selectOptions(screen.getByLabelText(/^Sexo/), 'Femenino');
}

/** Etiquetas de todos los campos de datos del paciente (los que comparten registro y edición). */
const CAMPOS_DEL_PACIENTE = [
  /^DNI/,
  /^Nombre/,
  /^Apellido/,
  /^Fecha de nacimiento/,
  /^Sexo/,
  /^Obra social/,
  /^N\.º de afiliado/,
  /^Diagnóstico/,
  /^Observaciones/,
  /^Contacto de emergencia/,
  /^Teléfono de emergencia/,
];

/** Los campos de datos del paciente que el navegador podría autocompletar (los que no dicen "off"). */
const camposQueSeAutocompletan = () =>
  CAMPOS_DEL_PACIENTE.filter(
    (etiqueta) => screen.getByLabelText(etiqueta).getAttribute('autocomplete') !== 'off',
  ).map(String);

describe('registro de paciente: botonera (F31)', () => {
  it('Cancelar va antes y la acción principal, Internar, es la última del grupo', async () => {
    renderizarApp('/pacientes/nuevo', MEDICO);

    await screen.findByLabelText(/^DNI/);
    expect(botonera().map((b) => b.textContent)).toEqual(['Cancelar', 'Internar']);
    expect(botonera().at(-1)).toHaveAttribute('type', 'submit');
  });
});

describe('registro de paciente: el reingreso pide una decisión (UX-12)', () => {
  it('el aviso "El paciente ya estuvo internado" toma el foco al aparecer', async () => {
    servidor.use(
      http.post('*/api/pacientes', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'PACIENTE_EGRESADO',
              mensaje: 'Benítez, Rosa ya estuvo internado. Puede registrar su reingreso.',
              detalles: { pacienteId: 7 },
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderizarApp('/pacientes/nuevo', MEDICO);

    await completarDatosPersonales();
    await userEvent.selectOptions(
      screen.getByLabelText(/^Cama/),
      screen.getByRole('option', { name: /A-02/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Internar' }));

    const aviso = (await screen.findByText('El paciente ya estuvo internado')).closest(
      '[role="alert"]',
    );
    expect(aviso).toHaveTextContent('Registrar reingreso');
    await waitFor(() => expect(aviso).toHaveFocus());
  });

  it('un error común del servidor no le roba el foco a ningún aviso', async () => {
    servidor.use(
      http.post('*/api/pacientes', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 500 },
        ),
      ),
    );
    renderizarApp('/pacientes/nuevo', MEDICO);

    await completarDatosPersonales();
    await userEvent.selectOptions(
      screen.getByLabelText(/^Cama/),
      screen.getByRole('option', { name: /A-02/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Internar' }));

    // Solo informa: no pide una decisión, así que no se lleva el foco.
    expect(await screen.findByRole('alert')).not.toHaveFocus();
  });
});

describe('datos del paciente: ayuda del DNI y sin autocompletar (UX-20a · UX-20d)', () => {
  it('el DNI explica el formato desde el principio, no recién cuando falla', async () => {
    renderizarApp('/pacientes/nuevo', MEDICO);

    const dni = await screen.findByLabelText(/^DNI/);
    expect(dni).toHaveAccessibleDescription('7 u 8 dígitos, sin puntos');
    expect(screen.getByText('7 u 8 dígitos, sin puntos')).toBeVisible();

    // Al fallar, el error toma el lugar de la ayuda; al corregirlo, vuelve la ayuda.
    await userEvent.type(dni, '123');
    await userEvent.click(screen.getByRole('button', { name: 'Internar' }));
    expect(dni).toHaveAccessibleDescription('El DNI debe tener 7 u 8 dígitos, sin puntos');
    await userEvent.type(dni, '45678');
    expect(dni).toHaveAccessibleDescription('7 u 8 dígitos, sin puntos');
  });

  it('ningún dato del paciente se autocompleta: son de otra persona, no de quien usa la tablet', async () => {
    renderizarApp('/pacientes/nuevo', MEDICO);

    await screen.findByLabelText(/^DNI/);
    expect(camposQueSeAutocompletan()).toEqual([]);
  });
});

describe('edición de paciente: botonera, ayuda del DNI y sin autocompletar', () => {
  beforeEach(() => {
    servidor.use(http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })));
  });

  it('Cancelar va antes y la acción principal, Guardar, es la última del grupo', async () => {
    renderizarApp('/pacientes/7/editar', MEDICO);

    await screen.findByLabelText(/^DNI/);
    expect(botonera().map((b) => b.textContent)).toEqual(['Cancelar', 'Guardar']);
    expect(botonera().at(-1)).toHaveAttribute('type', 'submit');
  });

  it('el DNI conserva su ayuda y los datos no se autocompletan', async () => {
    renderizarApp('/pacientes/7/editar', MEDICO);

    const dni = await screen.findByLabelText(/^DNI/);
    await waitFor(() => expect(dni).toHaveValue('30111222'));
    expect(dni).toHaveAccessibleDescription('7 u 8 dígitos, sin puntos');
    expect(camposQueSeAutocompletan()).toEqual([]);
  });
});
