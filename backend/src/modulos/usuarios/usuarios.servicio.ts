import type { Prisma } from '@prisma/client';
import { conflicto, noEncontrado, reglaNegocio } from '../../comun/errores';
import { respuestaPaginada } from '../../comun/paginacion';
import { reloj } from '../../comun/reloj';
import { prisma, type ClienteDb } from '../../db';
import { cambios, registrarAuditoria } from '../auditoria/auditoria.servicio';
import { cifrarContrasena } from '../auth/contrasenas';
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

async function idDeRol(db: ClienteDb, codigo: string) {
  return (await db.rol.findUniqueOrThrow({ where: { codigo } })).id;
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
    await verificarUnicos(tx, datos);
    const { rol, contrasena, ...resto } = datos;
    const creado = await tx.usuario.create({
      data: {
        ...resto,
        contrasenaHash: await cifrarContrasena(contrasena),
        rolId: await idDeRol(tx, rol),
      },
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
    const antes = await obtenerCompleto(tx, id);
    await verificarUnicos(tx, datos, id);
    const { rol, contrasena, ...resto } = datos;
    const despues = await tx.usuario.update({
      where: { id },
      data: {
        ...resto,
        ...(rol ? { rolId: await idDeRol(tx, rol) } : {}),
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
    const antes = await obtenerCompleto(tx, id);
    if (!antes.activo) throw conflicto('USUARIO_INACTIVO', 'El usuario ya está dado de baja');
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

/** Reemplaza los permisos adicionales del usuario (CU05). Ignora los que ya trae el rol. */
export async function asignarPermisosAdicionales(id: number, codigos: string[], actorId: number) {
  return prisma.$transaction(async (tx) => {
    const antes = await obtenerCompleto(tx, id);
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
