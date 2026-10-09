// Guía del médico: configuración, datos ficticios, utilidades y sesión por la API.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const WEB = process.env.SGSM_WEB ?? 'http://localhost:4173';
const API = process.env.SGSM_API ?? 'http://localhost:3000';
export const SALIDA = resolve(RAIZ, 'docs/manuales/img/medico');
export const ZONA = 'America/Argentina/Buenos_Aires';
export const MARCA = 'Demostración manual';
export const MINUTO = 60_000;
export const HORA = 60 * MINUTO;
export const DIA = 24 * HORA;

export const TABLET = { width: 768, height: 1024 };
export const TELEFONO = { width: 375, height: 812 };

/** Marcadores: magenta (no lo usa la interfaz, que es verde azulado, rojo y ocre) con borde blanco. */
export const COLOR = '#D0006F';
export const RADIO = 16;

const args = process.argv.slice(2);
const indiceSolo = args.indexOf('--solo');
export const SOLO =
  indiceSolo >= 0 ? args[indiceSolo + 1].split(',').map((s) => s.padStart(2, '0')) : null;
export const VER = args.includes('--ver');

// ───────────────────────── Datos ficticios ─────────────────────────

/** Paciente que se carga en el formulario de internación (no se guarda). */
export const NUEVO = {
  dni: '90926481',
  nombre: 'Leandro Ezequiel',
  apellido: 'Sosa',
  fechaNacimiento: '1978-08-30',
  sexo: 'Masculino',
  obraSocial: 'Obra social provincial',
  numeroAfiliado: '90-926481-00',
  diagnostico: 'Lesión medular incompleta, rehabilitación',
  contacto: 'Nora Ruiz (madre)',
  telefono: '0351 555-0129',
  cama: 'C-04',
};

/** Paciente ficticia ya egresada, para mostrar el aviso de reingreso. */
export const EGRESADA = {
  dni: '90815437',
  apellido: 'Quiroga',
  nombre: 'Elvira Dolores',
  fechaNacimiento: '1950-03-09',
  sexo: 'FEMENINO',
  obraSocial: 'Obra social provincial',
  numeroAfiliado: '90-815437-02',
  diagnostico: 'Accidente cerebrovascular isquémico, rehabilitación',
  contactoEmergenciaNombre: 'Raúl Quiroga (hijo)',
  contactoEmergenciaTelefono: '0351 555-0175',
  observaciones: `Paciente ficticia (${MARCA})`,
};

// ───────────────────────── Utilidades ─────────────────────────

const pad = (n) => String(n).padStart(2, '0');

/** "AAAA-MM-DDTHH:mm" en hora de Argentina (UTC-3, sin horario de verano) para un instante. */
export const campoDe = (ms) => new Date(ms - 3 * HORA).toISOString().slice(0, 16);

/** Campo de fecha y hora para un día relativo a hoy (0 = hoy, 1 = mañana) a una hora dada. */
export function campoDia(dias, hh, mm = 0) {
  const hoyAr = new Date(Date.now() - 3 * HORA).toISOString().slice(0, 10);
  const dia = new Date(Date.parse(`${hoyAr}T00:00:00Z`) + dias * DIA).toISOString().slice(0, 10);
  return `${dia}T${pad(hh)}:${pad(mm)}`;
}

/** Usuario de prueba del médico: variables de entorno o e2e/soporte.ts (nunca va al manual). */
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

export async function sesionApi(rol) {
  const { usuario, clave } = credenciales(rol);
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nombreUsuario: usuario, contrasena: clave }),
  });
  if (!r.ok) throw new Error(`No se pudo ingresar a la API como ${rol}: ${r.status}`);
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('sgsm_sesion='));
  const pedir = async (metodo, ruta, cuerpo) => {
    const res = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { cookie, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${metodo} ${ruta} → ${res.status} ${json?.error?.mensaje ?? ''}`);
    return json;
  };
  return {
    get: (ruta) => pedir('GET', ruta),
    post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo ?? {}),
  };
}
