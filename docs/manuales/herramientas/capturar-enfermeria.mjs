// Capturas del Manual de enfermería (T806): los cinco flujos que más se usan, recorridos en la
// interfaz como lo haría la persona, empezando por el Inicio y tocando lo que la pantalla ofrece.
//
//   1. Ingresar a la tablet, el aviso de inactividad y Salir (más el menú en el teléfono).
//   2. Ver las tomas y estudios para atender (panel de Recordatorios, insignia, niveles de
//      urgencia, sonido, pantalla encendida y "Sin conexión en tiempo real").
//   3. Administrar un medicamento (desde "Administrar medicamento" y desde un recordatorio), el
//      diálogo del rostro, "No se sabe si quedó registrada" y "No se administró".
//   4. Registrar insumos usados con un paciente.
//   5. Buscar un paciente, su ficha (prescripciones e historial), corregir un registro y confirmar
//      que se realizó un estudio.
//   6. La pestaña Datos con una alergia en Observaciones (29) y un "No se administró" en Historial ›
//      Modificaciones (30).
//
// NO guarda nada (salvo con --registrar-no-administrado, ver abajo): los diálogos de confirmación
// se fotografían abiertos y se cancelan. La alergia de 29 se agrega solo en la respuesta que recibe
// el navegador (la base no cambia). Para 30 hace falta un "No se administró" con un motivo creíble:
// con --registrar-no-administrado, si todavía no está, se registra DE VERDAD una vez en una toma de
// Arrieta desde su tarjeta de Recordatorios (como lo haría la enfermera). "No se sabe si
// quedó registrada" se provoca cortando el pedido en el navegador (el rostro se simula ahí mismo y el
// registro nunca llega al servidor). El aviso de inactividad se adelanta con el reloj del navegador y
// "Sin conexión en tiempo real" se provoca cerrando el WebSocket desde el navegador.
//
// Requisitos: la interfaz en modo demostración (http://localhost:4173, `vite preview` con
// VITE_BIOMETRIA_MODO=simulado), la API andando y los datos de demostración cargados con
// preparar-datos.mjs (los recordatorios vencen: si ya pasó mucho tiempo, volver a correrlo).
//
// Uso (desde la raíz del repo):
//   node docs/manuales/herramientas/capturar-enfermeria.mjs              (todas)
//   node docs/manuales/herramientas/capturar-enfermeria.mjs --solo 07,08  (solo esas; recorre igual)
//   node docs/manuales/herramientas/capturar-enfermeria.mjs --solo 30 --registrar-no-administrado
//
// Variables opcionales: SGSM_INTERFAZ (por defecto http://localhost:4173) y las de las pruebas e2e
// para el usuario (E2E_USUARIO_ENFERMERO, E2E_CLAVE_ENFERMERO); sin ellas toma el usuario de prueba
// de e2e/soporte.ts. Los usuarios y las contraseñas nunca aparecen en las capturas: el ingreso se
// fotografía vacío y el usuario que muestra el botón del rostro simulado se tapa con una barra gris.
//
// Salida: docs/manuales/img/enfermeria/NN-nombre.png (tablet vertical 768×1024, tema claro, escala
// 1; 05 y 06 en el teléfono, 375×812) y docs/manuales/img/enfermeria/referencias.json con qué señala
// cada marcador. Los marcadores (círculo magenta numerado con borde blanco y el marco del control)
// se dibujan sobre la página justo antes de cada foto y se quitan después.
//
// Lo que depende de la hora: los niveles de urgencia de 09 son los que haya en el panel en ese momento
// (con estos datos no coinciden los cuatro), y 28-recordatorio-vencido.png solo se saca si hay una toma
// vencida (60 min después de aparecer); si no, queda la de una corrida anterior, si la hay.

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../../..');
const SALIDA = resolve(AQUI, '../img/enfermeria');
const BASE = (process.env.SGSM_INTERFAZ ?? 'http://localhost:4173').replace(/\/$/, '');
const TABLET = { width: 768, height: 1024 };
const TELEFONO = { width: 375, height: 812 };
const ZONA = 'America/Argentina/Buenos_Aires';

/** Color de los marcadores: magenta, que no usa la interfaz (verde azulado y ámbar). */
const COLOR = '#C2185B';
const RADIO = 15;

/** Pacientes de preparar-datos.mjs: lo que no sea de ellos no debería salir en una captura. */
const DEMO = {
  olmedo: 'Olmedo, Ramiro Teodoro',
  villafane: 'Villafañe, Herminia',
  arrieta: 'Arrieta, Teodoro Julián',
};
const NOMBRES_DEMO = Object.values(DEMO);

const argSolo = process.argv.indexOf('--solo');
const SOLO = argSolo > 0 ? process.argv[argSolo + 1].split(',').map((s) => s.trim()) : null;
const quiero = (archivo) => !SOLO || SOLO.some((p) => archivo.startsWith(p));

const referencias = [];
const avisos = [];
const avisar = (texto) => {
  avisos.push(texto);
  console.log(`  ! ${texto}`);
};

// ───────────────────────── Usuario de prueba ─────────────────────────

function credenciales() {
  let usuario = process.env.E2E_USUARIO_ENFERMERO;
  let clave = process.env.E2E_CLAVE_ENFERMERO;
  if (!usuario || !clave) {
    const soporte = readFileSync(resolve(RAIZ, 'e2e/soporte.ts'), 'utf8');
    usuario ??= /E2E_USUARIO_ENFERMERO \?\? '([^']+)'/.exec(soporte)?.[1];
    clave ??= /E2E_CLAVE_ENFERMERO \?\? '([^']+)'/.exec(soporte)?.[1];
  }
  if (!usuario || !clave) throw new Error('No encuentro el usuario de prueba de enfermería');
  return { usuario, clave };
}
const CUENTA = credenciales();

// ───────────────────────── Navegador ─────────────────────────

async function nuevoContexto(navegador, viewport = TABLET) {
  const contexto = await navegador.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'es-AR',
    timezoneId: ZONA,
    reducedMotion: 'reduce',
    ...(viewport.width < 600 ? { hasTouch: true } : {}),
  });
  const page = await contexto.newPage();
  // Un "¿Salir de la página?" del navegador no tiene que trabar el recorrido.
  page.on('dialog', (d) => void d.accept().catch(() => undefined));
  return { contexto, page };
}

/** Ingreso por la API (como las pruebas e2e): para los contextos que no muestran el ingreso. */
async function ingresarPorApi(contexto) {
  const r = await contexto.request.post(`${BASE}/api/auth/login`, {
    data: { nombreUsuario: CUENTA.usuario, contrasena: CUENTA.clave },
  });
  if (!r.ok()) throw new Error(`No se pudo ingresar por la API: ${r.status()}`);
}

/** Espera a que la pantalla termine de cargar: sin pedidos pendientes ni indicadores girando. */
async function esperarPantalla(page, extra = 300) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  await page
    .waitForFunction(
      () =>
        ![...document.querySelectorAll('.MuiCircularProgress-root, .MuiLinearProgress-root')].some(
          (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          },
        ) && !/Cargando/.test(document.querySelector('main')?.innerText ?? ''),
      null,
      { timeout: 12_000 },
    )
    .catch(() => avisar(`La pantalla ${page.url()} siguió mostrando "Cargando"`));
  await page.waitForTimeout(extra);
}

/** Sube el elemento hasta `arriba` px del borde superior (deja libre la barra y la franja). */
async function subir(page, loc, arriba = 112) {
  await loc.first().scrollIntoViewIfNeeded();
  const caja = await loc.first().boundingBox();
  if (!caja) throw new Error('No se puede llevar a la vista un elemento invisible');
  await page.evaluate((dy) => window.scrollBy(0, dy), caja.y - arriba);
  await page.waitForTimeout(250);
}

async function arriba(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
}

/** Elige en un selector nativo la opción cuyo texto contiene `texto`. */
async function elegirOpcion(select, texto) {
  const opciones = await select.locator('option').allTextContents();
  const etiqueta = opciones.find((o) => o.includes(texto));
  if (!etiqueta) {
    throw new Error(`No está la opción «${texto}» (hay: ${opciones.join(' | ')}). ¿Faltan los datos de demostración?`);
  }
  await select.selectOption({ label: etiqueta });
}

/** El campo entero (marco, etiqueta y ayuda) de un control de formulario de MUI. */
const campo = (control) =>
  control.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " MuiFormControl-root ")][1]');

/** Si aparece "¿Descartar lo cargado?", se descarta (nada de lo cargado se guarda). */
async function descartarSiPregunta(page) {
  const descartar = page.getByRole('button', { name: 'Descartar' });
  const pregunta = await descartar
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (pregunta) {
    await descartar.click();
    await descartar.waitFor({ state: 'hidden' });
  }
}

// ───────────────────────── Marcadores ─────────────────────────

/**
 * Rectángulo que cubre a todos los elementos de `loc` (uno o varios locators). Un campo de MUI
 * incluye su etiqueta flotante (que sobresale arriba del borde); con `texto`, solo lo escrito.
 */
