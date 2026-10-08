import type { ClienteDb } from '../../db';
import { registrarAuditoria } from '../../modulos/auditoria/auditoria.servicio';
import { cifrarContrasena } from '../../modulos/auth/contrasenas';
import { contrasenaTemporal, type Credencial } from './credenciales';
import { ErrorInstalacion } from './errores';
import { clave, type FilaCatalogo, type FilaPersonal, type FilaSala } from './filas';

/**
 * Carga de los datos reales del hospital desde los CSV ya validados (T803 · D103), dentro de la
 * transacción del instalador. Solo agrega: lo que ya estaba (escrito igual) no se toca, y lo que
 * está escrito distinto que algo que ya existe es un error con la fila y el campo. Cada alta se
 * audita (CREAR) sin usuario actor y con el archivo y la fila en el detalle.
 */

export interface Conteo {
  nuevos: number;
  existentes: number;
}

const detalle = (archivo: string, fila: number) => `Instalador: ${archivo}, fila ${fila}`;

function fallarSiHay(errores: string[]) {
  if (errores.length > 0) throw new ErrorInstalacion(errores);
}

export async function cargarSalas(tx: ClienteDb, filas: FilaSala[], archivo: string) {
  const existentes = await tx.sala.findMany({ include: { camas: { select: { numero: true } } } });
  const porClave = new Map(existentes.map((s) => [clave(s.nombre), s]));
  fallarSiHay(
    filas.flatMap((f) => {
      const sala = porClave.get(clave(f.sala));
      if (sala && sala.nombre !== f.sala) {
        return [
          `${archivo}: Fila ${f.fila}, sala: "${f.sala}" está escrita distinto que la sala "${sala.nombre}" que ya existe: escríbala igual`,
        ];
      }
      const cama = sala?.camas.find((c) => clave(c.numero) === clave(f.cama));
      if (cama && cama.numero !== f.cama) {
        return [
          `${archivo}: Fila ${f.fila}, cama: "${f.cama}" está escrita distinto que la cama "${cama.numero}" que ya existe en "${sala!.nombre}": escríbala igual`,
        ];
      }
      return [];
    }),
  );

  const salas: Conteo = { nuevos: 0, existentes: 0 };
  const camas: Conteo = { nuevos: 0, existentes: 0 };
  const ids = new Map(existentes.map((s) => [s.nombre, s.id]));
  const vistas = new Set<string>();
  for (const f of filas) {
    let salaId = ids.get(f.sala);
    if (!vistas.has(f.sala) && salaId) salas.existentes++;
    vistas.add(f.sala);
    if (!salaId) {
      const sala = await tx.sala.create({ data: { nombre: f.sala } });
      await registrarAuditoria(tx, {
        accion: 'CREAR',
        entidad: 'Sala',
        entidadId: sala.id,
        nuevo: { nombre: sala.nombre },
        detalle: detalle(archivo, f.fila),
      });
      salaId = sala.id;
      ids.set(f.sala, salaId);
      salas.nuevos++;
    }
    if (porClave.get(clave(f.sala))?.camas.some((c) => c.numero === f.cama)) {
      camas.existentes++;
      continue;
    }
    const cama = await tx.cama.create({ data: { salaId, numero: f.cama } });
    await registrarAuditoria(tx, {
      accion: 'CREAR',
      entidad: 'Cama',
      entidadId: cama.id,
      nuevo: { salaId, cama: cama.numero },
      detalle: detalle(archivo, f.fila),
    });
    camas.nuevos++;
  }
  return { salas, camas };
}

const etiqueta = (i: { nombre: string; presentacion: string }) =>
  i.presentacion ? `${i.nombre} · ${i.presentacion}` : i.nombre;

