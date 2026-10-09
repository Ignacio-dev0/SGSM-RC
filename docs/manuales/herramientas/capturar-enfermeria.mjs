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
//
// Piezas (ninguna pasa de 1000 líneas): enfermeria/comun.mjs (configuración, usuario de prueba,
// navegador y comunes de la interfaz), enfermeria/marcadores.mjs (marcar, tapar y guardar),
// enfermeria/ingreso.mjs (flujo 1), enfermeria/recordatorios.mjs (flujo 2),
// enfermeria/administrar.mjs (flujos 3 y 4) y enfermeria/paciente.mjs (flujos 5 y 6).

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flujoAdministrar, flujoInsumos } from './enfermeria/administrar.mjs';
import { SALIDA, avisos, nuevoContexto, referencias } from './enfermeria/comun.mjs';
import { flujoInactividad, flujoIngreso, flujoTelefono } from './enfermeria/ingreso.mjs';
import { flujoFichaExtra, flujoPaciente } from './enfermeria/paciente.mjs';
import { flujoRecordatorios, flujoSinConexion } from './enfermeria/recordatorios.mjs';

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
    ...previas.filter(
      (r) => !hechas.has(r.archivo) && existsSync(resolve(SALIDA, '..', '..', r.archivo)),
    ),
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
