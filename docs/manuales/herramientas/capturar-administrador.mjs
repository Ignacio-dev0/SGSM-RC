// Capturas del Manual del administrador (T807) — SOLO desarrollo.
//
// Recorre la interfaz (http://localhost:4173, modo demostración) como lo haría el administrador:
// entra al Inicio y toca lo que la pantalla ofrece (menú, tarjetas, filas, botones). Antes de
// cada captura dibuja marcadores numerados sobre los controles que el manual va a nombrar
// (círculo con número; recuadro para áreas), recorta a la zona útil y guarda el PNG en
// docs/manuales/img/administrador/NN-nombre-corto.png. Los marcadores se quitan enseguida.
//
// Tablet vertical 768 × 1024 (el equipo del hospital), tema claro, deviceScaleFactor 1; antes,
// la pantalla Ingresar sin sesión (00); al final, tres capturas en teléfono (375 × 812) donde el
// recorrido cambia (menú en cajón y detalle de la auditoría a pantalla completa). La 39 (la parte
// de abajo de la ficha de una persona) se agregó después y va en el recorrido junto a la 05.
//
// Qué guarda en la base (solo datos ficticios de demostración):
//   - Una persona del personal de demostración, "Quiroga, Elena Beatriz" (enfermera, DNI que
//     empieza con 9). Si no existe, se crea por la API; si quedó dada de baja, se reactiva; se
//     le quitan los permisos adicionales y el rostro para que el recorrido arranque igual.
//   - Con ella, UNA sola vez (si el administrador todavía no tiene esos avisos): 3 validaciones
//     faciales fallidas y 3 ingresos con contraseña equivocada, para que las notificaciones
//     muestren una cuenta bloqueada y una validación facial fallida. Su contraseña es al azar y
//     no se guarda en ningún lado.
//   - En la interfaz, sobre esa persona: la da de baja y la reactiva, y le registra el rostro
//     simulado (hacen falta para mostrar el resultado).
//   Todo lo demás (alta de usuario, permisos, catálogo, bajas de insumos, eliminar el rostro) se
//   muestra con el formulario o el diálogo abierto, sin confirmar.
//
// Los nombres de usuario de las cuentas de prueba (los de e2e/soporte.ts) se tapan en las
// capturas: el manual no los muestra. Al terminar una corrida completa escribe referencias.json
// al lado de las imágenes: qué muestra cada captura y qué señala cada número.
//
// Uso (desde la raíz del repo, con la interfaz y la API andando):
//   node docs/manuales/herramientas/capturar-administrador.mjs
//   node docs/manuales/herramientas/capturar-administrador.mjs --solo 05,06   (recorre todo, guarda
//     esas y reemplaza sus entradas en referencias.json)
//   node docs/manuales/herramientas/capturar-administrador.mjs --recorrido telefono   (o tablet)
// Variables opcionales: SGSM_UI (http://localhost:4173), SGSM_API (http://localhost:3000) y las
// de las pruebas e2e para los usuarios (E2E_USUARIO_ADMIN, E2E_CLAVE_ADMIN…).
//
// Piezas (ninguna pasa de 1000 líneas): administrador/datos.mjs (datos ficticios y usuarios de
// prueba), administrador/marcadores.mjs (esperar, tapar, marcar, recortar y guardar),
// administrador/gestion.mjs (capturas 01–22) y administrador/consultas.mjs (23–38).

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { recorridoConsultas, recorridoTelefono } from './administrador/consultas.mjs';
import {
  API,
  DEMO,
  OPERACION_FALLIDA,
  RAIZ,
  UI,
  USUARIOS_DE_PRUEBA,
  claveAlAzar,
  credenciales,
} from './administrador/datos.mjs';
import { recorridoGestion } from './administrador/gestion.mjs';
import {
  crearCapturador,
  escribirReferencias,
  esperar,
  nuevoContexto,
} from './administrador/marcadores.mjs';

const SALIDA = resolve(RAIZ, 'docs/manuales/img/administrador');
/** --recorrido tablet | telefono: solo esa parte (para rehacer capturas sin repetir todo). */
const RECORRIDO = (() => {
  const i = process.argv.indexOf('--recorrido');
  return i > 0 ? process.argv[i + 1] : null;
})();
/** --solo 05,06: recorre todo pero guarda solo esas. */
const SOLO = (() => {
  const i = process.argv.indexOf('--solo');
  return i > 0 ? new Set(process.argv[i + 1].split(',').map((s) => s.padStart(2, '0'))) : null;
})();

/** Color de los marcadores: magenta, que no usa la aplicación (su primario es verde azulado). */
const COLOR = '#d4006f';
const TABLET = { width: 768, height: 1024 };
const TELEFONO = { width: 375, height: 812 };

// ───────────────────────── Preparación por la API ─────────────────────────

