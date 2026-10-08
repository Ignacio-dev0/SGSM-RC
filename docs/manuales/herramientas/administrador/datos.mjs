// Datos ficticios y usuarios de prueba de las capturas del Manual del administrador.

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const UI = process.env.SGSM_UI ?? 'http://localhost:4173';
export const API = process.env.SGSM_API ?? 'http://localhost:3000';
export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Persona del personal de demostración (se crea si falta). DNI con 9: no choca con nadie. */
export const DEMO = {
  nombre: 'Elena Beatriz',
  apellido: 'Quiroga',
  dni: '90815342',
  nombreUsuario: 'equiroga',
  email: 'equiroga@hospital-eldique.example',
  matricula: 'MP 90815',
  rol: 'ENFERMERO',
};

/** Lo que se escribe en el alta de ejemplo (NO se guarda). */
export const ALTA = {
  nombre: 'Nicolás Andrés',
  apellido: 'Paredes',
  dni: '90927136',
  matricula: 'MP 90927',
  email: 'nparedes@hospital-eldique.example',
  nombreUsuario: 'nparedes',
  rol: 'Médico',
};

/** Lo que se escribe en el alta de ejemplo del catálogo (NO se guarda). */
export const NUEVO_MEDICAMENTO = {
  nombre: 'Metoclopramida',
  unidad: 'mg',
  presentacion: 'Ampolla 10 mg',
};

/** Un medicamento del catálogo que no usan las prescripciones de demostración. */
export const MEDICAMENTO_A_EDITAR = 'Diclofenac';

/** La operación que la persona de demostración no pudo confirmar con su rostro. */
export const OPERACION_FALLIDA = 'Administrar Paracetamol 500 mg a Villafañe, Herminia';

/** Contraseña al azar: no se escribe en ningún lado. */
export const claveAlAzar = () => `Demo${randomBytes(9).toString('base64url')}9`;

/** Usuarios: variables de entorno o los usuarios de prueba de e2e/soporte.ts. */
export function credenciales(rol) {
  const ROL = rol.toUpperCase();
  let usuario = process.env[`E2E_USUARIO_${ROL}`];
  let clave = process.env[`E2E_CLAVE_${ROL}`];
  if (!usuario || !clave) {
    const soporte = readFileSync(resolve(RAIZ, 'e2e/soporte.ts'), 'utf8');
    usuario ??= new RegExp(`E2E_USUARIO_${ROL} \\?\\? '([^']+)'`).exec(soporte)?.[1];
    clave ??= new RegExp(`E2E_CLAVE_${ROL} \\?\\? '([^']+)'`).exec(soporte)?.[1];
  }
  if (!usuario || !clave) throw new Error(`No encuentro el usuario de prueba de ${rol}`);
  return { usuario, clave };
}

/** Nombres de usuario de las cuentas de prueba: no tienen que verse en las capturas. */
export const USUARIOS_DE_PRUEBA = ['admin', 'medico', 'enfermero'].map(
  (r) => credenciales(r).usuario,
);
