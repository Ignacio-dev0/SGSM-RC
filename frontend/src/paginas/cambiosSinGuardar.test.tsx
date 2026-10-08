// UX-11: ninguna pantalla con un formulario a medio cargar lo pierde por un toque accidental
// (Cancelar, la flecha Volver, el menú o el botón Atrás de la tablet): antes pregunta.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Rol, Usuario } from '../api/tipos';
import { ADMIN, ENFERMERO, MEDICO } from '../pruebas/datos';
import {
  SALAS,
  listaDePacientes,
  paciente,
  simularCatalogosDePacientes,
} from '../pruebas/datosPacientes';
import {
  MEDICAMENTOS,
  prepararPrescripciones,
  prescripcion,
  restaurarPruebas,
} from '../pruebas/datosPrescripciones';
import {
  INSUMOS,
  conPrescripciones,
  otraVigente,
  prepararSuministros,
  suministro,
  validarRostro,
  vigente,
} from '../pruebas/datosSuministros';
import { renderizarApp } from '../pruebas/renderizar';
import { servidor } from '../pruebas/servidor';

const PREGUNTA = '¿Descartar lo cargado?';

/** El diálogo que frena la salida (espera a que aparezca). */
const pregunta = () => screen.findByRole('dialog', { name: PREGUNTA });

const noPregunta = () =>
  expect(screen.queryByRole('dialog', { name: PREGUNTA })).not.toBeInTheDocument();

/** Elegir "Seguir editando" y esperar a que el diálogo termine de cerrarse. */
async function seguirEditando() {
  await userEvent.click(within(await pregunta()).getByRole('button', { name: 'Seguir editando' }));
  await waitFor(() => noPregunta());
}

const descartar = async () =>
  userEvent.click(within(await pregunta()).getByRole('button', { name: 'Descartar' }));

const delMenu = (nombre: string) =>
  within(screen.getByRole('navigation', { name: 'Menú principal' })).getByRole('link', {
    name: nombre,
  });

const cancelar = () => userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
const volver = () => userEvent.click(screen.getByRole('link', { name: 'Volver' }));

const aListaDePacientes = () =>
  servidor.use(http.get('*/api/pacientes', () => listaDePacientes([paciente()])));

// Las pantallas a las que se sale (Pacientes y la ficha) piden estas listas; cada prueba puede
// pisarlas con las suyas.
beforeEach(() => {
  servidor.use(
    http.get('*/api/salas', () => HttpResponse.json({ data: SALAS })),
    http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
  );
});