class ErrorApi extends Error {
  constructor(metodo, ruta, status, cuerpo) {
    super(
      `${metodo} ${ruta} → ${status} ${cuerpo?.error?.codigo ?? ''} ${cuerpo?.error?.mensaje ?? ''}`,
    );
    this.status = status;
    this.codigo = cuerpo?.error?.codigo;
  }
}

async function ingresarApi(usuario, clave) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nombreUsuario: usuario, contrasena: clave }),
  });
  if (!r.ok)
    throw new ErrorApi('POST', '/api/auth/login', r.status, await r.json().catch(() => null));
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('sgsm_sesion='));
  if (!cookie) throw new Error(`El ingreso de ${usuario} no devolvió la cookie de sesión`);
  const pedir = async (metodo, ruta, cuerpo) => {
    const res = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { cookie, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new ErrorApi(metodo, ruta, res.status, json);
    return json;
  };
  return {
    get: (ruta) => pedir('GET', ruta),
    post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo ?? {}),
    patch: (ruta, cuerpo) => pedir('PATCH', ruta, cuerpo),
    put: (ruta, cuerpo) => pedir('PUT', ruta, cuerpo),
    del: (ruta) => pedir('DELETE', ruta),
  };
}

// Rostro simulado del modo de demostración: mismo algoritmo que frontend/src/biometria/simulado.ts.
function hash(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
function generador(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const descriptorSimulado = (clave) => {
  const azar = generador(hash(clave));
  return Array.from({ length: 128 }, () => (azar() - 0.5) * 0.4);
};
const FOTO_SIMULADA = /FOTO_SIMULADA =\s*'([^']+)'/.exec(
  readFileSync(resolve(RAIZ, 'frontend/src/biometria/simulado.ts'), 'utf8'),
)?.[1];

const avisos = [];

/** Deja a la persona de demostración lista para el recorrido y las notificaciones a la vista. */
async function preparar() {
  const { usuario, clave } = credenciales('admin');
  const admin = await ingresarApi(usuario, clave);

  const buscar = async (activo) =>
    (await admin.get(`/api/usuarios?texto=${DEMO.dni}&activo=${activo}`)).data.find(
      (u) => u.dni === DEMO.dni,
    );
  let demo = (await buscar('true')) ?? (await buscar('false'));
  if (!demo) {
    demo = (await admin.post('/api/usuarios', { ...DEMO, contrasena: claveAlAzar() })).data;
    console.info(`  · se creó ${DEMO.apellido}, ${DEMO.nombre} (personal de demostración)`);
  }
  if (!demo.activo) demo = (await admin.post(`/api/usuarios/${demo.id}/reactivar`)).data;
  if ((await admin.get(`/api/usuarios/${demo.id}`)).data.permisosAdicionales?.length) {
    await admin.put(`/api/usuarios/${demo.id}/permisos-adicionales`, { permisos: [] });
  }

  // Notificaciones: una validación facial fallida y una cuenta bloqueada, una sola vez.
  const { data: notificaciones } = await admin.get('/api/notificaciones');
  const tiene = (tipo) =>
    notificaciones.some((n) => n.tipo === tipo && n.mensaje.includes(DEMO.nombreUsuario));

  if (!tiene('VALIDACION_FACIAL_FALLIDA')) {
    const contrasena = claveAlAzar();
    await admin.patch(`/api/usuarios/${demo.id}`, { contrasena });
    await admin.put(`/api/biometria/usuarios/${demo.id}`, {
      patron: descriptorSimulado(DEMO.nombreUsuario),
      foto: FOTO_SIMULADA,
    });
    try {
      const ella = await ingresarApi(DEMO.nombreUsuario, contrasena);
      for (let i = 0; i < 3; i++) {
        await ella.post('/api/biometria/validar', {
          patron: descriptorSimulado(`otro-rostro-${Date.now()}-${i}`),
          operacion: OPERACION_FALLIDA,
        });
      }
      console.info('  · 3 validaciones faciales fallidas (para la notificación)');
    } catch (e) {
      avisos.push(`No se pudo generar la validación facial fallida: ${e.message}`);
    }
  }
  if (!tiene('CUENTA_BLOQUEADA')) {
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombreUsuario: DEMO.nombreUsuario, contrasena: claveAlAzar() }),
      });
      if (r.ok) throw new Error('Un ingreso con contraseña al azar no debería funcionar');
    }
    console.info('  · 3 ingresos fallidos (para la notificación de cuenta bloqueada)');
  }
  if (!notificaciones.some((n) => n.tipo === 'RECORDATORIO_VENCIDO')) {
    avisos.push(
      'Todavía no hay notificaciones de tomas vencidas (aparecen solas cuando un recordatorio pasa una hora sin atenderse).',
    );
  }

  // El recorrido registra el rostro desde cero.
  const { data: rostro } = await admin.get(`/api/biometria/usuarios/${demo.id}`);
  if (rostro.registrado) await admin.del(`/api/biometria/usuarios/${demo.id}`);
  return demo;
}

