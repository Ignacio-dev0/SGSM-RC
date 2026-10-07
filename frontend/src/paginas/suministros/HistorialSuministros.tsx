import { useState } from 'react';
import { Box } from '@mui/material';
import InventoryOutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { suministrosApi } from '../../api/suministros';
import type { Suministro } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { ChipEstado } from '../../componentes/ChipEstado';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { Selector } from '../../componentes/Selector';
import { Tabla, type Columna } from '../../componentes/Tabla';
import {
  formatearFechaHora,
  formatearFechaHoraCorta,
  rangoDeFechas,
} from '../../utilidades/formato';
import { ColumnaPrincipal, GrillaDeFiltros, Recargando } from '../../utilidades/listado';
import { oracionDe, pasosParaProbar } from '../../utilidades/sinResultados';
import { useFiltrosEnUrl } from '../../utilidades/useFiltrosEnUrl';
import { formatearCama } from '../pacientes/etiquetas';
import { SelectorPaciente } from './comunes';
import { DialogoSuministro } from './DialogoSuministro';
import { detalleDe } from './formato';

const COLUMNAS: Columna<Suministro>[] = [
  { titulo: 'Fecha y hora', valor: (s) => formatearFechaHora(s.fechaHora), ancho: 170 },
  {
    // El paciente y su cama, en negrita; la cama no se parte en "A-" y "01".
    titulo: 'Paciente',
    valor: (s) => (
      <ColumnaPrincipal>
        {`${s.paciente.apellido}, ${s.paciente.nombre}${s.paciente.cama ? ` · ${formatearCama(s.paciente.cama)}` : ''}`}
      </ColumnaPrincipal>
    ),
  },
  { titulo: 'Detalle', valor: detalleDe },
  { titulo: 'Registró', valor: (s) => s.usuario.nombre },
  {
    titulo: 'Estado',
    valor: (s) => <ChipEstado estado={s.corregido ? 'CORREGIDO' : 'VALIDADO'} />,
  },
];

/** "AAAA-MM-DD" → inicio o fin del día en hora de Argentina. */
const inicioDelDia = (f: string) => (f ? `${f}T00:00:00-03:00` : undefined);
const finDelDia = (f: string) => (f ? `${f}T23:59:59.999-03:00` : undefined);

/** Vista inicial: todo lo registrado, sin filtros. Lo que se aparta de esto va en la URL. */
const FILTROS_INICIALES = { pacienteId: '', desde: '', hasta: '', tipoInsumo: '', usuarioId: '' };

const MENSAJE_SIN_SUMINISTROS =
  'Todavía no se registró ningún suministro. Aparecerán aquí cuando se administre un medicamento o se registren insumos.';

/** Qué no se encontró y qué probar: la causa y el paso siguiente, con lo que se filtró. */
function mensajeSinSuministros(
  { pacienteId, desde, hasta, tipoInsumo, usuarioId }: typeof FILTROS_INICIALES,
  conFiltros: boolean,
  nombreResponsable: string | undefined,
) {
  if (!conFiltros) return MENSAJE_SIN_SUMINISTROS;
  const causa = oracionDe([
    'No hay suministros',
    tipoInsumo === 'MEDICAMENTO' && 'de medicamentos',
    tipoInsumo === 'INSUMO' && 'de insumos',
    pacienteId && 'del paciente elegido',
    rangoDeFechas(desde, hasta),
    usuarioId && `registrados por ${nombreResponsable ?? 'el responsable elegido'}`,
  ]);
  const pasos = pasosParaProbar([
    pacienteId && 'elija otro paciente',
    (desde || hasta) && 'amplíe las fechas',
    tipoInsumo && 'cambie Tipo a Todos',
    usuarioId && 'elija otro responsable',
  ]);
  return `${causa} ${pasos}`;
}

/**
 * Historial de suministros con filtros y detalle (T415 · CU22 · RF10). Los filtros y la página
 * viven en la URL (`?pacienteId=7` abre el historial de un paciente): al abrir un registro y
 * volver, el filtro sigue ahí.
 */