describe('registro de paciente (RegistroPaciente)', () => {
  beforeEach(() => {
    simularCatalogosDePacientes();
    aListaDePacientes();
  });

  it('sin cambios, Cancelar vuelve a Pacientes sin preguntar', async () => {
    renderizarApp('/pacientes/nuevo', MEDICO);

    await screen.findByLabelText(/^DNI/);
    await cancelar();

    expect(await screen.findByRole('table', { name: 'Pacientes' })).toBeInTheDocument();
    noPregunta();
  });

  it('con datos escritos, Cancelar pregunta: "Seguir editando" conserva todo y "Descartar" sale', async () => {
    renderizarApp('/pacientes/nuevo', MEDICO);

    await userEvent.type(await screen.findByLabelText(/^DNI/), '30111222');
    await userEvent.type(screen.getByLabelText(/^Apellido/), 'Benítez');
    await cancelar();
    await seguirEditando();

    expect(screen.getByLabelText(/^DNI/)).toHaveValue('30111222');
    expect(screen.getByLabelText(/^Apellido/)).toHaveValue('Benítez');

    await cancelar();
    await descartar();
    expect(await screen.findByRole('table', { name: 'Pacientes' })).toBeInTheDocument();
  });

  it('elegir solo la cama ya cuenta como cargado', async () => {
    renderizarApp('/pacientes/nuevo', MEDICO);

    await screen.findByRole('option', { name: /A-02/ });
    await userEvent.selectOptions(
      screen.getByLabelText(/^Cama/),
      screen.getByRole('option', { name: /A-02/ }),
    );
    await cancelar();

    expect(await pregunta()).toBeVisible();
  });

  it('un ítem del menú y la flecha Volver también preguntan', async () => {
    renderizarApp('/pacientes/nuevo', MEDICO);

    await userEvent.type(await screen.findByLabelText(/^DNI/), '30111222');
    await userEvent.click(delMenu('Pacientes'));
    await seguirEditando();

    await volver();
    await seguirEditando();
    expect(screen.getByLabelText(/^DNI/)).toHaveValue('30111222');
  });

  it('el botón Atrás del navegador también pregunta', async () => {
    const { router } = renderizarApp('/pacientes', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: /Internar paciente/ }));
    await userEvent.type(await screen.findByLabelText(/^DNI/), '30111222');
    await router.navigate(-1);

    expect(await pregunta()).toBeVisible();
    expect(router.state.location.pathname).toBe('/pacientes/nuevo');
  });

  it('después de internar no pregunta: se abre la ficha del paciente', async () => {
    servidor.use(
      http.post('*/api/pacientes', () =>
        HttpResponse.json({ data: paciente({ id: 7 }) }, { status: 201 }),
      ),
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    );
    renderizarApp('/pacientes/nuevo', MEDICO);

    await userEvent.type(await screen.findByLabelText(/^DNI/), '30111222');
    await userEvent.type(screen.getByLabelText(/^Nombre/), 'Rosa');
    await userEvent.type(screen.getByLabelText(/^Apellido/), 'Benítez');
    await userEvent.type(screen.getByLabelText(/^Fecha de nacimiento/), '1948-03-15');
    await userEvent.selectOptions(screen.getByLabelText(/^Sexo/), 'Femenino');
    await userEvent.selectOptions(
      screen.getByLabelText(/^Cama/),
      screen.getByRole('option', { name: /B-01/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Internar' }));

    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    noPregunta();
  });
});

describe('edición de paciente (EdicionPaciente)', () => {
  beforeEach(() => {
    servidor.use(http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })));
  });

  it('sin tocar nada, Cancelar vuelve a la ficha sin preguntar', async () => {
    renderizarApp('/pacientes/7/editar', MEDICO);

    await waitFor(() => expect(screen.getByLabelText(/^Apellido/)).toHaveValue('Benítez'));
    await cancelar();

    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    noPregunta();
  });

  it('un cambio respecto de lo cargado pregunta; volver al valor original ya no', async () => {
    renderizarApp('/pacientes/7/editar', MEDICO);

    const apellido = await screen.findByLabelText(/^Apellido/);
    await waitFor(() => expect(apellido).toHaveValue('Benítez'));
    await userEvent.type(apellido, 'x');
    await cancelar();
    await seguirEditando();
    expect(apellido).toHaveValue('Benítezx');

    // Borra lo agregado: el formulario queda igual a como llegó.
    await userEvent.type(apellido, '{Backspace}');
    await cancelar();
    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    noPregunta();
  });

  it('con un cambio, "Descartar" vuelve a la ficha', async () => {
    renderizarApp('/pacientes/7/editar', MEDICO);

    const diagnostico = await screen.findByLabelText(/^Diagnóstico/);
    await waitFor(() => expect(diagnostico).toHaveValue('ACV isquémico'));
    await userEvent.type(diagnostico, ' con hemiparesia');
    await userEvent.click(screen.getByRole('link', { name: 'Volver' }));
    await descartar();

    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
  });

  it('después de guardar no pregunta', async () => {
    servidor.use(
      http.patch('*/api/pacientes/7', () =>
        HttpResponse.json({ data: paciente({ diagnostico: 'ACV isquémico con hemiparesia' }) }),
      ),
    );
    renderizarApp('/pacientes/7/editar', MEDICO);

    const diagnostico = await screen.findByLabelText(/^Diagnóstico/);
    await waitFor(() => expect(diagnostico).toHaveValue('ACV isquémico'));
    await userEvent.type(diagnostico, ' con hemiparesia');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/cambios se guardaron/);
    noPregunta();
  });
});

