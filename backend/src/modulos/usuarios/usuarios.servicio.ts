import type { Prisma } from '@prisma/client';
import { ErrorApi, conflicto, noEncontrado, reglaNegocio } from '../../comun/errores';
import { respuestaPaginada } from '../../comun/paginacion';
import { reloj } from '../../comun/reloj';
import { prisma, type ClienteDb } from '../../db';
import { cambios, registrarAuditoria } from '../auditoria/auditoria.servicio';
import { cifrarContrasena } from '../auth/contrasenas';
import { PERMISOS, type CodigoPermiso } from '../seguridad/catalogo-permisos';
import type { AltaUsuario, BusquedaUsuarios, ModificacionUsuario } from './usuarios.esquemas';

/**
 * Gestión de usuarios (T109 · CU01–CU05). Toda modificación queda en la auditoría dentro de la
 * misma transacción. No hay borrado físico: la baja es lógica (activo = false).
 */

const incluir = {
  rol: { include: { permisos: { include: { permiso: true } } } },
  permisosAdicionales: { include: { permiso: true } },
  datoBiometrico: { select: { id: true } },
} satisfies Prisma.UsuarioInclude;

type UsuarioCompleto = Prisma.UsuarioGetPayload<{ include: typeof incluir }>;

function aDto(u: UsuarioCompleto) {
  return {
    id: u.id,
    nombreUsuario: u.nombreUsuario,
    dni: u.dni,
    nombre: u.nombre,
    apellido: u.apellido,
    email: u.email,
    matricula: u.matricula,
    rol: { codigo: u.rol.codigo, nombre: u.rol.nombre },
    activo: u.activo,
    fechaBaja: u.fechaBaja,
    bloqueadoHasta: u.bloqueadoHasta,
    ultimoAcceso: u.ultimoAcceso,
    tieneBiometria: u.datoBiometrico !== null,
    permisosDelRol: u.rol.permisos.map((rp) => rp.permiso.codigo).sort(),
    permisosAdicionales: u.permisosAdicionales.map((up) => up.permiso.codigo).sort(),
  };
}

/** Valores que se comparan en la auditoría (el rol por su código, sin la contraseña). */
const paraAuditoria = (u: UsuarioCompleto) => ({
  nombreUsuario: u.nombreUsuario,
  dni: u.dni,
  nombre: u.nombre,
  apellido: u.apellido,
  email: u.email,
  matricula: u.matricula,
  rol: u.rol.codigo,
  activo: u.activo,
});

async function obtenerCompleto(db: ClienteDb, id: number) {
  const u = await db.usuario.findUnique({ where: { id }, include: incluir });
  if (!u) throw noEncontrado('El usuario no existe');
  return u;
}

async function verificarUnicos(
  db: ClienteDb,
  datos: { dni?: string | undefined; nombreUsuario?: string | undefined },
  excepto?: number,
) {
  const distinto = excepto ? { id: { not: excepto } } : {};
  if (datos.dni && (await db.usuario.findFirst({ where: { dni: datos.dni, ...distinto } }))) {
    throw conflicto('DNI_DUPLICADO', 'Ya existe un usuario con ese DNI');
  }
  if (
    datos.nombreUsuario &&
    (await db.usuario.findFirst({ where: { nombreUsuario: datos.nombreUsuario, ...distinto } }))
  ) {
    throw conflicto('USUARIO_DUPLICADO', 'Ese nombre de usuario ya está en uso');
  }
}

/**
 * D110: nadie amplía sus propios privilegios (rol, permisos adicionales, reactivación). Lo hace
 * otra persona con el permiso, y así queda en la auditoría a nombre de otro.
 */
const cambioPropio = (mensaje: string) => new ErrorApi(403, 'CAMBIO_PROPIO', mensaje);

/** D119: nadie otorga lo que no tiene, ni gestiona a quien tiene permisos que él no tiene. */
const privilegioAjeno = (mensaje: string) => new ErrorApi(403, 'PRIVILEGIO_AJENO', mensaje);

/** Número del candado de PostgreSQL (pg_advisory_xact_lock) de la gestión de usuarios (D120). */
const CANDADO_DE_USUARIOS = 10_901;

/**
 * D119 · D120: cada cambio de usuarios corre de a uno (son pocos y los hace un administrador) y
 * lee los permisos de quien lo hace dentro de la transacción, ya con el candado: dos cambios a la
 * vez no deciden sobre lo que el otro todavía no confirmó.
 */
