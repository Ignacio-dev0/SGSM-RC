import type { PrismaClient, TipoInsumo } from '@prisma/client';
import {
  CODIGOS_PERMISO,
  PERMISOS,
  ROLES,
  type CodigoRol,
} from '../modulos/seguridad/catalogo-permisos';

/**
 * Datos base que necesita cualquier instalación (T103): roles, permisos, salas y camas,
 * catálogo de insumos y medicamentos y tipos de estudio. Idempotente: se puede ejecutar
 * varias veces sin duplicar nada.
 */

/** Roles y permisos. Es lo único que necesitan la mayoría de las pruebas. */
export async function sembrarSeguridad(prisma: PrismaClient) {
  for (const codigo of CODIGOS_PERMISO) {
    const { modulo, descripcion } = PERMISOS[codigo];
    await prisma.permiso.upsert({
      where: { codigo },
      update: { modulo, descripcion },
      create: { codigo, modulo, descripcion },
    });
  }
  const permisos = await prisma.permiso.findMany();
  const idPermiso = new Map(permisos.map((p) => [p.codigo, p.id]));

  for (const [codigo, rol] of Object.entries(ROLES) as [CodigoRol, (typeof ROLES)[CodigoRol]][]) {
    const creado = await prisma.rol.upsert({
      where: { codigo },
      update: { nombre: rol.nombre, descripcion: rol.descripcion },
      create: { codigo, nombre: rol.nombre, descripcion: rol.descripcion },
    });
    await prisma.rolPermiso.deleteMany({ where: { rolId: creado.id } });
    await prisma.rolPermiso.createMany({
      data: rol.permisos.map((p) => ({ rolId: creado.id, permisoId: idPermiso.get(p)! })),
    });
  }
}

export const SALAS = [
  { nombre: 'Sala A – Neurorrehabilitación', piso: 'PB', prefijo: 'A', camas: 8 },
  { nombre: 'Sala B – Traumatología', piso: 'PB', prefijo: 'B', camas: 8 },
  { nombre: 'Sala C – Cuidados intermedios', piso: '1', prefijo: 'C', camas: 6 },
];

type InsumoSemilla = {
  nombre: string;
  tipo: TipoInsumo;
  unidadMedida: string;
  presentacion: string;
};

const med = (nombre: string, unidadMedida: string, presentacion: string): InsumoSemilla => ({
  nombre,
  tipo: 'MEDICAMENTO',
  unidadMedida,
  presentacion,
});
const ins = (nombre: string, unidadMedida: string, presentacion: string): InsumoSemilla => ({
  nombre,
  tipo: 'INSUMO',
  unidadMedida,
  presentacion,
});

export const INSUMOS: InsumoSemilla[] = [
  med('Paracetamol', 'mg', 'Comprimidos 500 mg'),
  med('Ibuprofeno', 'mg', 'Comprimidos 400 mg'),
  med('Enalapril', 'mg', 'Comprimidos 10 mg'),
  med('Omeprazol', 'mg', 'Cápsulas 20 mg'),
  med('Metformina', 'mg', 'Comprimidos 850 mg'),
  med('Baclofeno', 'mg', 'Comprimidos 10 mg'),
  med('Clonazepam', 'mg', 'Comprimidos 0,5 mg'),
  med('Enoxaparina', 'mg', 'Jeringa prellenada 40 mg'),
  med('Insulina NPH', 'UI', 'Frasco ampolla 100 UI/ml'),
  med('Ceftriaxona', 'g', 'Frasco ampolla 1 g'),
  med('Ketorolac', 'mg', 'Ampolla 30 mg'),
  med('Diclofenac', 'mg', 'Ampolla 75 mg'),
  med('Solución fisiológica', 'ml', 'Sachet 500 ml'),
  ins('Pañal para adultos talle M', 'unidad', 'Paquete x 10'),
  ins('Pañal para adultos talle G', 'unidad', 'Paquete x 10'),
  ins('Gasa estéril 10 x 10 cm', 'unidad', 'Sobre x 1'),
  ins('Apósito adhesivo', 'unidad', 'Caja x 50'),
  ins('Filtro antibacteriano HME', 'unidad', 'Unidad'),
  ins('Guantes de examen', 'par', 'Caja x 50 pares'),
  ins('Jeringa 5 ml', 'unidad', 'Unidad'),
  ins('Sonda vesical', 'unidad', 'Unidad'),
  ins('Bolsa colectora de orina', 'unidad', 'Unidad'),
  ins('Cánula nasal de oxígeno', 'unidad', 'Unidad'),
];

export const TIPOS_ESTUDIO = [
  { nombre: 'Análisis de laboratorio', preparacionPorDefecto: 'Ayuno de 8 horas' },
  { nombre: 'Radiografía', preparacionPorDefecto: null },
  { nombre: 'Ecografía abdominal', preparacionPorDefecto: 'Ayuno de 6 horas' },
  { nombre: 'Electrocardiograma', preparacionPorDefecto: null },
  { nombre: 'Tomografía computada', preparacionPorDefecto: 'Consultar si requiere contraste' },
  { nombre: 'Resonancia magnética', preparacionPorDefecto: 'Retirar objetos metálicos' },
  { nombre: 'Videodeglución', preparacionPorDefecto: 'Ayuno de 4 horas' },
  { nombre: 'Interconsulta', preparacionPorDefecto: null },
];

export async function sembrarCatalogoBase(prisma: PrismaClient) {
  await sembrarSeguridad(prisma);

  for (const s of SALAS) {
    const sala = await prisma.sala.upsert({
      where: { nombre: s.nombre },
      update: { piso: s.piso },
      create: { nombre: s.nombre, piso: s.piso },
    });
    for (let i = 1; i <= s.camas; i++) {
      const numero = `${s.prefijo}-${String(i).padStart(2, '0')}`;
      await prisma.cama.upsert({
        where: { salaId_numero: { salaId: sala.id, numero } },
        update: {},
        create: { salaId: sala.id, numero },
      });
    }
  }

  for (const i of INSUMOS) {
    await prisma.insumo.upsert({
      where: { nombre_presentacion: { nombre: i.nombre, presentacion: i.presentacion } },
      update: { tipo: i.tipo, unidadMedida: i.unidadMedida },
      create: i,
    });
  }

  for (const t of TIPOS_ESTUDIO) {
    await prisma.tipoEstudio.upsert({
      where: { nombre: t.nombre },
      update: { preparacionPorDefecto: t.preparacionPorDefecto },
      create: t,
    });
  }
}