async function cajaDe(loc, { texto = false } = {}) {
  const lista = Array.isArray(loc) ? loc : [loc];
  const cajas = [];
  for (const l of lista) {
    const n = await l.count();
    if (n === 0) throw new Error(`No aparece en la pantalla: ${l}`);
    if (n > 1) throw new Error(`Hay ${n} elementos para un solo marcador: ${l}`);
    await l.waitFor({ state: 'visible', timeout: 8000 });
    const b = await l.evaluate((el, soloTexto) => {
      let rs = [el.getBoundingClientRect()];
      if (soloTexto) {
        const rango = document.createRange();
        rango.selectNodeContents(el);
        rs = [rango.getBoundingClientRect()];
      }
      if (el.classList.contains('MuiFormControl-root')) {
        const etiqueta = el.querySelector(':scope > label');
        if (etiqueta && getComputedStyle(etiqueta).display !== 'none') rs.push(etiqueta.getBoundingClientRect());
      }
      let x = Math.min(...rs.map((r) => r.left));
      let y = Math.min(...rs.map((r) => r.top));
      let x2 = Math.max(...rs.map((r) => r.right));
      let y2 = Math.max(...rs.map((r) => r.bottom));
      // Solo la parte que se ve: una fila de una tabla con desplazamiento lateral sigue más allá.
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const st = getComputedStyle(p);
        if (!/(auto|scroll|hidden|clip)/.test(`${st.overflowX} ${st.overflowY}`)) continue;
        const r = p.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(st.overflowX)) {
          x = Math.max(x, r.left);
          x2 = Math.min(x2, r.right);
        }
        if (/(auto|scroll|hidden|clip)/.test(st.overflowY)) {
          y = Math.max(y, r.top);
          y2 = Math.min(y2, r.bottom);
        }
      }
      x = Math.max(x, 0);
      x2 = Math.min(x2, document.documentElement.clientWidth);
      return { x, y, width: x2 - x, height: y2 - y };
    }, texto);
    if (!b.width || !b.height) throw new Error(`No tiene caja: ${l}`);
    cajas.push(b);
  }
  const x = Math.min(...cajas.map((b) => b.x));
  const y = Math.min(...cajas.map((b) => b.y));
  const x2 = Math.max(...cajas.map((b) => b.x + b.width));
  const y2 = Math.max(...cajas.map((b) => b.y + b.height));
  return { x, y, width: x2 - x, height: y2 - y };
}

/**
 * Dónde puede ir el círculo:
 *   izq / der: afuera del control, a la altura de su centro;
 *   arriba / abajo: afuera, alineado a su izquierda (arriba-der / abajo-der: a su derecha);
 *   esq / esq-der: sobre la esquina superior del marco (para recuadros de áreas);
 *   dentro-der: adentro, cerca del borde derecho (campos anchos con lugar libre a la derecha);
 *   borde-abajo: sobre el borde inferior del marco, centrado;
 *   borde-izq / borde-der: sobre el borde de `en` (la tarjeta que lo contiene), a la altura del control.
 */
function centro(b, pos, pad, contenedor) {
  const G = 8;
  switch (pos) {
    case 'izq':
      return { cx: b.x - pad - RADIO - G, cy: b.y + b.height / 2 };
    case 'der':
      return { cx: b.x + b.width + pad + RADIO + G, cy: b.y + b.height / 2 };
    case 'arriba':
      return { cx: b.x + RADIO, cy: b.y - pad - RADIO - G };
    case 'abajo':
      return { cx: b.x + RADIO, cy: b.y + b.height + pad + RADIO + G };
    case 'abajo-der':
      return { cx: b.x + b.width - RADIO, cy: b.y + b.height + pad + RADIO + G };
    case 'arriba-der':
      return { cx: b.x + b.width - RADIO, cy: b.y - pad - RADIO - G };
    case 'esq-der':
      return { cx: b.x + b.width + pad, cy: b.y - pad };
    case 'dentro-der':
      return { cx: b.x + b.width - RADIO - 48, cy: b.y + b.height / 2 };
    case 'borde-abajo':
      return { cx: b.x + b.width / 2, cy: b.y + b.height + pad };
    case 'borde-izq':
      return contenedor && { cx: contenedor.x, cy: b.y + b.height / 2 };
    case 'borde-der':
      return contenedor && { cx: contenedor.x + contenedor.width, cy: b.y + b.height / 2 };
    default:
      return { cx: b.x - pad, cy: b.y - pad };
  }
}

/** Primero sobre la esquina del marco (no deja dudas de a qué control va), después alrededor. */
const CANDIDATOS = {
  punto: ['esq', 'izq', 'esq-der', 'der', 'arriba', 'abajo', 'arriba-der', 'abajo-der', 'dentro-der'],
  area: ['esq', 'esq-der', 'izq', 'der', 'arriba', 'abajo', 'arriba-der', 'abajo-der'],
};

/**
 * Lo que un círculo no debería tapar: cada texto visible (el que queda arriba de todo, no el que
 * está detrás de un diálogo), lo escrito en los campos y los íconos. Y el menú lateral fijo.
 */
async function obstaculos(page) {
  return page.evaluate(() => {
    const rects = [];
    const arribaDeTodo = (el, x, y) => {
      const top = document.elementFromPoint(x, y);
      return Boolean(top && (top === el || el.contains(top) || top.contains(el)));
    };
    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
      const el = n.parentElement;
      if (!el || !n.textContent.trim() || el.closest('#marcas-manual, #tachado-manual')) continue;
      const rango = document.createRange();
      rango.selectNodeContents(n);
      for (const r of rango.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        if (!arribaDeTodo(el, r.left + r.width / 2, r.top + r.height / 2)) continue;
        rects.push([r.left, r.top, r.right, r.bottom]);
      }
    }
    const lienzo = document.createElement('canvas').getContext('2d');
    for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea')) {
      const valor = el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text : el.value || el.placeholder;
      const r = el.getBoundingClientRect();
      if (!valor || r.width < 1 || !arribaDeTodo(el, r.left + 4, r.top + r.height / 2)) continue;
      const st = getComputedStyle(el);
      lienzo.font = st.font;
      const izq = r.left + parseFloat(st.paddingLeft);
      rects.push([izq, r.top + 4, Math.min(r.right, izq + lienzo.measureText(valor).width), r.bottom - 4]);
    }
    for (const el of document.querySelectorAll('svg, .MuiSwitch-root, .MuiChip-root, .MuiBadge-badge')) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || !arribaDeTodo(el, r.left + r.width / 2, r.top + r.height / 2)) continue;
      rects.push([r.left, r.top, r.right, r.bottom]);
    }
    const riel = document.querySelector('nav[aria-label="Menú principal"]');
    const rr = riel?.getBoundingClientRect();
    const esRiel = rr && rr.left <= 0 && rr.width < 140 && !riel.closest('.MuiDrawer-modal');
    return { rects, rielDerecha: esRiel ? rr.right : 0 };
  });
}

const contiene = (a, b) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];
const interseccion = (a, b) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/**
 * Dibuja los marcadores sobre la página: un círculo numerado (magenta, borde blanco) y el marco del
 * control (línea llena para un control, de trazos para un área). De las posiciones posibles (la
 * pedida en `pos` primero; con `fijo`, solo esa) el círculo va en la que menos tapa: texto, íconos,
 * otros círculos o el marco de otro control; a igualdad, la que viene antes. Avisa si igual tapa algo.
 */
async function marcar(page, marcas) {
  const viewport = page.viewportSize();
  const { rects, rielDerecha } = await obstaculos(page);
  // Primero todos los marcos: un círculo no debe caer sobre el marco de otro control.
  const marcos = [];
  for (const m of marcas) {
    const b = await cajaDe(m.loc, { texto: m.texto });
    const tipo = m.tipo ?? 'punto';
    if (b.y < -1 || b.y + b.height > viewport.height + 1) {
      throw new Error(`El marcador ${m.n} (${m.que}) queda fuera de la pantalla: subilo antes de capturar`);
    }
    // El marco no sale de la ventana (un control pegado al borde lo tendría cortado).
    const pedido = m.pad ?? (tipo === 'area' ? 7 : 4);
    const pad = Math.max(1, Math.min(pedido, b.x, b.y, viewport.width - b.x - b.width, viewport.height - b.y - b.height));
    marcos.push({ m, b, tipo, pad, caja: [b.x - pad, b.y - pad, b.x + b.width + pad, b.y + b.height + pad] });
  }
  const dibujos = [];
  for (const { m, b, tipo, pad } of marcos) {
    const contenedor = m.en ? await cajaDe(m.en) : null;
    // A la derecha del menú lateral, el círculo no se mete en él.
    const x0 = b.x >= rielDerecha ? rielDerecha + 1 : 0;
    const orden = [
      ...(m.pos ? [m.pos] : []),
      ...(m.en ? ['borde-izq', 'borde-der'] : []),
      ...(m.fijo ? [] : CANDIDATOS[tipo]),
    ];
    const propio = [b.x - pad, b.y - pad, b.x + b.width + pad, b.y + b.height + pad];
    let mejor = null;
    for (const [indice, pos] of [...new Set(orden)].entries()) {
      const c = centro(b, pos, pad, contenedor);
      if (!c) continue;
      const cx = Math.min(Math.max(c.cx, x0 + RADIO + 1), viewport.width - RADIO - 2);
      const cy = Math.min(Math.max(c.cy, RADIO + 2), viewport.height - RADIO - 2);
      const caja = [cx - RADIO + 2, cy - RADIO + 2, cx + RADIO - 2, cy + RADIO - 2];
      let puntaje = rects.reduce((t, r) => t + interseccion(caja, r), 0);
      for (const d of dibujos) {
        puntaje += 50 * interseccion(caja, [d.cx - RADIO, d.cy - RADIO, d.cx + RADIO, d.cy + RADIO]);
      }
      // Lejos de su marco y sobre el de otro control, se leería como de ese otro. Pegado a su propio
      // marco (en una esquina) no hay duda, aunque roce el de al lado.
      const pegado = interseccion(caja, propio) > 0;
      for (const o of marcos) {
        if (o.m === m || interseccion(caja, o.caja) === 0) continue;
        const anidados = contiene(o.caja, propio) || contiene(propio, o.caja);
        // Cruzar el borde de un marco anidado confunde de quién es el número.
        if (anidados) puntaje += contiene(o.caja, caja) ? 0 : 30;
        else puntaje += pegado ? 3 : 300;
      }
      // Ante la duda, el orden de preferencia.
      puntaje += 3 * indice;
      // Afuera del control se lee mejor (salvo las posiciones que van adentro a propósito).
      if (!['dentro-der', 'borde-izq', 'borde-der', 'borde-abajo', 'esq', 'esq-der'].includes(pos)) {
        puntaje += 0.2 * interseccion(caja, propio);
      }
      // Corrido por no entrar en la ventana: se aleja de donde se pidió.
      puntaje += 0.5 * (Math.abs(cx - c.cx) + Math.abs(cy - c.cy));
      if (!mejor || puntaje < mejor.puntaje) mejor = { cx, cy, pos, puntaje };
    }
    if (mejor.puntaje >= 40) {
      avisar(`el marcador ${m.n} (${m.que}) tapa algo (${Math.round(mejor.puntaje)} puntos, en ${mejor.pos})`);
    }
    dibujos.push({ n: m.n, que: m.que, tipo, ...b, cx: mejor.cx, cy: mejor.cy, pos: mejor.pos, pad });
  }
  // Círculos que se tapan entre sí.
  for (let i = 0; i < dibujos.length; i++) {
    for (let j = i + 1; j < dibujos.length; j++) {
      const d = Math.hypot(dibujos[i].cx - dibujos[j].cx, dibujos[i].cy - dibujos[j].cy);
      if (d < 2 * RADIO + 2) {
        avisar(`los marcadores ${dibujos[i].n} y ${dibujos[j].n} se tapan (${Math.round(d)} px)`);
      }
    }
  }
  await page.evaluate(
    ({ dibujos, COLOR, RADIO }) => {
      const capa = document.createElement('div');
      capa.id = 'marcas-manual';
      capa.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
      for (const d of dibujos) {
        const marco = document.createElement('div');
        marco.style.cssText = [
          'position:absolute',
          `left:${d.x - d.pad}px`,
          `top:${d.y - d.pad}px`,
          `width:${d.width + 2 * d.pad}px`,
          `height:${d.height + 2 * d.pad}px`,
          `border:3px ${d.tipo === 'area' ? 'dashed' : 'solid'} ${COLOR}`,
          'border-radius:10px',
          'box-sizing:border-box',
          'box-shadow:0 0 0 1px rgba(255,255,255,.9), inset 0 0 0 1px rgba(255,255,255,.9)',
        ].join(';');
        capa.appendChild(marco);
      }
      for (const d of dibujos) {
        const c = document.createElement('div');
        c.textContent = String(d.n);
        c.style.cssText = [
          'position:absolute',
          `left:${d.cx - RADIO}px`,
          `top:${d.cy - RADIO}px`,
          `width:${2 * RADIO}px`,
          `height:${2 * RADIO}px`,
          'border-radius:50%',
          `background:${COLOR}`,
          'color:#fff',
          'border:3px solid #fff',
          'box-sizing:border-box',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'font:700 15px/1 Arial, Helvetica, sans-serif',
          'box-shadow:0 1px 4px rgba(0,0,0,.5)',
        ].join(';');
        capa.appendChild(c);
      }
      document.body.appendChild(capa);
    },
    { dibujos, COLOR, RADIO },
  );
  return dibujos;
}

