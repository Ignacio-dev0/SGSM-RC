import type { WheelEvent } from 'react';

/**
 * La rueda del mouse no tiene que cambiar el valor de un campo numérico (UX-19): quien recorre
 * la pantalla con la rueda y pasa por encima de una dosis enfocada la modificaría sin darse
 * cuenta. Al girar la rueda el campo suelta el foco, y el navegador ya no le cambia el valor.
 *
 * Se pasa en `slotProps.htmlInput` de los campos `type="number"`:
 *
 *   slotProps={{ htmlInput: { inputMode: 'decimal', onWheel: soltarAlGirarLaRueda } }}
 */
export const soltarAlGirarLaRueda = (e: WheelEvent<HTMLInputElement>) => e.currentTarget.blur();
