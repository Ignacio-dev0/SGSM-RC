import { useState } from 'react';
import { Box, Chip, Typography, useMediaQuery, useTheme } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { prescripcionesApi } from '../../api/prescripciones';
import type { EstadoPrescripcion, Paciente, Prescripcion } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { Boton } from '../../componentes/Boton';
import { ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { Selector } from '../../componentes/Selector';
import { Tabla, type Columna } from '../../componentes/Tabla';
import { formatearFechaHora } from '../../utilidades/formato';
import { useAhora } from '../../utilidades/useAhora';
import { ChipEstadoToma } from './ChipEstadoToma';
import { ESTADOS, etiquetaVia, formatearDosis, formatearFrecuencia } from './etiquetas';
import { formatearProximaToma } from './proximaToma';
import { TarjetasPrescripciones } from './TarjetasPrescripciones';

/** Columnas de la tabla (pantallas desde md); "ahora" sirve para decir el día y el estado de la toma. */
const columnas = (ahora: Date): Columna<Prescripcion>[] => [
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
    valor: (p) => (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
        {p.proximaToma ? <strong>{formatearProximaToma(p.proximaToma, ahora)}</strong> : '—'}
        <ChipEstadoToma prescripcion={p} ahora={ahora} />
      </Box>
    ),
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
 * Se muestra como pestaña de la ficha del paciente. Desde md es una tabla; en pantallas más
 * angostas (tablet vertical, teléfono) una tarjeta por prescripción, para no esconder la última
 * administración ni Administrar detrás de un desplazamiento lateral.
 */
export function PrescripcionesPaciente({ paciente }: { paciente: Paciente }) {
  const navegar = useNavigate();
  const { tienePermiso } = useSesion();
  const angosta = useMediaQuery(useTheme().breakpoints.down('md'));
  const ahora = useAhora();
  const administra = tienePermiso('suministros.registrar') && paciente.estado === 'INTERNADO';
  const [estado, setEstado] = useState<EstadoPrescripcion | ''>('VIGENTE');
  const consulta = useQuery({
    queryKey: ['prescripciones', paciente.id, estado],
    queryFn: () => prescripcionesApi.dePaciente(paciente.id, estado || undefined),
  });
  // Mientras reintenta no se vuelve a mostrar el error viejo, sino que se ve que está cargando.
  const fallo = consulta.isError && !consulta.isFetching;
  const mensajeVacio =
    estado === 'VIGENTE' ? 'El paciente no tiene prescripciones vigentes' : 'Sin prescripciones';

  const abrir = (p: Prescripcion) => navegar(`/prescripciones/${p.id}`);
  const administrar = (p: Prescripcion) =>
    navegar(`/suministros/medicamento?pacienteId=${paciente.id}&prescripcionId=${p.id}`);

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
      {fallo ? (
        // Un corte de red no puede decir "no hay prescripciones": dice que no se pudo cargar.
        <ErrorDeCarga
          que="las prescripciones"
          error={consulta.error}
          alReintentar={() => void consulta.refetch()}
        />
      ) : angosta ? (
        <TarjetasPrescripciones
          prescripciones={consulta.data ?? []}
          ahora={ahora}
          administra={administra}
          cargando={consulta.isFetching}
          mensajeVacio={mensajeVacio}
          alAbrir={abrir}
          alAdministrar={administrar}
        />
      ) : (
        <Tabla
          titulo="Prescripciones"
          columnas={
            administra
              ? [
                  ...columnas(ahora),
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
                            administrar(p);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          Administrar
                        </Boton>
                      ),
                  },
                ]
              : columnas(ahora)
          }
          filas={consulta.data ?? []}
          claveFila={(p) => p.id}
          cargando={consulta.isFetching}
          mensajeVacio={mensajeVacio}
          alTocarFila={abrir}
        />
      )}
    </>
  );
}
