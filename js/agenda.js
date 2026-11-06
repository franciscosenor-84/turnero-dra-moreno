// Agenda: grilla de varios lunes en la computadora (opción B) y lista para tildar en el celular (opción C).
import { html, useState, useEffect } from './lib.js';
import {
  estado, useStore, acciones, armarDia, esAhora, proximasFechas, proximoLibre,
  nombreObraSocial, asegurarTurnosDesde,
} from './store.js';
import { Icono, MenuMas, Modal, aviso, avisoError, confirmar, navegar, armarRuta } from './ui.js';
import { itemsMenu } from './menu.js';
import {
  fechaCorta, fechaLarga, hhmm, minutos, deMinutos, sumarDias, hoyISO, diaMes, nombreAbreviado,
  linkWhatsApp, completarMensaje, datosMensaje, fechasDeAtencion, pluralizar, ahoraHHMM, nombreDia,
} from './util.js';

export const NOMBRE_ESTADO = { reservado: 'Reservado', atendido: 'Atendido', ausente: 'Ausente', cancelado: 'Cancelado' };
const PLURAL_DIA = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábados', 7: 'domingos' };

export function tipoTurno(t) {
  if (t.es_practica) return `Práctica · ${t.duracion_min} min`;
  return t.primera_vez ? 'Primera vez' : 'Control';
}

export function finTurno(t) {
  return deMinutos(minutos(t.hora) + t.duracion_min);
}

export function linkRecordatorio(turno) {
  const p = estado.pacientesPorId.get(turno.paciente_id);
  const mensaje = completarMensaje(estado.config.mensaje_recordatorio, datosMensaje(estado.config, p, turno.fecha, turno.hora));
  return linkWhatsApp(p?.telefono, mensaje);
}

export async function marcarEstado(turno, nuevo) {
  const anterior = turno.estado;
  try {
    await acciones.actualizarTurno(turno.id, { estado: nuevo });
    const p = estado.pacientesPorId.get(turno.paciente_id);
    aviso(`${nombreAbreviado(p?.apellido_nombre)}: ${NOMBRE_ESTADO[nuevo].toLowerCase()}`, {
      textoAccion: 'Deshacer',
      accion: () => acciones.actualizarTurno(turno.id, { estado: anterior }).catch((e) => avisoError(e)),
    });
  } catch (e) {
    avisoError(e);
  }
}

// Cuando se libera un horario (cancelación o reprogramación) y había sobreturnos en ese rango,
// el primero pasa a ocupar el horario como turno común. Devuelve los turnos que cambiaron.
export async function promoverSobreturnos(liberado) {
  if (liberado.sobreturno) return [];
  const ini = minutos(liberado.hora);
  const fin = ini + liberado.duracion_min;
  const candidatos = estado.turnos
    .filter((t) => t.fecha === liberado.fecha && t.sobreturno && t.estado !== 'cancelado' && t.id !== liberado.id
      && minutos(t.hora) >= ini && minutos(t.hora) < fin)
    .sort((a, b) => (hhmm(a.hora) + a.creado_en).localeCompare(hhmm(b.hora) + b.creado_en));
  const promovidos = [];
  for (const c of candidatos) {
    const cIni = minutos(c.hora);
    const cFin = cIni + c.duracion_min;
    const choca = estado.turnos.some((t) => t.fecha === c.fecha && t.id !== c.id && t.id !== liberado.id && !t.sobreturno
      && t.estado !== 'cancelado' && minutos(t.hora) < cFin && cIni < minutos(t.hora) + t.duracion_min);
    if (choca) continue;
    try {
      promovidos.push(await acciones.actualizarTurno(c.id, { sobreturno: false }));
    } catch (e) {
      console.warn('No se pudo pasar el sobreturno a turno común', e);
    }
  }
  return promovidos;
}

