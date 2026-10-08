// Mide las operaciones comunes contra la base *_volumen (T702 · RNF03 · docs/rendimiento.md):
// levanta la API (sin temporizador) en un puerto libre, inicia sesión con un usuario de cada rol
// y toma p50, p95 y máximo de 20 vueltas (más una de calentamiento que no cuenta). Imprime la
// tabla y la guarda en docs/rendimiento.md, en el bloque de la etiqueta.
// Uso: npm run volumen:medir -w backend -- --etiqueta=antes (VOLUMEN_PUERTO, VOLUMEN_VUELTAS).
// Modifica la base de volumen (sesiones, administraciones, ciclos): para comparar, volver a sembrar.
import { BASE_VOLUMEN } from './volumen/entorno';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '../db';
import { cifrarDatoBiometrico } from '../modulos/biometria/cifrado-biometrico';
import { levantarServidor } from '../servidor';
import { CONTRASENA_VOLUMEN, USUARIOS_MEDICION } from './volumen/base';
import { SesionHttp } from './volumen/cliente';
import {
  compararMediciones,
  cumple,
  reemplazarBloque,
  resumir,
  tablaMarkdown,
  type Resultado,
} from './volumen/medicion';
import { ROSTRO, operaciones, prepararEscenario, type Sesiones } from './volumen/operaciones';

const PUERTO = Number(process.env.VOLUMEN_PUERTO ?? 3100);
const VUELTAS = Number(process.env.VOLUMEN_VUELTAS ?? 20);
const ETIQUETA =
  process.argv.find((a) => a.startsWith('--etiqueta='))?.slice('--etiqueta='.length) || 'ultima';
const DOCUMENTO = path.resolve(__dirname, '../../../docs/rendimiento.md');

/** Rostro del enfermero de medición, como en las pruebas: sin él no se puede administrar. */
async function registrarRostroDeMedicion() {
  const [admin, enfermero] = await Promise.all(
    [USUARIOS_MEDICION.admin, USUARIOS_MEDICION.enfermero].map((nombreUsuario) =>
      prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario } }),
    ),
  );
  const datos = cifrarDatoBiometrico(enfermero!.id, ROSTRO, Buffer.from('foto'));
  await prisma.datoBiometrico.upsert({
    where: { usuarioId: enfermero!.id },
    create: {
      usuarioId: enfermero!.id,
      ...datos,
      fotoTipo: 'image/jpeg',
      registradoPorId: admin!.id,
    },
    update: datos,
  });
  await prisma.usuario.update({
    where: { id: enfermero!.id },
    data: { intentosBiometricosFallidos: 0 },
  });
}

const procesador = () =>
  `${(os.cpus()[0]?.model ?? 'CPU').replace(/\s+/g, ' ').trim()} × ${os.cpus().length}`;

/** Qué se midió y sobre qué: va arriba de la tabla. */
async function encabezado(ultimoSuministro: Date) {
  const [{ version } = { version: '?' }] = await prisma.$queryRaw<{ version: string }[]>`
    SELECT current_setting('server_version') AS version`;
  const [c] = await prisma.$queryRaw<
    { suministros: bigint; auditoria: bigint; recordatorios: bigint; pendientes: bigint }[]
  >`
    SELECT (SELECT count(*) FROM suministros) AS suministros,
           (SELECT count(*) FROM auditoria) AS auditoria,
           (SELECT count(*) FROM recordatorios) AS recordatorios,
           (SELECT count(*) FROM recordatorios WHERE estado = 'PENDIENTE') AS pendientes`;
  const n = (v: bigint | undefined) => Number(v ?? 0).toLocaleString('es-AR');
  return [
    `Medido el ${new Date().toISOString()} sobre \`${BASE_VOLUMEN}\` (último suministro del volumen: ${ultimoSuministro.toISOString()}).`,
    `${VUELTAS} vueltas por operación más una de calentamiento; API y cliente en el mismo proceso ` +
      `(Node ${process.version}, ${procesador()}), PostgreSQL ${version} en Docker.`,
    `Volumen: ${n(c?.suministros)} suministros, ${n(c?.auditoria)} entradas de auditoría, ` +
      `${n(c?.recordatorios)} recordatorios (${n(c?.pendientes)} pendientes al empezar).`,
  ].join('\n');
}

