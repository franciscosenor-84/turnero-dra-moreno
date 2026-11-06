// Estado compartido de la app: datos cargados de la base + cambios en vivo.
import { useEffect, useReducer } from './lib.js';
import { backend } from './backend.js';
import { hoyISO, sumarDias, hhmm, minutos, horariosDelDia, fechasDeAtencion, ahoraHHMM } from './util.js';

const CLAVE_QUIEN = 'turnero.quien';
const DIAS_HACIA_ATRAS = 70; // turnos del pasado que se mantienen cargados

function leerQuien() {
  try {
    return localStorage.getItem(CLAVE_QUIEN) || '';
  } catch {
    return '';
  }
}

export const estado = {
  cargando: true,
  error: null,
  config: null,
  obras: [],
  obrasPorId: new Map(),
  pacientes: [],
  pacientesPorId: new Map(),
  turnos: [],
  turnosDesde: null,
  espera: [],
  bloqueos: [],
  feriados: [],
  feriadosPorFecha: new Map(),
  quien: leerQuien(),
  version: 0,
};

const oyentes = new Set();

function avisar() {
  estado.version++;
  for (const f of oyentes) f();
}

export function useStore() {
  const [, forzar] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    oyentes.add(forzar);
    return () => oyentes.delete(forzar);
  }, []);
  return estado;
}

// ---------- Índices ----------

function ordenarPacientes() {
  estado.pacientes.sort((a, b) => a.apellido_nombre.localeCompare(b.apellido_nombre, 'es'));
  estado.pacientesPorId = new Map(estado.pacientes.map((p) => [p.id, p]));
}

function ordenarTurnos() {
  estado.turnos.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
}

function indexarObras() {
  estado.obras.sort((a, b) => {
    if (a.es_particular !== b.es_particular) return a.es_particular ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
  estado.obrasPorId = new Map(estado.obras.map((o) => [o.id, o]));
}

function indexarFeriados() {
  estado.feriados.sort((a, b) => a.fecha.localeCompare(b.fecha));
  estado.feriadosPorFecha = new Map(estado.feriados.map((f) => [f.fecha, f]));
}

function ordenarBloqueos() {
  estado.bloqueos.sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
}

// ---------- Carga ----------

// Cada cambio aplicado (propio o que llega en vivo) suma 1. Si hubo cambios mientras se recargaba todo,
// lo recargado puede estar viejo: se vuelve a pedir en lugar de pisar lo nuevo.
let generacion = 0;

async function recargarTodo(intento = 0) {
  const gen = generacion;
  const porDefecto = sumarDias(hoyISO(), -DIAS_HACIA_ATRAS);
  // Si ya se habían traído turnos más viejos (agenda mirando meses atrás), se mantienen.
  const desde = estado.turnosDesde && estado.turnosDesde < porDefecto ? estado.turnosDesde : porDefecto;
  const [config, obras, pacientes, turnos, espera, bloqueos, feriados] = await Promise.all([
    backend.cargarConfiguracion(),
    backend.listarObrasSociales(),
    backend.listarPacientes(),
    backend.listarTurnos(desde),
    backend.listarEspera(),
    backend.listarBloqueos('2000-01-01'), // son pocos: se traen todos
    backend.listarFeriados(),
  ]);
  if (gen !== generacion && intento < 3) return recargarTodo(intento + 1);
  Object.assign(estado, { config, obras, pacientes, turnos, espera, bloqueos, feriados, turnosDesde: desde });
  indexarObras();
  ordenarPacientes();
  ordenarTurnos();
  indexarFeriados();
  ordenarBloqueos();
}

let ultimaRecarga = 0;
let iniciado = false;
let suscripto = false;

// Se llama después de entrar con la clave. Si ya se había iniciado (por ejemplo, se volvió a entrar), recarga.
export async function iniciar() {
  estado.cargando = true;
  estado.error = null;
  avisar();
  try {
    if (!suscripto) {
      await backend.suscribir(aplicarCambio, () => refrescar());
      suscripto = true;
    }
    await recargarTodo();
    ultimaRecarga = Date.now();
  } catch (e) {
    console.error(e);
    estado.error = e;
  }
  estado.cargando = false;
  avisar();
  if (iniciado) return;
  iniciado = true;

  // Al volver a la app (celular que estuvo bloqueado, otra pestaña), se actualiza todo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - ultimaRecarga > 20000) refrescar();
  });
  window.addEventListener('online', () => refrescar());

  // Red de seguridad: si los cambios en vivo no llegan (la conexión se corta a las 24 h, wifi inestable),
  // se recarga todo cada tanto mientras la app está a la vista.
  setInterval(() => {
    if (document.visibilityState !== 'visible' || !estado.config) return;
    const cada = backend.enVivo() ? 30 * 60 * 1000 : 2 * 60 * 1000;
    if (Date.now() - ultimaRecarga > cada) refrescar();
  }, 60 * 1000);
}

let recargando = null;