describe('carga de prescripción (CargaPrescripcion)', () => {
  beforeEach(() => {
    prepararPrescripciones();
    aListaDePacientes();
    servidor.use(
      http.get('*/api/pacientes/7/prescripciones', () =>
        HttpResponse.json({ data: [prescripcion()] }),
      ),
    );
  });
  afterEach(restaurarPruebas);

  it('sin escribir nada, Cancelar vuelve a la ficha sin preguntar', async () => {
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await screen.findByRole('region', { name: 'Paciente' });
    await cancelar();

    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    noPregunta();
  });

  it('con la dosis escrita, Cancelar pregunta y "Seguir editando" conserva lo cargado', async () => {
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await userEvent.type(await screen.findByLabelText(/^Dosis/), '500');
    await cancelar();
    await seguirEditando();
    expect(screen.getByLabelText(/^Dosis/)).toHaveValue(500);

    await userEvent.click(delMenu('Pacientes'));
    await descartar();
    expect(await screen.findByRole('table', { name: 'Pacientes' })).toBeInTheDocument();
  });

  it('después de guardar no pregunta', async () => {
    servidor.use(
      http.post('*/api/pacientes/7/prescripciones', () =>
        HttpResponse.json({ data: prescripcion() }, { status: 201 }),
      ),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await screen.findByRole('region', { name: 'Paciente' });
    await screen.findByRole('option', { name: /Paracetamol/ });
    await userEvent.selectOptions(
      screen.getByLabelText(/^Medicamento/),
      screen.getByRole('option', { name: new RegExp(MEDICAMENTOS[0]!.nombre) }),
    );
    await userEvent.type(screen.getByLabelText(/^Dosis/), '500');
    await userEvent.selectOptions(screen.getByLabelText(/^Frecuencia/), 'Cada 8 horas');
    await userEvent.selectOptions(screen.getByLabelText(/^Vía/), 'Oral');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar prescripción' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Prescripción cargada/);
    noPregunta();
  });
});

describe('modificación de prescripción (DetallePrescripcion)', () => {
  beforeEach(() => {
    prepararPrescripciones();
    aListaDePacientes();
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
      http.get('*/api/pacientes/7/prescripciones', () =>
        HttpResponse.json({ data: [prescripcion()] }),
      ),
    );
  });
  afterEach(restaurarPruebas);

  /** La dosis, una vez que llegó la prescripción. */
  async function dosisCargada() {
    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    return dosis;
  }

  async function cambiarDosis(dosis: HTMLElement, valor: string) {
    await userEvent.clear(dosis);
    await userEvent.type(dosis, valor);
  }

  it('sin cambios, la flecha Volver no pregunta', async () => {
    renderizarApp('/prescripciones/40', MEDICO);

    await waitFor(() => expect(screen.getByLabelText(/^Dosis/)).toHaveValue(500));
    await volver();

    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    noPregunta();
  });

  it('con la dosis cambiada, Volver pregunta; "Seguir editando" la conserva y "Descartar" sale', async () => {
    renderizarApp('/prescripciones/40', MEDICO);

    const dosis = await dosisCargada();
    await cambiarDosis(dosis, '1000');
    await volver();
    await seguirEditando();
    expect(dosis).toHaveValue(1000);

    await userEvent.click(delMenu('Pacientes'));
    await descartar();
    expect(await screen.findByRole('table', { name: 'Pacientes' })).toBeInTheDocument();
  });

  it('si la dosis vuelve a su valor original ya no hay nada que perder', async () => {
    renderizarApp('/prescripciones/40', MEDICO);

    const dosis = await dosisCargada();
    await cambiarDosis(dosis, '1000');
    await cambiarDosis(dosis, '500');
    await volver();

    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    noPregunta();
  });

  it('después de guardar los cambios no pregunta', async () => {
    servidor.use(
      http.patch('*/api/prescripciones/40', () =>
        HttpResponse.json({ data: prescripcion({ dosis: 1000 }) }),
      ),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    await cambiarDosis(await dosisCargada(), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const modal = screen.getByRole('dialog', { name: /Guardar cambios/ });
    await userEvent.type(within(modal).getByLabelText(/Motivo del cambio/), 'Dolor persistente');
    await userEvent.click(within(modal).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/guardaron/);

    await volver();
    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    noPregunta();
  });
});

describe('formulario de usuario (FormularioUsuario)', () => {
  const ROLES: Rol[] = [
    { codigo: 'ADMINISTRADOR', nombre: 'Administrador', descripcion: null, permisos: [] },
    { codigo: 'ENFERMERO', nombre: 'Enfermero', descripcion: null, permisos: ['pacientes.ver'] },
  ];
  const usuario = (extra: Partial<Usuario> = {}): Usuario => ({
    id: 10,
    nombreUsuario: 'lgomez',
    dni: '30111222',
    nombre: 'Lucía',
    apellido: 'Gómez',
    email: null,
    matricula: 'ME 2001',
    rol: { codigo: 'ENFERMERO', nombre: 'Enfermero' },
    activo: true,
    fechaBaja: null,
    bloqueadoHasta: null,
    ultimoAcceso: null,
    tieneBiometria: false,
    permisosDelRol: ['pacientes.ver'],
    permisosAdicionales: [],
    ...extra,
  });
  const lista = (data: Usuario[]) =>
    HttpResponse.json({
      data,
      meta: { pagina: 1, porPagina: 20, total: data.length, totalPaginas: 1 },
    });

  beforeEach(() => {
    servidor.use(
      http.get('*/api/roles', () => HttpResponse.json({ data: ROLES })),
      http.get('*/api/usuarios', () => lista([usuario()])),
      http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario() })),
    );
  });

  it('en el alta, sin escribir nada Cancelar no pregunta', async () => {
    renderizarApp('/usuarios/nuevo', ADMIN);

    await screen.findByLabelText(/^DNI/);
    await cancelar();

    expect(await screen.findByRole('table', { name: 'Usuarios' })).toBeInTheDocument();
    noPregunta();
  });

  it('en el alta, con algo escrito Cancelar pregunta', async () => {
    renderizarApp('/usuarios/nuevo', ADMIN);

    await userEvent.type(await screen.findByLabelText(/^Matrícula/), 'ME 1234');
    await cancelar();
    await seguirEditando();
    expect(screen.getByLabelText(/^Matrícula/)).toHaveValue('ME 1234');

    await cancelar();
    await descartar();
    expect(await screen.findByRole('table', { name: 'Usuarios' })).toBeInTheDocument();
  });

  it('en la edición, escribir una contraseña nueva también cuenta como cambio', async () => {
    renderizarApp('/usuarios/10', ADMIN);

    await waitFor(() => expect(screen.getByLabelText(/^Apellido/)).toHaveValue('Gómez'));
    await userEvent.type(screen.getByLabelText(/^Contraseña nueva/), 'Clave2027');
    await cancelar();

    expect(await pregunta()).toBeVisible();
  });

  it('en la edición, sin cambios Cancelar no pregunta', async () => {
    renderizarApp('/usuarios/10', ADMIN);

    await waitFor(() => expect(screen.getByLabelText(/^Apellido/)).toHaveValue('Gómez'));
    await cancelar();

    expect(await screen.findByRole('table', { name: 'Usuarios' })).toBeInTheDocument();
    noPregunta();
  });

  it('después de crear el usuario no pregunta', async () => {
    servidor.use(
      http.post('*/api/usuarios', () => HttpResponse.json({ data: usuario() }, { status: 201 })),
    );
    renderizarApp('/usuarios/nuevo', ADMIN);

    await userEvent.type(await screen.findByLabelText(/^Nombre\s*\*?$/), 'Lucía');
    await userEvent.type(screen.getByLabelText(/^Apellido/), 'Gómez');
    await userEvent.type(screen.getByLabelText(/^DNI/), '30111222');
    await userEvent.type(screen.getByLabelText(/^Nombre de usuario/), 'lgomez');
    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'Enfermero');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), 'Clave2026');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/creado/);
    noPregunta();
  });

  it('después de guardar una modificación, la pantalla sigue ahí y salir no pregunta', async () => {
    servidor.use(
      http.patch('*/api/usuarios/10', () =>
        HttpResponse.json({ data: usuario({ apellido: 'Gómez Paz' }) }),
      ),
    );
    renderizarApp('/usuarios/10', ADMIN);

    const apellido = await screen.findByLabelText(/^Apellido/);
    await waitFor(() => expect(apellido).toHaveValue('Gómez'));
    await userEvent.clear(apellido);
    await userEvent.type(apellido, 'Gómez Paz');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/guardaron/);

    await cancelar();
    expect(await screen.findByRole('table', { name: 'Usuarios' })).toBeInTheDocument();
    noPregunta();
  });
});

