import { reloj } from '../../comun/reloj';
import { prisma } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { consumirValidacion } from '../biometria/validacion.servicio';
import { atenderPorEstudio } from '../recordatorios/atencion.servicio';
import { esperarCandadoDelCiclo } from '../recordatorios/ciclo.servicio';
import { avisarCambioRecordatorios } from '../tiempo-real/bus';
import type { ConfirmacionEstudio } from './estudios.esquemas';
import { aDtoEstudio, incluirEstudio, noProgramado, obtenerEstudioDb } from './estudios.servicio';

/**
 * Confirmación de un estudio con el rostro (T513 · S15): enfermería confirma que se realizó. El
 * comprobante facial tiene que ser de quien confirma, vigente y sin usar (como en suministros).
 * En la misma transacción el estudio pasa a REALIZADO y su recordatorio pendiente o vencido a
 * ATENDIDO; si atendió alguno, avisa al tiempo real después del commit.
 */
export async function confirmarEstudio(id: number, datos: ConfirmacionEstudio, usuarioId: number) {
  const { dto, atendidos } = await prisma.$transaction(async (tx) => {
    await esperarCandadoDelCiclo(tx);
    const antes = await obtenerEstudioDb(tx, id);
    // Un estudio programado es de un paciente internado: el egreso cancela los programados.
    if (antes.estado !== 'PROGRAMADO') throw noProgramado(antes.estado);
    // D33: las reglas de negocio antes que el comprobante, para no gastarlo en un rechazo.
    consumirValidacion(datos.validacionToken, usuarioId);

    const ahora = reloj.ahora();
    const despues = await tx.estudio.update({
      where: { id },
      data: {
        estado: 'REALIZADO',
        realizadoEn: ahora,
        confirmadoPorId: usuarioId,
        observacionesRealizacion: datos.observaciones,
      },
      include: incluirEstudio,
    });
    await registrarAuditoria(tx, {
      usuarioId,
      accion: 'CONFIRMAR',
      entidad: 'Estudio',
      entidadId: id,
      pacienteId: antes.pacienteId,
      anterior: { estado: 'PROGRAMADO' },
      nuevo: { estado: 'REALIZADO', realizadoEn: ahora, validadoBiometricamente: true },
      detalle: datos.observaciones,
    });
    const atendidos = await atenderPorEstudio(tx, { estudioId: id, fechaHora: ahora, usuarioId });
    return { dto: aDtoEstudio(despues), atendidos };
  });
  if (atendidos > 0) avisarCambioRecordatorios();
  return dto;
}
