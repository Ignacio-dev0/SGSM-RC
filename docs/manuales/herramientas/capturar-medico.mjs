// Capturas del Guía del médico (SOLO desarrollo, con los datos de demostración).
//
// Recorre la interfaz como lo haría el médico, empezando por el Inicio y tocando lo que cada
// pantalla ofrece, y guarda PNG con marcadores numerados en docs/manuales/img/medico/:
//   - tablet vertical 768 × 1024 (el equipo del hospital), tema claro, escala 1;
//   - unas pocas en teléfono 375 × 812, donde el menú pasa a un cajón.
//
// No guarda nada: las altas, traslados, cambios y cancelaciones se muestran con el diálogo
// abierto y se cierran con Cancelar. Una red de seguridad corta en el navegador cualquier pedido
// que modifique datos, salvo dos intentos que el servidor rechaza a propósito para mostrar sus
// avisos (y que se verifican antes por la API):
//   - internar con el DNI de una paciente ya egresada → aviso de reingreso;
//   - indicar Ketorolac a Olmedo, que ya lo tiene vigente → aviso de prescripción duplicada.
// Para el primero hace falta una paciente egresada: si no existe, se la interna y se le da el
// alta por la API (ficticia, DNI 90815437, observaciones "Demostración manual"). Para mostrar
// Reanudar hace falta una prescripción suspendida: si no está, se le indica Ibuprofeno a Arrieta
// y se la suspende por la API (observaciones "Demostración manual"). Es lo único que este script
// deja en la base, y solo la primera vez.
//
// La marca "(Demostración manual)" con la que preparar-datos.mjs reconoce sus datos se borra del
// texto de la pantalla justo antes de cada captura (no de la base): es interna y distrae.
//
// Requisitos: la interfaz en http://localhost:4173 (vite preview, modo demostración), la API en
// http://localhost:3000 y los datos de docs/manuales/herramientas/preparar-datos.mjs (si los
// recordatorios vencieron, volver a correrlo y esperar ~70 s).
//
// Uso (desde la raíz del repo):
//   node docs/manuales/herramientas/capturar-medico.mjs                 (todas)
//   node docs/manuales/herramientas/capturar-medico.mjs --solo 07,08    (solo los recorridos que
//                                                                        tienen esas capturas)
//   node docs/manuales/herramientas/capturar-medico.mjs --ver           (con la ventana a la vista)
//
// Variables opcionales: SGSM_WEB, SGSM_API y las de los usuarios de las pruebas e2e
// (E2E_USUARIO_MEDICO, E2E_CLAVE_MEDICO). Sin ellas toma el usuario de prueba de e2e/soporte.ts.
//
// Piezas (ninguna pasa de 1000 líneas): medico/datos.mjs (configuración, datos ficticios y sesión
// por la API), medico/api.mjs (preparación y red de seguridad), medico/pantalla.mjs (esperar,
// completar, marcar y guardar), medico/pacientes.mjs (capturas 00–08), medico/prescripciones.mjs
// (09–15, 28 y 29) y medico/consultas.mjs (16–27).

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bloqueados, prepararDatos, redDeSeguridad } from './medico/api.mjs';
import { estudios, recordatorios, reportes, telefono } from './medico/consultas.mjs';
import { SALIDA, SOLO, TABLET, TELEFONO, VER, ZONA } from './medico/datos.mjs';
import {
  fichaTrasladoAlta,
  inicioYBusqueda,
  internar,
  pantallaDeIngreso,
} from './medico/pacientes.mjs';
import { ingresar, problemas, quiere, referencias } from './medico/pantalla.mjs';
import {
  cambiarIndicacion,
  nuevaPrescripcion,
  prescripcionDuplicada,
  reanudar,
} from './medico/prescripciones.mjs';

// ───────────────────────── Principal ─────────────────────────

async function nuevaPagina(navegador, viewport, { conSesion = true } = {}) {
  const contexto = await navegador.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'es-AR',
    timezoneId: ZONA,
    reducedMotion: 'reduce',
    ...(viewport.width < 600 ? { isMobile: true, hasTouch: true } : {}),
  });
  await redDeSeguridad(contexto);
  const page = await contexto.newPage();
  page.setDefaultTimeout(15_000);
  // Al salir de un formulario a medias, el navegador pregunta: se sale sin guardar.
  page.on('dialog', (d) => void d.accept());
  if (conSesion) await ingresar(page);
  return page;
}

async function principal() {
  console.log('Preparando…');
  await prepararDatos();
  const navegador = await chromium.launch({ headless: !VER });
  try {
    console.log('Tablet 768 × 1024');
    if (quiere('00')) {
      const sinSesion = await nuevaPagina(navegador, TABLET, { conSesion: false });
      try {
        await pantallaDeIngreso(sinSesion);
      } catch (e) {
        problemas.push(`pantallaDeIngreso: ${e.message.split('\n')[0]}`);
        console.error(`  ✗ pantallaDeIngreso: ${e.message.split('\n')[0]}`);
      }
      await sinSesion.context().close();
    }
    const tablet = await nuevaPagina(navegador, TABLET);
    for (const recorrido of [
      inicioYBusqueda,
      internar,
      fichaTrasladoAlta,
      nuevaPrescripcion,
      prescripcionDuplicada,
      cambiarIndicacion,
      reanudar,
      estudios,
      recordatorios,
      reportes,
    ]) {
      try {
        await recorrido(tablet);
      } catch (e) {
        problemas.push(`${recorrido.name}: ${e.message.split('\n')[0]}`);
        console.error(`  ✗ ${recorrido.name}: ${e.message.split('\n')[0]}`);
        await tablet
          .screenshot({ path: resolve(SALIDA, `_error-${recorrido.name}.png`) })
          .catch(() => undefined);
      }
    }
    if (quiere('25', '26', '27')) {
      console.log('Teléfono 375 × 812');
      const movil = await nuevaPagina(navegador, TELEFONO);
      try {
        await telefono(movil);
      } catch (e) {
        problemas.push(`telefono: ${e.message.split('\n')[0]}`);
        console.error(`  ✗ telefono: ${e.message.split('\n')[0]}`);
      }
    }
  } finally {
    await navegador.close();
  }

  // Con --solo se reemplazan en referencias.json solo las capturas que se rehicieron.
  let todas = referencias;
  if (SOLO) {
    let anteriores = [];
    try {
      anteriores = JSON.parse(readFileSync(resolve(SALIDA, 'referencias.json'), 'utf8'));
    } catch {
      /* no había */
    }
    const nuevas = new Set(referencias.map((r) => r.archivo));
    todas = [...anteriores.filter((r) => !nuevas.has(r.archivo)), ...referencias];
  }
  todas.sort((a, b) => a.archivo.localeCompare(b.archivo));
  if (referencias.length) {
    writeFileSync(resolve(SALIDA, 'referencias.json'), `${JSON.stringify(todas, null, 2)}\n`);
  }
  if (bloqueados.length) {
    console.log(`\nLa red de seguridad cortó ${bloqueados.length} pedidos que modificaban datos:`);
    for (const b of bloqueados) console.log(`  - ${b}`);
  }
  if (problemas.length) {
    console.log('\nProblemas:');
    for (const p of problemas) console.log(`  - ${p}`);
    process.exitCode = 1;
  }
}

principal().catch((e) => {
  console.error(`No se pudieron hacer las capturas: ${e.message}`);
  process.exitCode = 1;
});
