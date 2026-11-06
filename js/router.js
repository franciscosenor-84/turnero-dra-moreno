// Navegación por "#/ruta?parametros" (funciona en cualquier hosting estático).
import { useEffect, useState } from './lib.js';

export function leerRuta() {
  const h = location.hash.replace(/^#/, '') || '/agenda';
  const [camino, consulta = ''] = h.split('?');
  const partes = camino.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(consulta));
  return { partes, query, camino };
}

export function armarRuta(camino, query = {}) {
  const q = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return '#' + camino + (q ? '?' + q : '');
}

export function navegar(camino, query) {
  location.hash = armarRuta(camino, query);
}

export function useRuta() {
  const [ruta, setRuta] = useState(leerRuta());
  useEffect(() => {
    const alCambiar = () => {
      setRuta(leerRuta());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);
  return ruta;
}