export async function cancelarTurno(turno) {
  const p = estado.pacientesPorId.get(turno.paciente_id);
  const ok = await confirmar({
    titulo: '¿Cancelar este turno?',
    mensaje: `${p?.apellido_nombre} · ${fechaLarga(turno.fecha)} a las ${hhmm(turno.hora)}. El horario queda libre y el turno sigue figurando en su historial.`,
    textoSi: 'Cancelar turno',
    textoNo: 'Volver',
    peligro: true,
  });
  if (!ok) return false;
  try {
    await acciones.actualizarTurno(turno.id, { estado: 'cancelado' });
  } catch (e) {
    avisoError(e);
    return false;
  }
  const promovidos = await promoverSobreturnos(turno);
  const n = estado.espera.length;
  if (promovidos.length) {
    const pp = estado.pacientesPorId.get(promovidos[0].paciente_id);
    aviso(`Turno cancelado. ${nombreAbreviado(pp?.apellido_nombre)} (sobreturno) pasa a ocupar las ${hhmm(promovidos[0].hora)}.`, { duracion: 7000 });
  } else if (n) {
    aviso(`Turno cancelado. Hay ${pluralizar(n, 'paciente', 'pacientes')} en lista de espera.`, { textoAccion: 'Ver lista', accion: () => navegar('/espera'), duracion: 7000 });
  } else {
    aviso('Turno cancelado. El horario quedó libre.');
  }
  return true;
}

async function desbloquear(bloqueo) {
  const ok = await confirmar({
    titulo: bloqueo.hora ? `¿Desbloquear las ${hhmm(bloqueo.hora)}?` : '¿Desbloquear el día?',
    mensaje: `${fechaLarga(bloqueo.fecha)}${bloqueo.motivo ? ' · ' + bloqueo.motivo : ''}`,
    textoSi: 'Desbloquear',
    textoNo: 'Volver',
  });
  if (!ok) return;
  try {
    await acciones.borrarBloqueo(bloqueo.id);
    aviso('Listo, se puede volver a dar turnos ahí.');
  } catch (e) {
    avisoError(e);
  }
}

function sobreturnosEn(dia, turno) {
  const ini = minutos(turno.hora);
  const fin = ini + turno.duracion_min;
  return dia.filas
    .filter((f) => minutos(f.hora) >= ini && minutos(f.hora) < fin)
    .flatMap((f) => f.sobreturnos)
    .filter((s) => s.id !== turno.id);
}

// La agenda recuerda por un rato qué semana o día se estaba mirando (al volver de dar un turno, por ejemplo).
const memoria = { compu: null, celular: null, cuando: 0 };
const MEMORIA_MS = 30 * 60 * 1000;
function recordar(clave, valor) {
  memoria[clave] = valor;
  memoria.cuando = Date.now();
}
function recuerdo(clave) {
  return Date.now() - memoria.cuando < MEMORIA_MS ? memoria[clave] : null;
}

export function Agenda({ esCompu, query }) {
  return esCompu ? html`<${AgendaCompu} query=${query} />` : html`<${AgendaCelular} query=${query} />`;
}

// ====================================================================
// Computadora: varios lunes a la vista
// ====================================================================