/** Guarda el bloque de la etiqueta y, si ya están las dos mediciones, la comparación. */
function guardar(contenido: string) {
  const actual = existsSync(DOCUMENTO) ? readFileSync(DOCUMENTO, 'utf8') : '# Rendimiento\n';
  let documento = reemplazarBloque(actual, ETIQUETA, contenido);
  const comparacion = compararMediciones(documento);
  if (comparacion) documento = reemplazarBloque(documento, 'comparacion', comparacion);
  writeFileSync(DOCUMENTO, documento);
  // Mismo formato que el resto de la documentación (npm run format:check), con el prettier del
  // repositorio como programa aparte: importarlo rompería la compilación de la imagen de Docker,
  // que no lo instala.
  try {
    const prettier = require.resolve('prettier/bin/prettier.cjs');
    execFileSync(process.execPath, [prettier, '--write', DOCUMENTO], { stdio: 'ignore' });
  } catch {
    console.warn('No se pudo dar formato a docs/rendimiento.md: correr npm run format');
  }
}

async function main() {
  const ultimo = await prisma.suministro.findFirst({ orderBy: { fechaHora: 'desc' } });
  if (!ultimo)
    throw new Error(`${BASE_VOLUMEN} está vacía: corra npm run volumen:sembrar -w backend`);
  if (Date.now() - ultimo.fechaHora.getTime() > 2 * 3_600_000) {
    console.warn(
      'El volumen tiene más de 2 h: el primer ciclo vence todo lo pendiente. Conviene volver a sembrar.',
    );
  }
  const cabecera = await encabezado(ultimo.fechaHora);
  await registrarRostroDeMedicion();
  const escenario = await prepararEscenario(VUELTAS);

  const servidor = await levantarServidor({ puerto: PUERTO, temporizador: false });
  try {
    const base = `http://localhost:${servidor.puerto}`;
    const sesiones: Sesiones = {
      admin: new SesionHttp(base),
      medico: new SesionHttp(base),
      enfermero: new SesionHttp(base),
    };
    for (const rol of ['admin', 'medico', 'enfermero'] as const) {
      await sesiones[rol].iniciar(USUARIOS_MEDICION[rol], CONTRASENA_VOLUMEN);
    }

    const resultados: Resultado[] = [];
    for (const op of operaciones(sesiones, escenario)) {
      const tiempos: number[] = [];
      for (let i = 0; i <= VUELTAS; i++) {
        const t = await op.medir(i);
        if (i > 0) tiempos.push(t);
      }
      const r = { grupo: op.grupo, operacion: op.operacion, limiteMs: op.limiteMs, tiempos };
      resultados.push(r);
      const { p50, p95, max } = resumir(tiempos);
      console.info(
        `${cumple(r) ? '   ' : ' ✗ '}${op.operacion}: p50 ${Math.round(p50)} · p95 ${Math.round(p95)} · máx ${Math.round(max)} ms`,
      );
    }

    const tabla = tablaMarkdown(resultados);
    console.info(`\n${tabla}\n`);
    guardar(`${cabecera}\n\n${tabla}`);
    const exceden = resultados.filter((r) => !cumple(r)).length;
    console.info(
      `Guardado en docs/rendimiento.md (bloque "${ETIQUETA}"). Exceden su límite: ${exceden}.`,
    );
  } finally {
    await servidor.cerrar();
  }
}

main()
  .catch((e: unknown) => {
    console.error('No se pudo medir el rendimiento', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
