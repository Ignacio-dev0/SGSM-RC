// Guía del médico: esperar, completar campos, marcadores y guardar cada captura.

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { COLOR, MARCA, RADIO, SALIDA, SOLO, WEB, credenciales } from './datos.mjs';

// ───────────────────────── Pantalla ─────────────────────────

/** Espera a que la pantalla termine de cargar (sin pedidos ni indicadores de carga). */
export async function esperar(page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page
    .locator(
      '[role="progressbar"]:visible, .MuiCircularProgress-root:visible, .MuiLinearProgress-root:visible',
    )
    .first()
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => undefined);
  await page.waitForTimeout(250);
}

/**
 * El contenedor de un campo (etiqueta, caja y ayuda) a partir de su etiqueta. El localizador de
 * `has` se busca dentro de cada contenedor, por eso sale de la página y no de `raiz`.
 */
export const campo = (raiz, etiqueta, exacto = false) => {
  const pagina = typeof raiz.page === 'function' ? raiz.page() : raiz;
  return raiz
    .locator('.MuiFormControl-root', { has: pagina.getByLabel(etiqueta, { exact: exacto }) })
    .first();
};

/** Elige en un <select> nativo la opción cuyo texto contiene `texto`. */
export async function elegir(select, texto) {
  const valor = await select.evaluate(
    (s, t) => [...s.options].find((o) => o.text.includes(t))?.value,
    texto,
  );
  if (valor === undefined) throw new Error(`No hay una opción «${texto}»`);
  await select.selectOption(valor);
}

/** Lleva un elemento al centro de la vista (lejos de la barra fija de arriba). */
export async function asomar(loc) {
  await loc.first().waitFor({ state: 'visible', timeout: 10_000 });
  await loc.first().evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await loc.page().waitForTimeout(200);
}

export async function irAlInicio(page) {
  await page.goto(`${WEB}/`);
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperar(page);
}

export async function ingresar(page) {
  const { usuario, clave } = credenciales('medico');
  await page.goto(`${WEB}/ingresar`);
  await page.getByRole('textbox', { name: 'Usuario' }).fill(usuario);
  await page.getByLabel('Contraseña', { exact: true }).fill(clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperar(page);
}

/** Desde el Inicio: Buscar paciente → escribir el apellido → tocar su fila → ficha. */
export async function abrirFicha(page, apellido, telefono = false) {
  await irAlInicio(page);
  await page.getByRole('link', { name: /Buscar paciente/ }).click();
  await page.getByLabel('Buscar por apellido, DNI o cama').fill(apellido);
  // En el teléfono cada paciente es una tarjeta: se toca su contenido, como con el dedo.
  const fila = telefono
    ? page.locator('li', {
        has: page.getByRole('button', { name: new RegExp(`Abrir ${apellido}`) }),
      })
    : page.getByRole('row', { name: new RegExp(`Abrir ${apellido}`) });
  await fila.first().waitFor();
  await esperar(page);
  await fila.first().click();
  await page.getByRole('heading', { level: 1, name: new RegExp(`^${apellido},`) }).waitFor();
  await esperar(page);
}

// ───────────────────────── Marcadores y captura ─────────────────────────

export const referencias = [];
export const problemas = [];

/** Centro del círculo según el lado elegido, dentro de la vista. */
function centroDelCirculo(r, lado, vp) {
  const fuera = RADIO + 8;
  let cx;
  let cy;
  switch (lado) {
    case 'dentro-arriba':
      cx = r.x + r.w - RADIO - 12;
      cy = r.y + RADIO + 10;
      break;
    case 'izq-arriba':
      cx = r.x - fuera;
      cy = r.y + RADIO;
      break;
    case 'izq':
      cx = r.x - fuera;
      cy = r.y + r.h / 2;
      break;
    case 'der':
      cx = r.x + r.w + fuera;
      cy = r.y + r.h / 2;
      break;
    case 'arriba':
      cx = r.x + Math.min(r.w / 2, 40);
      cy = r.y - fuera;
      break;
    case 'abajo':
      cx = r.x + r.w / 2;
      cy = r.y + r.h + fuera;
      break;
    case 'dentro':
      cx = r.x + r.w - RADIO - 10;
      cy = r.y + r.h / 2;
      break;
    case 'esquina-der':
      cx = r.x + r.w + 2;
      cy = r.y - 2;
      break;
    default: // esquina superior izquierda
      cx = r.x - 2;
      cy = r.y - 2;
  }
  const m = RADIO + 3;
  return {
    cx: Math.min(Math.max(cx, m), vp.width - m),
    cy: Math.min(Math.max(cy, m), vp.height - m),
  };
}

/**
 * Rectángulo VISIBLE del elemento: getBoundingClientRect recortado por los contenedores que lo
 * esconden (por ejemplo, una fila de tabla más ancha que su caja con desplazamiento lateral).
 */
const rectDe = (loc) =>
  loc.evaluate((el) => {
    const b = el.getBoundingClientRect();
    let x0 = b.left;
    let y0 = b.top;
    let x1 = b.right;
    let y1 = b.bottom;
    // La etiqueta de un campo sobresale por arriba de su caja: el recuadro la deja adentro.
    for (const l of el.querySelectorAll('label')) {
      const r = l.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      x0 = Math.min(x0, r.left);
      y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right);
      y1 = Math.max(y1, r.bottom);
    }
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)) {
        const c = p.getBoundingClientRect();
        x0 = Math.max(x0, c.left);
        y0 = Math.max(y0, c.top);
        x1 = Math.min(x1, c.right);
        y1 = Math.min(y1, c.bottom);
      }
    }
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  });