function AgendaCompu({ query }) {
  const st = useStore();
  const inicio = proximasFechas(1)[0];
  const [desde, setDesde] = useState(() => {
    const base = query.desde || recuerdo('compu') || inicio;
    if (query.dia && (query.dia < base || query.dia >= sumarDias(base, 35))) {
      return query.dia >= inicio && query.dia < sumarDias(inicio, 35) ? inicio : query.dia;
    }
    return base;
  });
  const [seleccion, setSeleccion] = useState(null);
  const fechas = fechasDeAtencion(desde, st.config.dia_semana, 5);

  useEffect(() => recordar('compu', desde), [desde]);
  useEffect(() => {
    asegurarTurnosDesde(fechas[0]).catch(() => aviso('No se pudieron traer los turnos anteriores.', { tipo: 'error' }));
  }, [fechas[0]]);

  const dias = fechas.map(armarDia);
  const horas = [...new Set(dias.flatMap((d) => d.filas.map((f) => f.hora)))].sort();
  const fila = (hora) => horas.indexOf(hora) + 2;
  const hoy = hoyISO();
  const libre = proximoLibre();
  const enInicio = desde === inicio;
  const plural = PLURAL_DIA[st.config.dia_semana];
  const titulo = enInicio ? `Próximos ${plural}` : `${plural[0].toUpperCase()}${plural.slice(1)} del ${diaMes(fechas[0])} al ${diaMes(fechas[4])}`;
  const filaAhora = dias.some((d) => d.fecha === hoy)
    ? horas.find((h) => minutos(h) <= minutos(ahoraHHMM()) && minutos(ahoraHHMM()) < minutos(h) + st.config.duracion_min)
    : null;

  const celdas = [];
  dias.forEach((dia, i) => {
    const col = i + 2;
    if (dia.cerrado && dia.pacientes === 0) {
      celdas.push(html`<${ColumnaCerrada} key=${'c' + dia.fecha} dia=${dia} col=${col} filas=${horas.length} />`);
      return;
    }
    for (const f of dia.filas) {
      if (f.cubiertoPor) continue;
      const t = f.principal || f.sobreturnos[0];
      if (t) {
        const fin = minutos(t.hora) + t.duracion_min;
        const span = t.sobreturno ? 1 : Math.max(1, horas.filter((h) => minutos(h) >= minutos(t.hora) && minutos(h) < fin).length);
        const extras = f.principal ? sobreturnosEn(dia, t).length : f.sobreturnos.length - 1;
        celdas.push(html`<${CeldaTurno} key=${t.id} t=${t} extras=${extras} col=${col} fila=${fila(f.hora)} span=${span}
          seleccionado=${seleccion === t.id || (seleccion && f.sobreturnos.some((s) => s.id === seleccion))} onElegir=${() => setSeleccion(t.id)} />`);
      } else if (f.bloqueo) {
        celdas.push(html`<button type="button" key=${'b' + dia.fecha + f.hora} class="celda celda-bloqueada" style=${{ gridColumn: col, gridRow: fila(f.hora) }}
          onClick=${() => desbloquear(f.bloqueo)} title="Tocá para desbloquear">
          <span class="celda-nombre"><${Icono} n="candado" t=${14} /> Bloqueado</span>
          ${f.bloqueo.motivo && html`<span class="celda-sub">${f.bloqueo.motivo}</span>`}
        </button>`);
      } else if (dia.cerrado) {
        // Día cerrado que igual tiene turnos dados (se bloqueó después): se ven para poder avisar o cancelar.
        celdas.push(dia.bloqueoDia
          ? html`<button type="button" key=${'x' + dia.fecha + f.hora} class="celda celda-bloqueada" style=${{ gridColumn: col, gridRow: fila(f.hora) }}
              onClick=${() => desbloquear(dia.bloqueoDia)} title="Tocá para desbloquear el día"><span class="celda-nombre"><${Icono} n="candado" t=${14} /> Bloqueado</span></button>`
          : html`<span key=${'x' + dia.fecha + f.hora} class="celda celda-bloqueada" style=${{ gridColumn: col, gridRow: fila(f.hora) }}><span class="celda-nombre">Feriado</span></span>`);
      } else if (f.libre) {
        celdas.push(html`<${CeldaLibre} key=${'l' + dia.fecha + f.hora} dia=${dia} f=${f} col=${col} fila=${fila(f.hora)} />`);
      }
    }
  });

  return html`<div class="pagina pagina-ancha">
    <section class="barra-agenda" aria-label="Semanas">
      <div class="barra-titulo">
        <button type="button" class="btn-icono btn-icono-grande con-borde" aria-label="Semanas anteriores" onClick=${() => { setSeleccion(null); setDesde(sumarDias(desde, -35)); }}><${Icono} n="izq" /></button>
        <div>
          <h1>${titulo}</h1>
          <p class="sub">Tocá un horario libre para dar el turno ahí</p>
        </div>
        <button type="button" class="btn-icono btn-icono-grande con-borde" aria-label="Semanas siguientes" onClick=${() => { setSeleccion(null); setDesde(sumarDias(desde, 35)); }}><${Icono} n="der" /></button>
        ${!enInicio && html`<button type="button" class="btn btn-texto" onClick=${() => setDesde(inicio)}>Volver a hoy</button>`}
      </div>
      <div class="barra-acciones">
        ${libre && html`<a class="btn btn-borde-azul btn-alto" href=${armarRuta('/turno', libre)}>
          Próximo libre: ${libre.fecha === hoy ? 'hoy' : fechaCorta(libre.fecha)} ${libre.hora}<${Icono} n="flecha" />
        </a>`}
        <${MenuMas} items=${itemsMenu(fechas[0])} />
        <a class="btn btn-primario btn-alto" href="#/turno"><${Icono} n="mas" grosor=${2.6} />Dar turno</a>
      </div>
    </section>

    <div class="grilla-marco">
      <div class="grilla" style=${{ gridTemplateColumns: `76px repeat(${fechas.length}, minmax(0, 1fr))`, gridTemplateRows: `auto repeat(${horas.length}, minmax(60px, auto))` }}>
        <span class="grilla-esquina" style=${{ gridColumn: 1, gridRow: 1 }}>Hora</span>
        ${dias.map((dia, i) => html`<${CabeceraDia} key=${'h' + dia.fecha} dia=${dia} col=${i + 2} hoy=${hoy} />`)}
        ${horas.map((h) => html`<span key=${'t' + h} class="grilla-hora" style=${{ gridColumn: 1, gridRow: fila(h) }}>
          ${h}${filaAhora === h && html`<small class="ahora-txt">ahora</small>`}
        </span>`)}
        ${celdas}
      </div>
    </div>

    <ul class="leyenda" aria-label="Referencias de colores">
      <li><span class="muestra m-reservado"></span>Reservado</li>
      <li><span class="muestra m-atendido"></span>Atendido</li>
      <li><span class="muestra m-ausente"></span>Ausente</li>
      <li><span class="muestra m-libre"></span>Libre</li>
      <li><span class="muestra m-bloqueado"></span>Feriado o bloqueado</li>
      <li><span class="chip-st">ST</span>Sobreturno</li>
    </ul>

    ${seleccion && html`<${PanelTurno} turnoId=${seleccion} onCerrar=${() => setSeleccion(null)} onElegir=${setSeleccion} />`}
  </div>`;
}

