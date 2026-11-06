// Opciones que se usan poco: van en el menú de los tres puntitos.
import { navegar } from './router.js';
import { exportarExcel } from './excel.js';

export function itemsMenu(fechaReferencia) {
  return [
    { icono: 'imprimir', texto: 'Imprimir planilla del día', accion: () => navegar('/planilla/' + fechaReferencia) },
    { icono: 'descargar', texto: 'Exportar todo a Excel', accion: () => exportarExcel() },
    { icono: 'candado', texto: 'Bloquear un día u horario', accion: () => navegar('/ajustes', { seccion: 'bloqueos' }) },
    { icono: 'ajustes', texto: 'Ajustes', accion: () => navegar('/ajustes') },
  ];
}