describe('registro de insumos (RegistroInsumos)', () => {
  beforeEach(prepararSuministros);
  afterEach(() => vi.unstubAllEnvs());

  it('sin insumos ni observaciones, Volver no pregunta', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await screen.findByRole('button', { name: /Agregar Gasa estéril/ });
    await volver();

    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    noPregunta();
  });

  it('con insumos agregados, Volver y el menú preguntan; "Descartar" sale', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    await volver();
    await seguirEditando();
    expect(screen.getByLabelText('Cantidad de Gasa estéril')).toHaveValue(1);

    await userEvent.click(delMenu('Pacientes'));
    await descartar();
    expect(await screen.findByRole('table', { name: 'Pacientes' })).toBeInTheDocument();
  });

  it('una observación sola también cuenta', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await screen.findByRole('button', { name: /Agregar Gasa estéril/ });
    await userEvent.type(screen.getByLabelText('Observaciones'), 'Curación de la herida');
    await volver();

    expect(await pregunta()).toBeVisible();
  });

  it('cambiar de paciente con insumos cargados también pregunta antes de vaciar la lista', async () => {
    aListaDePacientes();
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Paciente' }), '');
    await seguirEditando();

    expect(screen.getByLabelText('Cantidad de Gasa estéril')).toHaveValue(1);
    // El selector vuelve al paciente de siempre: no queda mostrando uno que no se eligió.
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue('7');
  });

  it('después de registrar no pregunta', async () => {
    validarRostro();
    servidor.use(
      http.post('*/api/suministros/insumos', () =>
        HttpResponse.json(
          {
            data: suministro({
              tipo: 'INSUMOS',
              prescripcion: null,
              detalles: [
                {
                  insumoId: INSUMOS[0]!.id,
                  insumo: INSUMOS[0]!.nombre,
                  tipoInsumo: 'INSUMO',
                  cantidad: 1,
                  unidad: 'unidad',
                },
              ],
            }),
          },
          { status: 201 },
        ),
      ),
    );
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/Se registraron 1 insumo/);

    await volver();
    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    noPregunta();
  });
});