function CabeceraDia({ dia, col, hoy }) {
  const esHoy = dia.fecha === hoy;
  let sub;
  if (dia.feriado?.tipo === 'feriado') sub = 'Feriado';
  else if (dia.bloqueoDia) sub = 'Bloqueado';
  else if (dia.pasado) sub = pluralizar(dia.pacientes, 'paciente', 'pacientes');
  else {
    const libres = dia.libres ? pluralizar(dia.libres, 'libre', 'libres') : 'Completo';
    sub = `${esHoy ? 'Hoy · ' : ''}${dia.feriado ? 'No laborable · ' : ''}${libres}`;
  }
  const clase = esHoy ? 'cab-dia cab-hoy' : dia.cerrado ? 'cab-dia cab-cerrado' : 'cab-dia';
  return html`<a class=${clase} style=${{ gridColumn: col, gridRow: 1 }} href=${armarRuta('/planilla/' + dia.fecha)} title="Ver planilla del día">
    <span class="cab-fecha">${fechaCorta(dia.fecha)}</span>
    <span class="cab-sub">${sub}</span>
  </a>`;
}

function ColumnaCerrada({ dia, col, filas }) {
  const esFeriado = dia.feriado?.tipo === 'feriado';
  return html`<div class="columna-cerrada" style=${{ gridColumn: col, gridRow: `2 / span ${filas}` }}>
    <${Icono} n="candado" t=${26} grosor=${2} />
    <strong>${esFeriado ? 'Feriado' : 'Día bloqueado'}</strong>
    <span>${esFeriado ? dia.feriado.nombre : dia.bloqueoDia.motivo || 'Sin atención'}</span>
    ${esFeriado
      ? html`<small>No se dan turnos</small>`
      : html`<button type="button" class="btn btn-borde btn-chico" onClick=${() => desbloquear(dia.bloqueoDia)}>Desbloquear</button>`}
  </div>`;
}

function CeldaTurno({ t, extras, col, fila, span, seleccionado, onElegir }) {
  const p = estado.pacientesPorId.get(t.paciente_id);
  const mostrarEstado = t.fecha <= hoyISO();
  return html`<button type="button" class=${`celda celda-${t.estado} ${seleccionado ? 'celda-elegida' : ''}`}
    style=${{ gridColumn: col, gridRow: `${fila} / span ${span}` }} onClick=${onElegir}
    aria-label=${`${hhmm(t.hora)} ${p?.apellido_nombre || ''}, ${NOMBRE_ESTADO[t.estado]}`}>
    <span class="celda-nombre">
      ${t.sobreturno && html`<span class="chip-st">ST</span>`}
      ${nombreAbreviado(p?.apellido_nombre)}
      ${extras > 0 && html`<span class="chip-st">+${extras} ST</span>`}
    </span>
    ${t.es_practica && html`<span class="celda-sub">Práctica · ${t.duracion_min} min</span>`}
    ${mostrarEstado
      ? html`<${EstadoTexto} estado=${t.estado} />`
      : html`<span class="celda-sub">${nombreObraSocial(p)}</span>`}
  </button>`;
}

