// Guía del médico · capturas 09–15, 28 y 29: indicar, duplicada, cambiar, suspender, finalizar y reanudar.

import { SUSPENDIDA, ketorolacVigente, permitido } from './api.mjs';
import { HORA, MINUTO, campoDe } from './datos.mjs';
import {
  abrirFicha,
  asomar,
  campo,
  capturar,
  elegir,
  esperar,
  problemas,
  quiere,
} from './pantalla.mjs';

export async function nuevaPrescripcion(page) {
  if (!quiere('09', '10')) return;
  await abrirFicha(page, 'Arrieta');
  await page.getByRole('button', { name: 'Nueva prescripción' }).click();
  const titulo = page.getByRole('heading', { level: 1, name: 'Nueva prescripción' });
  await titulo.waitFor();
  await page.getByRole('region', { name: 'Paciente' }).waitFor();
  await esperar(page);
  await elegir(page.getByLabel('Medicamento'), 'Paracetamol');
  await page.getByLabel('Dosis').fill('500');
  await page.getByLabel('Frecuencia').selectOption({ label: 'Cada 8 horas' });
  await page.getByLabel('Vía').selectOption({ label: 'Oral' });
  const inicio = campoDe(Math.ceil((Date.now() + 10 * MINUTO) / HORA) * HORA);
  await page.getByLabel('Inicio').fill(inicio);
  await page.getByLabel('Observaciones').fill('Dolor de hombro derecho; no más de 3 g por día');
  await page.evaluate(() => window.scrollTo(0, 0));
  await capturar(page, '09-prescripcion-formulario.png', {
    muestra: 'Nueva prescripción (Arrieta): medicamento, dosis, unidad, frecuencia y vía',
    incluir: [titulo],
    marcas: [
      {
        n: 1,
        loc: page.getByRole('region', { name: 'Paciente' }),
        que: 'A quién se le indica: nombre, DNI, edad y cama',
      },
      {
        n: 2,
        loc: campo(page, 'Medicamento'),
        que: 'Selector Medicamento (catálogo)',
        lado: 'izq',
      },
      { n: 3, loc: campo(page, 'Dosis'), que: 'Campo Dosis', lado: 'izq' },
      {
        n: 4,
        loc: campo(page, 'Unidad'),
        que: 'Campo Unidad (se completa con la del medicamento)',
        lado: 'izq',
      },
      { n: 5, loc: campo(page, 'Frecuencia'), que: 'Selector Frecuencia', lado: 'izq' },
      { n: 6, loc: campo(page, 'Vía'), que: 'Selector Vía', lado: 'izq' },
    ],
  });

  await asomar(page.getByRole('list', { name: 'Primeras tomas' }));
  await capturar(page, '10-prescripcion-tomas.png', {
    muestra:
      'Nueva prescripción: inicio, fin opcional, primeras tomas calculadas y Guardar prescripción (sin tocarlo)',
    marcas: [
      { n: 1, loc: campo(page, 'Inicio'), que: 'Campo Inicio (primera toma)', lado: 'izq' },
      { n: 2, loc: campo(page, 'Fin (opcional)'), que: 'Campo Fin (opcional)', lado: 'izq' },
      {
        n: 3,
        loc: page.getByRole('list', { name: 'Primeras tomas' }),
        que: 'Primeras tomas, en 24 h, para revisar antes de guardar',
        lado: 'izq',
      },
      {
        n: 4,
        loc: page.getByRole('button', { name: 'Guardar prescripción' }),
        que: 'Botón Guardar prescripción',
        lado: 'esquina-der',
      },
      {
        n: 5,
        loc: page.getByRole('button', { name: 'Cancelar' }),
        que: 'Botón Cancelar',
        lado: 'izq',
      },
    ],
  });
}

