/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `camara` (por defecto) o `simulado` para demostraciones sin cámara. Ver docs/biometria.md. */
  readonly VITE_BIOMETRIA_MODO?: 'camara' | 'simulado';
}
