import type { Prisma } from '@prisma/client';
import type { CodigoRol } from '../../modulos/seguridad/catalogo-permisos';
import { type Azar, pesosZipf } from './azar';
import { USUARIOS_MEDICION, VOLUMEN } from './base';
import {
  APELLIDOS,
  INSUMOS,
  MEDICAMENTOS,
  NOMBRES_FEMENINOS,
  NOMBRES_MASCULINOS,
  PRESENTACIONES_INSUMO,
  PRESENTACIONES_MEDICAMENTO,
  SALAS,
  TIPOS_ESTUDIO,
} from './nombres';

/**
 * Tablas chicas del volumen (T702): personal, salas y camas, catálogo y tipos de estudio. Los ids
 * son fijos (1..n) para que el SQL masivo los pueda elegir sin consultarlos.
 */

type Tx = Prisma.TransactionClient;

export interface Personal {
  administradores: number[];
  medicos: number[];
  enfermeros: number[];
}

export interface Medicamento {
  id: number;
  nombre: string;
  presentacion: string;
  unidad: string;
  dosis: number;
}

export interface Catalogo {
  medicamentos: Medicamento[];
  /** Ids de insumos no medicinales repetidos según su uso (para elegir con pesos en SQL). */
  insumosPonderados: number[];
  /** Pesos de Zipf de los medicamentos, en el orden de `medicamentos`. */
  pesosMedicamentos: number[];
}

const DIA = 86_400_000;

/** 60 personas: los tres usuarios de medición (ids 1 a 3) y el resto por rol. */
export async function crearPersonal(
  tx: Tx,
  azar: Azar,
  roles: Record<CodigoRol, number>,
  contrasenaHash: string,
  inicio: Date,
): Promise<Personal> {
  const personal: Personal = { administradores: [], medicos: [], enfermeros: [] };
  const filas: Prisma.UsuarioCreateManyInput[] = [];
  const agregar = (rol: CodigoRol, nombreUsuario?: string) => {
    const id = filas.length + 1;
    const femenino = azar.num() < 0.6;
    filas.push({
      id,
      nombreUsuario:
        nombreUsuario ?? `${rol.slice(0, 3).toLowerCase()}_${String(id).padStart(3, '0')}`,
      contrasenaHash,
      dni: String(27_000_000 + id * 7),
      nombre: azar.elegir(femenino ? NOMBRES_FEMENINOS : NOMBRES_MASCULINOS),
      apellido: azar.elegir(APELLIDOS),
      matricula:
        rol === 'MEDICO' ? `MP ${40_000 + id}` : rol === 'ENFERMERO' ? `ME ${10_000 + id}` : null,
      rolId: roles[rol],
      creadoEn: new Date(inicio.getTime() - 30 * DIA),
    });
    const lista = { ADMINISTRADOR: 'administradores', MEDICO: 'medicos', ENFERMERO: 'enfermeros' };
    personal[lista[rol] as keyof Personal].push(id);
  };
  agregar('ADMINISTRADOR', USUARIOS_MEDICION.admin);
  agregar('MEDICO', USUARIOS_MEDICION.medico);
  agregar('ENFERMERO', USUARIOS_MEDICION.enfermero);
  for (let i = 1; i < VOLUMEN.administradores; i++) agregar('ADMINISTRADOR');
  for (let i = 1; i < VOLUMEN.medicos; i++) agregar('MEDICO');
  for (let i = 1; i < VOLUMEN.enfermeros; i++) agregar('ENFERMERO');
  await tx.usuario.createMany({ data: filas });
  return personal;
}

/** 6 salas de 20 camas: la cama k de la sala s tiene id (s − 1) × 20 + k. */
export async function crearCamas(tx: Tx) {
  await tx.sala.createMany({
    data: SALAS.slice(0, VOLUMEN.salas).map((s, i) => ({
      id: i + 1,
      nombre: s.nombre,
      piso: s.piso,
    })),
  });
  const camas: Prisma.CamaCreateManyInput[] = [];
  SALAS.slice(0, VOLUMEN.salas).forEach((s, i) => {
    for (let k = 1; k <= VOLUMEN.camasPorSala; k++) {
      camas.push({
        id: i * VOLUMEN.camasPorSala + k,
        salaId: i + 1,
        numero: `${s.prefijo}-${String(k).padStart(2, '0')}`,
      });
    }
  });
  await tx.cama.createMany({ data: camas });
}

/**
 * 200 medicamentos (ids 1 a 200: 50 drogas × 4 presentaciones) y 100 insumos (ids 201 a 300).
 * Los primeros de cada grupo son los más usados.
 */
export async function crearCatalogo(tx: Tx): Promise<Catalogo> {
  const medicamentos: Medicamento[] = Array.from({ length: VOLUMEN.medicamentos }, (_, i) => {
    const [nombre, unidad, dosis] = MEDICAMENTOS[i % MEDICAMENTOS.length]!;
    const presentacion =
      PRESENTACIONES_MEDICAMENTO[Math.floor(i / MEDICAMENTOS.length)] ?? `Presentación ${i}`;
    return { id: i + 1, nombre, presentacion, unidad, dosis };
  });
  const insumos = Array.from({ length: VOLUMEN.insumos }, (_, i) => {
    const [nombre, unidad] = INSUMOS[i % INSUMOS.length]!;
    const presentacion =
      PRESENTACIONES_INSUMO[Math.floor(i / INSUMOS.length)] ?? `Presentación ${i}`;
    return { id: VOLUMEN.medicamentos + i + 1, nombre, presentacion, unidad };
  });
  await tx.insumo.createMany({
    data: [
      ...medicamentos.map((m) => ({
        id: m.id,
        nombre: m.nombre,
        presentacion: m.presentacion,
        unidadMedida: m.unidad,
        tipo: 'MEDICAMENTO' as const,
      })),
      ...insumos.map((i) => ({
        id: i.id,
        nombre: i.nombre,
        presentacion: i.presentacion,
        unidadMedida: i.unidad,
        tipo: 'INSUMO' as const,
      })),
    ],
  });
  await tx.tipoEstudio.createMany({
    data: TIPOS_ESTUDIO.map(([nombre, preparacionPorDefecto], i) => ({
      id: i + 1,
      nombre,
      preparacionPorDefecto,
    })),
  });

  // 1000 casilleros repartidos según el uso de cada insumo (pañales y guantes, los primeros).
  const pesos = pesosZipf(insumos.length, 1);
  const total = pesos.reduce((s, p) => s + p, 0);
  const insumosPonderados = insumos.flatMap((ins, i) =>
    Array.from({ length: Math.max(1, Math.round((1000 * pesos[i]!) / total)) }, () => ins.id),
  );
  return { medicamentos, insumosPonderados, pesosMedicamentos: pesosZipf(medicamentos.length) };
}