/** 11 · Aviso de prescripción duplicada (el servidor la rechaza y no se toca Cargar igual). */
export async function prescripcionDuplicada(page) {
  if (!quiere('11')) return;
  const vigente = await ketorolacVigente();
  if (!vigente) {
    problemas.push('11: Olmedo no tiene Ketorolac vigente; no se intentó el aviso de duplicada');
    return;
  }
  await abrirFicha(page, 'Olmedo');
  await page.getByRole('button', { name: 'Nueva prescripción' }).click();
  const titulo = page.getByRole('heading', { level: 1, name: 'Nueva prescripción' });
  await titulo.waitFor();
  await page.getByRole('region', { name: 'Paciente' }).waitFor();
  await esperar(page);
  await elegir(page.getByLabel('Medicamento'), 'Ketorolac');
  await page.getByLabel('Dosis').fill('30');
  await page.getByLabel('Frecuencia').selectOption({ label: 'Cada 8 horas' });
  await page.getByLabel('Vía').selectOption({ label: 'Intravenosa' });
  permitido.duplicada = true;
  await page.getByRole('button', { name: 'Guardar prescripción' }).click();
  const aviso = page.locator('.MuiAlert-root', { hasText: 'Posible prescripción duplicada' });
  await aviso.waitFor();
  permitido.duplicada = false;
  await page.evaluate(() => window.scrollTo(0, 0));
  await capturar(page, '11-prescripcion-duplicada.png', {
    muestra:
      'Aviso de posible prescripción duplicada (Ketorolac a Olmedo, que ya lo tiene vigente), sin tocar Cargar igual',
    incluir: [titulo],
    marcas: [
      {
        n: 1,
        loc: aviso,
        que: 'Aviso «Posible prescripción duplicada» con la que ya está vigente',
      },
      {
        n: 2,
        loc: page.getByRole('button', { name: 'Cargar igual' }),
        que: 'Botón Cargar igual',
        lado: 'izq',
      },
      {
        n: 3,
        loc: campo(page, 'Medicamento'),
        que: 'Selector Medicamento (para corregir)',
        lado: 'izq',
      },
    ],
  });
}

/** Desde la ficha de un paciente, toca la tarjeta de una prescripción y espera su detalle. */
async function abrirPrescripcion(page, apellido, medicamento) {
  await abrirFicha(page, apellido);
  // La tarjeta entera abre el detalle (se toca el contenido, como con el dedo).
  await page.locator('li', { hasText: medicamento }).first().click();
  await page.getByRole('heading', { level: 1, name: new RegExp(`^${medicamento}`) }).waitFor();
  await page.getByRole('region', { name: 'Paciente' }).waitFor();
  await esperar(page);
}

/**
 * 12–15 · Cambiar la dosis (Enalapril de Villafañe), y suspender y finalizar otra indicación
 * (Ceftriaxona de Villafañe): diálogos con motivo, sin confirmar. Son prescripciones distintas
 * para que, leídas en orden, no parezca que el cambio de la 12 no se guardó.
 */
export async function cambiarIndicacion(page) {
  if (!quiere('12', '13', '14', '15')) return;
  if (quiere('12', '13')) await cambiarDosis(page);
  if (quiere('14', '15')) await suspenderYFinalizar(page);
}

