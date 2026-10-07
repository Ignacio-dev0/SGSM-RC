import { useState } from 'react';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mensajeDeError } from '../../api/cliente';
import { pacientesApi } from '../../api/pacientes';
import { suministrosApi } from '../../api/suministros';
import type { HistorialPaciente as Historial, Suministro } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { Alerta } from '../../componentes/Alerta';
import { CampoTexto } from '../../componentes/CampoTexto';
import { ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { Tabla } from '../../componentes/Tabla';
import {
  formatearFechaHora,
  formatearFechaHoraCorta,
  rangoDeFechas,
} from '../../utilidades/formato';
import { Recargando } from '../../utilidades/listado';
import { oracionDe, pasosParaProbar } from '../../utilidades/sinResultados';
import { DialogoSuministro } from '../suministros/DialogoSuministro';
import { detalleDe } from '../suministros/formato';
import { CAMPOS, MOTIVO_ASIGNACION, etiquetaAccion, formatearCama } from './etiquetas';

type Modificacion = Historial['modificaciones'][number];

const mostrarValor = (v: unknown) =>
  v === null || v === undefined || v === ''
    ? '(vacío)'
    : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)
      ? formatearFechaHora(v)
      : String(v);

/** "Obra social: IOMA → PAMI" por cada campo que cambió. */
function cambiosDe(m: Modificacion) {
  const campos = new Set([
    ...Object.keys(m.valorAnterior ?? {}),
    ...Object.keys(m.valorNuevo ?? {}),
  ]);
  if (campos.size === 0) return m.detalle ?? '';
  return [...campos]
    .map((c) => {
      const antes =
        m.valorAnterior && c in m.valorAnterior ? mostrarValor(m.valorAnterior[c]) : null;
      const despues = m.valorNuevo && c in m.valorNuevo ? mostrarValor(m.valorNuevo[c]) : null;
      const nombre = CAMPOS[c] ?? c;
      if (antes !== null && despues !== null) return `${nombre}: ${antes} → ${despues}`;
      return `${nombre}: ${despues ?? antes}`;
    })
    .join(' · ');
}

/** Qué se espera ver en cada pestaña cuando todavía no hay nada, y cuándo va a aparecer. */
const SIN_REGISTROS = {
  camas:
    'Todavía no hay asignaciones de cama. Aparecerán aquí cuando se interne o se traslade al paciente.',
  modificaciones:
    'Todavía no hay modificaciones. Aparecerán aquí cuando se edite la ficha o se registre un movimiento del paciente.',
  suministros:
    'Todavía no se registró ningún suministro. Aparecerán aquí cuando se administre un medicamento o se registren insumos.',
};

/** Sin fechas, el vacío normal; con fechas, nombra el período y propone ampliarlo. */
function mensajeSin(que: string, sinRegistros: string, desde: string, hasta: string) {
  if (!desde && !hasta) return sinRegistros;
  return `${oracionDe(['No hay', que, rangoDeFechas(desde, hasta)])} ${pasosParaProbar(['amplíe las fechas'])}`;
}

/** Inicio y fin del día en hora de Argentina, para filtrar por fecha. */
const inicioDelDia = (f: string) => (f ? `${f}T00:00:00-03:00` : undefined);
const finDelDia = (f: string) => (f ? `${f}T23:59:59.999-03:00` : undefined);