// ───────────────────────── Pantalla de ingreso ─────────────────────────

/** 00 · Ingresar: lo primero que se ve, sin sesión y con los campos vacíos. */
async function capturarIngreso(page, capturar) {
  await page.goto(`${UI}/ingresar`);
  const titulo = page.getByRole('heading', { level: 1, name: 'Ingresar' });
  await titulo.waitFor();
  await esperar(page);
  await capturar(page, '00-ingresar.png', 'Pantalla Ingresar, con los campos vacíos', {
    marcas: [
      {
        n: 1,
        loc: page.getByRole('textbox', { name: 'Usuario', exact: true }),
        que: 'Campo Usuario',
        lado: 'izq',
      },
      {
        n: 2,
        loc: page.getByLabel('Contraseña', { exact: true }),
        que: 'Campo Contraseña',
        lado: 'izq',
      },
      {
        n: 3,
        loc: page.getByRole('button', { name: 'Mostrar contraseña' }),
        que: 'Ojo: muestra u oculta la contraseña',
        lado: 'der',
      },
      {
        n: 4,
        loc: page.getByText('Recordar mi usuario en esta tablet').locator('..'),
        que: 'Recordar mi usuario en esta tablet',
        lado: 'izq',
      },
      {
        n: 5,
        loc: page.getByRole('button', { name: 'Ingresar', exact: true }),
        que: 'Botón Ingresar',
        lado: 'izq',
      },
    ],
    incluir: [page.locator('form')],
  });
}

// ───────────────────────── Principal ─────────────────────────

mkdirSync(SALIDA, { recursive: true });
console.info('Preparando los datos de demostración…');
await preparar();

const {
  capturar,
  capturas,
  avisos: avisosDeCapturas,
} = crearCapturador({
  salida: SALIDA,
  solo: SOLO,
  tapar: USUARIOS_DE_PRUEBA,
  color: COLOR,
});
const admin = credenciales('admin');
const navegador = await chromium.launch();
let fallo = null;
try {
  if (RECORRIDO !== 'telefono') {
    console.info('Tablet 768 × 1024:');
    // 00 · La pantalla Ingresar, sin sesión y con los campos vacíos.
    const ingreso = await nuevoContexto(navegador, { ui: UI, viewport: TABLET, sinSesion: true });
    try {
      await capturarIngreso(ingreso.page, capturar);
    } finally {
      await ingreso.contexto.close();
    }
    const { contexto, page } = await nuevoContexto(navegador, {
      ui: UI,
      viewport: TABLET,
      ...admin,
    });
    try {
      await recorridoGestion(page, capturar);
      await recorridoConsultas(page, capturar);
    } finally {
      await contexto.close();
    }
  }
  if (RECORRIDO !== 'tablet') {
    console.info('Teléfono 375 × 812:');
    const { contexto, page } = await nuevoContexto(navegador, {
      ui: UI,
      viewport: TELEFONO,
      telefono: true,
      ...admin,
    });
    try {
      await recorridoTelefono(page, capturar);
    } finally {
      await contexto.close();
    }
  }
} catch (e) {
  fallo = e;
} finally {
  await navegador.close();
}

console.info(`
${capturas.length} capturas en ${SALIDA}`);
// Qué muestra cada captura y qué señala cada número, para escribir el manual. Con --solo, solo
// se reemplazan (o se agregan) las entradas de esas capturas.
if (!fallo && !SOLO && !RECORRIDO) {
  await escribirReferencias(resolve(SALIDA, 'referencias.json'), capturas);
  console.info('  y referencias.json (qué muestra cada una y qué señala cada número)');
} else if (!fallo && SOLO) {
  const archivo = resolve(SALIDA, 'referencias.json');
  let anteriores = [];
  try {
    anteriores = JSON.parse(readFileSync(archivo, 'utf8'));
  } catch {
    // Sin referencias anteriores: quedan solo las de esta corrida.
  }
  const nuevas = capturas.filter((c) => SOLO.has(c.archivo.slice(0, 2)));
  const juntas = [
    ...anteriores.filter((c) => !nuevas.some((n) => n.archivo === c.archivo)),
    ...nuevas,
  ].sort((a, b) => a.archivo.localeCompare(b.archivo));
  await escribirReferencias(archivo, juntas);
  console.info(`  y referencias.json (${nuevas.length} entrada(s) reemplazada(s) o agregada(s))`);
}
for (const a of [...avisos, ...avisosDeCapturas]) console.warn(`  ! ${a}`);
if (fallo) {
  console.error(`
Falló: ${fallo.message}`);
  process.exitCode = 1;
}
