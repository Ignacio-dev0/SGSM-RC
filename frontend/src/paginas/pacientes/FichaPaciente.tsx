import { useId, useState, type ReactNode } from 'react';
import { Box, Chip, Paper, Tab, Tabs, Typography } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePaciente } from '../../api/pacientes';
import type { Paciente } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { edad, formatearFechaHora, formatearFechaSinZona } from '../../utilidades/formato';
import { PrescripcionesPaciente } from '../prescripciones/PrescripcionesPaciente';
import { DialogoEgreso, DialogoTraslado } from './DialogosPaciente';
import { HistorialPaciente } from './HistorialPaciente';
import { etiquetaSexo, ubicacionCama } from './etiquetas';

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {etiqueta}
      </Typography>
      <Typography sx={{ fontWeight: 600 }}>{children || '—'}</Typography>
    </Box>
  );
}

function DatosDelPaciente({ p }: { p: Paciente }) {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Box
        sx={{
          display: 'grid',
          gap: 2.5,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
        }}
      >
        <Dato etiqueta="Fecha de nacimiento">
          {formatearFechaSinZona(p.fechaNacimiento)} ({edad(p.fechaNacimiento)} años)
        </Dato>
        <Dato etiqueta="Sexo">{etiquetaSexo(p.sexo)}</Dato>
        <Dato etiqueta="Obra social">
          {[p.obraSocial, p.numeroAfiliado].filter(Boolean).join(' · ')}
        </Dato>
        <Dato etiqueta="Diagnóstico">{p.diagnostico}</Dato>
        <Dato etiqueta="Contacto de emergencia">
          {[p.contactoEmergenciaNombre, p.contactoEmergenciaTelefono].filter(Boolean).join(' · ')}
        </Dato>
        <Dato etiqueta="Fecha de ingreso">{formatearFechaHora(p.fechaIngreso)}</Dato>
        {p.estado === 'EGRESADO' && (
          <>
            <Dato etiqueta="Fecha de egreso">{formatearFechaHora(p.fechaEgreso)}</Dato>
            <Dato etiqueta="Motivo del egreso">{p.motivoEgreso}</Dato>
          </>
        )}
        <Dato etiqueta="Observaciones">{p.observaciones}</Dato>
      </Box>
    </Paper>
  );
}

const PESTANAS = ['datos', 'prescripciones', 'historial'] as const;
type Pestana = (typeof PESTANAS)[number];

const ETIQUETAS_PESTANA: Record<Pestana, string> = {
  datos: 'Datos',
  prescripciones: 'Prescripciones',
  historial: 'Historial',
};

/**
 * Ficha del paciente: datos, cama actual y acciones (editar T207, trasladar T207, dar de alta
 * T208), con las pestañas de prescripciones (T305) e historial (T209).
 */