export function refrescar() {
  // Si ya hay una recarga en marcha, se espera esa en lugar de pedir todo dos veces.
  if (recargando) return recargando;
  recargando = (async () => {
    try {
      await recargarTodo();
      ultimaRecarga = Date.now();
      estado.error = null;
    } catch (e) {
      console.error(e);
    } finally {
      recargando = null;
    }
    avisar();
  })();
  return recargando;
}

// Trae turnos más viejos si la agenda navega hacia atrás.
export async function asegurarTurnosDesde(fecha) {
  if (!estado.turnosDesde || fecha >= estado.turnosDesde) return;
  const nuevos = await backend.listarTurnosEntre(fecha, sumarDias(estado.turnosDesde, -1));
  const ids = new Set(estado.turnos.map((t) => t.id));
  estado.turnos.push(...nuevos.filter((t) => !ids.has(t.id)));
  estado.turnosDesde = fecha;
  ordenarTurnos();
  avisar();
}

// ---------- Cambios en vivo ----------

function reemplazar(lista, fila, clave = 'id') {
  const i = lista.findIndex((x) => x[clave] === fila[clave]);
  if (i >= 0) lista[i] = fila;
  else lista.push(fila);
}

function quitar(lista, valor, clave = 'id') {
  const i = lista.findIndex((x) => x[clave] === valor);
  if (i >= 0) lista.splice(i, 1);
}

function aplicarCambio(tabla, tipo, nueva, vieja) {
  generacion++;
  const borrado = tipo === 'DELETE';
  switch (tabla) {
    case 'configuracion':
      if (!borrado) estado.config = nueva;
      break;
    case 'obras_sociales':
      borrado ? quitar(estado.obras, vieja.id) : reemplazar(estado.obras, nueva);
      indexarObras();
      break;
    case 'pacientes':
      borrado ? quitar(estado.pacientes, vieja.id) : reemplazar(estado.pacientes, nueva);
      ordenarPacientes();
      break;
    case 'turnos':
      if (borrado) quitar(estado.turnos, vieja.id);
      else if (!estado.turnosDesde || nueva.fecha >= estado.turnosDesde) reemplazar(estado.turnos, nueva);
      ordenarTurnos();
      break;
    case 'lista_espera':
      if (borrado) quitar(estado.espera, vieja.id);
      else if (nueva.resuelto_en) quitar(estado.espera, nueva.id);
      else reemplazar(estado.espera, nueva);
      estado.espera.sort((a, b) => a.anotado_en.localeCompare(b.anotado_en));
      break;
    case 'bloqueos':
      borrado ? quitar(estado.bloqueos, vieja.id) : reemplazar(estado.bloqueos, nueva);
      ordenarBloqueos();
      break;
    case 'feriados':
      borrado ? quitar(estado.feriados, vieja.fecha, 'fecha') : reemplazar(estado.feriados, nueva, 'fecha');
      indexarFeriados();
      break;
  }
  avisar();
}

// ---------- Acciones (escriben en la base y actualizan la pantalla al instante) ----------

export function setQuien(nombre) {
  estado.quien = nombre;
  try {
    localStorage.setItem(CLAVE_QUIEN, nombre);
  } catch {
    /* sin almacenamiento local: se pregunta de nuevo la próxima vez */
  }
  avisar();
}

export const acciones = {
  async crearPaciente(datos) {
    const p = await backend.crearPaciente({ ...datos, creado_por: estado.quien || null });
    aplicarCambio('pacientes', 'INSERT', p);
    return p;
  },
  async actualizarPaciente(id, cambios) {
    const p = await backend.actualizarPaciente(id, cambios);
    aplicarCambio('pacientes', 'UPDATE', p);
    return p;
  },
  async crearTurno(datos) {
    const t = await backend.crearTurno({ ...datos, creado_por: estado.quien || null, modificado_por: estado.quien || null });
    aplicarCambio('turnos', 'INSERT', t);
    return t;
  },
  async actualizarTurno(id, cambios) {
    const t = await backend.actualizarTurno(id, { ...cambios, modificado_por: estado.quien || null });
    aplicarCambio('turnos', 'UPDATE', t);
    return t;
  },
  async crearEspera(datos) {
    const e = await backend.crearEspera({ ...datos, anotado_por: estado.quien || null });
    aplicarCambio('lista_espera', 'INSERT', e);
    return e;
  },
  async resolverEspera(id, resultado) {
    const e = await backend.resolverEspera(id, resultado);
    aplicarCambio('lista_espera', 'UPDATE', e);
  },
  async resolverEsperaDePaciente(pacienteId) {
    const filas = await backend.resolverEsperaDePaciente(pacienteId);
    for (const e of filas) aplicarCambio('lista_espera', 'UPDATE', e);
  },
  async crearBloqueo(datos) {
    const b = await backend.crearBloqueo({ ...datos, creado_por: estado.quien || null });
    aplicarCambio('bloqueos', 'INSERT', b);
    return b;
  },
  async borrarBloqueo(id) {
    await backend.borrarBloqueo(id);
    aplicarCambio('bloqueos', 'DELETE', null, { id });
  },
  async crearFeriado(datos) {
    const f = await backend.crearFeriado(datos);
    aplicarCambio('feriados', 'INSERT', f);
  },
  async borrarFeriado(fecha) {
    await backend.borrarFeriado(fecha);
    aplicarCambio('feriados', 'DELETE', null, { fecha });
  },
  async crearObraSocial(nombre) {
    const o = await backend.crearObraSocial(nombre);
    aplicarCambio('obras_sociales', 'INSERT', o);
    return o;
  },
  async actualizarObraSocial(id, cambios) {
    const o = await backend.actualizarObraSocial(id, cambios);
    aplicarCambio('obras_sociales', 'UPDATE', o);
  },
  async guardarConfiguracion(cambios) {
    const c = await backend.guardarConfiguracion(cambios);
    aplicarCambio('configuracion', 'UPDATE', c);
  },
};