async function quitarMarcas(page) {
  await page.evaluate(() => {
    document.getElementById('marcas-manual')?.remove();
    document.getElementById('tachado-manual')?.remove();
  });
}

/**
 * Tapa el usuario de prueba donde la pantalla lo muestra ("Simular el rostro de …" del modo
 * demostración): una barra gris sobre esas letras, sin tocar el DOM de la aplicación.
 */
async function taparUsuario(page) {
  const tapadas = await page.evaluate((usuario) => {
    const capa = document.createElement('div');
    capa.id = 'tachado-manual';
    capa.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
    let n = 0;
    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) {
      const texto = nodo.textContent ?? '';
      // Solo donde la pantalla muestra el usuario: el botón del rostro simulado.
      if (!nodo.parentElement?.closest('button')?.textContent?.startsWith('Simular el rostro de')) continue;
      let desde = texto.indexOf(usuario);
      while (desde >= 0) {
        const rango = document.createRange();
        rango.setStart(nodo, desde);
        rango.setEnd(nodo, desde + usuario.length);
        for (const r of rango.getClientRects()) {
          if (r.width === 0) continue;
          const barra = document.createElement('div');
          barra.style.cssText = `position:absolute;left:${r.left - 2}px;top:${r.top + 1}px;width:${r.width + 4}px;height:${r.height - 2}px;background:#455a64;border-radius:4px;`;
          capa.appendChild(barra);
          n++;
        }
        desde = texto.indexOf(usuario, desde + usuario.length);
      }
    }
    document.body.appendChild(capa);
    return n;
  }, CUENTA.usuario);
  return tapadas;
}

/**
 * Saca la foto con los marcadores y la guarda. `recorte`:
 *   undefined → alto justo para lo marcado (y `incluir`) con margen, ancho completo;
 *   'pantalla' → la ventana entera;
 *   { y0, y1 } → esa franja (ancho completo).
 * Con `desdeArriba` el recorte empieza en 0 (muestra la barra superior).
 */
async function capturar(page, archivo, que, marcas, opciones = {}) {
  if (!quiero(archivo)) return;
  const { recorte, incluir = [], desdeArriba = false, margen = 20 } = opciones;
  // Sin foco: un campo enfocado se dibuja resaltado y el texto no lo explica.
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.mouse.move(1, 1);
  const tapadas = await taparUsuario(page);
  const dibujos = await marcar(page, marcas);
  const viewport = page.viewportSize();

  let clip;
  if (recorte === 'pantalla') {
    clip = { x: 0, y: 0, width: viewport.width, height: viewport.height };
  } else if (recorte && typeof recorte === 'object') {
    clip = { x: 0, y: recorte.y0, width: viewport.width, height: recorte.y1 - recorte.y0 };
  } else {
    const ys = [];
    for (const d of dibujos) {
      ys.push(d.y - d.pad - 4, d.y + d.height + d.pad + 4, d.cy - RADIO - 4, d.cy + RADIO + 4);
    }
    for (const l of incluir) {
      const b = await cajaDe(l);
      ys.push(b.y, b.y + b.height);
    }
    const y0 = desdeArriba ? 0 : Math.max(0, Math.floor(Math.min(...ys) - margen));
    const y1 = Math.min(viewport.height, Math.ceil(Math.max(...ys) + margen));
    clip = { x: 0, y: y0, width: viewport.width, height: y1 - y0 };
  }
  // Ningún marcador cortado por el recorte.
  for (const d of dibujos) {
    const arriba = Math.min(d.y - d.pad, d.cy - RADIO);
    const abajo = Math.max(d.y + d.height + d.pad, d.cy + RADIO);
    if (arriba < clip.y - 1 || abajo > clip.y + clip.height + 1) {
      throw new Error(
        `${archivo}: el marcador ${d.n} (${d.que}) queda fuera del recorte (marca ${Math.round(arriba)}–${Math.round(abajo)}, recorte ${Math.round(clip.y)}–${Math.round(clip.y + clip.height)})`,
      );
    }
  }
  if (dibujos.length > 6) avisar(`${archivo}: ${dibujos.length} marcadores (más de 6 se leen mal)`);

  const ruta = resolve(SALIDA, archivo);
  await page.screenshot({ path: ruta, clip, animations: 'disabled', caret: 'hide' });
  await quitarMarcas(page);
  referencias.push({
    archivo: `img/enfermeria/${archivo}`,
    muestra: que,
    tamano: { w: Math.round(clip.width), h: Math.round(clip.height) },
    ...(tapadas ? { tapado: 'el usuario de prueba (barra gris)' } : {}),
    marcadores: dibujos.map((d) => ({ n: d.n, tipo: d.tipo, que_es: d.que })),
  });
  console.log(`  ✓ ${archivo} (${Math.round(clip.width)}×${Math.round(clip.height)}) · ${dibujos.map((d) => `${d.n} ${d.que}`).join(' · ')}`);
}

// ───────────────────────── Comunes de la interfaz ─────────────────────────

const menu = (page) => page.getByRole('navigation', { name: 'Menú principal' });
const insignia = (page) => page.getByRole('link', { name: /^Recordatorios:/ });
const botonSalir = (page) => page.getByRole('button', { name: 'Salir' });
const tarea = (page, nombre) => page.getByRole('link', { name: new RegExp(`^${nombre}`) });

async function irAlInicio(page) {
  await menu(page).getByRole('link', { name: 'Inicio' }).click();
  await descartarSiPregunta(page);
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperarPantalla(page);
}

/** Desde el Inicio, la tarea con ese nombre (como lo haría la persona). */
async function abrirTarea(page, nombre, titulo) {
  await irAlInicio(page);
  await tarea(page, nombre).click();
  await page.getByRole('heading', { level: 1, name: titulo }).waitFor();
  await esperarPantalla(page);
}

/** Tarjetas del panel de recordatorios. */
const tarjetas = (page) => page.getByRole('list', { name: /para atender/ }).getByRole('listitem');

/** La tarjeta de una toma o un estudio de ese paciente (y, si se indica, ese medicamento). */
function tarjeta(page, paciente, que) {
  let t = tarjetas(page).filter({ has: page.getByRole('heading', { name: paciente }) });
  if (que) t = t.filter({ hasText: que });
  return t.first();
}

async function verificarPanel(page) {
  const nombres = await tarjetas(page).getByRole('heading').allTextContents();
  const ajenos = [...new Set(nombres.filter((n) => !NOMBRES_DEMO.includes(n.trim())))];
  if (ajenos.length) {
    avisar(`En el panel hay recordatorios de pacientes que no son de la demostración: ${ajenos.join(', ')}`);
  }
  return nombres;
}

/** Nivel de urgencia que muestra cada tarjeta (el texto de su chip). */
async function niveles(page) {
  return tarjetas(page).evaluateAll((lis) =>
    lis.map((li) => li.querySelector('.MuiChip-label')?.textContent?.trim() ?? ''),
  );
}

// ───────────────────────── Flujo 1: ingresar, inactividad y Salir ─────────────────────────

