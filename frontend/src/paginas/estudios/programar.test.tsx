import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MEDICO } from '../../pruebas/datos';
import {
  ESTUDIOS,
  TIPOS_ESTUDIO,
  conEstudios,
  contarRecordatorios,
  errorApi,
  estudio,
  localEnHoras,
  prepararEstudios,
  restaurarEstudios,
} from '../../pruebas/datosEstudios';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';
import { isoDeCampoFechaHora } from '../../utilidades/campoFechaHora';

beforeEach(prepararEstudios);
afterEach(restaurarEstudios);

/** Abre el diálogo de programar desde la pestaña Estudios, como médico. */
async function abrirProgramar() {
  renderizarApp('/pacientes/7?pestana=estudios', MEDICO);
  await userEvent.click(await screen.findByRole('button', { name: 'Programar estudio' }));
  return screen.findByRole('dialog', { name: 'Programar estudio' });
}

const campo = (dialogo: HTMLElement, etiqueta: RegExp) => within(dialogo).getByLabelText(etiqueta);
const tipo = (d: HTMLElement) => campo(d, /^Tipo de estudio/);
const fecha = (d: HTMLElement) => campo(d, /^Fecha y hora/);
const nombre = (d: HTMLElement) => campo(d, /^Nombre del estudio/);
const preparacion = (d: HTMLElement) => campo(d, /^Preparación/);
const programar = (d: HTMLElement) =>
  userEvent.click(within(d).getByRole('button', { name: 'Programar estudio' }));

/** Registra lo que se manda a programar y responde con `respuesta` (por defecto, 201). */
function capturarProgramacion(respuesta?: () => Response) {
  const enviados: Record<string, unknown>[] = [];
  servidor.use(
    http.post('*/api/pacientes/7/estudios', async ({ request }) => {
      enviados.push((await request.json()) as Record<string, unknown>);
      return respuesta?.() ?? HttpResponse.json({ data: estudio({ id: 70 }) }, { status: 201 });
    }),
  );
  return enviados;
}