// ---------- Cálculos de agenda ----------

export function nombreObraSocial(paciente) {
  return estado.obrasPorId.get(paciente?.obra_social_id)?.nombre || '';
}

export function esParticular(paciente) {
  return !!estado.obrasPorId.get(paciente?.obra_social_id)?.es_particular;
}

export function esperaActivaDe(pacienteId) {
  return estado.espera.find((e) => e.paciente_id === pacienteId) || null;
}

// Arma el día completo: horarios con su turno, sobreturnos, bloqueos y cancelaciones.
// "excluir" deja afuera un turno (el que se está reprogramando).
export function armarDia(fecha, { excluir = null } = {}) {
  const { config } = estado;
  const feriado = estado.feriadosPorFecha.get(fecha) || null;
  const bloqueoDia = estado.bloqueos.find((b) => b.fecha === fecha && !b.hora) || null;
  const cerrado = (feriado && feriado.tipo === 'feriado') || !!bloqueoDia;
  const delDia = estado.turnos.filter((t) => t.fecha === fecha && t.id !== excluir);
  const activos = delDia.filter((t) => t.estado !== 'cancelado');

  const horas = new Set(horariosDelDia(config));
  for (const t of activos) horas.add(hhmm(t.hora));
  const lista = [...horas].sort();

  const hoy = hoyISO();
  const ahora = ahoraHHMM();
  const pasado = fecha < hoy;

  const filas = lista.map((hora) => {
    const m = minutos(hora);
    const principal = activos.find((t) => !t.sobreturno && minutos(t.hora) === m) || null;
    const cubiertoPor = principal
      ? null
      : activos.find((t) => !t.sobreturno && minutos(t.hora) < m && minutos(t.hora) + t.duracion_min > m) || null;
    const sobreturnos = activos.filter((t) => t.sobreturno && minutos(t.hora) === m);
    const bloqueo = estado.bloqueos.find((b) => b.fecha === fecha && b.hora && hhmm(b.hora) === hora) || null;
    const cancelados = delDia.filter((t) => t.estado === 'cancelado' && minutos(t.hora) === m);
    const libre = !principal && !cubiertoPor && !bloqueo && !cerrado;
    const yaPaso = pasado || (fecha === hoy && minutos(hora) + config.duracion_min <= minutos(ahora));
    return { hora, principal, cubiertoPor, sobreturnos, bloqueo, cancelados, libre, yaPaso };
  });

  const libres = filas.filter((f) => f.libre && !f.yaPaso).length;
  const pacientes = activos.length;
  return { fecha, feriado, bloqueoDia, cerrado, filas, libres, pacientes, pasado };
}

// ¿Este turno está ocurriendo ahora?
export function esAhora(turno) {
  if (turno.fecha !== hoyISO()) return false;
  const m = minutos(ahoraHHMM());
  return m >= minutos(turno.hora) && m < minutos(turno.hora) + turno.duracion_min;
}

// Próximas fechas de atención (según el día configurado), a partir de hoy.
export function proximasFechas(cantidad, desde = hoyISO()) {
  return fechasDeAtencion(desde, estado.config.dia_semana, cantidad);
}

// Primer horario libre desde ahora (en las próximas semanas).
export function proximoLibre(semanas = 26) {
  for (const fecha of proximasFechas(semanas)) {
    const dia = armarDia(fecha);
    if (dia.cerrado) continue;
    const fila = dia.filas.find((f) => f.libre && !f.yaPaso);
    if (fila) return { fecha, hora: fila.hora };
  }
  return null;
}

// Horarios que quedaron libres por una cancelación (desde ahora en adelante).
export function horariosLiberados(semanas = 8) {
  const lista = [];
  for (const fecha of proximasFechas(semanas)) {
    const dia = armarDia(fecha);
    if (dia.cerrado) continue;
    for (const f of dia.filas) {
      if (f.libre && !f.yaPaso && f.cancelados.length) lista.push({ fecha, hora: f.hora, cancelado: f.cancelados[f.cancelados.length - 1] });
    }
  }
  return lista;
}