async function enTurno(tx: Prisma.TransactionClient, actorId: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CANDADO_DE_USUARIOS}::bigint)`;
  const actor = await tx.usuario.findUnique({ where: { id: actorId }, include: incluir });
  // Si en el medio le dieron de baja, ya no gestiona nada.
  return new Set(actor?.activo ? permisosEfectivos(actor) : []);
}

const permisosEfectivos = (u: {
  rol: { permisos: { permiso: { codigo: string } }[] };
  permisosAdicionales?: { permiso: { codigo: string } }[];
}) => [
  ...u.rol.permisos.map((rp) => rp.permiso.codigo),
  ...(u.permisosAdicionales ?? []).map((up) => up.permiso.codigo),
];

const faltantes = (delActor: Set<string>, codigos: string[]) =>
  [...new Set(codigos)].filter((c) => !delActor.has(c));

/** D119: sobre quien tiene un permiso que el actor no tiene, el actor no cambia nada. */
function exigirQueNoTengaMas(delActor: Set<string>, u: UsuarioCompleto) {
  if (faltantes(delActor, permisosEfectivos(u)).length > 0) {
    throw privilegioAjeno(
      `${u.apellido}, ${u.nombre} tiene permisos que usted no tiene: lo gestiona un administrador`,
    );
  }
}

async function rolOtorgable(tx: Prisma.TransactionClient, delActor: Set<string>, codigo: string) {
  const rol = await tx.rol.findUniqueOrThrow({
    where: { codigo },
    include: { permisos: { include: { permiso: true } } },
  });
  if (faltantes(delActor, permisosEfectivos({ rol })).length > 0) {
    throw privilegioAjeno(
      `No puede dar el rol ${rol.nombre}: tiene permisos que usted no tiene. Lo hace un administrador.`,
    );
  }
  return rol.id;
}

/**
 * D120: siempre queda un Administrador activo. Se llama con el candado de usuarios tomado, así
 * dos cambios a la vez no dejan cero.
 */
async function exigirOtroAdministrador(tx: Prisma.TransactionClient, u: UsuarioCompleto) {
  if (u.rol.codigo !== 'ADMINISTRADOR' || !u.activo) return;
  const otros = await tx.usuario.count({
    where: { id: { not: u.id }, activo: true, rol: { codigo: 'ADMINISTRADOR' } },
  });
  if (otros === 0) {
    throw conflicto(
      'ULTIMO_ADMINISTRADOR',
      `${u.apellido}, ${u.nombre} es el único administrador activo: antes cree o reactive otro`,
    );
  }
}

export async function buscarUsuarios(filtros: BusquedaUsuarios) {
  const { pagina, porPagina, texto, rol, activo } = filtros;
  const where: Prisma.UsuarioWhereInput = {
    ...(rol ? { rol: { codigo: rol } } : {}),
    ...(activo ? { activo: activo === 'true' } : {}),
    ...(texto
      ? {
          OR: [
            { apellido: { contains: texto, mode: 'insensitive' } },
            { nombre: { contains: texto, mode: 'insensitive' } },
            { nombreUsuario: { contains: texto, mode: 'insensitive' } },
            { dni: { startsWith: texto } },
          ],
        }
      : {}),
  };
  const [filas, total] = await prisma.$transaction([
    prisma.usuario.findMany({
      where,
      include: incluir,
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.usuario.count({ where }),
  ]);
  return respuestaPaginada(filas.map(aDto), total, { pagina, porPagina });
}

export async function obtenerUsuario(id: number) {
  return aDto(await obtenerCompleto(prisma, id));
}

export async function crearUsuario(datos: AltaUsuario, actorId: number) {
  return prisma.$transaction(async (tx) => {
    const delActor = await enTurno(tx, actorId);
    const rolId = await rolOtorgable(tx, delActor, datos.rol);
    await verificarUnicos(tx, datos);
    const { rol: _rol, contrasena, ...resto } = datos;
    const creado = await tx.usuario.create({
      data: { ...resto, contrasenaHash: await cifrarContrasena(contrasena), rolId },
      include: incluir,
    });
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'CREAR',
      entidad: 'Usuario',
      entidadId: creado.id,
      nuevo: paraAuditoria(creado),
    });
    return aDto(creado);
  });
}

export async function modificarUsuario(id: number, datos: ModificacionUsuario, actorId: number) {
  return prisma.$transaction(async (tx) => {
    const delActor = await enTurno(tx, actorId);
    const antes = await obtenerCompleto(tx, id);
    const cambiaRol = datos.rol !== undefined && datos.rol !== antes.rol.codigo;
    if (id === actorId && cambiaRol) {
      throw cambioPropio('No puede cambiar su propio rol: pídaselo a otro administrador');
    }
    exigirQueNoTengaMas(delActor, antes);
    const rolId = datos.rol && cambiaRol ? await rolOtorgable(tx, delActor, datos.rol) : null;
    if (cambiaRol) await exigirOtroAdministrador(tx, antes);
    await verificarUnicos(tx, datos, id);
    const { rol: _rol, contrasena, ...resto } = datos;
    const despues = await tx.usuario.update({
      where: { id },
      data: {
        ...resto,
        ...(rolId ? { rolId } : {}),
        ...(contrasena ? { contrasenaHash: await cifrarContrasena(contrasena) } : {}),
      },
      include: incluir,
    });
    const { anterior, nuevo } = cambios(paraAuditoria(antes), paraAuditoria(despues));
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'MODIFICAR',
      entidad: 'Usuario',
      entidadId: id,
      anterior,
      nuevo,
      detalle: contrasena ? 'Se cambió la contraseña' : null,
    });
    return aDto(despues);
  });
}

export async function darDeBajaUsuario(id: number, actorId: number) {
  if (id === actorId) {
    throw reglaNegocio('BAJA_PROPIA', 'No puede darse de baja a sí mismo');
  }
  return prisma.$transaction(async (tx) => {
    const delActor = await enTurno(tx, actorId);
    const antes = await obtenerCompleto(tx, id);
    exigirQueNoTengaMas(delActor, antes);
    if (!antes.activo) throw conflicto('USUARIO_INACTIVO', 'El usuario ya está dado de baja');
    await exigirOtroAdministrador(tx, antes);
    const despues = await tx.usuario.update({
      where: { id },
      data: { activo: false, fechaBaja: reloj.ahora() },
      include: incluir,
    });
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'BAJA',
      entidad: 'Usuario',
      entidadId: id,
      anterior: { activo: true },
      nuevo: { activo: false, fechaBaja: despues.fechaBaja },
    });
    return aDto(despues);
  });
}

/** Deshace una baja: el usuario vuelve a poder ingresar. Queda en la auditoría. */
export async function reactivarUsuario(id: number, actorId: number) {
  if (id === actorId) throw cambioPropio('No puede reactivarse a sí mismo');
  return prisma.$transaction(async (tx) => {
    const delActor = await enTurno(tx, actorId);
    const antes = await obtenerCompleto(tx, id);
    exigirQueNoTengaMas(delActor, antes);
    if (antes.activo) throw conflicto('USUARIO_ACTIVO', 'El usuario ya está activo');
    const despues = await tx.usuario.update({
      where: { id },
      data: { activo: true, fechaBaja: null },
      include: incluir,
    });
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'REACTIVAR',
      entidad: 'Usuario',
      entidadId: id,
      anterior: { activo: false, fechaBaja: antes.fechaBaja },
      nuevo: { activo: true, fechaBaja: null },
    });
    return aDto(despues);
  });
}

/** Reemplaza los permisos adicionales del usuario (CU05). Ignora los que ya trae el rol. */
export async function asignarPermisosAdicionales(id: number, codigos: string[], actorId: number) {
  if (id === actorId) {
    throw cambioPropio('No puede cambiar sus propios permisos: pídaselo a otro administrador');
  }
  return prisma.$transaction(async (tx) => {
    const delActor = await enTurno(tx, actorId);
    const antes = await obtenerCompleto(tx, id);
    exigirQueNoTengaMas(delActor, antes);
    const ajenos = faltantes(delActor, codigos);
    if (ajenos.length > 0) {
      const cuales = ajenos.map((c) => PERMISOS[c as CodigoPermiso]?.descripcion ?? c);
      throw privilegioAjeno(`No puede asignar permisos que usted no tiene: ${cuales.join('; ')}`);
    }
    const delRol = new Set(antes.rol.permisos.map((rp) => rp.permiso.codigo));
    const extra = [...new Set(codigos)].filter((c) => !delRol.has(c)).sort();
    const permisos = await tx.permiso.findMany({ where: { codigo: { in: extra } } });

    await tx.usuarioPermiso.deleteMany({ where: { usuarioId: id } });
    await tx.usuarioPermiso.createMany({
      data: permisos.map((p) => ({ usuarioId: id, permisoId: p.id, otorgadoPorId: actorId })),
    });
    const anteriores = antes.permisosAdicionales.map((up) => up.permiso.codigo).sort();
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'MODIFICAR_PERMISOS',
      entidad: 'Usuario',
      entidadId: id,
      anterior: { permisosAdicionales: anteriores },
      nuevo: { permisosAdicionales: extra },
    });
    return aDto(await obtenerCompleto(tx, id));
  });
}
