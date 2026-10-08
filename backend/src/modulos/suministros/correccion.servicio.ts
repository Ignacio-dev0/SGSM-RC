import { noEncontrado, reglaNegocio } from '../../comun/errores';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';
import { prisma } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { consumirValidacion } from '../biometria/validacion.servicio';
import type { Correccion } from './suministros.esquemas';
import {
  aDtoSuministro,
  detallesParaAuditoria,
  incluirSuministro,
  limiteCorreccion,
  verificarInsumos,
} from './suministros.servicio';

/**
 * Corrección de un suministro (T412 · CU23): dentro de las 24 horas de registrado, con motivo
 * obligatorio y validación facial de quien corrige. Se conserva el registro original (quién y
 * cuándo) y el cambio queda en la auditoría con los valores anterior y nuevo.
 */
export async function corregirSuministro(id: number, datos: Correccion, usuarioId: number) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.suministro.findUnique({ where: { id }, include: incluirSuministro });
    if (!antes) throw noEncontrado('El suministro no existe');

    // D152: pasado el plazo no lo corrige nadie, tampoco el administrador: no se manda a pedirlo.
    if (reloj.ahora() > limiteCorreccion(antes)) {
      const horas = config.suministros.plazoCorreccionHoras;
      throw reglaNegocio(
        'FUERA_DE_PLAZO',
        `Pasaron más de ${horas} ${horas === 1 ? 'hora' : 'horas'}: ya no se puede corregir. Avise a su supervisora para dejar constancia.`,
      );
    }
    if (antes.tipo === 'MEDICAMENTO' && datos.items) {
      throw reglaNegocio(
        'CORRECCION_INVALIDA',
        'En una administración de medicamento solo se corrige la cantidad',
      );
    }
    if (antes.tipo === 'INSUMOS' && datos.cantidad !== undefined) {
      throw reglaNegocio('CORRECCION_INVALIDA', 'En un movimiento de insumos se corrige la lista');
    }
    if (datos.items) await verificarInsumos(tx, datos.items);

    const cambiaCantidad =
      datos.cantidad !== undefined && datos.cantidad !== antes.detalles[0]?.cantidad;
    const cambiaObservaciones =
      datos.observaciones !== undefined && datos.observaciones !== antes.observaciones;
    if (!cambiaCantidad && !datos.items && !cambiaObservaciones) {
      throw reglaNegocio('SIN_CAMBIOS', 'No hay nada que corregir');
    }
    consumirValidacion(datos.validacionToken, usuarioId);

    if (cambiaCantidad) {
      await tx.detalleSuministro.update({
        where: { id: antes.detalles[0]!.id },
        data: { cantidad: datos.cantidad! },
      });
    }
    if (datos.items) {
      await tx.detalleSuministro.deleteMany({ where: { suministroId: id } });
      await tx.detalleSuministro.createMany({
        data: datos.items.map((i) => ({
          suministroId: id,
          insumoId: i.insumoId,
          cantidad: i.cantidad,
        })),
      });
    }
    const despues = await tx.suministro.update({
      where: { id },
      data: {
        ...(cambiaObservaciones ? { observaciones: datos.observaciones } : {}),
        motivoCorreccion: datos.motivo,
        corregidoEn: reloj.ahora(),
        corregidoPorId: usuarioId,
      },
      include: incluirSuministro,
    });
    await registrarAuditoria(tx, {
      usuarioId,
      accion: 'CORREGIR',
      entidad: 'Suministro',
      entidadId: id,
      pacienteId: antes.pacienteId,
      anterior: { detalles: detallesParaAuditoria(antes), observaciones: antes.observaciones },
      nuevo: { detalles: detallesParaAuditoria(despues), observaciones: despues.observaciones },
      detalle: datos.motivo,
    });
    return aDtoSuministro(despues);
  });
}