/** Historial del paciente con pestañas y filtro por fechas (T209 · CU16 · RF10). */
export function HistorialPaciente({ pacienteId }: { pacienteId: number }) {
  const [pestana, setPestana] = useState(0);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const rango = { desde: inicioDelDia(desde), hasta: finDelDia(hasta) };

  const historial = useQuery({
    queryKey: ['historial', pacienteId, rango],
    queryFn: () => pacientesApi.historial(pacienteId, rango),
    placeholderData: keepPreviousData,
  });
  const h = historial.data;
  const { tienePermiso } = useSesion();
  const clienteQuery = useQueryClient();
  const [suministro, setSuministro] = useState<Suministro | null>(null);
  // Donde se ve el registro, se puede abrir (y corregir) sin ir a otra pantalla (hallazgo F3).
  const abrirSuministro = useMutation({
    mutationFn: (id: number) => suministrosApi.obtener(id),
    onSuccess: setSuministro,
  });

  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, maxWidth: 520 }}>
        <CampoTexto
          etiqueta="Desde"
          valor={desde}
          alCambiar={setDesde}
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <CampoTexto
          etiqueta="Hasta"
          valor={hasta}
          alCambiar={setHasta}
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>

      <Tabs value={pestana} onChange={(_e, v: number) => setPestana(v)} sx={{ mb: 2 }}>
        {/* Sin respuesta (cargando o con error) no se afirma "(0)": no se sabe cuántos hay. */}
        <Tab label={h ? `Camas (${h.asignaciones.length})` : 'Camas'} />
        <Tab label={h ? `Modificaciones (${h.modificaciones.length})` : 'Modificaciones'} />
        <Tab label={h ? `Suministros (${h.suministros.length})` : 'Suministros'} />
      </Tabs>

      {historial.isError ? (
        // Un fallo de carga no se lee como "no hay registros": sin tabla ni mensaje de vacío.
        <ErrorDeCarga
          que="el historial del paciente"
          error={historial.error}
          alReintentar={() => void historial.refetch()}
        />
      ) : (
        <Recargando activo={historial.isFetching && historial.isPlaceholderData}>
          {pestana === 0 && (
            <Tabla
              titulo="Asignaciones de cama"
              columnas={[
                // La cama llega como "Sala B – Traumatología · B-01": su guion no deja cortar.
                { titulo: 'Cama', valor: (a) => formatearCama(a.cama) },
                { titulo: 'Motivo', valor: (a) => MOTIVO_ASIGNACION[a.motivo] ?? a.motivo },
                { titulo: 'Desde', valor: (a) => formatearFechaHora(a.fechaDesde) },
                {
                  titulo: 'Hasta',
                  valor: (a) => (a.fechaHasta ? formatearFechaHora(a.fechaHasta) : 'Actual'),
                },
                { titulo: 'Asignó', valor: (a) => a.asignadoPor ?? '—' },
              ]}
              filas={h?.asignaciones ?? []}
              claveFila={(a) => a.id}
              cargando={historial.isFetching}
              mensajeVacio={mensajeSin('asignaciones de cama', SIN_REGISTROS.camas, desde, hasta)}
            />
          )}
          {pestana === 1 && (
            <Tabla
              titulo="Modificaciones"
              columnas={[
                {
                  titulo: 'Fecha y hora',
                  valor: (m) => formatearFechaHora(m.fechaHora),
                  ancho: 170,
                },
                { titulo: 'Acción', valor: (m) => etiquetaAccion(m.accion, m.entidad) },
                {
                  titulo: 'Detalle',
                  valor: (m) => <Typography variant="body2">{cambiosDe(m)}</Typography>,
                },
                { titulo: 'Usuario', valor: (m) => m.usuario ?? 'Sistema' },
              ]}
              filas={h?.modificaciones ?? []}
              claveFila={(m) => m.id}
              cargando={historial.isFetching}
              mensajeVacio={mensajeSin(
                'modificaciones',
                SIN_REGISTROS.modificaciones,
                desde,
                hasta,
              )}
            />
          )}
          {pestana === 2 && (
            <Tabla
              titulo="Suministros"
              columnas={[
                {
                  titulo: 'Fecha y hora',
                  valor: (s) => formatearFechaHora(s.fechaHora),
                  ancho: 170,
                },
                {
                  titulo: 'Tipo',
                  valor: (s) => (s.tipo === 'MEDICAMENTO' ? 'Medicamento' : 'Insumos'),
                },
                {
                  titulo: 'Detalle',
                  valor: (s) => detalleDe(s) + (s.corregido ? ' (corregido)' : ''),
                },
                { titulo: 'Registró', valor: (s) => s.usuario ?? '—' },
              ]}
              filas={h?.suministros ?? []}
              claveFila={(s) => s.id}
              cargando={historial.isFetching || abrirSuministro.isPending}
              mensajeVacio={mensajeSin('suministros', SIN_REGISTROS.suministros, desde, hasta)}
              etiquetaFila={(s) => `Abrir el registro de ${formatearFechaHoraCorta(s.fechaHora)}`}
              {...(tienePermiso('suministros.ver')
                ? { alTocarFila: (s: { id: number }) => abrirSuministro.mutate(s.id) }
                : {})}
            />
          )}
        </Recargando>
      )}
      {abrirSuministro.isError && (
        <Alerta tipo="error">{mensajeDeError(abrirSuministro.error)}</Alerta>
      )}
      {suministro && (
        <DialogoSuministro
          inicial={suministro}
          alCerrar={() => {
            setSuministro(null);
            void clienteQuery.invalidateQueries({ queryKey: ['historial', pacienteId] });
          }}
        />
      )}
    </>
  );
}
