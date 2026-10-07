import { useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useEstudiosDePaciente, type Estudio } from '../../api/estudios';
import type { Paciente } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { Recargando } from '../../utilidades/listado';
import { useConfirmacionEstudio } from './ConfirmacionEstudio';
import { DialogoProgramarEstudio } from './DialogoProgramarEstudio';
import { DialogoCancelarEstudio, DialogoReprogramarEstudio } from './DialogosEstudio';
import { pacienteDelEstudio } from './etiquetas';
import { ListaEstudios, type AccionesEstudio } from './TarjetasEstudios';
import type { ResultadoEstudio } from './useRefrescarEstudios';

type Dialogo =
  | { tipo: 'programar' }
  | { tipo: 'reprogramar'; estudio: Estudio }
  | { tipo: 'cancelar'; estudio: Estudio };

/** Botón de la acción de la pestaña; a lo ancho en teléfono. */
function BotonProgramar({ alTocar }: { alTocar: () => void }) {
  return (
    <Boton startIcon={<AddIcon />} onClick={alTocar} sx={{ width: { xs: '100%', sm: 'auto' } }}>
      Programar estudio
    </Boton>
  );
}

/**
 * Estudios del paciente (T510 · S15), como pestaña de su ficha: primero los programados (el más
 * próximo arriba) y después los realizados y cancelados, en el orden del servidor (D35). Desde
 * acá el médico programa, reprograma y cancela, y enfermería confirma con su rostro que se hizo.
 */
export function EstudiosPaciente({ paciente }: { paciente: Paciente }) {
  const { tienePermiso } = useSesion();
  const consulta = useEstudiosDePaciente(paciente.id);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [aviso, setAviso] = useState<ResultadoEstudio | null>(null);
  const terminar = (r: ResultadoEstudio) => {
    setDialogo(null);
    setAviso(r);
  };
  const { abrirConfirmacion, dialogoConfirmacion } = useConfirmacionEstudio({
    alTerminar: terminar,
  });

  const identidad = pacienteDelEstudio(paciente);
  const gestiona = tienePermiso('estudios.gestionar');
  const programa = gestiona && paciente.estado === 'INTERNADO';
  // Al empezar otra acción, el aviso de la anterior ya no corresponde.
  const abrir = (d: Dialogo) => {
    setAviso(null);
    setDialogo(d);
  };
  const acciones: AccionesEstudio = {
    ...(gestiona && {
      alReprogramar: (estudio: Estudio) => abrir({ tipo: 'reprogramar', estudio }),
      alCancelar: (estudio: Estudio) => abrir({ tipo: 'cancelar', estudio }),
    }),
    ...(tienePermiso('estudios.confirmar') && {
      alConfirmar: (estudio: Estudio) => {
        setAviso(null);
        abrirConfirmacion(estudio.id, { estudio, paciente: identidad });
      },
    }),
  };
  const abrirProgramar = () => abrir({ tipo: 'programar' });

  const estudios = consulta.data ?? [];
  const programados = estudios.filter((e) => e.estado === 'PROGRAMADO');
  const cerrados = estudios.filter((e) => e.estado !== 'PROGRAMADO');
  // Mientras reintenta no se vuelve a mostrar el error viejo, sino que está cargando.
  const fallo = consulta.isError && !consulta.isFetching;

  return (
    <>
      {aviso && (
        <Alerta
          tipo={aviso.tipo}
          // Que otra persona ya lo cerró pide atención: se lleva a la vista (UX-12).
          enfocar={aviso.tipo !== 'exito'}
          alCerrar={() => setAviso(null)}
        >
          {aviso.texto}
        </Alerta>
      )}

      {fallo ? (
        // Un fallo de carga no puede decir "no tiene estudios".
        <ErrorDeCarga
          que="los estudios"
          error={consulta.error}
          alReintentar={() => void consulta.refetch()}
        />
      ) : !consulta.data ? (
        <Cargando texto="Cargando los estudios…" />
      ) : (
        <Recargando activo={consulta.isFetching}>
          {programa && programados.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <BotonProgramar alTocar={abrirProgramar} />
            </Box>
          )}
          <ListaEstudios
            titulo="Programados"
            estudios={programados}
            {...acciones}
            vacio={
              <Paper variant="outlined" sx={{ p: { xs: 2, sm: 4 }, textAlign: 'center' }}>
                <Typography color="text.secondary" sx={{ mb: programa ? 2 : 0 }}>
                  No tiene estudios programados
                </Typography>
                {programa && <BotonProgramar alTocar={abrirProgramar} />}
              </Paper>
            }
          />
          {cerrados.length > 0 && (
            <ListaEstudios titulo="Realizados y cancelados" estudios={cerrados} />
          )}
        </Recargando>
      )}

      {dialogo?.tipo === 'programar' && (
        <DialogoProgramarEstudio
          paciente={paciente}
          alCerrar={() => setDialogo(null)}
          alTerminar={terminar}
        />
      )}
      {dialogo?.tipo === 'reprogramar' && (
        <DialogoReprogramarEstudio
          estudio={dialogo.estudio}
          paciente={identidad}
          alCerrar={() => setDialogo(null)}
          alTerminar={terminar}
        />
      )}
      {dialogo?.tipo === 'cancelar' && (
        <DialogoCancelarEstudio
          estudio={dialogo.estudio}
          paciente={identidad}
          alCerrar={() => setDialogo(null)}
          alTerminar={terminar}
        />
      )}
      {dialogoConfirmacion}
    </>
  );
}
