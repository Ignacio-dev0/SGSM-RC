import type { ReactNode } from 'react';
import { ContextoMotor, type MotorFacial } from './motor';
import { motorFaceApi } from './motorFaceApi';

/** Permite reemplazar el motor (las pruebas usan uno falso). */
export function ProveedorBiometria({
  motor,
  children,
}: {
  motor?: MotorFacial;
  children: ReactNode;
}) {
  return <ContextoMotor.Provider value={motor ?? motorFaceApi}>{children}</ContextoMotor.Provider>;
}
