import { leerPaginacion, respuestaPaginada } from './paginacion';
import { ErrorApi } from './errores';

describe('paginación', () => {
  it('usa página 1 y 20 por página si no se indica', () => {
    expect(leerPaginacion({})).toEqual({ pagina: 1, porPagina: 20, skip: 0, take: 20 });
  });

  it('convierte los parámetros de la query y calcula el desplazamiento', () => {
    expect(leerPaginacion({ pagina: '3', porPagina: '10' })).toEqual({
      pagina: 3,
      porPagina: 10,
      skip: 20,
      take: 10,
    });
  });

  it('rechaza valores fuera de rango', () => {
    expect(() => leerPaginacion({ pagina: '0' })).toThrow(ErrorApi);
    expect(() => leerPaginacion({ porPagina: '101' })).toThrow(ErrorApi);
  });

  it('arma la respuesta con los metadatos', () => {
    expect(respuestaPaginada(['a', 'b'], 45, { pagina: 2, porPagina: 20 })).toEqual({
      data: ['a', 'b'],
      meta: { pagina: 2, porPagina: 20, total: 45, totalPaginas: 3 },
    });
  });
});
