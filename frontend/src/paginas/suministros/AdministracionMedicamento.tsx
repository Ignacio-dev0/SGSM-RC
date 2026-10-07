import { useEffect, useState } from 'react';
import { Box, Card, CardActionArea, CardContent, Paper, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import { usePaciente } from '../../api/pacientes';
import { prescripcionesApi } from '../../api/prescripciones';
import { suministrosApi } from '../../api/suministros';
import type { Prescripcion, Suministro } from '../../api/tipos';
import { useValidacionFacial } from '../../biometria/useValidacionFacial';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { formatearFechaHora, formatearHora } from '../../utilidades/formato';
import { etiquetaVia, formatearDosis, formatearFrecuencia } from '../prescripciones/etiquetas';
import { SelectorPaciente } from './comunes';

/** Cierra la oración sin duplicar el punto de "a. m." / "p. m.". */
const conPunto = (texto: string) => (texto.endsWith('.') ? texto : `${texto}.`);

function TarjetaPrescripcion({
  p,
  elegida,
  alElegir,
}: {
  p: Prescripcion;
  elegida: boolean;
  alElegir: () => void;
}) {
  const ultima = p.ultimasAdministraciones[0];
  return (
    <Card
      variant="outlined"
      sx={{
        borderWidth: 2,
        borderColor: elegida ? 'primary.main' : 'divider',
        bgcolor: elegida ? 'action.selected' : undefined,
      }}
    >
      <CardActionArea onClick={alElegir} aria-pressed={elegida} sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" component="p">
              {p.medicamento.nombre} {formatearDosis(p.dosis, p.unidadDosis)}
            </Typography>
            <Typography color="text.secondary">
              {etiquetaVia(p.via)} · {formatearFrecuencia(p.frecuenciaHoras)}
              {p.observaciones ? ` · ${p.observaciones}` : ''}
            </Typography>
            <Typography sx={{ mt: 0.5 }}>
              Próxima toma: <strong>{p.proximaToma ? formatearHora(p.proximaToma) : '—'}</strong>
              {ultima && ` · Última: ${formatearFechaHora(ultima.fechaHora)} (${ultima.usuario})`}
            </Typography>
          </Box>
          {elegida && <CheckCircleIcon color="primary" sx={{ fontSize: 36 }} />}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

/**
 * Administración de medicamento (T413 · CU20): la pantalla más usada del sistema. Paciente →
 * prescripción vigente → cantidad → confirmación con la cara.
 */
export function AdministracionMedicamento() {
  const navegar = useNavigate();
  const clienteQuery = useQueryClient();
  const [parametros, setParametros] = useSearchParams();
  const pacienteId = Number(parametros.get('pacienteId')) || 0;
  const paciente = usePaciente(pacienteId);
  const vigentes = useQuery({
    queryKey: ['prescripciones', pacienteId, 'VIGENTE'],
    queryFn: () => prescripcionesApi.dePaciente(pacienteId, 'VIGENTE'),
    enabled: pacienteId > 0,
  });
  const { pedirValidacion, modalValidacion } = useValidacionFacial();
  const [elegida, setElegida] = useState<Prescripcion | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [registrado, setRegistrado] = useState<Suministro | null>(null);

  useEffect(() => {
    setElegida(null);
    setRegistrado(null);
  }, [pacienteId]);

  const registrar = useMutation({
    mutationFn: (validacionToken: string) =>
      suministrosApi.administrar({
        pacienteId,
        prescripcionId: elegida!.id,
        cantidad: Number(cantidad),
        observaciones,
        validacionToken,
      }),
    onSuccess: (s) => {
      setRegistrado(s);
      setElegida(null);
      setObservaciones('');
      void clienteQuery.invalidateQueries({ queryKey: ['prescripciones', pacienteId] });
      void clienteQuery.invalidateQueries({ queryKey: ['suministros'] });
    },
  });

  const elegir = (p: Prescripcion) => {
    setElegida(p);
    setCantidad(String(p.dosis));
    setRegistrado(null);
    registrar.reset();
  };

  const confirmar = async () => {
    if (!elegida || !paciente.data) return;
    const token = await pedirValidacion(
      `Administración de ${elegida.medicamento.nombre} a ${paciente.data.apellido}, ${paciente.data.nombre}`,
    );
    if (token) registrar.mutate(token);
  };

  const p = paciente.data;
  const cantidadValida = Number(cantidad) > 0;

  return (
    <>
      <EncabezadoPagina
        titulo="Administrar medicamento"
        volverA={pacienteId ? `/pacientes/${pacienteId}?pestana=prescripciones` : '/suministros'}
      />
      <Box sx={{ maxWidth: 520, mb: 2 }}>
        <SelectorPaciente
          valor={pacienteId ? String(pacienteId) : ''}
          alCambiar={(v) => setParametros(v ? { pacienteId: v } : {}, { replace: true })}
        />
      </Box>

      {registrado && (
        <Alerta
          tipo="exito"
          titulo="Administración registrada"
          accion={
            <Boton
              variante="texto"
              onClick={() => navegar(`/pacientes/${pacienteId}?pestana=prescripciones`)}
            >
              Ir a la ficha
            </Boton>
          }
        >
          Se registró {registrado.detalles[0]?.insumo}{' '}
          {formatearDosis(
            registrado.detalles[0]?.cantidad ?? 0,
            registrado.detalles[0]?.unidad ?? '',
          )}{' '}
          a {registrado.paciente.apellido}, {registrado.paciente.nombre}
          {registrado.paciente.cama ? ` (cama ${registrado.paciente.cama})` : ''} a las{' '}
          {conPunto(formatearHora(registrado.fechaHora))}
        </Alerta>
      )}
      {registrar.isError && <Alerta tipo="error">{mensajeDeError(registrar.error)}</Alerta>}

      {p && (
        <>
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            {p.apellido}, {p.nombre} {p.cama ? `· Cama ${p.cama.numero}` : ''}
          </Typography>
          {vigentes.data?.length === 0 && (
            <Alerta tipo="info">
              El paciente no tiene prescripciones vigentes. Los insumos no medicinales se registran
              desde Registrar insumos.
            </Alerta>
          )}
          <Box sx={{ display: 'grid', gap: 1.5, mb: 3 }}>
            {(vigentes.data ?? []).map((x) => (
              <TarjetaPrescripcion
                key={x.id}
                p={x}
                elegida={elegida?.id === x.id}
                alElegir={() => elegir(x)}
              />
            ))}
          </Box>
        </>
      )}

      {elegida && (
        <Paper variant="outlined" sx={{ p: 3, display: 'grid', gap: 2, maxWidth: 640 }}>
          <Box
            sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '200px 1fr' } }}
          >
            <CampoTexto
              etiqueta={`Cantidad (${elegida.unidadDosis})`}
              valor={cantidad}
              alCambiar={setCantidad}
              type="number"
              error={cantidadValida ? undefined : 'La cantidad debe ser mayor a 0'}
              ayuda={`Prescripto: ${formatearDosis(elegida.dosis, elegida.unidadDosis)}`}
              slotProps={{ htmlInput: { inputMode: 'decimal', min: 0, step: 'any' } }}
            />
            <CampoTexto
              etiqueta="Observaciones"
              valor={observaciones}
              alCambiar={setObservaciones}
            />
          </Box>
          <Boton
            startIcon={<FaceRetouchingNaturalIcon />}
            disabled={!cantidadValida}
            cargando={registrar.isPending}
            onClick={() => void confirmar()}
            sx={{ justifySelf: 'start' }}
          >
            Confirmar con mi rostro
          </Boton>
        </Paper>
      )}
      {!elegida && p && (vigentes.data?.length ?? 0) > 0 && (
        <Boton disabled startIcon={<FaceRetouchingNaturalIcon />}>
          Confirmar con mi rostro
        </Boton>
      )}
      {modalValidacion}
    </>
  );
}