describe('administración de medicamento (AdministracionMedicamento)', () => {
  beforeEach(prepararSuministros);
  afterEach(() => vi.unstubAllEnvs());

  const elegirParacetamol = async () =>
    userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));

  it('sin elegir nada, Volver no pregunta', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await screen.findByRole('button', { name: /Paracetamol 500\smg/ });
    await volver();

    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    noPregunta();
  });

  it('elegir el medicamento con su dosis prescripta todavía no es un cambio', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await elegirParacetamol();
    expect(screen.getByLabelText(/^Cantidad/)).toHaveValue(500);
    await volver();

    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    noPregunta();
  });

  it('con observaciones escritas, Volver pregunta; "Seguir editando" las conserva y "Descartar" sale', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await elegirParacetamol();
    await userEvent.type(screen.getByLabelText('Observaciones'), 'Lo tomó con agua');
    await volver();
    await seguirEditando();
    expect(screen.getByLabelText('Observaciones')).toHaveValue('Lo tomó con agua');

    await userEvent.click(delMenu('Pacientes'));
    await descartar();
    expect(await screen.findByRole('table', { name: 'Pacientes' })).toBeInTheDocument();
  });

  it('con la cantidad cambiada también pregunta', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await elegirParacetamol();
    const cantidad = screen.getByLabelText(/^Cantidad/);
    await userEvent.clear(cantidad);
    await userEvent.type(cantidad, '250');
    await volver();

    expect(await pregunta()).toBeVisible();
  });

  it('cambiar de paciente con observaciones escritas pregunta antes de borrarlas', async () => {
    aListaDePacientes();
    conPrescripciones(vigente, otraVigente(41, 'Ibuprofeno', 400));
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await elegirParacetamol();
    await userEvent.type(screen.getByLabelText('Observaciones'), 'Lo tomó con agua');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Paciente' }), '');
    await seguirEditando();

    expect(screen.getByLabelText('Observaciones')).toHaveValue('Lo tomó con agua');
    expect(screen.getByRole('combobox', { name: 'Paciente' })).toHaveValue('7');
  });

  it('después de registrar la toma no pregunta', async () => {
    validarRostro();
    servidor.use(
      http.post('*/api/suministros/medicamentos', () =>
        HttpResponse.json({ data: suministro() }, { status: 201 }),
      ),
    );
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await elegirParacetamol();
    await userEvent.type(screen.getByLabelText('Observaciones'), 'Lo tomó con agua');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/Se registró Paracetamol/);

    await volver();
    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    noPregunta();
  });
});