async function cambiarDosis(page) {
  await abrirPrescripcion(page, 'Villafañe', 'Enalapril');
  const dosis = page.getByLabel('Dosis');
  const original = await dosis.inputValue();
  await dosis.fill('20');
  const guardar = page.getByRole('button', { name: 'Guardar cambios' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await capturar(page, '12-prescripcion-detalle.png', {
    muestra:
      'Detalle de una prescripción (Enalapril de Villafañe) con la dosis cambiada de 10 a 20 mg, antes de guardar',
    incluir: [page.getByRole('heading', { level: 1, name: /^Enalapril/ })],
    marcas: [
      { n: 1, loc: page.getByRole('button', { name: 'Suspender' }), que: 'Botón Suspender' },
      {
        n: 2,
        loc: page.getByRole('button', { name: 'Finalizar' }),
        que: 'Botón Finalizar',
        lado: 'esquina-der',
      },
      { n: 3, loc: campo(page, 'Dosis'), que: 'Campo Dosis (cambiada de 10 a 20)', lado: 'izq' },
      { n: 4, loc: campo(page, 'Frecuencia'), que: 'Selector Frecuencia', lado: 'izq' },
      { n: 5, loc: guardar, que: 'Botón Guardar cambios', lado: 'esquina-der' },
    ],
  });

  if (quiere('13')) {
    await guardar.click();
    const dialogo = page.getByRole('dialog', { name: 'Guardar cambios en la prescripción' });
    await dialogo.waitFor();
    await dialogo.getByLabel('Motivo del cambio').fill('Tensión arterial elevada en los controles');
    await capturar(page, '13-prescripcion-guardar-cambios.png', {
      muestra:
        'Diálogo Guardar cambios en la prescripción: antes y después, y motivo, sin confirmar',
      incluir: [dialogo],
      marcas: [
        {
          n: 1,
          loc: dialogo.getByRole('table', { name: 'Cambios' }),
          que: 'Tabla Antes / Después de lo que cambia',
        },
        {
          n: 2,
          loc: campo(dialogo, 'Motivo del cambio'),
          que: 'Campo Motivo del cambio (obligatorio)',
          lado: 'izq',
        },
        {
          n: 3,
          loc: dialogo.getByRole('button', { name: 'Guardar', exact: true }),
          que: 'Botón Guardar',
          lado: 'esquina-der',
        },
        {
          n: 4,
          loc: dialogo.getByRole('button', { name: 'Cancelar' }),
          que: 'Botón Cancelar',
          lado: 'izq',
        },
      ],
    });
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await dialogo.waitFor({ state: 'hidden' });
  }
  // Vuelve la dosis a la original: al salir no queda un cambio a medias (ni el aviso de descartar).
  await dosis.fill(original);
}

async function suspenderYFinalizar(page) {
  await abrirPrescripcion(page, 'Villafañe', 'Ceftriaxona');
  for (const [nn, boton, titulo, motivo, archivo, muestra, mensaje] of [
    [
      '14',
      'Suspender',
      'Suspender la prescripción',
      'Se reevalúa con el resultado del hemocultivo',
      '14-prescripcion-suspender.png',
      'Diálogo Suspender la prescripción con su motivo, sin confirmar (se puede reanudar)',
      'Qué se suspende y que se puede reanudar después',
    ],
    [
      '15',
      'Finalizar',
      'Finalizar la prescripción',
      'Completó el tratamiento',
      '15-prescripcion-finalizar.png',
      'Diálogo Finalizar la prescripción con su motivo, sin confirmar (no se puede reanudar)',
      'Qué se finaliza y que no se puede reanudar',
    ],
  ]) {
    if (!quiere(nn)) continue;
    await page.getByRole('button', { name: boton, exact: true }).click();
    const dialogo = page.getByRole('dialog', { name: titulo });
    await dialogo.waitFor();
    await dialogo.getByLabel('Motivo').fill(motivo);
    await capturar(page, archivo, {
      muestra,
      incluir: [dialogo],
      marcas: [
        { n: 1, loc: dialogo.getByText(/^Se (suspende|finaliza)/), que: mensaje, lado: 'izq' },
        { n: 2, loc: campo(dialogo, 'Motivo'), que: 'Campo Motivo (obligatorio)', lado: 'izq' },
        {
          n: 3,
          loc: dialogo.getByRole('button', { name: boton, exact: true }),
          que: `Botón ${boton}`,
          lado: 'esquina-der',
        },
        {
          n: 4,
          loc: dialogo.getByRole('button', { name: 'Cancelar' }),
          que: 'Botón Cancelar',
          lado: 'izq',
        },
      ],
    });
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await dialogo.waitFor({ state: 'hidden' });
  }
}

/** 28–29 · Encontrar una prescripción suspendida (Mostrar: Todas) y el diálogo Reanudar, sin confirmar. */
export async function reanudar(page) {
  if (!quiere('28', '29')) return;
  await abrirFicha(page, 'Arrieta');
  await page.getByLabel('Mostrar', { exact: true }).selectOption({ label: 'Todas' });
  const tarjeta = page.locator('li', { hasText: SUSPENDIDA.medicamento }).first();
  await tarjeta.waitFor();
  await esperar(page);
  await asomar(tarjeta);
  await capturar(page, '28-prescripcion-suspendida.png', {
    muestra:
      'Ficha de Arrieta con Mostrar: Todas, donde aparece la prescripción suspendida (Ibuprofeno)',
    marcas: [
      { n: 1, loc: campo(page, 'Mostrar', true), que: 'Selector Mostrar (en Todas)', lado: 'izq' },
      { n: 2, loc: tarjeta, que: 'Tarjeta de la prescripción suspendida' },
    ],
  });

  if (!quiere('29')) return;
  await tarjeta.click();
  await page
    .getByRole('heading', { level: 1, name: new RegExp(`^${SUSPENDIDA.medicamento}`) })
    .waitFor();
  await esperar(page);
  await page.getByRole('button', { name: 'Reanudar', exact: true }).click();
  const dialogo = page.getByRole('dialog', { name: 'Reanudar la prescripción' });
  await dialogo.waitFor();
  await dialogo.getByLabel('Motivo').fill('Sin epigastralgia; vuelve el dolor de hombro');
  await capturar(page, '29-prescripcion-reanudar.png', {
    muestra: 'Diálogo Reanudar la prescripción con su motivo, sin confirmar',
    incluir: [dialogo],
    marcas: [
      { n: 1, loc: dialogo.getByText(/^Se reanuda/), que: 'Qué se reanuda', lado: 'izq' },
      { n: 2, loc: campo(dialogo, 'Motivo'), que: 'Campo Motivo (obligatorio)', lado: 'izq' },
      {
        n: 3,
        loc: dialogo.getByRole('button', { name: 'Reanudar', exact: true }),
        que: 'Botón Reanudar',
        lado: 'esquina-der',
      },
      {
        n: 4,
        loc: dialogo.getByRole('button', { name: 'Cancelar' }),
        que: 'Botón Cancelar',
        lado: 'izq',
      },
    ],
  });
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await dialogo.waitFor({ state: 'hidden' });
}

/** 16–19 · Estudios: programar, reprogramar y cancelar (diálogos sin confirmar). */