export function FichaPaciente() {
  const id = Number(useParams().id);
  const navegar = useNavigate();
  const clienteQuery = useQueryClient();
  const { tienePermiso } = useSesion();
  const ubicacion = useLocation();
  const [parametros, setParametros] = useSearchParams();
  // Al lado de la cama lo primero que se busca es la medicación (hallazgo F1).
  const pestanaInicial: Pestana = tienePermiso('prescripciones.ver') ? 'prescripciones' : 'datos';
  const pestana: Pestana = PESTANAS.includes(parametros.get('pestana') as Pestana)
    ? (parametros.get('pestana') as Pestana)
    : pestanaInicial;
  const [aviso, setAviso] = useState<string | null>(
    (ubicacion.state as { aviso?: string } | null)?.aviso ?? null,
  );
  const [dialogo, setDialogo] = useState<'traslado' | 'egreso' | null>(null);
  const paciente = usePaciente(id);
  const p = paciente.data;
  // Cada pestaña y su panel se refieren entre sí (WAI-ARIA tabs).
  const base = useId();
  const idPestana = (v: Pestana) => `${base}-pestana-${v}`;
  const idPanel = (v: Pestana) => `${base}-panel-${v}`;
  const propiedadesPestana = (v: Pestana) => ({
    value: v,
    label: ETIQUETAS_PESTANA[v],
    id: idPestana(v),
    'aria-controls': idPanel(v),
  });

  const alTerminar = (actualizado: Paciente, mensaje: string) => {
    clienteQuery.setQueryData(['paciente', id], actualizado);
    void clienteQuery.invalidateQueries({ queryKey: ['pacientes'] });
    void clienteQuery.invalidateQueries({ queryKey: ['historial', id] });
    setDialogo(null);
    setAviso(mensaje);
  };

  if (paciente.isError) {
    return (
      <ErrorDeCarga
        que="la ficha del paciente"
        error={paciente.error}
        alReintentar={() => void paciente.refetch()}
      />
    );
  }
  if (!p) return <Cargando texto="Cargando la ficha del paciente…" />;

  const gestiona = tienePermiso('pacientes.gestionar') && p.estado === 'INTERNADO';
  const suministra = tienePermiso('suministros.registrar') && p.estado === 'INTERNADO';

  return (
    <>
      <EncabezadoPagina
        titulo={`${p.apellido}, ${p.nombre}`}
        volverA={(ubicacion.state as { volverA?: string } | null)?.volverA ?? '/pacientes'}
        subtitulo={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
            <span>DNI {p.dni}</span>
            <span>· {edad(p.fechaNacimiento)} años ·</span>
            {p.cama ? (
              // La cama como texto en negrita, igual que en la identificación de las otras pantallas.
              <Typography component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                {ubicacionCama(p.cama)}
              </Typography>
            ) : (
              <Chip label="Egresado" />
            )}
          </Box>
        }
        acciones={
          (gestiona || suministra) && (
            <>
              {suministra && (
                <>
                  <Boton
                    startIcon={<MedicationOutlinedIcon />}
                    onClick={() => navegar(`/suministros/medicamento?pacienteId=${id}`)}
                  >
                    Administrar medicamento
                  </Boton>
                  <Boton
                    variante="secundario"
                    startIcon={<InventoryOutlinedIcon />}
                    onClick={() => navegar(`/suministros/insumos?pacienteId=${id}`)}
                  >
                    Registrar insumos
                  </Boton>
                </>
              )}
              {gestiona && (
                <>
                  <Boton
                    variante="secundario"
                    startIcon={<EditOutlinedIcon />}
                    onClick={() => navegar(`/pacientes/${id}/editar`)}
                  >
                    Editar datos
                  </Boton>
                  <Boton
                    variante="secundario"
                    startIcon={<SwapHorizIcon />}
                    onClick={() => setDialogo('traslado')}
                  >
                    Trasladar
                  </Boton>
                  <Boton variante="peligro" onClick={() => setDialogo('egreso')}>
                    Dar de alta
                  </Boton>
                </>
              )}
            </>
          )
        }
      />

      {aviso && (
        <Alerta tipo="exito" alCerrar={() => setAviso(null)}>
          {aviso}
        </Alerta>
      )}

      <Tabs
        value={pestana}
        aria-label="Secciones de la ficha"
        // Cambiar de pestaña conserva el estado (a qué búsqueda vuelve la flecha).
        onChange={(_e, v: Pestana) =>
          setParametros({ pestana: v }, { replace: true, state: ubicacion.state })
        }
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab {...propiedadesPestana('datos')} />
        {tienePermiso('prescripciones.ver') && <Tab {...propiedadesPestana('prescripciones')} />}
        <Tab {...propiedadesPestana('historial')} />
      </Tabs>

      {/* Solo el panel de la pestaña activa está en la página: las otras secciones no cargan datos. */}
      <Box role="tabpanel" id={idPanel(pestana)} aria-labelledby={idPestana(pestana)}>
        {pestana === 'datos' && <DatosDelPaciente p={p} />}
        {pestana === 'prescripciones' && <PrescripcionesPaciente paciente={p} />}
        {pestana === 'historial' && <HistorialPaciente pacienteId={id} />}
      </Box>

      <DialogoTraslado
        paciente={p}
        abierto={dialogo === 'traslado'}
        alCerrar={() => setDialogo(null)}
        alTerminar={alTerminar}
      />
      <DialogoEgreso
        paciente={p}
        abierto={dialogo === 'egreso'}
        alCerrar={() => setDialogo(null)}
        alTerminar={alTerminar}
      />
    </>
  );
}