async function flujoIngreso(page) {
  console.log('\nFlujo 1 · Ingresar a la tablet');
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { name: 'Ingresar' }).waitFor();
  await esperarPantalla(page);
  const usuario = page.getByRole('textbox', { name: 'Usuario' });
  const contrasena = page.getByLabel('Contraseña', { exact: true });
  await capturar(page, '01-ingresar.png', 'Pantalla de ingreso de la tablet, sin datos cargados', [
    { n: 1, que: 'campo Usuario', loc: campo(usuario), pos: 'izq' },
    { n: 2, que: 'campo Contraseña', loc: campo(contrasena), pos: 'izq' },
    { n: 3, que: 'botón del ojo: Mostrar contraseña', loc: page.getByRole('button', { name: 'Mostrar contraseña' }), pos: 'der' },
    { n: 4, que: 'casilla «Recordar mi usuario en esta tablet»', loc: page.locator('label', { hasText: 'Recordar mi usuario' }), pos: 'izq' },
    { n: 5, que: 'botón Ingresar', loc: page.getByRole('button', { name: 'Ingresar' }), pos: 'izq' },
  ], { incluir: [page.locator('form')] });

  // Ingresa como la persona (la captura ya se sacó: el usuario no queda en ninguna imagen).
  await usuario.fill(CUENTA.usuario);
  await contrasena.fill(CUENTA.clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperarPantalla(page, 600);

  await capturar(page, '02-inicio.png', 'Inicio de enfermería con sus tareas, el menú lateral y la barra superior', [
    { n: 1, que: 'tarea «Tomas y estudios para atender» (la principal)', loc: tarea(page, 'Tomas y estudios para atender'), tipo: 'area', pos: 'esq', fijo: true },
    { n: 2, que: 'tarea «Administrar medicamento»', loc: tarea(page, 'Administrar medicamento'), tipo: 'area', pos: 'esq', fijo: true },
    { n: 3, que: 'tarea «Registrar insumos»', loc: tarea(page, 'Registrar insumos'), tipo: 'area', pos: 'esq', fijo: true },
    { n: 4, que: 'tarea «Buscar paciente»', loc: tarea(page, 'Buscar paciente'), tipo: 'area', pos: 'esq', fijo: true },
    { n: 5, que: 'menú lateral (Inicio, Recordatorios, Pacientes, Suministros)', loc: menu(page).getByRole('list'), tipo: 'area', pos: 'abajo' },
    // Pegado a la esquina del botón, dentro de la barra (abajo caería sobre la franja de demostración).
    { n: 6, que: 'botón Salir (cierra la sesión)', loc: botonSalir(page), pos: 'esq-der', fijo: true },
  ], { desdeArriba: true });
}

/** Aviso del último minuto y cierre por inactividad: se adelanta el reloj del navegador. */
async function flujoInactividad(navegador) {
  if (!quiero('03') && !quiero('04')) return;
  console.log('\nFlujo 1 · Aviso de inactividad (reloj adelantado en el navegador)');
  const { contexto, page } = await nuevoContexto(navegador);
  await ingresarPorApi(contexto);
  await page.clock.install();
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperarPantalla(page);
  const minutos = await page.evaluate(async () => {
    const r = await fetch('/api/auth/sesion', { credentials: 'same-origin' });
    const j = await r.json();
    return j.data?.inactividadMinutos ?? 15;
  });
  // Hasta el último minuto sin tocar nada.
  await page.clock.fastForward((minutos - 1) * 60_000);
  const aviso = page.getByRole('alertdialog', { name: '¿Sigue ahí?' });
  await aviso.waitFor();
  await page.waitForTimeout(400);
  await capturar(page, '03-aviso-inactividad.png', `Aviso «¿Sigue ahí?» un minuto antes de cerrar la sesión por inactividad (${minutos} min sin tocar la pantalla)`, [
    { n: 1, que: 'cuenta regresiva del cierre', loc: aviso.locator('.MuiDialogContent-root p'), tipo: 'area', pos: 'izq', pad: 10 },
    { n: 2, que: 'botón Seguir trabajando', loc: aviso.getByRole('button', { name: 'Seguir trabajando' }), pos: 'abajo' },
    { n: 3, que: 'botón Cerrar sesión', loc: aviso.getByRole('button', { name: 'Cerrar sesión' }), pos: 'izq' },
  ], { incluir: [aviso] });

  // Pasa el minuto: la sesión se cierra sola y el ingreso dice por qué.
  await page.clock.fastForward(61_000);
  await page.getByRole('heading', { name: 'Ingresar' }).waitFor();
  await esperarPantalla(page);
  const alerta = page.getByRole('alert').or(page.getByRole('status')).filter({ hasText: 'inactividad' }).first();
  await alerta.waitFor();
  await capturar(page, '04-sesion-cerrada.png', 'Ingreso después del cierre por inactividad, con el aviso de que los recordatorios quedaron apagados', [
    { n: 1, que: 'aviso: se cerró la sesión por inactividad y los avisos de recordatorios quedan apagados', loc: alerta, tipo: 'area', pos: 'izq' },
    { n: 2, que: 'botón Ingresar (volver a entrar)', loc: page.getByRole('button', { name: 'Ingresar' }), pos: 'izq' },
  ], { incluir: [page.locator('form')] });
  await contexto.close();
}

/** En el teléfono: la barra cambia y el menú va en un cajón. */
async function flujoTelefono(navegador) {
  if (!quiero('05') && !quiero('06')) return;
  console.log('\nFlujo 1 · En el teléfono (375×812)');
  const { contexto, page } = await nuevoContexto(navegador, TELEFONO);
  await ingresarPorApi(contexto);
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperarPantalla(page, 600);
  const abrirMenu = page.getByRole('button', { name: 'Abrir el menú' });
  await capturar(page, '05-telefono-inicio.png', 'Inicio en el teléfono: la barra superior con el botón del menú, la insignia y Salir', [
    // La barra del teléfono no tiene lugar libre: los círculos van sobre el borde de abajo del botón
    // (tapan un poco la franja de demostración, no el ícono).
    { n: 1, que: 'botón del menú (abre el cajón)', loc: abrirMenu, pos: 'borde-abajo', fijo: true },
    { n: 2, que: 'insignia de recordatorios', loc: insignia(page), pos: 'borde-abajo', fijo: true },
    { n: 3, que: 'botón Salir (solo el ícono)', loc: page.getByRole('button', { name: 'Salir' }), pos: 'borde-abajo', fijo: true },
    { n: 4, que: 'tarea «Tomas y estudios para atender»', loc: tarea(page, 'Tomas y estudios para atender'), tipo: 'area', pos: 'esq' },
  ], { desdeArriba: true, incluir: [tarea(page, 'Administrar medicamento')] });

  await abrirMenu.click();
  const cajon = page.locator('.MuiDrawer-paper').filter({ has: page.getByRole('navigation', { name: 'Menú principal' }) });
  await cajon.waitFor();
  await page.waitForTimeout(600);
  await capturar(page, '06-telefono-menu.png', 'Menú abierto en el teléfono (cajón lateral)', [
    { n: 1, que: 'opciones del menú', loc: cajon.getByRole('navigation', { name: 'Menú principal' }).getByRole('list'), tipo: 'area', pos: 'der' },
    { n: 2, que: 'Tema de la pantalla (claro u oscuro)', loc: cajon.getByText('Tema de la pantalla').locator('..'), tipo: 'area', pos: 'arriba' },
  ], { recorte: 'pantalla' });
  await contexto.close();
}

// ───────────────────────── Flujo 2: tomas y estudios para atender ─────────────────────────

