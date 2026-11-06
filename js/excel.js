// Respaldo en Excel: todos los turnos, pacientes, lista de espera y bloqueos, en hojas separadas.
import { estado } from './store.js';
import { backend } from './backend.js';
import { aviso } from './ui.js';
import { hoyISO, hhmm, minutos, deMinutos, nombreDia } from './util.js';

// SheetJS se carga recién cuando se pide el Excel (no demora la apertura de la app).
const FUENTES = [
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs',
];

async function cargarSheetJS() {
  let ultimo;
  for (const url of FUENTES) {
    try {
      return await import(url);
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo;
}

const ESTADOS = { reservado: 'Reservado', atendido: 'Atendido', ausente: 'Ausente', cancelado: 'Cancelado' };
const RESULTADO_ESPERA = { turno: 'Se le dio turno', quitado: 'Se quitó de la lista' };
const BASE_EXCEL = Date.UTC(1899, 11, 30);

const mayuscula = (t) => (t ? t[0].toUpperCase() + t.slice(1) : '');

// Fechas como fecha de Excel (se pueden ordenar y filtrar), no como texto.
function celdaFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { t: 'n', v: (Date.UTC(y, m - 1, d) - BASE_EXCEL) / 86400000, z: 'dd/mm/yyyy' };
}

function celdaFechaHora(marca) {
  if (!marca) return '';
  const f = new Date(marca);
  const local = Date.UTC(f.getFullYear(), f.getMonth(), f.getDate(), f.getHours(), f.getMinutes());
  return { t: 'n', v: (local - BASE_EXCEL) / 86400000, z: 'dd/mm/yyyy hh:mm' };
}

function armarHoja(XLSX, encabezados, filas, anchos) {
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);
  hoja['!cols'] = anchos.map((wch) => ({ wch }));
  if (filas.length) hoja['!autofilter'] = { ref: hoja['!ref'] };
  return hoja;
}

let exportando = false;

export async function exportarExcel() {
  if (exportando) return;
  exportando = true;
  aviso('Preparando el Excel…', { duracion: 2500 });
  try {
    const [XLSX, turnos, espera, bloqueos] = await Promise.all([
      cargarSheetJS(),
      backend.todosLosTurnos(),
      backend.todaLaEspera(),
      backend.listarBloqueos('2000-01-01'),
    ]);
    const pacientes = estado.pacientesPorId;
    const obra = (p) => estado.obrasPorId.get(p?.obra_social_id)?.nombre || '';
    const hoy = hoyISO();

    // Resumen por paciente
    const resumen = new Map();
    for (const t of turnos) {
      const r = resumen.get(t.paciente_id) || { atendidos: 0, ausencias: 0, ultimo: null, proximo: null };
      if (t.estado === 'atendido') {
        r.atendidos++;
        if (!r.ultimo || t.fecha > r.ultimo) r.ultimo = t.fecha;
      }
      if (t.estado === 'ausente') r.ausencias++;
      if (t.estado === 'reservado' && t.fecha >= hoy && (!r.proximo || t.fecha < r.proximo)) r.proximo = t.fecha;
      resumen.set(t.paciente_id, r);
    }

    const filasTurnos = turnos.map((t) => {
      const p = pacientes.get(t.paciente_id);
      return [
        celdaFecha(t.fecha), mayuscula(nombreDia(t.fecha)), hhmm(t.hora), deMinutos(minutos(t.hora) + t.duracion_min),
        p?.apellido_nombre || '', p?.telefono || '', obra(p), p?.nro_afiliado || '',
        t.es_practica ? 'Práctica' : 'Consulta', t.primera_vez ? 'Primera vez' : 'Control', t.sobreturno ? 'Sí' : 'No',
        t.motivo || '', t.observaciones || '', ESTADOS[t.estado] || t.estado,
        t.creado_por || '', t.modificado_por || '', celdaFechaHora(t.creado_en),
      ];
    });

    const filasPacientes = estado.pacientes.map((p) => {
      const r = resumen.get(p.id) || {};
      return [
        p.apellido_nombre, p.telefono, p.sin_email ? 'No tiene' : p.email || '', obra(p), p.nro_afiliado || '', p.plan || '',
        p.dni || '', p.observaciones || '', r.atendidos || 0, r.ausencias || 0, celdaFecha(r.ultimo), celdaFecha(r.proximo),
        celdaFecha(p.creado_en),
      ];
    });

    const filasEspera = espera.map((e) => {
      const p = pacientes.get(e.paciente_id);
      return [
        celdaFechaHora(e.anotado_en), p?.apellido_nombre || '', p?.telefono || '', obra(p), e.preferencia || '',
        e.anotado_por || '', e.resuelto_en ? RESULTADO_ESPERA[e.resultado] || 'Resuelto' : 'En espera', celdaFechaHora(e.resuelto_en),
      ];
    });

    const filasBloqueos = bloqueos.map((b) => [
      celdaFecha(b.fecha), mayuscula(nombreDia(b.fecha)), b.hora ? hhmm(b.hora) : 'Todo el día', b.motivo || '', b.creado_por || '',
    ]);

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, armarHoja(XLSX,
      ['Fecha', 'Día', 'Hora', 'Hasta', 'Paciente', 'Teléfono', 'Obra social', 'N° afiliado', 'Tipo', 'Primera vez / Control',
        'Sobreturno', 'Motivo', 'Observaciones', 'Estado', 'Lo cargó', 'Último cambio', 'Cargado el'],
      filasTurnos, [11, 10, 7, 7, 26, 16, 22, 14, 10, 14, 11, 28, 28, 11, 12, 13, 16]), 'Turnos');
    XLSX.utils.book_append_sheet(libro, armarHoja(XLSX,
      ['Apellido y nombre', 'Teléfono', 'Email', 'Obra social', 'N° afiliado', 'Plan', 'DNI', 'Observaciones',
        'Atendido (veces)', 'Ausencias', 'Último atendido', 'Próximo turno', 'Paciente desde'],
      filasPacientes, [28, 16, 28, 22, 14, 10, 12, 30, 10, 10, 13, 13, 13]), 'Pacientes');
    XLSX.utils.book_append_sheet(libro, armarHoja(XLSX,
      ['Anotado el', 'Paciente', 'Teléfono', 'Obra social', 'Preferencia', 'Lo anotó', 'Situación', 'Resuelto el'],
      filasEspera, [16, 28, 16, 22, 22, 12, 20, 16]), 'Lista de espera');
    XLSX.utils.book_append_sheet(libro, armarHoja(XLSX,
      ['Fecha', 'Día', 'Horario', 'Motivo', 'Lo cargó'],
      filasBloqueos, [11, 10, 12, 30, 12]), 'Bloqueos');
    libro.Props = { Title: 'Respaldo del turnero', Author: estado.config?.profesional || 'Turnero' };

    XLSX.writeFile(libro, `turnero-respaldo-${hoy}.xlsx`, { compression: true });
    aviso(`Excel descargado: ${turnos.length} turnos y ${estado.pacientes.length} pacientes.`);
  } catch (e) {
    console.error(e);
    aviso('No se pudo armar el Excel. Revisá la conexión e intentá de nuevo.', { tipo: 'error', duracion: 7000 });
  } finally {
    exportando = false;
  }
}