export function EstadoTexto({ estado: e }) {
  const icono = { reservado: 'reloj', atendido: 'check', ausente: 'x', cancelado: 'x' }[e];
  return html`<span class=${'estado-txt estado-' + e}><${Icono} n=${icono} t=${14} grosor=${2.8} />${NOMBRE_ESTADO[e]}</span>`;
}

function CeldaLibre({ dia, f, col, fila }) {
  const estilo = { gridColumn: col, gridRow: fila };
  if (f.yaPaso) return html`<span class="celda celda-pasada" style=${estilo}>—</span>`;
  const cancelado = f.cancelados[f.cancelados.length - 1];
  if (cancelado) {
    const p = estado.pacientesPorId.get(cancelado.paciente_id);
    const nEspera = estado.espera.length;
    return html`<a class="celda celda-libre celda-liberada" style=${estilo}
      href=${nEspera ? '#/espera' : armarRuta('/turno', { fecha: dia.fecha, hora: f.hora })}>
      <span class="celda-nombre"><${Icono} n="mas" t=${14} grosor=${3} />Libre</span>
      <span class="celda-sub">Canceló ${nombreAbreviado(p?.apellido_nombre)}${nEspera ? ` · ${nEspera} en espera` : ''}</span>
    </a>`;
  }
  return html`<a class="celda celda-libre" style=${estilo} href=${armarRuta('/turno', { fecha: dia.fecha, hora: f.hora })}
    aria-label=${`Dar turno el ${fechaCorta(dia.fecha)} a las ${f.hora}`}>
    <span class="celda-nombre"><${Icono} n="mas" t=${14} grosor=${3} />Libre</span>
  </a>`;
}

