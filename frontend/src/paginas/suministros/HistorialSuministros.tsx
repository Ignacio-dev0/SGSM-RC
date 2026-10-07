import { useState } from 'react';
import { Box, Chip } from '@mui/material';
import InventoryOutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import { suministrosApi } from '../../api/suministros';
import type { Suministro } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Selector } from '../../componentes/Selector';
import { Tabla, type Columna } from '../../componentes/Tabla';
import { formatearFechaHora } from '../../utilidades/formato';
import { SelectorPaciente } from './comunes';
import { DialogoSuministro } from './DialogoSuministro';
import { detalleDe } from './formato';

const COLUMNAS: Columna<Suministro>[] = [
  { titulo: 'Fecha y hora', valor: (s) => formatearFechaHora(s.fechaHora), ancho: 170 },
  {
    titulo: 'Paciente',
    valor: (s) =>
      `${s.paciente.apellido}, ${s.paciente.nombre}${s.paciente.cama ? ` · ${s.paciente.cama}` : ''}`,
  },
  { titulo: 'Detalle', valor: detalleDe },
  { titulo: 'Registró', valor: (s) => s.usuario.nombre },
  {
    titulo: 'Estado',
    valor: (s) =>
      s.corregido ? (
        <Chip size="small" color="warning" label="Corregido" />
      ) : (
        <Chip size="small" color="success" variant="outlined" label="Validado" />
      ),
  },
];

/** "AAAA-MM-DD" → inicio o fin del día en hora de Argentina. */
const inicioDelDia = (f: string) => (f ? `${f}T00:00:00-03:00` : undefined);
const finDelDia = (f: string) => (f ? `${f}T23:59:59.999-03:00` : undefined);

/** Historial de suministros con filtros y detalle (T415 · CU22 · RF10). */
export function HistorialSuministros() {
  const navegar = useNavigate();
  const { tienePermiso } = useSesion();
  const [parametros] = useSearchParams();
  const [pacienteId, setPacienteId] = useState(parametros.get('pacienteId') ?? '');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [tipoInsumo, setTipoInsumo] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [pagina, setPagina] = useState(1);
  const [abierto, setAbierto] = useState<Suministro | null>(null);

  const responsables = useQuery({
    queryKey: ['suministros', 'responsables'],
    queryFn: suministrosApi.responsables,
  });
  const filtros = {
    pacienteId,
    usuarioId,
    tipoInsumo,
    desde: inicioDelDia(desde),
    hasta: finDelDia(hasta),
    pagina,
  };
  const consulta = useQuery({
    queryKey: ['suministros', filtros],
    queryFn: () => suministrosApi.buscar(filtros),
    placeholderData: keepPreviousData,
  });
  const filtrar = (aplicar: () => void) => {
    aplicar();
    setPagina(1);
  };

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
      {consulta.isError && <Alerta tipo="error">{mensajeDeError(consulta.error)}</Alerta>}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '2fr 1fr 1fr 1fr 1.5fr' },
          mb: 2,
        }}
      >
        <SelectorPaciente
          valor={pacienteId}
          alCambiar={(v) => filtrar(() => setPacienteId(v))}
          textoVacio="Todos"
        />
        <CampoTexto
          etiqueta="Desde"
          valor={desde}
          alCambiar={(v) => filtrar(() => setDesde(v))}
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <CampoTexto
          etiqueta="Hasta"
          valor={hasta}
          alCambiar={(v) => filtrar(() => setHasta(v))}
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Selector
          etiqueta="Tipo"
          valor={tipoInsumo}
          alCambiar={(v) => filtrar(() => setTipoInsumo(v))}
          opciones={[
            { valor: '', etiqueta: 'Todos' },
            { valor: 'MEDICAMENTO', etiqueta: 'Medicamentos' },
            { valor: 'INSUMO', etiqueta: 'Insumos' },
          ]}
        />
        <Selector
          etiqueta="Responsable"
          valor={usuarioId}
          alCambiar={(v) => filtrar(() => setUsuarioId(v))}
          textoVacio="Todos"
          opciones={(responsables.data ?? []).map((u) => ({
            valor: String(u.id),
            etiqueta: u.nombre,
          }))}
        />
      </Box>
      <Tabla
        titulo="Suministros"
        columnas={COLUMNAS}
        filas={consulta.data?.data ?? []}
        claveFila={(s) => s.id}
        cargando={consulta.isFetching}
        mensajeVacio="No hay suministros con esos filtros"
        alTocarFila={setAbierto}
        {...(consulta.data && {
          paginacion: { ...consulta.data.meta, alCambiarPagina: setPagina },
        })}
      />
      {abierto && <DialogoSuministro inicial={abierto} alCerrar={() => setAbierto(null)} />}
    </>
  );
}
