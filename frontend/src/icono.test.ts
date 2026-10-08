// Ícono propio y manifest para el acceso directo en la tablet (F19).
import indice from '../index.html?raw';
import manifestTexto from '../public/manifest.webmanifest?raw';
import iconoSvg from '../public/icono.svg?raw';
import nginx from '../nginx.conf?raw';
import { tema } from './tema';

/** Los archivos de public/ (solo los nombres: no se cargan). */
const PUBLICOS = Object.keys(import.meta.glob('../public/*.{svg,png,webmanifest}')).map((r) =>
  r.replace('../public', ''),
);

/** El color principal del tema claro (el de la barra superior de día). */
const PRIMARIO = (
  tema as unknown as { colorSchemes: { light: { palette: { primary: { main: string } } } } }
).colorSchemes.light.palette.primary.main;

interface Manifest {
  name: string;
  short_name: string;
  display: string;
  start_url: string;
  theme_color: string;
  background_color: string;
  lang: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
}

const manifest = JSON.parse(manifestTexto) as Manifest;
const html = new DOMParser().parseFromString(indice, 'text/html');

describe('ícono y manifest (F19)', () => {
  it('index.html enlaza el ícono SVG, el de iOS y el manifest', () => {
    // El documento leído no es el de la prueba: se miran los atributos (no los matchers del DOM).
    const destino = (rel: string) => html.querySelector(`link[rel="${rel}"]`)?.getAttribute('href');
    expect(destino('icon')).toBe('/icono.svg');
    expect(html.querySelector('link[rel="icon"]')?.getAttribute('type')).toBe('image/svg+xml');
    expect(destino('apple-touch-icon')).toBe('/apple-touch-icon.png');
    expect(destino('manifest')).toBe('/manifest.webmanifest');
    for (const rel of ['icon', 'apple-touch-icon', 'manifest']) {
      expect(PUBLICOS).toContain(destino(rel));
    }
  });

  it('el manifest nombra el sistema, abre como app y usa el color del tema', () => {
    expect(manifest).toMatchObject({
      name: 'SGSM-RC · Hospital El Dique',
      short_name: 'SGSM-RC',
      display: 'standalone',
      start_url: '/',
      lang: 'es',
      theme_color: PRIMARIO,
    });
    expect(html.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(PRIMARIO);
  });

  it('trae el SVG y los PNG de 192 y 512 (uno para el recorte de Android), y existen', () => {
    const tamanos = manifest.icons.map((i) => `${i.sizes} ${i.purpose ?? 'any'}`);
    expect(tamanos).toEqual(
      expect.arrayContaining(['any any', '192x192 any', '512x512 any', '512x512 maskable']),
    );
    for (const i of manifest.icons) expect(PUBLICOS).toContain(i.src);
  });

  it('el ícono es una cruz blanca sobre el color principal del tema', () => {
    expect(iconoSvg).toContain(`fill="${PRIMARIO}"`);
    expect(iconoSvg).toContain('fill="#ffffff"');
  });
});

describe('el manifest en el despliegue (nginx)', () => {
  it('se sirve como application/manifest+json: la imagen de nginx no conoce .webmanifest', () => {
    // Sin esto sale como application/octet-stream (con nosniff) y el navegador no lo usa.
    const bloque = /location = \/manifest\.webmanifest \{([^}]*)\}/.exec(nginx)?.[1] ?? '';
    expect(bloque).toMatch(/default_type application\/manifest\+json;/);
    // Con los mismos encabezados de seguridad que el resto de la interfaz.
    expect(bloque).toContain('include /etc/nginx/snippets/seguridad.conf;');
  });
});
