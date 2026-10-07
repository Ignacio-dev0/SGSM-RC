import { useQuery } from '@tanstack/react-query';
import { api } from './cliente';
import type { Cama, HistorialPaciente, Paciente, Sala, Sexo } from './tipos';

export interface DatosPaciente {
  dni: string;
  nombre: string;
  apellido: string;
  fechaNacimiento: string;
  sexo: Sexo | '';
  obraSocial: string;
  numeroAfiliado: string;
  diagnostico: string;
  contactoEmergenciaNombre: string;
  contactoEmergenciaTelefono: string;
  observaciones: string;
}

export interface FiltrosPacientes {
  texto?: string;
  salaId?: string;
  estado?: string;
  pagina?: number;
}

export const pacientesApi = {
  buscar: (f: FiltrosPacientes) => api.lista<Paciente>('/api/pacientes', { ...f }),
  obtener: (id: number) => api.get<Paciente>(`/api/pacientes/${id}`),
  crear: (d: DatosPaciente & { camaId: number }) => api.post<Paciente>('/api/pacientes', d),
  modificar: (id: number, d: Partial<DatosPaciente>) =>
    api.patch<Paciente>(`/api/pacientes/${id}`, d),
  reingresar: (id: number, d: Partial<DatosPaciente> & { camaId: number }) =>
    api.post<Paciente>(`/api/pacientes/${id}/reingresar`, d),
  trasladar: (id: number, camaId: number) =>
    api.post<Paciente>(`/api/pacientes/${id}/trasladar`, { camaId }),
  egresar: (id: number, d: { motivo: string; fechaEgreso?: string }) =>
    api.post<Paciente>(`/api/pacientes/${id}/egresar`, d),
  historial: (id: number, rango: { desde?: string; hasta?: string }) =>
    api.get<HistorialPaciente>(`/api/pacientes/${id}/historial`, rango),
};

export const useCamasLibres = (habilitado = true) =>
  useQuery({
    queryKey: ['camas', 'libres'],
    queryFn: () => api.get<Cama[]>('/api/camas', { estado: 'libre' }),
    enabled: habilitado,
  });

export const useSalas = () =>
  useQuery({ queryKey: ['salas'], queryFn: () => api.get<Sala[]>('/api/salas') });

export const usePaciente = (id: number) =>
  useQuery({ queryKey: ['paciente', id], queryFn: () => pacientesApi.obtener(id) });
