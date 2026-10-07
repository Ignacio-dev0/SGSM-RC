import { useState } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import { prescripcionesApi } from '../../api/prescripciones';
import type { EstadoPrescripcion, Paciente, Prescripcion } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { Selector } from '../../componentes/Selector';
import { Tabla, type Columna } from '../../componentes/Tabla';
import { formatearFechaHora, formatearHora } from '../../utilidades/formato';
import { ESTADOS, etiquetaVia, formatearDosis, formatearFrecuencia } from './etiquetas';

const COLUMNAS: Columna<Prescripcion>[] = [
  {
    titulo: 'Medicamento',
    valor: (p) => (
      <>
        <Typography sx={{ fontWeight: 700 }}>{p.medicamento.nombre}</Typography>
        <Typography variant="body2" color="text.secondary">
          {p.medicamento.presentacion}
        </Typography>
      </>
    ),
  },
  { titulo: 'Dosis', valor: (p) => formatearDosis(p.dosis, p.unidadDosis) },
  { titulo: 'Frecuencia', valor: (p) => formatearFrecuencia(p.frecuenciaHoras) },
  { titulo: 'Vía', valor: (p) => etiquetaVia(p.via) },
  {
    titulo: 'Próxima toma',
    valor: (p) => (p.proximaToma ? <strong>{formatearHora(p.proximaToma)}</strong> : '—'),
  },
  {
    titulo: 'Estado',
    valor: (p) => (
      <Chip size="small" label={ESTADOS[p.estado].etiqueta} color={ESTADOS[p.estado].color} />
    ),
  },
  {
    titulo: 'Última administración',
    valor: (p) => {
      const u = p.ultimasAdministraciones[0];
      return u ? `${formatearFechaHora(u.fechaHora)} · ${u.usuario}` : 'Sin registros';
    },
  },
];

/**
 * Prescripciones del paciente (T305 · CU18): estado, próxima toma y últimas administraciones.
 * Se muestra como pestaña de la ficha del paciente.
 */
export function PrescripcionesPaciente({ paciente }: { paciente: Paciente }) {
  const navegar = useNavigate();
  const { tienePermiso: puede } = useSesion();
  const administra = puede('suministros.registrar') && paciente.estado === 'INTERNADO';
  const { tienePermiso } = useSesion();
  const [estado, setEstado] = useState<EstadoPrescripcion | ''>('VIGENTE');
  const consulta = useQuery({
    queryKey: ['prescripciones', paciente.id, estado],
    queryFn: () => prescripcionesApi.dePaciente(paciente.id, estado || undefined),
  });

  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Box sx={{ width: 220 }}>
          <Selector
            etiqueta="Mostrar"
            valor={estado}
            alCambiar={(v) => setEstado(v as EstadoPrescripcion | '')}
            opciones={[
              { valor: 'VIGENTE', etiqueta: 'Vigentes' },
              { valor: '', etiqueta: 'Todas' },
            ]}
          />
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        {tienePermiso('prescripciones.gestionar') && paciente.estado === 'INTERNADO' && (
          <Boton
            startIcon={<AddIcon />}
            onClick={() => navegar(`/pacientes/${paciente.id}/prescripciones/nueva`)}
          >
            Nueva prescripción
          </Boton>
        )}
      </Box>
      {consulta.isError && <Alerta tipo="error">{mensajeDeError(consulta.error)}</Alerta>}
      <Tabla
        titulo="Prescripciones"
        columnas={
          administra
            ? [
                ...COLUMNAS,
                {
                  titulo: 'Acción',
                  valor: (p) =>
                    p.estado === 'VIGENTE' && (
                      <Boton
                        variante="secundario"
                        startIcon={<MedicationOutlinedIcon />}
                        aria-label={`Administrar ${p.medicamento.nombre}`}
                        // Sin esto, el toque o el Enter también abrirían el detalle de la fila.
                        onClick={(e) => {
                          e.stopPropagation();
                          navegar(
                            `/suministros/medicamento?pacienteId=${paciente.id}&prescripcionId=${p.id}`,
                          );
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        Administrar
                      </Boton>
                    ),
                },
              ]
            : COLUMNAS
        }
        filas={consulta.data ?? []}
        claveFila={(p) => p.id}
        cargando={consulta.isFetching}
        mensajeVacio={
          estado === 'VIGENTE'
            ? 'El paciente no tiene prescripciones vigentes'
            : 'Sin prescripciones'
        }
        alTocarFila={(p) => navegar(`/prescripciones/${p.id}`)}
      />
    </>
  );
}