async function flujoRecordatorios(page) {
  console.log('\nFlujo 2 · Tomas y estudios para atender');
  await abrirTarea(page, 'Tomas y estudios para atender', 'Recordatorios');
  await tarjetas(page).first().waitFor();
  await verificarPanel(page);
  console.log(`  niveles en el panel: ${(await niveles(page)).join(', ')}`);

  const subtitulo = page.getByText(/para atender ·|Actualizada a las/).first();
  const tipo = page.getByRole('combobox', { name: 'Tipo' });
  const sala = page.getByRole('combobox', { name: 'Sala' });
  const pantalla = page.locator('label', { hasText: 'Mantener la pantalla encendida' });
  const hayPantalla = (await pantalla.count()) > 0;
  if (!hayPantalla) avisar('El navegador no ofrece «Mantener la pantalla encendida»: no se marca');
  const primera = tarjetas(page).first();
  await capturar(page, '07-recordatorios.png', 'Panel de Recordatorios: lo que hay para atender, de lo más urgente a lo menos', [
    { n: 1, que: 'insignia de recordatorios en la barra (cuántos hay para atender)', loc: insignia(page) },
    { n: 2, que: 'resumen: cuántos para atender, cuántos urgentes y hora de actualización', loc: subtitulo, texto: true, pos: 'der', pad: 6 },
    { n: 3, que: 'interruptor Sonido de avisos', loc: page.locator('label', { hasText: 'Sonido de avisos' }) },
    ...(hayPantalla ? [{ n: 4, que: 'interruptor Mantener la pantalla encendida', loc: pantalla }] : []),
    { n: hayPantalla ? 5 : 4, que: 'filtros Tipo (tomas o estudios) y Sala', loc: [campo(tipo), campo(sala)], tipo: 'area' },
    { n: hayPantalla ? 6 : 5, que: 'tarjeta de un recordatorio', loc: primera, tipo: 'area', pos: 'esq' },
  ], { desdeArriba: true });

  // Una tarjeta de toma, de cerca. Se prefiere una que tenga Administrar (no un estudio).
  const toma = tarjetas(page).filter({ has: page.getByRole('button', { name: /^Administrar / }) }).first();
  await subir(page, toma, 120);
  const fila = toma;
  const bloques = toma.locator(':scope > div');
  await capturar(page, '08-tarjeta-toma.png', 'Tarjeta de una toma en el panel de Recordatorios', [
    { n: 1, que: 'hora de la toma y cuánto falta (o cuánto pasó)', loc: bloques.nth(0).locator(':scope > div').first(), pos: 'borde-izq', en: toma },
    { n: 2, que: 'nivel de urgencia (Urgente, Pronto, Programada o Vencida)', loc: toma.locator('.MuiChip-root'), pos: 'abajo' },
    { n: 3, que: 'paciente: nombre, DNI, cama y sala', loc: bloques.nth(1), pos: 'borde-izq', en: toma },
    { n: 4, que: 'medicamento, dosis, vía y presentación', loc: bloques.nth(2), pos: 'borde-izq', en: toma },
    { n: 5, que: 'botón No se administró', loc: toma.getByRole('button', { name: /^No se administró/ }), pos: 'borde-izq', en: toma },
    { n: 6, que: 'botón Administrar', loc: toma.getByRole('button', { name: /^Administrar / }), pos: 'borde-izq', en: toma },
  ], { incluir: [fila] });

  // Los niveles de urgencia que haya ahora, un marcador en el chip de una tarjeta de cada uno. El
  // panel va de lo más urgente a lo menos: se toman las tarjetas de cada cambio de nivel (la última
  // de un nivel y la primera del siguiente), que quedan cerca y entran en la misma foto.
  const todas = await tarjetas(page).all();
  const conNivel = [];
  for (const t of todas) {
    const chip = t.locator('.MuiChip-root');
    const nivel = (await chip.textContent())?.trim();
    if (nivel) conNivel.push({ nivel, chip, tarjeta: t });
  }
  const orden = [...new Set(conNivel.map((c) => c.nivel))];
  const elegidas = orden.map((nivel, i) => {
    const delNivel = conNivel.filter((c) => c.nivel === nivel);
    return i < orden.length - 1 ? delNivel.at(-1) : delNivel[0];
  });
  await subir(page, elegidas[0].tarjeta, 112);
  const vistos = new Map();
  for (const e of elegidas) {
    const b = await e.tarjeta.boundingBox();
    if (b && b.y + b.height <= TABLET.height) vistos.set(e.nivel, e);
  }
  const marcasNiveles = [...vistos.entries()].map(([nivel, { chip }], i) => ({
    n: i + 1,
    que: `nivel «${nivel}»`,
    loc: chip,
    pos: 'abajo',
  }));
  if (vistos.size < 4 && quiero('09')) {
    avisar(`09-niveles-urgencia.png muestra ${[...vistos.keys()].join(', ')}: los otros niveles no estaban en el panel a esta hora`);
  }
  // Las tarjetas completas de esos niveles (y las de su misma fila).
  await capturar(page, '09-niveles-urgencia.png', `Niveles de urgencia en las tarjetas del panel (a esta hora: ${[...vistos.keys()].join(', ')})`, marcasNiveles, {
    incluir: [...vistos.values()].map((v) => v.tarjeta),
  });

  // Una toma vencida (pasaron 60 min desde que apareció sin atenderse), si a esta hora hay alguna.
  // Va al final de la numeración porque depende de la hora (casi nunca coincide con las otras).
  const vencida = tarjetas(page)
    .filter({ has: page.locator('.MuiChip-root', { hasText: /^Vencid[ao]$/ }) })
    .filter({ has: page.getByRole('button', { name: /^Administrar / }) })
    .first();
  if (await vencida.count()) {
    await subir(page, vencida, 120);
    const bl = vencida.locator(':scope > div');
    await capturar(page, '28-recordatorio-vencido.png', 'Tarjeta de una toma vencida: pasó la hora sin atenderse y todavía se puede atender', [
      { n: 1, que: 'hora de la toma y cuánto hace que pasó', loc: bl.nth(0).locator(':scope > div').first(), pos: 'borde-izq', en: vencida },
      { n: 2, que: 'nivel «Vencida»', loc: vencida.locator('.MuiChip-root'), pos: 'abajo' },
      { n: 3, que: 'botón No se administró', loc: vencida.getByRole('button', { name: /^No se administró/ }), pos: 'borde-izq', en: vencida },
      { n: 4, que: 'botón Administrar (se puede atender tarde)', loc: vencida.getByRole('button', { name: /^Administrar / }), pos: 'borde-izq', en: vencida },
    ], { incluir: [vencida] });
  } else if (quiero('28')) {
    avisar('No hay tomas vencidas a esta hora: 28-recordatorio-vencido.png no se saca (queda la de una corrida anterior, si la hay)');
  }
  await arriba(page);
}

/** "Sin conexión en tiempo real": el navegador cierra el WebSocket apenas se abre. */
async function flujoSinConexion(navegador) {
  if (!quiero('10')) return;
  console.log('\nFlujo 2 · Sin conexión en tiempo real (WebSocket cortado en el navegador)');
  const { contexto, page } = await nuevoContexto(navegador);
  await ingresarPorApi(contexto);
  await page.routeWebSocket(/\/api\/tiempo-real/, (ws) => {
    ws.close({ code: 1000, reason: 'Corte simulado para el manual' });
  });
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperarPantalla(page);
  await tarea(page, 'Tomas y estudios para atender').click();
  await page.getByRole('heading', { level: 1, name: 'Recordatorios' }).waitFor();
  const franja = page.getByRole('status').filter({ hasText: 'Sin conexión en tiempo real' });
  await franja.waitFor({ timeout: 15_000 });
  await esperarPantalla(page);
  await capturar(page, '10-sin-conexion.png', 'Panel sin conexión en tiempo real: la franja lo avisa y la insignia lleva el ícono de sin señal', [
    { n: 1, que: 'insignia con el ícono de sin señal', loc: page.getByRole('link', { name: /sin avisos en tiempo real/ }) },
    { n: 2, que: 'franja «Sin conexión en tiempo real: la lista y los avisos se actualizan cada 30 s»', loc: franja, tipo: 'area', pos: 'esq' },
  ], { desdeArriba: true, incluir: [page.getByRole('combobox', { name: 'Tipo' })] });
  await contexto.close();
}

// ───────────────────────── Flujo 3: administrar un medicamento ─────────────────────────

/** El diálogo del rostro abierto, con lo que se confirma (modo demostración). */
async function capturarRostro(page, archivo, que, detalleQue) {
  const dialogo = page.getByRole('dialog', { name: /Confirmar con su rostro/ });
  await dialogo.waitFor();
  await page.waitForTimeout(500);
  const simular = dialogo.getByRole('button', { name: /^Simular el rostro de/ });
  await capturar(page, archivo, que, [
    { n: 1, que: 'qué se está confirmando (título y operación)', loc: dialogo.locator('#titulo-validacion'), texto: true, tipo: 'area', pos: 'esq', pad: 10 },
    { n: 2, que: 'aviso «Modo demostración: el rostro se simula»', loc: dialogo.getByRole('note'), tipo: 'area', pos: 'esq' },
    { n: 3, que: detalleQue, loc: dialogo.getByRole('note').locator('xpath=following-sibling::div[1]'), tipo: 'area', pos: 'esq' },
    { n: 4, que: 'botón «Simular el rostro de …» (en la tablet real, la cámara)', loc: simular, pos: 'esq' },
    { n: 5, que: 'botón Cancelar', loc: dialogo.getByRole('button', { name: 'Cancelar' }), pos: 'izq' },
  ], { incluir: [dialogo] });
  return dialogo;
}