describe('programar un estudio (T511 · S15)', () => {
  it('precarga el nombre y la preparación del tipo, se pueden cambiar, y manda un cuerpo válido', async () => {
    const enviados = capturarProgramacion();
    const pedidos = conEstudios(...ESTUDIOS);
    const recordatorios = contarRecordatorios();
    const d = await abrirProgramar();
    // La identidad del paciente está en el diálogo.
    expect(d).toHaveTextContent('Benítez, Rosa');
    expect(d).toHaveTextContent('DNI 30111222');
    expect(d).toHaveTextContent(/Cama A.01/);

    await userEvent.selectOptions(tipo(d), 'Radiografía');
    expect(nombre(d)).toHaveValue('Radiografía');
    expect(preparacion(d)).toHaveValue('Retirar alhajas y objetos metálicos');
    // Pegado en lugar de tecleado: tecla por tecla, con la suite completa, superaba el tiempo.
    await userEvent.clear(nombre(d));
    await userEvent.paste('Rx de tórax frente y perfil');
    const cuando = localEnHoras(20);
    fireEvent.change(fecha(d), { target: { value: cuando } });
    await userEvent.click(campo(d, /^Observaciones/));
    await userEvent.paste('Trasladar en silla de ruedas');
    await waitFor(() => expect(recordatorios.total).toBeGreaterThan(0));
    const antes = { lista: pedidos.lista, recordatorios: recordatorios.total };
    await programar(d);

    expect(await screen.findByText(/Se programó Rx de tórax frente y perfil/)).toBeVisible();
    expect(enviados).toEqual([
      {
        tipoEstudioId: 2,
        fechaHora: isoDeCampoFechaHora(cuando),
        nombre: 'Rx de tórax frente y perfil',
        preparacion: 'Retirar alhajas y objetos metálicos',
        observaciones: 'Trasladar en silla de ruedas',
      },
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Se vuelven a pedir la lista del paciente y los recordatorios.
    await waitFor(() => expect(pedidos.lista).toBeGreaterThan(antes.lista));
    await waitFor(() => expect(recordatorios.total).toBeGreaterThan(antes.recordatorios));
  });

  it('al cambiar de tipo cambia lo precargado, pero no lo que se escribió a mano', async () => {
    const d = await abrirProgramar();

    await userEvent.selectOptions(tipo(d), 'Laboratorio');
    expect(nombre(d)).toHaveValue('Laboratorio');
    expect(preparacion(d)).toHaveValue('Ayuno de 8 horas');
    // Un tipo sin preparación por defecto deja el campo vacío.
    await userEvent.selectOptions(tipo(d), 'Interconsulta');
    expect(nombre(d)).toHaveValue('Interconsulta');
    expect(preparacion(d)).toHaveValue('');

    await userEvent.clear(nombre(d));
    await userEvent.type(nombre(d), 'Interconsulta con kinesiología');
    await userEvent.selectOptions(tipo(d), 'Radiografía');
    expect(nombre(d)).toHaveValue('Interconsulta con kinesiología');
    expect(preparacion(d)).toHaveValue('Retirar alhajas y objetos metálicos');
  });

  it('si se borra la preparación precargada, se programa sin preparación', async () => {
    const enviados = capturarProgramacion();
    const d = await abrirProgramar();

    await userEvent.selectOptions(tipo(d), 'Radiografía');
    await userEvent.clear(preparacion(d));
    fireEvent.change(fecha(d), { target: { value: localEnHoras(2) } });
    await programar(d);

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]).toMatchObject({ tipoEstudioId: 2, preparacion: null });
  });

  it('valida antes de mandar y lleva el foco al primer campo con error', async () => {
    const enviados = capturarProgramacion();
    const d = await abrirProgramar();

    await programar(d);

    expect(tipo(d)).toHaveAccessibleDescription('Elija el tipo de estudio');
    expect(fecha(d)).toHaveAccessibleDescription('Indique la fecha y hora del estudio');
    await waitFor(() => expect(tipo(d)).toHaveFocus());
    expect(enviados).toHaveLength(0);
    // La lista de tipos cargó: no hay nada que reintentar (E5-07).
    expect(within(d).queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it.each([
    ['ya pasó', -1],
    ['es de más de 90 días adelante', 24 * 91],
  ])('avisa en el campo si la fecha %s, sin mandarla', async (_caso, horas) => {
    const enviados = capturarProgramacion();
    const d = await abrirProgramar();

    await userEvent.selectOptions(tipo(d), 'Laboratorio');
    fireEvent.change(fecha(d), { target: { value: localEnHoras(horas) } });
    expect(fecha(d)).toHaveAccessibleDescription(/entre 5\smin atrás y 90\sdías adelante/);
    await programar(d);

    await waitFor(() => expect(fecha(d)).toHaveFocus());
    expect(enviados).toHaveLength(0);
  });

  it('si no se puede cargar la lista de tipos de estudio, el selector lo dice y deja reintentar', async () => {
    let fallar = true;
    servidor.use(
      http.get('*/api/tipos-estudio', () =>
        fallar ? errorApi(500, 'ERROR_INTERNO') : HttpResponse.json({ data: TIPOS_ESTUDIO }),
      ),
    );
    const d = await abrirProgramar();

    await waitFor(() =>
      expect(tipo(d)).toHaveAccessibleDescription(/No se pudo cargar la lista de tipos de estudio/),
    );
    fallar = false;
    await userEvent.click(within(d).getByRole('button', { name: 'Reintentar' }));
    expect(await within(d).findByRole('option', { name: 'Radiografía' })).toBeInTheDocument();
  });

  it('Cancelar cierra el diálogo sin programar nada', async () => {
    const enviados = capturarProgramacion();
    const d = await abrirProgramar();

    await userEvent.click(within(d).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(enviados).toHaveLength(0);
  });
});

describe('programar: los errores del servidor se dicen en palabras', () => {
  /** Completa el formulario con datos válidos y programa. */
  async function programarValido(d: HTMLElement) {
    await userEvent.selectOptions(tipo(d), 'Radiografía');
    fireEvent.change(fecha(d), { target: { value: localEnHoras(3) } });
    await programar(d);
  }

  it('paciente que ya no está internado', async () => {
    capturarProgramacion(() =>
      errorApi(409, 'PACIENTE_NO_INTERNADO', 'El paciente no está internado'),
    );
    const d = await abrirProgramar();
    await programarValido(d);

    const aviso = await within(d).findByRole('alert');
    expect(aviso).toHaveTextContent(/ya no está internado: no se le pueden programar estudios/);
    // Se lleva a la vista y toma el foco: está arriba, lejos del botón tocado (E5-10).
    await waitFor(() => expect(aviso).toHaveFocus());
  });

  it('tipo de estudio dado de baja: lo dice en el campo y vuelve a pedir la lista', async () => {
    let pedidosTipos = 0;
    servidor.use(
      http.get('*/api/tipos-estudio', () => {
        pedidosTipos++;
        return HttpResponse.json({ data: TIPOS_ESTUDIO });
      }),
    );
    capturarProgramacion(() =>
      errorApi(422, 'TIPO_ESTUDIO_NO_DISPONIBLE', 'El tipo de estudio fue dado de baja'),
    );
    const d = await abrirProgramar();
    await waitFor(() => expect(pedidosTipos).toBe(1));
    await programarValido(d);

    await waitFor(() =>
      expect(tipo(d)).toHaveAccessibleDescription(/ya no está disponible\. Elija otro/),
    );
    await waitFor(() => expect(tipo(d)).toHaveFocus());
    await waitFor(() => expect(pedidosTipos).toBe(2));
  });

  it('fecha fuera de lo permitido según el reloj del servidor', async () => {
    capturarProgramacion(() =>
      errorApi(422, 'FECHA_ESTUDIO_INVALIDA', 'La fecha del estudio no es válida'),
    );
    const d = await abrirProgramar();
    await programarValido(d);

    await waitFor(() =>
      expect(fecha(d)).toHaveAccessibleDescription(/entre 5\smin atrás y 90\sdías adelante/),
    );
    await waitFor(() => expect(fecha(d)).toHaveFocus());
  });

  it('error de validación por campo que devuelve el servidor', async () => {
    capturarProgramacion(() =>
      HttpResponse.json(
        {
          error: {
            codigo: 'VALIDACION',
            mensaje: 'Datos inválidos',
            detalles: [{ campo: 'nombre', mensaje: 'El nombre puede tener hasta 120 caracteres' }],
          },
        },
        { status: 400 },
      ),
    );
    const d = await abrirProgramar();
    await programarValido(d);

    await waitFor(() =>
      expect(nombre(d)).toHaveAccessibleDescription('El nombre puede tener hasta 120 caracteres'),
    );
  });
});

describe('la fecha y hora es siempre la de Argentina (E5-16)', () => {
  // La zona del sistema, para dejarla como estaba: borrar TZ deja UTC, no la del sistema.
  const zonaOriginal = process.env.TZ;
  const zonaDelSistema = Intl.DateTimeFormat().resolvedOptions().timeZone;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T15:00:00.000Z'));
    // La tablet quedó con otra zona: el campo igual habla en hora de Argentina.
    process.env.TZ = 'Asia/Tokyo';
  });
  afterEach(() => {
    process.env.TZ = zonaOriginal ?? zonaDelSistema;
    vi.useRealTimers();
  });

  it('debajo del campo dice cómo quedará, con el formato de la app, y manda esa hora de Argentina', async () => {
    const enviados = capturarProgramacion();
    const d = await abrirProgramar();

    await userEvent.selectOptions(tipo(d), 'Radiografía');
    fireEvent.change(fecha(d), { target: { value: '2026-10-08T10:00' } });

    expect(fecha(d)).toHaveAccessibleDescription(/^Quedará para el 08\/10\/2026\s10:00$/);
    await programar(d);
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]).toMatchObject({ fechaHora: '2026-10-08T13:00:00.000Z' });
  });

  it('sin fecha elegida, la ayuda dice el rango permitido', async () => {
    const d = await abrirProgramar();

    expect(fecha(d)).toHaveAccessibleDescription(/^Entre 5\smin atrás y 90\sdías adelante$/);
  });
});
