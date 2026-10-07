import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { ADMIN, ENFERMERO, MEDICO } from '../pruebas/datos';
import { listaDePacientes, paciente } from '../pruebas/datosPacientes';
import { renderizarApp } from '../pruebas/renderizar';
import { servidor } from '../pruebas/servidor';

/** Nombres de las tareas que ofrece el Inicio, en el orden en que aparecen. */
const tareas = () => screen.getAllByRole('link').map((l) => l.textContent);

describe('inicio por rol: las tareas del día con las palabras de quien las hace', () => {
  it('enfermería ve primero administrar medicamento, registrar insumos y buscar paciente', async () => {
    renderizarApp('/', ENFERMERO);
    await screen.findByRole('heading', { name: /Hola, Sofía/ });

    const enInicio = tareas().filter((t) => t && !/^(Inicio|Pacientes|Suministros)$/.test(t));
    expect(enInicio.slice(0, 3)).toEqual([
      expect.stringMatching(/^Administrar medicamento/),
      expect.stringMatching(/^Registrar insumos/),
      expect.stringMatching(/^Buscar paciente/),
    ]);
    expect(screen.queryByRole('link', { name: /Internar paciente/ })).not.toBeInTheDocument();
  });

  it('el médico ve internar y buscar paciente, pero no administrar', async () => {
    renderizarApp('/', MEDICO);
    expect(await screen.findByRole('link', { name: /Internar paciente/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Buscar paciente/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Administrar medicamento/ })).not.toBeInTheDocument();
  });

  it('administración ve sus tareas de gestión', async () => {
    renderizarApp('/', ADMIN);
    expect(await screen.findByRole('link', { name: /Nuevo usuario/ })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Registrar el rostro del personal/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Agregar al catálogo/ })).toBeInTheDocument();
  });

  it('desde el inicio se llega a administrar medicamento en un toque', async () => {
    servidor.use(http.get('*/api/pacientes', () => listaDePacientes([paciente()])));
    renderizarApp('/', ENFERMERO);

    await userEvent.click(await screen.findByRole('link', { name: /Administrar medicamento/ }));
    expect(
      await screen.findByRole('heading', { name: 'Administrar medicamento' }),
    ).toBeInTheDocument();
  });
});