async function flujoAdministrar(page) {
  console.log('\nFlujo 3 · Administrar un medicamento');
  await abrirTarea(page, 'Administrar medicamento', 'Administrar medicamento');
  const selectorPaciente = page.getByRole('combobox', { name: 'Paciente' });
  await elegirOpcion(selectorPaciente, 'Arrieta');
  await page.getByText('Toque el medicamento que va a dar').waitFor();
  await esperarPantalla(page);
  const identidad = page.locator('section').filter({ hasText: DEMO.arrieta }).first();
  const lista = page.getByText('Toque el medicamento que va a dar').locator('xpath=following-sibling::div[1]');
  const ayuda = page.getByText('Elija el medicamento que va a dar');
  await capturar(page, '11-administrar-elegir.png', 'Administrar medicamento: paciente elegido y sus prescripciones vigentes para tocar', [
    { n: 1, que: 'selector Paciente (cama · apellido, nombre)', loc: campo(selectorPaciente), pos: 'dentro-der' },
    { n: 2, que: 'identificación del paciente: nombre, DNI, edad y cama', loc: identidad, tipo: 'area', pos: 'esq' },
    { n: 3, que: 'prescripciones vigentes con el estado de la toma (tocar la que se va a dar)', loc: lista, tipo: 'area', pos: 'esq' },
    { n: 4, que: 'botón Confirmar con mi rostro, deshabilitado hasta elegir, con el porqué', loc: [ayuda, page.getByRole('button', { name: 'Confirmar con mi rostro' })], tipo: 'area', pos: 'esq' },
  ], { desdeArriba: true });

  // Toca la primera prescripción (como la persona).
  const primeraTarjeta = lista.locator('.MuiCardActionArea-root').first();
  await primeraTarjeta.click();
  await page.getByRole('heading', { name: 'Revise antes de confirmar' }).waitFor();
  await esperarPantalla(page);
  const elegida = lista.locator('.MuiCard-root').filter({ has: page.locator('[aria-pressed="true"]') });
  await subir(page, elegida, 112);
  const formulario = page.getByRole('heading', { name: 'Revise antes de confirmar' }).locator('xpath=ancestor::div[contains(@class,"MuiPaper-root")][1]');
  const cantidad = page.getByRole('spinbutton', { name: /^Cantidad/ });
  const resumen = page.getByRole('region', { name: 'Revise antes de confirmar' });
  const confirmar = page.getByRole('button', { name: 'Confirmar con mi rostro' });
  await capturar(page, '12-administrar-revisar.png', 'Administrar medicamento: prescripción elegida, cantidad y resumen para revisar antes de confirmar', [
    { n: 1, que: 'prescripción elegida (con el tilde)', loc: elegida, tipo: 'area', pos: 'esq' },
    { n: 2, que: 'campo Cantidad (viene con la dosis prescripta)', loc: campo(cantidad), pos: 'dentro-der' },
    { n: 3, que: 'campo Observaciones', loc: campo(page.getByRole('textbox', { name: 'Observaciones' })), pos: 'dentro-der' },
    { n: 4, que: 'resumen «Revise antes de confirmar»: paciente con DNI y cama, qué se da, vía y toma', loc: resumen, tipo: 'area', pos: 'esq-der', pad: 10 },
    { n: 5, que: 'botón Confirmar con mi rostro', loc: confirmar, pos: 'izq' },
  ], { incluir: [formulario] });

  // El diálogo del rostro (modo demostración), abierto y sin confirmar.
  await confirmar.click();
  const dialogo = await capturarRostro(
    page,
    '13-confirmar-rostro.png',
    'Diálogo «Confirmar con su rostro» en modo demostración (la tablet real usa la cámara)',
    'lo que se registra: medicamento, dosis, vía y paciente con DNI y cama',
  );

  // "No se sabe si quedó registrada": se simula el rostro en el navegador y el registro se corta
  // antes de salir (no llega al servidor, no se guarda nada).
  if (quiero('14')) {
    await page.route('**/api/biometria/validar', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { valido: true, validacionToken: 'corte-simulado-manual', similitud: 0.9 } }),
      }),
    );
    await page.route('**/api/suministros/medicamentos', (route) =>
      route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
    );
    await dialogo.getByRole('button', { name: /^Simular el rostro de/ }).click();
    const alerta = page.getByRole('alert').filter({ hasText: 'No se sabe si quedó registrada' });
    await alerta.waitFor();
    await page.unroute('**/api/biometria/validar');
    await page.unroute('**/api/suministros/medicamentos');
    await esperarPantalla(page);
    await subir(page, alerta, 112);
    await capturar(page, '14-no-se-sabe.png', 'Aviso «No se sabe si quedó registrada» (corte de conexión simulado: no se guardó nada)', [
      { n: 1, que: 'aviso «No se sabe si quedó registrada»', loc: alerta, tipo: 'area', pos: 'esq' },
      { n: 2, que: 'botón Ver el historial (revisar antes de volver a intentar)', loc: alerta.getByRole('button', { name: 'Ver el historial' }), pos: 'abajo' },
    ], { desdeArriba: true });
  } else {
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  }

  // Desde un recordatorio: el panel abre la misma pantalla con todo elegido.
  await menu(page).getByRole('link', { name: 'Recordatorios' }).click();
  await descartarSiPregunta(page);
  await page.getByRole('heading', { level: 1, name: 'Recordatorios' }).waitFor();
  await esperarPantalla(page);
  let delRecordatorio = tarjeta(page, DEMO.villafane, 'Paracetamol');
  if (!(await delRecordatorio.count())) {
    delRecordatorio = tarjetas(page).filter({ has: page.getByRole('button', { name: /^Administrar / }) }).first();
  }
  const pacienteRecordatorio = (await delRecordatorio.getByRole('heading').textContent()).trim();
  await delRecordatorio.getByRole('button', { name: /^Administrar / }).click();
  await page.getByRole('heading', { name: 'Revise antes de confirmar' }).waitFor();
  await esperarPantalla(page);
  const tarjetaElegida = page.locator('.MuiCard-root').filter({ has: page.locator('[aria-pressed="true"]') });
  await capturar(page, '15-desde-recordatorio.png', `Administrar medicamento abierto desde un recordatorio (${pacienteRecordatorio}): paciente y prescripción ya elegidos`, [
    { n: 1, que: 'flecha Volver (vuelve al panel de Recordatorios)', loc: page.getByRole('link', { name: 'Volver' }) },
    { n: 2, que: 'paciente del recordatorio', loc: campo(page.getByRole('combobox', { name: 'Paciente' })), pos: 'dentro-der' },
    { n: 3, que: 'identificación del paciente', loc: page.locator('section').filter({ hasText: 'DNI' }).first(), tipo: 'area', pos: 'esq' },
    { n: 4, que: 'prescripción del recordatorio, ya elegida', loc: tarjetaElegida, tipo: 'area', pos: 'esq' },
  ], { desdeArriba: true });
  const filaToma = page.getByRole('region', { name: 'Revise antes de confirmar' }).locator('dd').filter({ hasText: /recordatorio/ });
  if (!(await filaToma.count())) avisar('15-desde-recordatorio.png: el resumen no dice «(recordatorio)»');

  // "No se administró": el diálogo con el motivo escrito, sin registrar.
  await page.getByRole('link', { name: 'Volver' }).click();
  await descartarSiPregunta(page);
  await page.getByRole('heading', { level: 1, name: 'Recordatorios' }).waitFor();
  await esperarPantalla(page);
  let paraNoAdministrar = tarjeta(page, DEMO.arrieta, 'Clonazepam');
  if (!(await paraNoAdministrar.count())) {
    paraNoAdministrar = tarjetas(page).filter({ has: page.getByRole('button', { name: /^No se administró/ }) }).first();
  }
  await paraNoAdministrar.getByRole('button', { name: /^No se administró/ }).click();
  const dialogoNo = page.getByRole('dialog', { name: 'No se administró' });
  await dialogoNo.waitFor();
  await dialogoNo.getByRole('textbox', { name: /Por qué no se administró/ }).fill('En ayunas para un estudio');
  await page.waitForTimeout(400);
  await capturar(page, '16-no-se-administro.png', 'Diálogo «No se administró» con el motivo escrito (sin registrar)', [
    { n: 1, que: 'qué toma, de quién y que no se puede deshacer', loc: dialogoNo.locator('.MuiDialogContent-root p').first(), tipo: 'area', pos: 'esq', pad: 10 },
    { n: 2, que: 'campo «Por qué no se administró» (obligatorio)', loc: campo(dialogoNo.getByRole('textbox', { name: /Por qué no se administró/ })), pos: 'dentro-der' },
    { n: 3, que: 'botón Registrar', loc: dialogoNo.getByRole('button', { name: 'Registrar' }), pos: 'abajo' },
    { n: 4, que: 'botón Cancelar', loc: dialogoNo.getByRole('button', { name: 'Cancelar' }), pos: 'izq' },
  ], { incluir: [dialogoNo] });
  await dialogoNo.getByRole('button', { name: 'Cancelar' }).click();
  await dialogoNo.waitFor({ state: 'hidden' });
}

// ───────────────────────── Flujo 4: registrar insumos ─────────────────────────

async function flujoInsumos(page) {
  console.log('\nFlujo 4 · Registrar insumos');
  await abrirTarea(page, 'Registrar insumos', 'Registrar insumos');
  const selectorPaciente = page.getByRole('combobox', { name: 'Paciente' });
  await elegirOpcion(selectorPaciente, 'Olmedo');
  await page.getByRole('heading', { name: 'Catálogo' }).waitFor();
  await esperarPantalla(page);
  const catalogo = page.getByRole('heading', { name: 'Catálogo' }).locator('..');
  const botones = catalogo.getByRole('button', { name: /^Agregar / });
  const buscar = page.getByRole('searchbox', { name: 'Buscar insumo' });
  await capturar(page, '17-insumos-catalogo.png', 'Registrar insumos: paciente elegido y catálogo de insumos para tocar', [
    { n: 1, que: 'selector Paciente', loc: campo(selectorPaciente), pos: 'dentro-der' },
    { n: 2, que: 'identificación del paciente', loc: page.locator('section').filter({ hasText: DEMO.olmedo }).first(), tipo: 'area', pos: 'esq' },
    { n: 3, que: 'campo Buscar insumo', loc: campo(buscar), pos: 'dentro-der' },
    { n: 4, que: 'insumos del catálogo (cada toque suma uno)', loc: botones.first().locator('..'), tipo: 'area', pos: 'esq' },
  ], { desdeArriba: true });

  // Toca tres insumos (dos veces el primero), como al lado de la cama.
  const nombres = ['Gasa estéril', 'Apósito adhesivo', 'Guantes de examen'];
  let tocados = 0;
  for (const nombre of nombres) {
    const b = catalogo.getByRole('button', { name: new RegExp(`^Agregar ${nombre}`) }).first();
    if (await b.count()) {
      await b.click();
      tocados++;
    }
  }
  if (!tocados) {
    await botones.nth(0).click();
    await botones.nth(1).click();
  }
  await botones.first().click(); // uno más del primero: la cantidad pasa a 2
  await page.getByRole('textbox', { name: 'Observaciones' }).fill('Curación de la herida');
  await page.waitForTimeout(300);
  const lista = page.getByRole('list', { name: 'Insumos a registrar' });
  const panel = page.getByRole('heading', { name: 'Insumos a registrar' }).locator('..');
  await subir(page, page.getByRole('heading', { name: 'Insumos a registrar' }), 120);
  const filaUno = lista.getByRole('listitem').first();
  await capturar(page, '18-insumos-lista.png', 'Registrar insumos: la lista de lo que se va a registrar, con cantidades y observaciones', [
    { n: 1, que: 'insumos a registrar con su cantidad', loc: lista, tipo: 'area', pos: 'esq' },
    { n: 2, que: 'cantidad de la fila con los botones restar uno, sumar uno y quitar', loc: [filaUno.getByRole('button', { name: /^Restar uno/ }), filaUno.getByRole('button', { name: /^Quitar/ })], tipo: 'area' },
    { n: 3, que: 'campo Observaciones', loc: campo(page.getByRole('textbox', { name: 'Observaciones' })), pos: 'dentro-der' },
    { n: 4, que: 'botón Confirmar con mi rostro', loc: page.getByRole('button', { name: 'Confirmar con mi rostro' }), pos: 'izq' },
  ], { incluir: [panel] });

  await page.getByRole('button', { name: 'Confirmar con mi rostro' }).click();
  const dialogo = await capturarRostro(
    page,
    '19-insumos-rostro.png',
    'Confirmar con su rostro el registro de insumos (modo demostración, sin confirmar)',
    'los insumos con sus cantidades y el paciente con DNI y cama',
  );
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await dialogo.waitFor({ state: 'hidden' });
}