export async function cargarCatalogo(
  tx: ClienteDb,
  filas: FilaCatalogo[],
  archivo: string,
): Promise<Conteo> {
  const existentes = await tx.insumo.findMany({ select: { nombre: true, presentacion: true } });
  const porClave = new Map(
    existentes.map((i) => [`${clave(i.nombre)}|${clave(i.presentacion)}`, i]),
  );
  const yaEstan = (f: FilaCatalogo) => porClave.get(`${clave(f.nombre)}|${clave(f.presentacion)}`);
  fallarSiHay(
    filas.flatMap((f) => {
      const i = yaEstan(f);
      return i && etiqueta(i) !== etiqueta(f)
        ? [
            `${archivo}: Fila ${f.fila}, nombre: "${etiqueta(f)}" está escrito distinto que "${etiqueta(i)}", que ya está en el catálogo: escríbalo igual`,
          ]
        : [];
    }),
  );

  const conteo: Conteo = { nuevos: 0, existentes: 0 };
  for (const f of filas) {
    if (yaEstan(f)) {
      conteo.existentes++;
      continue;
    }
    const { fila, ...datos } = f;
    const insumo = await tx.insumo.create({ data: datos });
    await registrarAuditoria(tx, {
      accion: 'CREAR',
      entidad: 'Insumo',
      entidadId: insumo.id,
      nuevo: {
        nombre: insumo.nombre,
        tipo: insumo.tipo,
        unidadMedida: insumo.unidadMedida,
        presentacion: insumo.presentacion,
        activo: insumo.activo,
      },
      detalle: detalle(archivo, fila),
    });
    conteo.nuevos++;
  }
  return conteo;
}

/**
 * Usuarios activos con una contraseña temporal al azar (D104). Alguien que ya existe con el mismo
 * usuario y DNI se deja como está (ni rol, ni contraseña); si solo coincide uno de los dos, es un
 * error: probablemente una fila equivocada.
 */
export async function cargarPersonal(
  tx: ClienteDb,
  filas: FilaPersonal[],
  archivo: string,
): Promise<{ usuarios: Conteo; credenciales: Credencial[] }> {
  const existentes = await tx.usuario.findMany({
    where: {
      OR: [
        { nombreUsuario: { in: filas.map((f) => f.nombreUsuario) } },
        { dni: { in: filas.map((f) => f.dni) } },
      ],
    },
    select: { nombreUsuario: true, dni: true },
  });
  const porUsuario = new Map(existentes.map((u) => [u.nombreUsuario, u]));
  const porDni = new Map(existentes.map((u) => [u.dni, u]));
  const nuevas: FilaPersonal[] = [];
  const errores: string[] = [];
  let yaEstaban = 0;
  for (const f of filas) {
    const mismoUsuario = porUsuario.get(f.nombreUsuario);
    const mismoDni = porDni.get(f.dni);
    if (mismoUsuario && mismoUsuario.dni === f.dni) yaEstaban++;
    else if (mismoUsuario) {
      errores.push(
        `${archivo}: Fila ${f.fila}, usuario: "${f.nombreUsuario}" ya existe con otro DNI`,
      );
    } else if (mismoDni) {
      errores.push(
        `${archivo}: Fila ${f.fila}, dni: el DNI ${f.dni} ya es del usuario "${mismoDni.nombreUsuario}"`,
      );
    } else nuevas.push(f);
  }
  fallarSiHay(errores);

  const roles = new Map((await tx.rol.findMany()).map((r) => [r.codigo, r.id]));
  const credenciales: Credencial[] = [];
  for (const { fila, rol, ...datos } of nuevas) {
    const contrasena = contrasenaTemporal();
    const usuario = await tx.usuario.create({
      data: {
        ...datos,
        contrasenaHash: await cifrarContrasena(contrasena),
        rolId: roles.get(rol)!,
      },
    });
    await registrarAuditoria(tx, {
      accion: 'CREAR',
      entidad: 'Usuario',
      entidadId: usuario.id,
      nuevo: {
        nombreUsuario: usuario.nombreUsuario,
        dni: usuario.dni,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        matricula: usuario.matricula,
        rol,
        activo: usuario.activo,
      },
      detalle: detalle(archivo, fila),
    });
    credenciales.push({
      nombreUsuario: usuario.nombreUsuario,
      apellido: usuario.apellido,
      nombre: usuario.nombre,
      rol,
      contrasena,
    });
  }
  return { usuarios: { nuevos: nuevas.length, existentes: yaEstaban }, credenciales };
}