// Panel lateral con los datos y acciones del turno elegido
function PanelTurno({ turnoId, onCerrar, onElegir }) {
  const st = useStore();
  const t = st.turnos.find((x) => x.id === turnoId);
  useEffect(() => {
    const alTeclear = (e) => e.key === 'Escape' && onCerrar();
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, []);
  useEffect(() => {
    if (!t || t.estado === 'cancelado') onCerrar();
  }, [t?.estado, !!t]);
  if (!t || t.estado === 'cancelado') return null;

  const p = st.pacientesPorId.get(t.paciente_id);
  const dia = armarDia(t.fecha);
  const filaDia = dia.filas.find((f) => f.hora === hhmm(t.hora));
  const otros = filaDia ? [filaDia.principal, ...filaDia.sobreturnos].filter((x) => x && x.id !== t.id) : [];

  return html`<aside class="panel-turno" aria-label=${`Turno de ${p?.apellido_nombre}`}>
    <div class="panel-cab">
      <span class="panel-cuando">
        ${t.fecha === hoyISO() ? 'Hoy' : fechaCorta(t.fecha)} · ${hhmm(t.hora)}${t.es_practica ? ` a ${finTurno(t)}` : ''}
        ${esAhora(t) && html`<span class="chip-ahora">Ahora</span>`}
      </span>
      <button type="button" class="btn-icono btn-icono-grande con-borde" aria-label="Cerrar" onClick=${onCerrar}><${Icono} n="x" /></button>
    </div>
    <div>
      <h2 class="panel-nombre">${p?.apellido_nombre}</h2>
      <p class="sub">${nombreObraSocial(p)} · ${tipoTurno(t)}${t.sobreturno ? ' · Sobreturno' : ''}</p>
    </div>
    <dl class="datos-cortos">
      <dt>Teléfono</dt><dd>${p?.telefono}</dd>
      ${t.motivo && html`<dt>Motivo</dt><dd>${t.motivo}</dd>`}
      ${t.observaciones && html`<dt>Observ.</dt><dd>${t.observaciones}</dd>`}
      <dt>Estado</dt><dd><${EstadoTexto} estado=${t.estado} /></dd>
    </dl>
    ${t.fecha > hoyISO()
      ? null
      : t.estado === 'reservado'
        ? html`<div class="grilla-2">
            <button type="button" class="btn btn-verde btn-alto" onClick=${() => marcarEstado(t, 'atendido')}><${Icono} n="check" grosor=${2.8} />Atendido</button>
            <button type="button" class="btn btn-naranja btn-alto" onClick=${() => marcarEstado(t, 'ausente')}><${Icono} n="x" grosor=${2.8} />Ausente</button>
          </div>`
        : html`<button type="button" class="btn btn-borde btn-alto" onClick=${() => marcarEstado(t, 'reservado')}>Volver a "Reservado"</button>`}
    <a class="btn btn-wa btn-alto" href=${linkRecordatorio(t)} target="_blank" rel="noopener"><${Icono} n="whatsapp" grosor=${2} />Recordatorio por WhatsApp</a>
    <div class="enlaces-panel">
      <a class="btn btn-texto" href=${'#/pacientes/' + t.paciente_id}>Ver ficha</a>
      <a class="btn btn-texto" href=${armarRuta('/turno', { reprogramar: t.id })}>Reprogramar</a>
      <button type="button" class="btn btn-texto texto-peligro" onClick=${() => cancelarTurno(t)}>Cancelar turno</button>
    </div>
    ${otros.length > 0 && html`<div class="panel-otros">
      <span class="panel-otros-titulo">También a las ${hhmm(t.hora)}</span>
      ${otros.map((o) => {
        const po = st.pacientesPorId.get(o.paciente_id);
        return html`<button type="button" key=${o.id} class="panel-otro" onClick=${() => onElegir(o.id)}>
          <strong>${po?.apellido_nombre}</strong>
          <span>${o.sobreturno ? 'Sobreturno · ' : ''}${nombreObraSocial(po)} · ${NOMBRE_ESTADO[o.estado]}</span>
        </button>`;
      })}
    </div>`}
    <p class="panel-registro">
      ${t.creado_por ? `Lo cargó: ${t.creado_por}` : ''}${t.modificado_por && t.modificado_por !== t.creado_por ? ` · Último cambio: ${t.modificado_por}` : ''}
    </p>
  </aside>`;
}

// ====================================================================
// Celular: lista del día para tildar
// ====================================================================

function AgendaCelular({ query }) {
  const st = useStore();
  const inicio = proximasFechas(1)[0];
  const [fecha, setFecha] = useState(query.dia || recuerdo('celular') || inicio);
  const [abierto, setAbierto] = useState(null);
  const [menuTurno, setMenuTurno] = useState(null);

  useEffect(() => recordar('celular', fecha), [fecha]);
  // El ícono de agenda del encabezado vuelve al próximo día de atención.
  useEffect(() => {
    const alInicio = () => {
      setAbierto(null);
      setFecha(proximasFechas(1)[0]);
      window.scrollTo(0, 0);
    };
    window.addEventListener('turnero:agenda-inicio', alInicio);
    return () => window.removeEventListener('turnero:agenda-inicio', alInicio);
  }, []);
  useEffect(() => {
    asegurarTurnosDesde(fecha).catch(() => aviso('No se pudieron traer los turnos anteriores.', { tipo: 'error' }));
  }, [fecha]);

  const dia = armarDia(fecha);
  const hoy = hoyISO();
  const mover = (semanas) => {
    setAbierto(null);
    setFecha(sumarDias(fecha, 7 * semanas));
  };
  const alternar = (id) => setAbierto(abierto === id ? null : id);

  let resumen;
  if (dia.feriado?.tipo === 'feriado') resumen = `Feriado · ${dia.feriado.nombre}`;
  else if (dia.bloqueoDia) resumen = `Día bloqueado${dia.bloqueoDia.motivo ? ' · ' + dia.bloqueoDia.motivo : ''}`;
  else resumen = `${fecha === hoy ? 'Hoy · ' : ''}${pluralizar(dia.pacientes, 'paciente', 'pacientes')}${dia.pasado ? '' : ' · ' + pluralizar(dia.libres, 'libre', 'libres')}`;

  const filas = [];
  if (!dia.cerrado || dia.filas.some((f) => f.principal || f.sobreturnos.length)) {
    for (const f of dia.filas) {
      if (f.principal) filas.push(html`<${FilaTurno} key=${f.principal.id} t=${f.principal} abierto=${abierto === f.principal.id} onAlternar=${alternar} onMas=${setMenuTurno} />`);
      for (const s of f.sobreturnos) filas.push(html`<${FilaTurno} key=${s.id} t=${s} abierto=${abierto === s.id} onAlternar=${alternar} onMas=${setMenuTurno} />`);
      if (f.principal || f.cubiertoPor || f.sobreturnos.length) continue;
      if (f.bloqueo) filas.push(html`<${FilaBloqueo} key=${'b' + f.hora} f=${f} />`);
      else if (f.libre) filas.push(html`<${FilaLibre} key=${'l' + f.hora} dia=${dia} f=${f} />`);
    }
  }

  return html`<div class="pagina pagina-celular">
    <div class="barra-dia">
      <button type="button" class="btn-icono btn-icono-grande con-borde" aria-label="Día anterior" onClick=${() => mover(-1)}><${Icono} n="izq" /></button>
      <div class="barra-dia-textos">
        <h1>${fechaLarga(fecha)}</h1>
        <p class="sub">${resumen}</p>
      </div>
      <button type="button" class="btn-icono btn-icono-grande con-borde" aria-label="Día siguiente" onClick=${() => mover(1)}><${Icono} n="der" /></button>
    </div>
    ${fecha !== inicio && html`<button type="button" class="btn btn-texto volver-hoy" onClick=${() => { setAbierto(null); setFecha(inicio); }}>Volver a ${inicio === hoy ? 'hoy' : 'la próxima fecha'}</button>`}

    ${dia.cerrado && html`<div class="aviso-dia">
      <${Icono} n="candado" t=${22} grosor=${2} />
      <div>
        <strong>${dia.feriado?.tipo === 'feriado' ? 'Feriado: ' + dia.feriado.nombre : 'Día bloqueado'}</strong>
        <span>No se dan turnos este día.</span>
      </div>
      ${dia.bloqueoDia && html`<button type="button" class="btn btn-borde btn-chico" onClick=${() => desbloquear(dia.bloqueoDia)}>Desbloquear</button>`}
    </div>`}
    ${filas.length > 0 && html`<ol class="lista-dia" aria-label="Turnos del día">${filas}</ol>`}

    <div class="barra-inferior">
      <a class="btn btn-primario btn-enorme" href=${armarRuta('/turno', { fecha: dia.cerrado || dia.pasado ? undefined : fecha })}>
        <${Icono} n="mas" grosor=${2.6} />Dar turno
      </a>
    </div>

    ${menuTurno && html`<${AccionesTurno} t=${menuTurno} onCerrar=${() => setMenuTurno(null)} />`}
  </div>`;
}

function FilaTurno({ t, abierto, onAlternar, onMas }) {
  const p = estado.pacientesPorId.get(t.paciente_id);
  const ahora = esAhora(t);
  const futuro = t.fecha > hoyISO();
  return html`<li class=${'fila ' + (abierto ? 'fila-abierta' : '')}>
    <div class="fila-principal">
      <button type="button" class="fila-boton" aria-expanded=${abierto} onClick=${() => onAlternar(t.id)}>
        <span class="fila-hora">
          <span class=${t.sobreturno ? 'hora-st' : ''}>${hhmm(t.hora)}</span>
          ${t.es_practica && html`<small>a ${finTurno(t)}</small>`}
          ${ahora && html`<span class="chip-ahora">Ahora</span>`}
          ${t.sobreturno && html`<span class="chip-st">ST</span>`}
        </span>
        <span class="fila-textos">
          <span class="fila-nombre">${p?.apellido_nombre}</span>
          <span class="fila-sub">${nombreObraSocial(p)} · ${tipoTurno(t)}</span>
        </span>
      </button>
      ${futuro
        ? html`<a class="circulo circulo-wa" href=${linkRecordatorio(t)} target="_blank" rel="noopener" aria-label=${`Enviar recordatorio a ${p?.apellido_nombre}`}><${Icono} n="whatsapp" t=${20} grosor=${2} /></a>`
        : html`<${CirculoEstado} t=${t} nombre=${p?.apellido_nombre} onAlternar=${onAlternar} />`}
    </div>
    ${abierto && html`<div class="fila-detalle">
      <span class="fila-datos">Tel. ${p?.telefono}${t.motivo ? ' · ' + t.motivo : ''}</span>
      ${t.observaciones && html`<span class="fila-datos">${t.observaciones}</span>`}
      <div class="grilla-2">
        ${futuro
          ? null
          : t.estado === 'reservado'
            ? html`<button type="button" class="btn btn-verde" onClick=${() => marcarEstado(t, 'atendido')}><${Icono} n="check" grosor=${3} t=${18} />Atendido</button>
                <button type="button" class="btn btn-naranja" onClick=${() => marcarEstado(t, 'ausente')}><${Icono} n="x" grosor=${3} t=${18} />Ausente</button>`
            : html`<button type="button" class="btn btn-borde columna-doble" onClick=${() => marcarEstado(t, 'reservado')}>Volver a "Reservado"</button>`}
        <a class="btn btn-wa" href=${linkRecordatorio(t)} target="_blank" rel="noopener"><${Icono} n="whatsapp" t=${18} grosor=${2} />WhatsApp</a>
        <button type="button" class="btn btn-borde" onClick=${() => onMas(t)}>Más opciones</button>
      </div>
    </div>`}
  </li>`;
}

function CirculoEstado({ t, nombre, onAlternar }) {
  if (t.estado === 'atendido') {
    return html`<button type="button" class="circulo circulo-atendido" aria-label=${`${nombre}: atendido. Cambiar estado`} onClick=${() => onAlternar(t.id)}><${Icono} n="check" t=${20} grosor=${3} /></button>`;
  }
  if (t.estado === 'ausente') {
    return html`<button type="button" class="circulo circulo-ausente" aria-label=${`${nombre}: ausente. Cambiar estado`} onClick=${() => onAlternar(t.id)}><${Icono} n="x" t=${18} grosor=${3} /></button>`;
  }
  return html`<button type="button" class="circulo circulo-vacio" aria-label=${`Marcar atendido: ${nombre}`} onClick=${() => marcarEstado(t, 'atendido')}><${Icono} n="check" t=${18} grosor=${3} /></button>`;
}

function FilaLibre({ dia, f }) {
  const cancelado = f.cancelados[f.cancelados.length - 1];
  const nEspera = estado.espera.length;
  const pc = cancelado ? estado.pacientesPorId.get(cancelado.paciente_id) : null;
  return html`<li class="fila fila-libre">
    <div class="fila-principal fila-relleno">
      <span class="fila-hora">${f.hora}</span>
      <span class="fila-textos">
        <span class="fila-nombre texto-azul">${f.yaPaso ? 'Libre (ya pasó)' : 'Libre'}</span>
        ${cancelado && html`<span class="fila-sub">Canceló ${nombreAbreviado(pc?.apellido_nombre)}${nEspera ? ` · ${nEspera} en espera` : ''}</span>`}
      </span>
      ${!f.yaPaso && (cancelado && nEspera
        ? html`<a class="btn btn-primario btn-chico" href="#/espera">Lista de espera</a>`
        : html`<a class="btn btn-borde-azul btn-chico" href=${armarRuta('/turno', { fecha: dia.fecha, hora: f.hora })}><${Icono} n="mas" t=${16} grosor=${2.8} />Dar turno</a>`)}
    </div>
  </li>`;
}

function FilaBloqueo({ f }) {
  return html`<li class="fila fila-bloqueada">
    <div class="fila-principal fila-relleno">
      <span class="fila-hora">${f.hora}</span>
      <span class="fila-textos">
        <span class="fila-nombre"><${Icono} n="candado" t=${15} /> Bloqueado</span>
        ${f.bloqueo.motivo && html`<span class="fila-sub">${f.bloqueo.motivo}</span>`}
      </span>
      <button type="button" class="btn btn-borde btn-chico" onClick=${() => desbloquear(f.bloqueo)}>Desbloquear</button>
    </div>
  </li>`;
}

function AccionesTurno({ t, onCerrar }) {
  const p = estado.pacientesPorId.get(t.paciente_id);
  return html`<${Modal} titulo=${p?.apellido_nombre || 'Turno'} onCerrar=${onCerrar} chico=${true}>
    <p class="dialogo-texto">${fechaLarga(t.fecha)} · ${hhmm(t.hora)} · ${tipoTurno(t)}</p>
    <div class="lista-acciones">
      <a class="btn btn-borde btn-alto" href=${'#/pacientes/' + t.paciente_id} onClick=${onCerrar}><${Icono} n="usuario" />Ver ficha</a>
      <a class="btn btn-borde btn-alto" href=${armarRuta('/turno', { reprogramar: t.id })} onClick=${onCerrar}><${Icono} n="calendario" />Reprogramar</a>
      <button type="button" class="btn btn-borde btn-alto texto-peligro" onClick=${async () => { if (await cancelarTurno(t)) onCerrar(); }}><${Icono} n="x" />Cancelar turno</button>
    </div>
  <//>`;
}