// ───────────────────────── Flujo 5: paciente, ficha, corrección y estudio ─────────────────────────

async function buscarPaciente(page, texto) {
  await abrirTarea(page, 'Buscar paciente', 'Pacientes');
  const buscar = page.getByRole('searchbox', { name: 'Buscar por apellido, DNI o cama' });
  await buscar.fill(texto);
  await page.waitForTimeout(700);
  await esperarPantalla(page);
  return buscar;
}

async function flujoPaciente(page) {
  console.log('\nFlujo 5 · Buscar un paciente, su ficha, corregir y confirmar un estudio');
  const buscar = await buscarPaciente(page, 'Olmedo');
  const fila = page.getByRole('row', { name: `Abrir ${DEMO.olmedo}` }).or(page.getByRole('button', { name: `Abrir ${DEMO.olmedo}` })).first();
  await fila.waitFor();
  await capturar(page, '20-buscar-paciente.png', 'Buscar paciente: búsqueda por apellido, DNI o cama, con filtros de sala y estado', [
    { n: 1, que: 'campo Buscar por apellido, DNI o cama', loc: campo(buscar), pos: 'dentro-der' },
    { n: 2, que: 'filtro Sala', loc: campo(page.getByRole('combobox', { name: 'Sala' })), pos: 'dentro-der' },
    { n: 3, que: 'filtro Estado (Internados, Egresados o Todos)', loc: campo(page.getByRole('combobox', { name: 'Estado' })), pos: 'dentro-der' },
    { n: 4, que: 'fila del paciente encontrado (tocar para abrir la ficha)', loc: fila, tipo: 'area', pos: 'esq' },
  ], { desdeArriba: true, incluir: [page.getByText(/^Página \d+ de \d+/).first()] });

  await fila.click();
  await page.getByRole('heading', { level: 1, name: DEMO.olmedo }).waitFor();
  await esperarPantalla(page, 600);
  const pestanas = page.getByRole('tablist', { name: 'Secciones de la ficha' });
  const prescripciones = page.getByRole('list', { name: 'Prescripciones' }).or(page.getByRole('tabpanel')).first();
  const tarjetaP = page.locator('[aria-labelledby$="-titulo"]').first().locator('..');
  const encabezado = page.getByRole('heading', { level: 1, name: DEMO.olmedo }).locator('..');
  await capturar(page, '21-ficha-prescripciones.png', 'Ficha del paciente, pestaña Prescripciones: cada medicamento con su próxima toma y Administrar', [
    { n: 1, que: 'paciente: nombre, DNI, edad y cama', loc: encabezado, tipo: 'area', pos: 'esq' },
    { n: 2, que: 'botones Administrar medicamento y Registrar insumos', loc: [page.getByRole('button', { name: 'Administrar medicamento' }), page.getByRole('button', { name: 'Registrar insumos' })], tipo: 'area', pos: 'esq' },
    { n: 3, que: 'pestañas Datos, Prescripciones, Estudios e Historial', loc: pestanas, tipo: 'area', pos: 'esq' },
    { n: 4, que: 'próxima toma y última administración', loc: tarjetaP.getByText(/Próxima:|Última:/).first(), pos: 'borde-izq', en: tarjetaP },
    { n: 5, que: 'botón Administrar de esa prescripción', loc: tarjetaP.getByRole('button', { name: /^Administrar / }), pos: 'borde-izq', en: tarjetaP },
  ], { desdeArriba: true, incluir: [tarjetaP] });
  void prescripciones;

  // Historial → Suministros.
  await pestanas.getByRole('tab', { name: 'Historial' }).click();
  await esperarPantalla(page);
  const subpestana = page.getByRole('tab', { name: /^Suministros/ });
  await subpestana.click();
  await esperarPantalla(page);
  const tabla = page.getByRole('table', { name: 'Suministros' }).or(page.getByRole('list', { name: 'Suministros' })).first();
  const filaKetorolac = page.getByRole('row', { name: /^Abrir el registro/ }).or(page.getByRole('button', { name: /^Abrir el registro/ })).filter({ hasText: 'Ketorolac' }).first();
  await filaKetorolac.waitFor();
  await capturar(page, '22-ficha-historial.png', 'Ficha del paciente, pestaña Historial: los suministros registrados, para abrir y corregir', [
    { n: 1, que: 'pestaña Historial', loc: pestanas.getByRole('tab', { name: 'Historial' }), pos: 'abajo' },
    { n: 2, que: 'fechas Desde y Hasta', loc: [campo(page.getByLabel('Desde')), campo(page.getByLabel('Hasta'))], tipo: 'area', pos: 'esq' },
    { n: 3, que: 'pestaña Suministros del historial', loc: subpestana, pos: 'der' },
    { n: 4, que: 'un registro (tocar para abrirlo)', loc: filaKetorolac, tipo: 'area', pos: 'esq' },
  ], { desdeArriba: true, incluir: [tabla] });

  // Abrir el registro y corregir (sin confirmar).
  await filaKetorolac.click();
  const detalle = page.getByRole('dialog', { name: /^Suministro del/ });
  await detalle.waitFor();
  await page.waitForTimeout(500);
  const corregir = detalle.getByRole('button', { name: 'Corregir' });
  if (!(await corregir.count())) {
    throw new Error('El registro no ofrece Corregir: ¿pasaron 24 h desde preparar-datos.mjs? Volver a correrlo.');
  }
  await capturar(page, '23-suministro-detalle.png', 'Detalle de un registro de administración, con Corregir (dentro de las 24 h)', [
    { n: 1, que: 'datos del registro: paciente, quién registró, prescripción, detalle', loc: detalle.locator('.MuiDialogContent-root > div').last(), tipo: 'area', pos: 'esq', pad: 10 },
    { n: 2, que: 'botón Corregir', loc: corregir, pos: 'izq' },
    { n: 3, que: 'botón Cerrar', loc: detalle.getByRole('button', { name: 'Cerrar' }), pos: 'abajo' },
  ], { incluir: [detalle] });

  await corregir.click();
  const cantidad = detalle.getByRole('spinbutton', { name: /^Cantidad/ });
  await cantidad.waitFor();
  await cantidad.fill('15');
  await detalle.getByRole('textbox', { name: /^Motivo de la corrección/ }).fill('Se cargó la dosis completa y se dio la mitad');
  await page.waitForTimeout(300);
  const confirmarCorreccion = detalle.getByRole('button', { name: 'Confirmar corrección con mi rostro' });
  await capturar(page, '24-corregir.png', 'Corrección de un registro: nueva cantidad y motivo, antes de confirmar con el rostro', [
    { n: 1, que: 'campo Cantidad corregida', loc: campo(cantidad), pos: 'der' },
    { n: 2, que: 'campo Motivo de la corrección (obligatorio)', loc: campo(detalle.getByRole('textbox', { name: /^Motivo de la corrección/ })), pos: 'dentro-der' },
    { n: 3, que: 'botón Confirmar corrección con mi rostro', loc: confirmarCorreccion, pos: 'abajo' },
    { n: 4, que: 'botón Cancelar (deja el registro como estaba)', loc: detalle.getByRole('button', { name: 'Cancelar' }), pos: 'izq' },
  ], { incluir: [detalle] });

  await confirmarCorreccion.click();
  const rostro = await capturarRostro(
    page,
    '25-corregir-rostro.png',
    'Confirmar con su rostro la corrección (modo demostración, sin confirmar): antes, después y motivo',
    'la corrección: paciente, antes, después y motivo',
  );
  await rostro.getByRole('button', { name: 'Cancelar' }).click();
  await rostro.waitFor({ state: 'hidden' });
  await detalle.getByRole('button', { name: 'Cancelar' }).click();
  await detalle.getByRole('button', { name: 'Cerrar' }).click();
  await detalle.waitFor({ state: 'hidden' });

  // Confirmar que se realizó un estudio: el de hoy (Villafañe), desde su ficha.
  await buscarPaciente(page, 'Villafañe');
  await page.getByRole('row', { name: `Abrir ${DEMO.villafane}` }).or(page.getByRole('button', { name: `Abrir ${DEMO.villafane}` })).first().click();
  await page.getByRole('heading', { level: 1, name: DEMO.villafane }).waitFor();
  await esperarPantalla(page);
  const pestanasV = page.getByRole('tablist', { name: 'Secciones de la ficha' });
  await pestanasV.getByRole('tab', { name: 'Estudios' }).click();
  await esperarPantalla(page);
  const botonConfirmar = page.getByRole('button', { name: /^Confirmar que se realizó/ }).first();
  await botonConfirmar.waitFor();
  const tarjetaEstudio = botonConfirmar.locator('xpath=ancestor::*[contains(@class,"MuiPaper-root")][1]');
  await capturar(page, '26-ficha-estudios.png', 'Ficha del paciente, pestaña Estudios: el estudio programado con Confirmar que se realizó', [
    // Sobre la esquina de la pestaña: abajo quedaba al lado del título «Programados».
    { n: 1, que: 'pestaña Estudios', loc: pestanasV.getByRole('tab', { name: 'Estudios' }), pos: 'esq', fijo: true },
    { n: 2, que: 'estudio programado: nombre, fecha y hora', loc: tarjetaEstudio, tipo: 'area', pos: 'esq' },
    { n: 3, que: 'botón Confirmar que se realizó', loc: botonConfirmar, pos: 'izq' },
  ], { desdeArriba: true });

  await botonConfirmar.click();
  const dialogoEstudio = page.getByRole('dialog', { name: 'Confirmar que se realizó el estudio' });
  await dialogoEstudio.waitFor();
  await dialogoEstudio.getByRole('region', { name: 'Revise antes de confirmar' }).waitFor();
  await page.waitForTimeout(500);
  await capturar(page, '27-confirmar-estudio.png', 'Confirmar que se realizó el estudio: resumen, observaciones y Confirmar con mi rostro (sin confirmar)', [
    { n: 1, que: 'qué se confirma: estudio, fecha y hora, preparación y paciente', loc: dialogoEstudio.getByRole('region', { name: 'Revise antes de confirmar' }), tipo: 'area', pos: 'esq' },
    { n: 2, que: 'campo Observaciones (opcional)', loc: campo(dialogoEstudio.getByRole('textbox', { name: /^Observaciones/ })), pos: 'dentro-der' },
    { n: 3, que: 'botón Confirmar con mi rostro', loc: dialogoEstudio.getByRole('button', { name: 'Confirmar con mi rostro' }), pos: 'abajo' },
    { n: 4, que: 'botón Cancelar', loc: dialogoEstudio.getByRole('button', { name: 'Cancelar' }), pos: 'izq' },
  ], { incluir: [dialogoEstudio] });
  await dialogoEstudio.getByRole('button', { name: 'Cancelar' }).click();
}