/**
 * Captura con marcadores. `marcas`: [{ n, loc, que, lado?, recuadro? }]. `incluir`: otros
 * elementos que tienen que entrar en el recorte. `recorte`: 'auto' (alto justo, ancho completo),
 * 'pantalla' o 'arriba' (desde el borde superior, con la barra).
 */
export async function capturar(
  page,
  archivo,
  { muestra, marcas = [], incluir = [], recorte = 'auto', margen = 20 },
) {
  if (SOLO && !SOLO.includes(archivo.slice(0, 2))) return;
  const vp = page.viewportSize();
  await esperar(page);
  // Sin foco ni puntero encima: la captura no muestra un estado de edición que el texto no explica.
  await page.mouse.move(vp.width - 3, vp.height - 3);
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement && el !== document.body) el.blur();
  });
  await page.waitForTimeout(250);
  // La marca interna de los datos de demostración no se muestra (solo en la pantalla, no en la base).
  await page.evaluate((marca) => {
    const quitar = (t) => t.replaceAll(` (${marca})`, '').replaceAll(`(${marca})`, '');
    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
      if (n.nodeValue.includes(marca)) n.nodeValue = quitar(n.nodeValue);
    }
    for (const campo of document.querySelectorAll('input, textarea')) {
      if (campo.value.includes(marca)) campo.value = quitar(campo.value);
    }
  }, MARCA);

  const calculadas = [];
  for (const m of marcas) {
    // Un marcador puede abarcar varios controles juntos (un grupo): se marca su unión.
    const partes = [];
    for (const l of Array.isArray(m.loc) ? m.loc : [m.loc]) {
      await l.first().waitFor({ state: 'visible', timeout: 10_000 });
      partes.push(await rectDe(l.first()));
    }
    const x0 = Math.min(...partes.map((p) => p.x));
    const y0 = Math.min(...partes.map((p) => p.y));
    const r = {
      x: x0,
      y: y0,
      w: Math.max(...partes.map((p) => p.x + p.w)) - x0,
      h: Math.max(...partes.map((p) => p.y + p.h)) - y0,
    };
    if (
      r.w === 0 ||
      r.h === 0 ||
      r.y < 0 ||
      r.y + r.h > vp.height ||
      r.x < 0 ||
      r.x + r.w > vp.width + 1
    ) {
      throw new Error(
        `${archivo}: el marcador ${m.n} (${m.que}) quedó fuera de la vista ${JSON.stringify(r)}`,
      );
    }
    calculadas.push({
      n: m.n,
      que: m.que,
      ...r,
      ...centroDelCirculo(r, m.lado, vp),
      recuadro: m.recuadro !== false,
    });
  }
  const extras = [];
  for (const loc of incluir) {
    await loc.first().waitFor({ state: 'visible', timeout: 10_000 });
    extras.push(await rectDe(loc.first()));
  }

  // Avisa si dos círculos quedan encimados.
  for (let i = 0; i < calculadas.length; i++) {
    for (let j = i + 1; j < calculadas.length; j++) {
      const a = calculadas[i];
      const b = calculadas[j];
      if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < 2 * RADIO + 4) {
        console.warn(`  ! ${archivo}: los círculos ${a.n} y ${b.n} se tocan`);
      }
    }
  }

  await page.evaluate(
    ({ marcas, color, radio }) => {
      const capa = document.createElement('div');
      capa.id = 'marcadores-del-manual';
      capa.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
      for (const m of marcas) {
        if (m.recuadro) {
          const b = document.createElement('div');
          b.style.cssText =
            `position:fixed;left:${m.x - 5}px;top:${m.y - 5}px;width:${m.w + 10}px;height:${m.h + 10}px;` +
            `border:3px solid ${color};border-radius:8px;box-sizing:border-box;` +
            'box-shadow:0 0 0 2px #fff, inset 0 0 0 2px #fff;';
          capa.appendChild(b);
        }
        const c = document.createElement('div');
        c.textContent = String(m.n);
        c.style.cssText =
          `position:fixed;left:${m.cx - radio}px;top:${m.cy - radio}px;width:${2 * radio}px;height:${2 * radio}px;` +
          `border-radius:50%;background:${color};color:#fff;border:3px solid #fff;box-sizing:border-box;` +
          `display:flex;align-items:center;justify-content:center;font:700 17px/1 Arial,Helvetica,sans-serif;` +
          'box-shadow:0 1px 5px rgba(0,0,0,.6);';
        capa.appendChild(c);
      }
      document.body.appendChild(capa);
    },
    { marcas: calculadas, color: COLOR, radio: RADIO },
  );
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );

  let clip;
  if (recorte === 'pantalla') {
    clip = { x: 0, y: 0, width: vp.width, height: vp.height };
  } else {
    const arriba = [];
    const abajo = [];
    for (const m of calculadas) {
      arriba.push(m.y - 8, m.cy - RADIO - 4);
      abajo.push(m.y + m.h + 8, m.cy + RADIO + 4);
    }
    for (const r of extras) {
      arriba.push(r.y);
      abajo.push(r.y + r.h);
    }
    let y0 = recorte === 'arriba' ? 0 : Math.max(0, Math.min(...arriba) - margen);
    const { desplazada, finDeLaBarra } = await page.evaluate(() => ({
      desplazada: window.scrollY > 0,
      // La barra superior y la franja fija de abajo (aviso de demostración).
      finDeLaBarra: Math.max(
        0,
        ...[...document.querySelectorAll('header, body *')]
          .filter((el) => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return (
              s.position === 'fixed' &&
              r.top <= 70 &&
              r.width > window.innerWidth / 2 &&
              r.height < 200
            );
          })
          .map((el) => el.getBoundingClientRect().bottom),
      ),
    }));
    if (recorte !== 'arriba') {
      if (!desplazada && y0 < 150) {
        // Lo útil empieza cerca de arriba: entra la barra entera y no queda un ítem del menú cortado.
        y0 = 0;
      } else if (desplazada && y0 < finDeLaBarra) {
        // Con la página desplazada, lo que pasa por debajo de la barra fija no se muestra a medias.
        y0 = finDeLaBarra;
      }
    }
    const y1 = Math.min(vp.height, Math.max(...abajo) + margen);
    const pedido = Math.max(...abajo) - Math.min(...arriba);
    if (pedido > vp.height) problemas.push(`${archivo}: lo pedido no entra en la vista`);
    clip = { x: 0, y: Math.round(y0), width: vp.width, height: Math.round(y1 - y0) };
  }

  mkdirSync(SALIDA, { recursive: true });
  await page.screenshot({ path: resolve(SALIDA, archivo), clip, animations: 'disabled' });
  await page.evaluate(() => document.getElementById('marcadores-del-manual')?.remove());

  referencias.push({
    archivo: `img/medico/${archivo}`,
    muestra,
    tamano: { w: clip.width, h: clip.height },
    marcadores: marcas.map((m) => ({ n: m.n, que: m.que })),
  });
  console.log(`  ok ${archivo} (${clip.width}×${clip.height})`);
}

export const quiere = (...nn) => !SOLO || nn.some((n) => SOLO.includes(n));
