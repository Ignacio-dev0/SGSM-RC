import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { ENFERMERO } from '../../pruebas/datos';
import {
  listaDePacientes,
  paciente,
  simularCatalogosDePacientes,
} from '../../pruebas/datosPacientes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

/** Guion no separable (U+2011) que usan las camas en pantalla. */
const GUION = String.fromCharCode(0x2011);

beforeEach(simularCatalogosDePacientes);

describe('listado de pacientes en tablet vertical (F28 · F32 · F48)', () => {
  const unPaciente = http.get('*/api/pacientes', () => listaDePacientes([paciente()]));

  it('los filtros van en una región de búsqueda con nombre (grilla de dos columnas desde sm)', async () => {
    servidor.use(unPaciente);
    renderizarApp('/pacientes', ENFERMERO);

    const filtros = await screen.findByRole('search', { name: 'Filtros' });
    expect(within(filtros).getByLabelText(/Buscar/)).toBeInTheDocument();
    expect(within(filtros).getByLabelText('Sala')).toBeInTheDocument();
    expect(within(filtros).getByLabelText('Estado')).toBeInTheDocument();
  });

  it('los encabezados son cortos, para que no se partan en dos renglones', async () => {
    servidor.use(unPaciente);
    renderizarApp('/pacientes', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Pacientes' });
    const encabezados = within(tabla)
      .getAllByRole('columnheader')
      .map((e) => e.textContent?.trim());
    expect(encabezados.slice(0, 6)).toEqual(['Cama', 'Paciente', 'DNI', 'Edad', 'Sala', 'Estado']);
  });

  it('el paciente va en negrita y la fila dice qué abre', async () => {
    servidor.use(unPaciente);
    renderizarApp('/pacientes', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Pacientes' });
    const fila = await within(tabla).findByRole('row', { name: 'Abrir Benítez, Rosa' });
    expect(within(fila).getByText('Benítez, Rosa').tagName).toBe('STRONG');
  });

  it('la cama no se parte: "A-01" lleva un guion que no permite cortar el renglón', async () => {
    servidor.use(unPaciente);
    renderizarApp('/pacientes', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Pacientes' });
    const cama = await within(tabla).findByText(`A${GUION}01`);
    // Sigue siendo la cama A-01 para quien lee: solo cambia dónde puede cortar el renglón.
    expect(cama).toHaveTextContent(/^A.01$/);
    expect(within(tabla).queryByText('A-01')).not.toBeInTheDocument();
  });

  it('mientras se filtra, las filas anteriores se ven atenuadas y el listado figura ocupado', async () => {
    let liberar!: () => void;
    const respuestaLenta = new Promise<void>((resolver) => (liberar = resolver));
    servidor.use(
      http.get('*/api/pacientes', async ({ request }) => {
        if (new URL(request.url).searchParams.get('estado') === 'EGRESADO') await respuestaLenta;
        return listaDePacientes([paciente()]);
      }),
    );
    renderizarApp('/pacientes', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Pacientes' });
    await within(tabla).findByText('Benítez, Rosa');
    const contenedor = tabla.closest('[aria-busy]')!;
    expect(contenedor).toHaveAttribute('aria-busy', 'false');
    expect(contenedor).toHaveStyle({ opacity: '1' });

    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Egresados');

    await waitFor(() => expect(contenedor).toHaveAttribute('aria-busy', 'true'));
    expect(contenedor).toHaveStyle({ opacity: '0.5' });
    // Las filas viejas siguen ahí: no se vacía la lista mientras llegan las nuevas.
    expect(within(tabla).getByText('Benítez, Rosa')).toBeInTheDocument();

    liberar();
    await waitFor(() => expect(contenedor).toHaveAttribute('aria-busy', 'false'));
    expect(contenedor).toHaveStyle({ opacity: '1' });
  });
});