// ───────────────── Flujo 6: alergias en Datos y "No se administró" en el historial ─────────────────

/** Alergia ficticia de Olmedo: solo en lo que recibe el navegador para la captura 29, no en la base. */
const ALERGIA = 'Alérgico a la penicilina.';
/** Motivo del "No se administró" que se muestra en la captura 30 (se registra con --registrar-no-administrado). */
const MOTIVO_NO_ADMINISTRADO = 'Lo rechazó: refiere náuseas';
const REGISTRAR_NO_ADMINISTRADO = process.argv.includes('--registrar-no-administrado');

async function abrirFicha(page, apellido, nombre) {
  await buscarPaciente(page, apellido);
  await page.getByRole('row', { name: `Abrir ${nombre}` }).or(page.getByRole('button', { name: `Abrir ${nombre}` })).first().click();
  await page.getByRole('heading', { level: 1, name: nombre }).waitFor();
  await esperarPantalla(page);
  return page.getByRole('tablist', { name: 'Secciones de la ficha' });
}

/** La fila del "No se administró" de Arrieta con el motivo de la captura, en Historial › Modificaciones. */
async function filaNoAdministrado(page) {
  const pestanas = await abrirFicha(page, 'Arrieta', DEMO.arrieta);
  await pestanas.getByRole('tab', { name: 'Historial' }).click();
  await esperarPantalla(page);
  const subpestana = page.getByRole('tab', { name: /^Modificaciones/ });
  await subpestana.click();
  await esperarPantalla(page);
  const fila = page.getByRole('row').filter({ hasText: 'NO_ADMINISTRAR' }).filter({ hasText: MOTIVO_NO_ADMINISTRADO }).first();
  return { fila, subpestana, historial: pestanas.getByRole('tab', { name: 'Historial' }), existe: (await fila.count()) > 0 };
}

/**
 * Registra DE VERDAD un "No se administró" en una toma de Arrieta, desde su tarjeta en
 * Recordatorios, como lo haría la enfermera. Solo con --registrar-no-administrado y solo si
 * todavía no hay uno con ese motivo (una vez por base).
 */
async function registrarNoAdministrado(page) {
  await menu(page).getByRole('link', { name: 'Recordatorios' }).click();
  await descartarSiPregunta(page);
  await page.getByRole('heading', { level: 1, name: 'Recordatorios' }).waitFor();
  await esperarPantalla(page);
  let t = tarjeta(page, DEMO.arrieta, 'Baclofeno');
  if (!(await t.count())) t = tarjeta(page, DEMO.arrieta);
  if (!(await t.count())) throw new Error('No hay ninguna toma de Arrieta en Recordatorios: correr preparar-datos.mjs');
  await t.getByRole('button', { name: /^No se administró/ }).click();
  const dialogo = page.getByRole('dialog', { name: 'No se administró' });
  await dialogo.waitFor();
  await dialogo.getByRole('textbox', { name: /Por qué no se administró/ }).fill(MOTIVO_NO_ADMINISTRADO);
  await dialogo.getByRole('button', { name: 'Registrar' }).click();
  await dialogo.waitFor({ state: 'hidden' });
  await page.getByText(/^Se registró que no se administró/).first().waitFor();
  console.log('  · se registró «No se administró» en una toma de Arrieta');
}

async function flujoFichaExtra(page) {
  if (!quiero('29') && !quiero('30')) return;
  console.log('\nFlujo 6 · Alergias en la pestaña Datos y «No se administró» en el historial');

  if (quiero('29')) {
    // La alergia se agrega en la respuesta que ve el navegador (la base no cambia).
    const conAlergia = async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const respuesta = await route.fetch();
      const json = await respuesta.json();
      if (json?.data?.apellido === 'Olmedo' && !String(json.data.observaciones ?? '').startsWith(ALERGIA)) {
        json.data.observaciones = `${ALERGIA} ${json.data.observaciones ?? ''}`.trim();
      }
      await route.fulfill({ response: respuesta, json });
    };
    await page.route(/\/api\/pacientes\/\d+(\?.*)?$/, conAlergia);
    const pestanas = await abrirFicha(page, 'Olmedo', DEMO.olmedo);
    await pestanas.getByRole('tab', { name: 'Datos' }).click();
    await esperarPantalla(page);
    const panel = page.getByRole('tabpanel');
    await panel.getByText(ALERGIA, { exact: false }).waitFor();
    const observaciones = panel.getByText('Observaciones', { exact: true }).locator('..');
    await capturar(page, '29-ficha-datos.png', 'Ficha del paciente, pestaña Datos: las alergias, si el médico las anotó, están en Observaciones (alergia ficticia)', [
      { n: 1, que: 'pestaña Datos', loc: pestanas.getByRole('tab', { name: 'Datos' }), pos: 'esq', fijo: true },
      { n: 2, que: 'Observaciones (donde el médico anota, por ejemplo, las alergias)', loc: observaciones, tipo: 'area', pos: 'esq' },
    ], { desdeArriba: true, incluir: [panel] });
    await page.unroute(/\/api\/pacientes\/\d+(\?.*)?$/, conAlergia);
  }

  if (quiero('30')) {
    let { fila, subpestana, historial, existe } = await filaNoAdministrado(page);
    if (!existe) {
      if (!REGISTRAR_NO_ADMINISTRADO) {
        avisar('30-historial-no-administrado.png no se saca: falta un «No se administró» con el motivo de la captura (correr con --registrar-no-administrado)');
        return;
      }
      await registrarNoAdministrado(page);
      ({ fila, subpestana, historial, existe } = await filaNoAdministrado(page));
      if (!existe) throw new Error('No aparece el «No se administró» recién registrado en Modificaciones');
    }
    // Desde arriba (el paciente y sus pestañas) hasta el renglón, si entra; si no, solo el renglón.
    await arriba(page);
    const caja = await fila.boundingBox();
    const entra = caja && caja.y + caja.height <= TABLET.height - 4;
    if (!entra) await subir(page, fila, 120);
    const celdas = fila.getByRole('cell');
    const base = entra ? 2 : 0;
    await capturar(page, '30-historial-no-administrado.png', 'Historial › Modificaciones: el renglón de un «No se administró», con el motivo en Detalle', [
      ...(entra
        ? [
            { n: 1, que: 'pestaña Historial', loc: historial, pos: 'esq', fijo: true },
            { n: 2, que: 'solapa Modificaciones del historial', loc: subpestana, pos: 'der' },
          ]
        : []),
      { n: base + 1, que: 'Acción «NO_ADMINISTRAR»', loc: celdas.nth(1), pos: 'esq' },
      { n: base + 2, que: 'Detalle: el motivo (después de «motivoNoAdministrado»)', loc: celdas.nth(2), tipo: 'area', pos: 'esq' },
      { n: base + 3, que: 'Usuario: quién lo registró', loc: celdas.nth(3), pos: 'esq-der', fijo: true },
    ], { incluir: [fila], margen: 6, desdeArriba: entra });
  }
}

// ───────────────────────── Principal ─────────────────────────

async function principal() {
  mkdirSync(SALIDA, { recursive: true });
  const navegador = await chromium.launch();
  try {
    const { page } = await nuevoContexto(navegador);
    await flujoIngreso(page);
    await flujoInactividad(navegador);
    await flujoTelefono(navegador);
    await flujoRecordatorios(page);
    await flujoSinConexion(navegador);
    await flujoAdministrar(page);
    await flujoInsumos(page);
    await flujoPaciente(page);
    await flujoFichaExtra(page);
  } finally {
    await navegador.close();
  }

  const rutaRef = resolve(SALIDA, 'referencias.json');
  // Se conservan las entradas de las capturas que no se rehicieron en esta corrida (--solo, o la de
  // la tarjeta vencida cuando a esta hora no hay ninguna) y cuyo archivo sigue en la carpeta.
  const previas = existsSync(rutaRef) ? JSON.parse(readFileSync(rutaRef, 'utf8')) : [];
  const hechas = new Set(referencias.map((r) => r.archivo));
  const todas = [
    ...referencias,
    ...previas.filter((r) => !hechas.has(r.archivo) && existsSync(resolve(SALIDA, '..', '..', r.archivo))),
  ].sort((a, b) => a.archivo.localeCompare(b.archivo));
  writeFileSync(rutaRef, `${JSON.stringify(todas, null, 2)}\n`);
  console.log(`\n${referencias.length} capturas en ${SALIDA}`);
  if (avisos.length) {
    console.log('\nAvisos:');
    for (const a of avisos) console.log(`  - ${a}`);
  }
}

principal().catch((e) => {
  console.error(`\nNo se pudieron sacar las capturas: ${e.message}`);
  process.exitCode = 1;
});
