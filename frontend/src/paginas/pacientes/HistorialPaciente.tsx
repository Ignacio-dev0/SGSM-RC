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
import { Tabla } from '../../componentes/Tabla';
import { formatearFechaHora } from '../../utilidades/formato';
import { DialogoSuministro } from '../suministros/DialogoSuministro';
import { CAMPOS, MOTIVO_ASIGNACION, etiquetaAccion } from './etiquetas';

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
      {historial.isError && <Alerta tipo="error">{mensajeDeError(historial.error)}</Alerta>}

      <Tabs value={pestana} onChange={(_e, v: number) => setPestana(v)} sx={{ mb: 2 }}>
        <Tab label={`Camas (${h?.asignaciones.length ?? 0})`} />
        <Tab label={`Modificaciones (${h?.modificaciones.length ?? 0})`} />
        <Tab label={`Suministros (${h?.suministros.length ?? 0})`} />
      </Tabs>

      {pestana === 0 && (
        <Tabla
          titulo="Asignaciones de cama"
          columnas={[
            { titulo: 'Cama', valor: (a) => a.cama },
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
          mensajeVacio="Sin asignaciones de cama en el período"
        />
      )}
      {pestana === 1 && (
        <Tabla
          titulo="Modificaciones"
          columnas={[
            { titulo: 'Fecha y hora', valor: (m) => formatearFechaHora(m.fechaHora), ancho: 170 },
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
          mensajeVacio="Sin modificaciones en el período"
        />
      )}
      {pestana === 2 && (
        <Tabla
          titulo="Suministros"
          columnas={[
            { titulo: 'Fecha y hora', valor: (s) => formatearFechaHora(s.fechaHora), ancho: 170 },
            {
              titulo: 'Tipo',
              valor: (s) => (s.tipo === 'MEDICAMENTO' ? 'Medicamento' : 'Insumos'),
            },
            {
              titulo: 'Detalle',
              valor: (s) =>
                s.detalles.map((d) => `${d.insumo} × ${d.cantidad} ${d.unidad}`).join(', ') +
                (s.corregido ? ' (corregido)' : ''),
            },
            { titulo: 'Registró', valor: (s) => s.usuario ?? '—' },
          ]}
          filas={h?.suministros ?? []}
          claveFila={(s) => s.id}
          cargando={historial.isFetching || abrirSuministro.isPending}
          mensajeVacio="Sin suministros en el período"
          {...(tienePermiso('suministros.ver')
            ? { alTocarFila: (s: { id: number }) => abrirSuministro.mutate(s.id) }
            : {})}
        />
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