export function HistorialSuministros() {
  const navegar = useNavigate();
  const { tienePermiso } = useSesion();
  const filtros = useFiltrosEnUrl(FILTROS_INICIALES);
  const { pacienteId, desde, hasta, tipoInsumo, usuarioId } = filtros.valores;
  const [abierto, setAbierto] = useState<Suministro | null>(null);

  const responsables = useQuery({
    queryKey: ['suministros', 'responsables'],
    queryFn: suministrosApi.responsables,
  });
  const pedido = {
    pacienteId,
    usuarioId,
    tipoInsumo,
    desde: inicioDelDia(desde),
    hasta: finDelDia(hasta),
    pagina: filtros.pagina,
  };
  const consulta = useQuery({
    queryKey: ['suministros', pedido],
    queryFn: () => suministrosApi.buscar(pedido),
    placeholderData: keepPreviousData,
  });

  // Solo con la respuesta ya asentada y sin error: un fallo de carga no es "no hay suministros".
  const sinResultados =
    consulta.isSuccess && !consulta.isFetching && consulta.data.data.length === 0;
  const conFiltros = filtros.hayFiltros();
  const nombreResponsable = responsables.data?.find((u) => String(u.id) === usuarioId)?.nombre;

  return (
    <>
      <EncabezadoPagina
        titulo="Suministros"
        subtitulo="Medicamentos e insumos registrados"
        acciones={
          tienePermiso('suministros.registrar') && (
            <>
              <Boton
                startIcon={<MedicationOutlinedIcon />}
                onClick={() => navegar('/suministros/medicamento')}
              >
                Administrar medicamento
              </Boton>
              <Boton
                variante="secundario"
                startIcon={<InventoryOutlinedIcon />}
                onClick={() => navegar('/suministros/insumos')}
              >
                Registrar insumos
              </Boton>
            </>
          )
        }
      />
      <GrillaDeFiltros columnas="2fr 1fr 1fr 1fr 1.5fr" desde="lg">
        <SelectorPaciente
          valor={pacienteId}
          alCambiar={(v) => filtros.fijar({ pacienteId: v })}
          textoVacio="Todos"
        />
        <CampoTexto
          etiqueta="Desde"
          valor={desde}
          alCambiar={(v) => filtros.fijar({ desde: v })}
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <CampoTexto
          etiqueta="Hasta"
          valor={hasta}
          alCambiar={(v) => filtros.fijar({ hasta: v })}
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Selector
          etiqueta="Tipo"
          valor={tipoInsumo}
          alCambiar={(v) => filtros.fijar({ tipoInsumo: v })}
          opciones={[
            { valor: '', etiqueta: 'Todos' },
            { valor: 'MEDICAMENTO', etiqueta: 'Medicamentos' },
            { valor: 'INSUMO', etiqueta: 'Insumos' },
          ]}
        />
        <Selector
          etiqueta="Responsable"
          valor={usuarioId}
          alCambiar={(v) => filtros.fijar({ usuarioId: v })}
          textoVacio="Todos"
          opciones={(responsables.data ?? []).map((u) => ({
            valor: String(u.id),
            etiqueta: u.nombre,
          }))}
        />
      </GrillaDeFiltros>
      {consulta.isError ? (
        // Un fallo de carga no se lee como "no hay suministros": sin tabla ni mensaje de vacío.
        <ErrorDeCarga
          que="el historial de suministros"
          error={consulta.error}
          alReintentar={() => void consulta.refetch()}
        />
      ) : (
        <Recargando activo={consulta.isFetching && consulta.isPlaceholderData}>
          <Tabla
            titulo="Suministros"
            columnas={COLUMNAS}
            filas={consulta.data?.data ?? []}
            claveFila={(s) => s.id}
            cargando={consulta.isFetching}
            mensajeVacio={mensajeSinSuministros(filtros.valores, conFiltros, nombreResponsable)}
            alTocarFila={setAbierto}
            etiquetaFila={(s) =>
              `Abrir el registro de ${formatearFechaHoraCorta(s.fechaHora)} de ${s.paciente.apellido}, ${s.paciente.nombre}`
            }
            {...(consulta.data && {
              paginacion: { ...consulta.data.meta, alCambiarPagina: filtros.irAPagina },
            })}
          />
        </Recargando>
      )}
      {sinResultados && conFiltros && (
        <Box
          role="group"
          aria-label="Qué puede hacer ahora"
          sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}
        >
          <Boton variante="secundario" onClick={filtros.quitarFiltros}>
            Quitar filtros
          </Boton>
        </Box>
      )}
      {abierto && <DialogoSuministro inicial={abierto} alCerrar={() => setAbierto(null)} />}
    </>
  );
}
