// Genera el volumen de un año de un hospital de rehabilitación de tamaño medio en la base
// *_volumen, para las pruebas de rendimiento (T702 · RNF03 · docs/rendimiento.md). VACÍA esa base
// antes de cargar. Uso: npm run volumen:sembrar -w backend (VOLUMEN_AHORA=2026-10-07T12:00:00Z
// para fijar el "ahora" y reproducir exactamente los mismos datos).
import { BASE_VOLUMEN } from './volumen/entorno';
import type { CodigoRol } from '../modulos/seguridad/catalogo-permisos';
import { prisma } from '../db';
import { cifrarContrasena } from '../modulos/auth/contrasenas';
import { sembrarSeguridad } from '../semillas/catalogo-base';
import { crearAuditoria } from './volumen/auditoria';
import { Azar } from './volumen/azar';
import { CONTRASENA_VOLUMEN, SEMILLA } from './volumen/base';
import { crearCamas, crearCatalogo, crearPersonal } from './volumen/catalogo';
import { apagarClavesForaneas, verificarClavesForaneas } from './volumen/integridad';
import { crearMasivo, ejecutar } from './volumen/masivo';
import {
  crearEstudios,
  crearPacientes,
  crearPrescripciones,
  planificarEstadias,
} from './volumen/pacientes';

const DIA = 86_400_000;

/** El "ahora" del volumen: VOLUMEN_AHORA o el minuto actual. */
function ahoraDelVolumen(): Date {
  const fijo = process.env.VOLUMEN_AHORA;
  const ms = fijo ? Date.parse(fijo) : Date.now();
  if (Number.isNaN(ms)) throw new Error('VOLUMEN_AHORA no es una fecha ISO 8601 válida');
  return new Date(Math.floor(ms / 60_000) * 60_000);
}

/** Vacía todas las tablas (menos la de migraciones), como `limpiarBase` de las pruebas. */
async function vaciar() {
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const lista = tablas.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`);
}

/** Después de cargar con ids fijos, las secuencias siguen desde el último. */
async function ajustarSecuencias() {
  const tablas = await prisma.$queryRaw<{ tabla: string }[]>`
    SELECT table_name AS tabla FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'id' AND column_default LIKE 'nextval%'`;
  for (const { tabla } of tablas) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${tabla}"', 'id'),
                     COALESCE((SELECT max(id) FROM "${tabla}"), 0) + 1, false)`,
    );
  }
}

async function main() {
  const t0 = performance.now();
  const ahora = ahoraDelVolumen();
  const inicio = new Date(ahora.getTime() - 365 * DIA);
  const azar = new Azar(SEMILLA);
  console.info(`Volumen en ${BASE_VOLUMEN}: un año hasta ${ahora.toISOString()}`);

  await vaciar();
  await sembrarSeguridad(prisma);
  const roles = Object.fromEntries(
    (await prisma.rol.findMany()).map((r) => [r.codigo, r.id]),
  ) as Record<CodigoRol, number>;
  // Una sola vez (bcrypt es lento): todos los usuarios del volumen tienen la misma contraseña.
  const hash = await cifrarContrasena(CONTRASENA_VOLUMEN);

  await prisma.$transaction(
    async (tx) => {
      const sinClaves = await apagarClavesForaneas(tx);
      const personal = await crearPersonal(tx, azar, roles, hash, inicio);
      await crearCamas(tx);
      const catalogo = await crearCatalogo(tx);
      const estadias = planificarEstadias(azar, inicio, ahora);
      await crearPacientes(tx, azar, estadias, personal);
      await crearPrescripciones(tx, azar, estadias, personal, catalogo, ahora);
      await crearEstudios(tx, azar, estadias, personal, ahora);
      console.info(`  Tablas chicas: ${Math.round(performance.now() - t0)} ms`);
      await crearMasivo(tx, ahora, personal, catalogo);
      await crearAuditoria(tx, inicio, ahora, personal);
      if (sinClaves) await verificarClavesForaneas(tx);
    },
    { timeout: 15 * 60_000, maxWait: 60_000 },
  );
  await ajustarSecuencias();
  // Estadísticas y mapa de visibilidad al día, como los deja el autovacuum en una base en uso.
  await ejecutar(prisma, 'VACUUM ANALYZE', 'VACUUM ANALYZE');
  // Lo cargado queda escrito en disco ya: si no, el punto de control siguiente lo escribe
  // durante la medición y compite con ella (hace falta superusuario; si no, se sigue igual).
  await ejecutar(prisma, 'CHECKPOINT', 'CHECKPOINT').catch(() => 0);

  const conteos = await prisma.$queryRaw<{ tabla: string; filas: bigint }[]>`
    SELECT 'pacientes' AS tabla, count(*) AS filas FROM pacientes
    UNION ALL SELECT 'internados', count(*) FROM pacientes WHERE estado = 'INTERNADO'
    UNION ALL SELECT 'prescripciones', count(*) FROM prescripciones
    UNION ALL SELECT 'suministros', count(*) FROM suministros
    UNION ALL SELECT 'detalles_suministro', count(*) FROM detalles_suministro
    UNION ALL SELECT 'recordatorios', count(*) FROM recordatorios
    UNION ALL SELECT 'recordatorios pendientes', count(*) FROM recordatorios WHERE estado = 'PENDIENTE'
    UNION ALL SELECT 'estudios', count(*) FROM estudios
    UNION ALL SELECT 'auditoria', count(*) FROM auditoria
    UNION ALL SELECT 'notificaciones', count(*) FROM notificaciones`;
  for (const c of conteos) console.info(`  ${c.tabla}: ${Number(c.filas).toLocaleString('es-AR')}`);
  console.info(`Volumen listo en ${Math.round((performance.now() - t0) / 1000)} s`);
}

main()
  .catch((e: unknown) => {
    console.error('No se pudo generar el volumen', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
