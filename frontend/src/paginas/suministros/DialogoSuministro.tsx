import { useEffect, useState, type ReactNode } from 'react';
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mensajeDeError } from '../../api/cliente';
import { suministrosApi } from '../../api/suministros';
import type { Suministro } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { useValidacionFacial } from '../../biometria/useValidacionFacial';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { formatearFechaHora } from '../../utilidades/formato';
import { formatearDosis } from '../prescripciones/etiquetas';
import { detalleDe } from './formato';
import { ListaCantidades, type ItemCantidad } from './comunes';

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

/**
 * Detalle de un suministro (T415) con su corrección (T416 · CU23): dentro de las 24 horas,
 * con motivo obligatorio y confirmación con la cara.
 */
export function DialogoSuministro({
  inicial,
  alCerrar,
}: {
  inicial: Suministro;
  alCerrar: () => void;
}) {
  const { tienePermiso } = useSesion();
  const clienteQuery = useQueryClient();
  const { pedirValidacion, modalValidacion } = useValidacionFacial();
  const [s, setS] = useState(inicial);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [cantidad, setCantidad] = useState('');
  const [items, setItems] = useState<ItemCantidad[]>([]);
  const [motivo, setMotivo] = useState('');

  useEffect(() => setS(inicial), [inicial]);

  const empezarCorreccion = () => {
    setCantidad(String(s.detalles[0]?.cantidad ?? ''));
    setItems(
      s.detalles.map((d) => ({
        insumoId: d.insumoId,
        nombre: d.insumo,
        unidad: d.unidad,
        cantidad: d.cantidad,
      })),
    );
    setMotivo('');
    setCorrigiendo(true);
  };

  const corregir = useMutation({
    mutationFn: (validacionToken: string) =>
      suministrosApi.corregir(s.id, {
        ...(s.tipo === 'MEDICAMENTO'
          ? { cantidad: Number(cantidad) }
          : { items: items.map(({ insumoId, cantidad: c }) => ({ insumoId, cantidad: c })) }),
        motivo: motivo.trim(),
        validacionToken,
      }),
    onSuccess: (nuevo) => {
      setS(nuevo);
      setCorrigiendo(false);
      void clienteQuery.invalidateQueries({ queryKey: ['suministros'] });
    },
  });

  const confirmar = async () => {
    const token = await pedirValidacion(
      `Corrección del suministro de ${s.paciente.apellido}, ${s.paciente.nombre}`,
    );
    if (token) corregir.mutate(token);
  };

  const enPlazo = new Date(s.corregibleHasta) > new Date();
  const puedeCorregir = tienePermiso('suministros.corregir') && enPlazo;
  const valida =
    motivo.trim().length >= 3 &&
    (s.tipo === 'MEDICAMENTO' ? Number(cantidad) > 0 : items.length > 0);

  return (
    <Dialog open onClose={alCerrar} fullWidth maxWidth="md" aria-labelledby="titulo-suministro">
      <DialogTitle id="titulo-suministro">
        Suministro del {formatearFechaHora(s.fechaHora)}
      </DialogTitle>
      <DialogContent>
        {corregir.isError && <Alerta tipo="error">{mensajeDeError(corregir.error)}</Alerta>}
        {s.corregido && (
          <Alerta tipo="info">
            Corregido por {s.corregidoPor} el {formatearFechaHora(s.corregidoEn)}. Motivo:{' '}
            {s.motivoCorreccion}
          </Alerta>
        )}
        <Box
          sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mb: 2 }}
        >
          <Dato etiqueta="Paciente">
            {s.paciente.apellido}, {s.paciente.nombre} · DNI {s.paciente.dni}
            {s.paciente.cama ? ` · Cama ${s.paciente.cama}` : ''}
          </Dato>
          <Dato etiqueta="Registró">
            {s.usuario.nombre} {s.validadoBiometricamente ? '(validado con el rostro)' : ''}
          </Dato>
          <Dato etiqueta="Tipo">
            {s.tipo === 'MEDICAMENTO' ? 'Administración de medicamento' : 'Insumos'}
          </Dato>
          {s.prescripcion && (
            <Dato etiqueta="Prescripción">
              {s.prescripcion.medicamento}{' '}
              {formatearDosis(s.prescripcion.dosis, s.prescripcion.unidadDosis)} cada{' '}
              {s.prescripcion.frecuenciaHoras} h · toma de las{' '}
              {formatearFechaHora(s.tomaProgramada)}
            </Dato>
          )}
          <Dato etiqueta="Detalle">{detalleDe(s)}</Dato>
          <Dato etiqueta="Observaciones">{s.observaciones}</Dato>
        </Box>

        {corrigiendo ? (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Typography variant="h6" component="h3">
              Corrección
            </Typography>
            {s.tipo === 'MEDICAMENTO' ? (
              <CampoTexto
                etiqueta={`Cantidad (${s.detalles[0]?.unidad ?? ''})`}
                valor={cantidad}
                alCambiar={setCantidad}
                type="number"
                sx={{ maxWidth: 240 }}
              />
            ) : (
              <ListaCantidades titulo="Insumos corregidos" items={items} alCambiar={setItems} />
            )}
            <CampoTexto
              etiqueta="Motivo de la corrección"
              valor={motivo}
              alCambiar={setMotivo}
              required
              multiline
              minRows={2}
            />
          </Box>
        ) : (
          !puedeCorregir &&
          !enPlazo && (
            <Typography color="text.secondary">
              El plazo de corrección venció (24 h desde el registro). Si hay un error, pídale la
              corrección al administrador.
            </Typography>
          )
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        {corrigiendo ? (
          <>
            <Boton variante="texto" onClick={() => setCorrigiendo(false)}>
              Cancelar
            </Boton>
            <Boton
              startIcon={<FaceRetouchingNaturalIcon />}
              disabled={!valida}
              cargando={corregir.isPending}
              onClick={() => void confirmar()}
            >
              Confirmar corrección con mi rostro
            </Boton>
          </>
        ) : (
          <>
            {puedeCorregir && (
              <Boton variante="secundario" onClick={empezarCorreccion}>
                Corregir
              </Boton>
            )}
            <Boton onClick={alCerrar}>Cerrar</Boton>
          </>
        )}
      </DialogActions>
      {modalValidacion}
    </Dialog>
  );
}
