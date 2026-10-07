// Ayudantes para pruebas de la API: usuarios por rol y agentes HTTP con sesión iniciada.
import request from 'supertest';
import type { Express } from 'express';
import { crearApp } from '../../src/app';
import { prisma } from '../../src/db';
import { cifrarContrasena } from '../../src/modulos/auth/contrasenas';
import { limiteLogin } from '../../src/modulos/auth/limite-ip';
import type { CodigoPermiso, CodigoRol } from '../../src/modulos/seguridad/catalogo-permisos';
import { sembrarSeguridad } from '../../src/semillas/catalogo-base';
import { limpiarBase } from './base';

export const CONTRASENA = 'Prueba2026';

let app: Express | undefined;
export const obtenerApp = () => (app ??= crearApp());

/** Base vacía con los roles y permisos cargados (y sin fallidos de login por IP en memoria). */
export async function prepararBaseConSeguridad() {
  limiteLogin.reiniciar();
  await limpiarBase();
  await sembrarSeguridad(prisma);
}

let n = 0;

export async function crearUsuario(
  rol: CodigoRol,
  opciones: {
    permisosAdicionales?: CodigoPermiso[];
    nombreUsuario?: string;
    activo?: boolean;
  } = {},
) {
  n++;
  const rolDb = await prisma.rol.findUniqueOrThrow({ where: { codigo: rol } });
  const usuario = await prisma.usuario.create({
    data: {
      nombreUsuario: opciones.nombreUsuario ?? `${rol.toLowerCase()}${n}`,
      contrasenaHash: await cifrarContrasena(CONTRASENA),
      dni: String(25000000 + n),
      nombre: 'Prueba',
      apellido: `${rol} ${n}`,
      rolId: rolDb.id,
      activo: opciones.activo ?? true,
    },
  });
  for (const codigo of opciones.permisosAdicionales ?? []) {
    const permiso = await prisma.permiso.findUniqueOrThrow({ where: { codigo } });
    await prisma.usuarioPermiso.create({ data: { usuarioId: usuario.id, permisoId: permiso.id } });
  }
  return usuario;
}

/** Devuelve un agente de supertest que conserva la cookie de sesión del usuario. */
export async function agenteDe(usuario: { nombreUsuario: string }) {
  const agente = request.agent(obtenerApp());
  const res = await agente
    .post('/api/auth/login')
    .send({ nombreUsuario: usuario.nombreUsuario, contrasena: CONTRASENA });
  if (res.status !== 200) {
    throw new Error(`No se pudo iniciar sesión: ${JSON.stringify(res.body)}`);
  }
  return agente;
}

export async function agenteConRol(rol: CodigoRol, permisosAdicionales: CodigoPermiso[] = []) {
  const usuario = await crearUsuario(rol, { permisosAdicionales });
  return { usuario, agente: await agenteDe(usuario) };
}
