import { expect, test, type APIRequestContext } from '@playwright/test';
import { enModoDemostracion, ingresar, ingresarPorApi } from './soporte';

/**
 * Recordatorios contra el servidor real (T501–T507 · T701): el médico indica un medicamento cuya
 * toma es en unos minutos; con el panel ya abierto, el temporizador genera el recordatorio y la
 * tarjeta aparece sola por el tiempo real (sin recargar); la enfermera lo administra desde la
 * tarjeta con su rostro y el recordatorio queda atendido. Necesita el temporizador encendido
 * (lo está por defecto) y el modo de demostración para simular la cara. Al terminar, el médico
 * finaliza la indicación para que no siga generando recordatorios. La segunda prueba registra
 * "No se administró" con el motivo (T12 de las tareas núcleo).
 */
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'pc', 'El recorrido se hace una vez, en PC');
});

interface Paciente {
  id: number;
  apellido: string;
  nombre: string;
}

async function datos<T>(api: APIRequestContext, ruta: string): Promise<T> {
  const r = await api.get(ruta);
  expect(r.ok(), `${ruta} → ${r.status()}`).toBe(true);
  return ((await r.json()) as { data: T }).data;
}

/**
 * El médico indica, por la API, un medicamento que el paciente no tiene vigente con la primera
 * toma dentro de `minutos`: así la tarjeta no se confunde con las de otras pruebas.
 */
async function indicarTomaProxima(medico: APIRequestContext, minutos: number) {
  const internados = await datos<Paciente[]>(medico, '/api/pacientes?estado=INTERNADO');
  const paciente = internados[0]!;
  const vigentes = await datos<{ medicamento: { id: number } }[]>(
    medico,
    `/api/pacientes/${paciente.id}/prescripciones?estado=VIGENTE`,
  );
  const medicamentos = await datos<{ id: number; nombre: string }[]>(
    medico,
    '/api/insumos?tipo=MEDICAMENTO',
  );
  const medicamento = medicamentos.find((m) => !vigentes.some((v) => v.medicamento.id === m.id))!;
  const toma = new Date(Date.now() + minutos * 60_000);
  const alta = await medico.post(`/api/pacientes/${paciente.id}/prescripciones`, {
    data: {
      insumoId: medicamento.id,
      dosis: 1,
      unidadDosis: 'comprimido',
      frecuenciaHoras: 24,
      via: 'ORAL',
      // La toma cae dentro de la ventana de generación (30 min antes).
      fechaInicio: toma.toISOString(),
      observaciones: 'Prueba e2e de recordatorios',
      confirmarDuplicada: true,
    },
  });
  expect(alta.status()).toBe(201);
  const prescripcion = ((await alta.json()) as { data: { id: number } }).data;
  const hora = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(toma);
  return {
    paciente,
    medicamento,
    prescripcion,
    nombreTarjeta: `Toma de las ${hora} · ${paciente.apellido}, ${paciente.nombre}`,
    finalizar: () =>
      medico.post(`/api/prescripciones/${prescripcion.id}/estado`, {
        data: { estado: 'FINALIZADA', motivo: 'Fin de la prueba e2e de recordatorios' },
      }),
  };
}

test('la toma que se acerca aparece sola en el panel y se atiende al administrarla', async ({
  page,
  playwright,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const medico = await playwright.request.newContext({ baseURL });
  await ingresarPorApi(medico, 'medico');

  const { paciente, medicamento, prescripcion, nombreTarjeta, finalizar } =
    await indicarTomaProxima(medico, 10);

  try {
    // Inicio → la primera tarea de enfermería → el panel, abierto ANTES de que se genere.
    await ingresar(page, 'enfermero');
    await page.goto('/');
    test.skip(
      !(await enModoDemostracion(page)),
      'Sin modo de demostración no se puede simular el rostro',
    );
    await page.getByRole('link', { name: /Tomas y estudios para atender/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Recordatorios' })).toBeVisible();

    // El temporizador corre cada 60 s: la tarjeta llega por el tiempo real, sin recargar.
    const tarjeta = page.getByRole('listitem', { name: nombreTarjeta });
    await expect(tarjeta).toBeVisible({ timeout: 90_000 });
    // "Faltan 10 min" va con espacios que no cortan: \s los incluye.
    await expect(tarjeta.getByText(/Faltan\s\d+\smin/)).toBeVisible();
    await expect(tarjeta.getByText(new RegExp(medicamento.nombre))).toBeVisible();

    // Administrar desde la tarjeta: llega con el paciente y la prescripción elegidos.
    await tarjeta.getByRole('button', { name: /^Administrar/ }).click();
    await expect(page.getByRole('combobox', { name: 'Paciente' })).toHaveValue(String(paciente.id));
    await expect(
      page.getByRole('button', { name: new RegExp(`^${medicamento.nombre}`), pressed: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar con mi rostro' }).click();
    await page
      .getByRole('dialog', { name: /Confirmar con su rostro/ })
      .getByRole('button', { name: /Simular el rostro de enfermero/ })
      .click();
    await expect(page.getByText('Administración registrada')).toBeVisible();

    // El recordatorio de esa toma quedó atendido: ya no está para atender.
    const pendientes = await datos<{ prescripcion: { id: number } | null }[]>(
      page.request,
      '/api/recordatorios',
    );
    expect(pendientes.some((r) => r.prescripcion?.id === prescripcion.id)).toBe(false);
  } finally {
    await finalizar();
    await medico.dispose();
  }
});

test('T12 · anotar que una toma no se dio y por qué', async ({ page, playwright, baseURL }) => {
  test.setTimeout(180_000);
  const medico = await playwright.request.newContext({ baseURL });
  await ingresarPorApi(medico, 'medico');
  const { prescripcion, nombreTarjeta, finalizar } = await indicarTomaProxima(medico, 12);

  try {
    await ingresar(page, 'enfermero');
    await page.goto('/');
    await page.getByRole('link', { name: /Tomas y estudios para atender/ }).click();
    const tarjeta = page.getByRole('listitem', { name: nombreTarjeta });
    await expect(tarjeta).toBeVisible({ timeout: 90_000 });

    await tarjeta.getByRole('button', { name: /^No se administró/ }).click();
    const dialogo = page.getByRole('dialog', { name: 'No se administró' });
    await dialogo.getByRole('textbox').fill('Paciente en ayunas para un estudio');
    await dialogo.getByRole('button', { name: 'Registrar' }).click();

    // La tarjeta sale de la lista y el recordatorio queda atendido con el motivo.
    await expect(tarjeta).toHaveCount(0);
    const pendientes = await datos<{ prescripcion: { id: number } | null }[]>(
      page.request,
      '/api/recordatorios',
    );
    expect(pendientes.some((r) => r.prescripcion?.id === prescripcion.id)).toBe(false);
  } finally {
    await finalizar();
    await medico.dispose();
  }
});
