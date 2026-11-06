// Pacientes: búsqueda, ficha y formulario de datos (compartido con "Dar turno" y la lista de espera).
import { html, useState, useEffect, useMemo, useRef } from './lib.js';
import { estado, useStore, acciones, nombreObraSocial, esParticular, esperaActivaDe } from './store.js';
import { backend } from './backend.js';
import { Icono, Modal, aviso, avisoError, confirmar, armarRuta, navegar } from './ui.js';
import { EstadoTexto, tipoTurno, linkRecordatorio, cancelarTurno } from './agenda.js';
import {
  normalizar, fechaNumerica, fechaCorta, hhmm, hoyISO, ahoraHHMM, minutos, mesAnio, linkWhatsApp, pluralizar,
} from './util.js';

// ---------- Búsqueda ----------

export function buscarPacientes(texto, limite = 8) {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const resultado = [];
  for (const p of estado.pacientes) {
    const pajar = normalizar(`${p.apellido_nombre} ${p.dni || ''} ${p.telefono || ''}`);
    if (palabras.every((w) => pajar.includes(w))) {
      resultado.push(p);
      if (resultado.length >= limite) break;
    }
  }
  return resultado;
}

// ---------- Formulario de datos del paciente ----------

export const PACIENTE_VACIO = {
  apellido_nombre: '', telefono: '', email: '', sin_email: false, obra_social_id: null,
  nro_afiliado: '', plan: '', dni: '', observaciones: '',
};

export function datosDePaciente(p) {
  const d = { ...PACIENTE_VACIO };
  for (const k of Object.keys(d)) if (p[k] !== null && p[k] !== undefined) d[k] = p[k];
  return d;
}

export function validarPaciente(d) {
  const errores = {};
  if (!d.apellido_nombre.trim()) errores.apellido_nombre = 'Escribí apellido y nombre.';
  if (!d.telefono.trim()) errores.telefono = 'Falta el teléfono.';
  if (!d.sin_email && !d.email.trim()) errores.email = 'Escribí el email o marcá "No tiene email".';
  else if (!d.sin_email && !/^\S+@\S+\.\S+$/.test(d.email.trim())) errores.email = 'Revisá el email.';
  if (!d.obra_social_id) errores.obra_social_id = 'Elegí la obra social (o Particular).';
  return errores;
}

// Prepara los datos para guardar en la base
export function limpiarPaciente(d) {
  const texto = (v) => (v || '').trim() || null;
  const particular = estado.obrasPorId.get(d.obra_social_id)?.es_particular;
  return {
    apellido_nombre: d.apellido_nombre.trim().replace(/\s+/g, ' '),
    telefono: d.telefono.trim(),
    email: d.sin_email ? null : texto(d.email),
    sin_email: !!d.sin_email,
    obra_social_id: d.obra_social_id,
    nro_afiliado: particular ? null : texto(d.nro_afiliado),
    plan: particular ? null : texto(d.plan),
    dni: texto(d.dni),
    observaciones: texto(d.observaciones),
  };
}

function Campo({ etiqueta, obligatorio, error, children, clase = '' }) {
  return html`<label class=${'campo ' + clase}>
    <span>${etiqueta}${obligatorio && html` <span class="obligatorio" aria-hidden="true">*</span>`}</span>
    ${children}
    ${error && html`<span class="error-campo">${error}</span>`}
  </label>`;
}

export function FormPaciente({ datos, setDatos, errores = {} }) {
  const [verMas, setVerMas] = useState(!!(datos.dni || datos.observaciones));
  const cambiar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const particular = estado.obrasPorId.get(datos.obra_social_id)?.es_particular;
  return html`<div class="form-paciente">
    <${Campo} etiqueta="Apellido y nombre" obligatorio=${true} error=${errores.apellido_nombre}>
      <input class="entrada" value=${datos.apellido_nombre} onInput=${cambiar('apellido_nombre')} placeholder="Ej.: Sosa, Graciela" autocomplete="off" aria-required="true" />
    <//>
    <${Campo} etiqueta="Teléfono" obligatorio=${true} error=${errores.telefono}>
      <input class="entrada" type="tel" value=${datos.telefono} onInput=${cambiar('telefono')} placeholder="Ej.: 341 555-0178" autocomplete="off" aria-required="true" />
    <//>
    <div class="campo-con-casilla">
      <${Campo} etiqueta="Email" obligatorio=${true} error=${errores.email}>
        <input class="entrada" type="email" value=${datos.sin_email ? '' : datos.email} disabled=${datos.sin_email}
          placeholder=${datos.sin_email ? 'No tiene' : 'nombre@ejemplo.com'} onInput=${cambiar('email')} autocomplete="off" />
      <//>
      <label class="casilla"><input type="checkbox" checked=${datos.sin_email} onChange=${cambiar('sin_email')} />No tiene email</label>
    </div>
    <div class="campo">
      <span id="etiqueta-os">Obra social <span class="obligatorio" aria-hidden="true">*</span></span>
      <${SelectorObraSocial} valor=${datos.obra_social_id} onCambio=${(id) => setDatos({ ...datos, obra_social_id: id })} idEtiqueta="etiqueta-os" />
      ${errores.obra_social_id && html`<span class="error-campo">${errores.obra_social_id}</span>`}
    </div>
    ${datos.obra_social_id && !particular && html`<div class="grilla-afiliado">
      <${Campo} etiqueta="N° de afiliado">
        <input class="entrada" value=${datos.nro_afiliado} onInput=${cambiar('nro_afiliado')} placeholder="Opcional" autocomplete="off" />
      <//>
      <${Campo} etiqueta="Plan">
        <input class="entrada" value=${datos.plan} onInput=${cambiar('plan')} placeholder="Opcional" autocomplete="off" />
      <//>
    </div>`}
    ${verMas
      ? html`<${Campo} etiqueta="DNI">
          <input class="entrada" inputmode="numeric" value=${datos.dni} onInput=${cambiar('dni')} placeholder="Opcional" autocomplete="off" />
        <//>
        <${Campo} etiqueta="Observaciones del paciente">
          <textarea class="entrada" rows="2" value=${datos.observaciones} onInput=${cambiar('observaciones')} placeholder="Opcional"></textarea>
        <//>`
      : html`<button type="button" class="btn btn-texto alineado-izq" onClick=${() => setVerMas(true)}><${Icono} n="mas" t=${16} grosor=${2.6} />Agregar DNI y observaciones</button>`}
  </div>`;
}

// ---------- Selector de obra social con buscador ----------

export function SelectorObraSocial({ valor, onCambio, idEtiqueta }) {
  const st = useStore();
  const [abierto, setAbierto] = useState(false);
  const elegida = st.obrasPorId.get(valor);
  return html`<button type="button" class=${'entrada selector ' + (elegida ? '' : 'selector-vacio')} aria-haspopup="dialog"
      aria-labelledby=${idEtiqueta} onClick=${() => setAbierto(true)}>
      <span>${elegida ? elegida.nombre : 'Elegir obra social…'}</span><${Icono} n="abajo" t=${18} />
    </button>
    ${abierto && html`<${ListaObrasSociales} onElegir=${(id) => { onCambio(id); setAbierto(false); }} onCerrar=${() => setAbierto(false)} />`}`;
}

function ListaObrasSociales({ onElegir, onCerrar }) {
  const st = useStore();
  const [texto, setTexto] = useState('');
  const [agregando, setAgregando] = useState(false);
  const entrada = useRef(null);
  useEffect(() => entrada.current?.focus(), []);
  const n = normalizar(texto);
  const activas = st.obras.filter((o) => o.activa);
  const visibles = n ? activas.filter((o) => normalizar(o.nombre).includes(n)) : activas;
  const exacta = activas.some((o) => normalizar(o.nombre) === n);
  const agregar = async () => {
    setAgregando(true);
    try {
      const o = await acciones.crearObraSocial(texto.trim());
      aviso(`Se agregó "${o.nombre}" a la lista.`);
      onElegir(o.id);
    } catch (e) {
      avisoError(e, 'No se pudo agregar la obra social.');
      setAgregando(false);
    }
  };
  return html`<${Modal} titulo="Obra social" onCerrar=${onCerrar}>
    <label class="buscador">
      <span class="solo-lector">Buscar obra social</span>
      <${Icono} n="buscar" t=${18} />
      <input ref=${entrada} class="entrada" value=${texto} onInput=${(e) => setTexto(e.target.value)} placeholder="Buscar…" autocomplete="off" />
    </label>
    <ul class="lista-opciones">
      ${visibles.map((o) => html`<li key=${o.id}><button type="button" class="opcion" onClick=${() => onElegir(o.id)}>${o.nombre}</button></li>`)}
      ${texto.trim() && !exacta && html`<li><button type="button" class="opcion opcion-agregar" disabled=${agregando} onClick=${agregar}>
        <${Icono} n="mas" t=${16} grosor=${2.6} />Agregar "${texto.trim()}" a la lista
      </button></li>`}
    </ul>
  <//>`;
}

// ---------- Lista de pacientes ----------

export function Pacientes() {
  const st = useStore();
  const [texto, setTexto] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const LIMITE = 100;
  const lista = useMemo(
    () => (texto.trim() ? buscarPacientes(texto, LIMITE) : st.pacientes.slice(0, LIMITE)),
    [texto, st.version]
  );
  return html`<div class="pagina pagina-angosta">
    <div class="titulo-pagina">
      <div>
        <h1>Pacientes</h1>
        <p class="sub">${pluralizar(st.pacientes.length, 'paciente cargado', 'pacientes cargados')}</p>
      </div>
      <button type="button" class="btn btn-borde-azul btn-alto" onClick=${() => setNuevo(true)}><${Icono} n="mas" grosor=${2.6} />Nuevo paciente</button>
    </div>
    <label class="buscador buscador-grande">
      <span class="solo-lector">Buscar paciente</span>
      <${Icono} n="buscar" />
      <input class="entrada" type="search" value=${texto} onInput=${(e) => setTexto(e.target.value)} placeholder="Buscar por apellido, nombre, DNI o teléfono" autocomplete="off" />
    </label>
    ${lista.length === 0
      ? html`<p class="vacio">${texto ? 'No hay pacientes con esa búsqueda.' : 'Todavía no hay pacientes cargados. Se agregan solos al dar el primer turno.'}</p>`
      : html`<ul class="tarjeta lista-pacientes">
          ${lista.map((p) => html`<li key=${p.id}>
            <a class="fila-paciente" href=${'#/pacientes/' + p.id}>
              <span class="fila-textos">
                <span class="fila-nombre">${p.apellido_nombre}</span>
                <span class="fila-sub">${nombreObraSocial(p)} · ${p.telefono}${p.dni ? ' · DNI ' + p.dni : ''}</span>
              </span>
              ${esperaActivaDe(p.id) && html`<span class="chip chip-azul">En espera</span>`}
              <${Icono} n="der" t=${18} />
            </a>
          </li>`)}
        </ul>`}
    ${!texto && st.pacientes.length > LIMITE && html`<p class="vacio">Se muestran los primeros ${LIMITE}. Usá el buscador para encontrar al resto.</p>`}
    ${nuevo && html`<${NuevoPaciente} onCerrar=${() => setNuevo(false)} onCreado=${(p) => navegar('/pacientes/' + p.id)} />`}
  </div>`;
}

export function NuevoPaciente({ onCerrar, onCreado, nombreInicial = '' }) {
  const [datos, setDatos] = useState({ ...PACIENTE_VACIO, apellido_nombre: nombreInicial });
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const guardar = async (e) => {
    e.preventDefault();
    const errs = validarPaciente(datos);
    setErrores(errs);
    if (Object.keys(errs).length) return;
    setGuardando(true);
    try {
      const p = await acciones.crearPaciente(limpiarPaciente(datos));
      aviso('Paciente guardado.');
      onCerrar();
      onCreado?.(p);
    } catch (err) {
      avisoError(err);
      setGuardando(false);
    }
  };
  return html`<${Modal} titulo="Nuevo paciente" onCerrar=${onCerrar}>
    <form onSubmit=${guardar}>
      <${FormPaciente} datos=${datos} setDatos=${setDatos} errores=${errores} />
      <div class="acciones-modal">
        <button type="button" class="btn btn-borde" onClick=${onCerrar}>Cancelar</button>
        <button type="submit" class="btn btn-primario" disabled=${guardando}>${guardando ? 'Guardando…' : 'Guardar paciente'}</button>
      </div>
    </form>
  <//>`;
}

// ---------- Ficha del paciente ----------

export function FichaPaciente({ id }) {
  const st = useStore();
  const p = st.pacientesPorId.get(id);
  const [historial, setHistorial] = useState(null);
  const [editando, setEditando] = useState(false);
  const [anotando, setAnotando] = useState(false);

  useEffect(() => {
    let vivo = true;
    backend.turnosDePaciente(id).then((t) => vivo && setHistorial(t)).catch(() => vivo && setHistorial([]));
    return () => { vivo = false; };
  }, [id]);

  if (!p) {
    return html`<div class="pagina pagina-angosta">
      <a class="volver" href="#/pacientes"><${Icono} n="izq" t=${18} />Pacientes</a>
      <p class="vacio">No se encontró el paciente.</p>
    </div>`;
  }

  // Une el historial completo con los turnos recientes que llegan en vivo
  const porId = new Map((historial || []).map((t) => [t.id, t]));
  for (const t of st.turnos) if (t.paciente_id === id) porId.set(t.id, t);
  const todos = [...porId.values()];
  const hoy = hoyISO();
  const ahora = minutos(ahoraHHMM());
  const futuro = (t) => t.fecha > hoy || (t.fecha === hoy && minutos(t.hora) + t.duracion_min > ahora);
  const proximos = todos.filter((t) => t.estado === 'reservado' && futuro(t)).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const anteriores = todos.filter((t) => !proximos.includes(t)).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  const atendidos = anteriores.filter((t) => t.estado === 'atendido').length;
  const ausencias = anteriores.filter((t) => t.estado === 'ausente').length;
  const espera = esperaActivaDe(id);

  return html`<div class="pagina pagina-angosta">
    <a class="volver" href="#/pacientes"><${Icono} n="izq" t=${18} />Pacientes</a>

    <section class="ficha-cabecera">
      <span class="sobretitulo">Ficha del paciente</span>
      <h1>${p.apellido_nombre}</h1>
      <div class="chips">
        <span class="chip chip-azul">${nombreObraSocial(p)}${p.plan ? ' · Plan ' + p.plan : ''}</span>
        <span class="chip">Paciente desde ${mesAnio(p.creado_en)}</span>
        ${espera && html`<span class="chip chip-azul">En lista de espera</span>`}
      </div>
      <div class="acciones-fila">
        <a class="btn btn-primario btn-alto" href=${armarRuta('/turno', { paciente: p.id })}><${Icono} n="mas" grosor=${2.6} />Dar turno</a>
        <a class="btn btn-wa btn-alto" href=${linkWhatsApp(p.telefono)} target="_blank" rel="noopener"><${Icono} n="whatsapp" grosor=${2} />WhatsApp</a>
        <button type="button" class="btn btn-borde btn-alto" onClick=${() => setEditando(!editando)}><${Icono} n="lapiz" t=${18} />Editar datos</button>
        ${espera
          ? html`<button type="button" class="btn btn-texto" onClick=${async () => {
              if (await confirmar({ titulo: '¿Quitar de la lista de espera?', textoSi: 'Quitar', textoNo: 'Volver' })) {
                acciones.resolverEspera(espera.id, 'quitado').then(() => aviso('Se quitó de la lista de espera.')).catch((e) => avisoError(e));
              }
            }}>Quitar de la lista de espera</button>`
          : html`<button type="button" class="btn btn-texto" onClick=${() => setAnotando(true)}>Anotar en lista de espera</button>`}
      </div>
    </section>

    ${editando && html`<${EditarPaciente} p=${p} onCerrar=${() => setEditando(false)} />`}

    <section class="tarjeta" aria-labelledby="proximo">
      <h2 class="tarjeta-titulo" id="proximo">${proximos.length > 1 ? 'Próximos turnos' : 'Próximo turno'}</h2>
      ${proximos.length === 0 && html`<p class="vacio vacio-tarjeta">No tiene turnos reservados.</p>`}
      ${proximos.map((t) => html`<div class="turno-ficha" key=${t.id}>
        <div class="turno-ficha-fila">
          <span class="turno-ficha-cuando"><strong>${hhmm(t.hora)}</strong><span>${t.fecha === hoy ? 'Hoy' : fechaCorta(t.fecha)}</span></span>
          <span class="fila-textos">
            <span class="fila-nombre">${tipoTurno(t)}${t.sobreturno ? ' · Sobreturno' : ''}</span>
            ${t.motivo && html`<span class="fila-sub">${t.motivo}</span>`}
          </span>
          <${EstadoTexto} estado=${t.estado} />
        </div>
        <div class="acciones-fila">
          <a class="btn btn-wa" href=${linkRecordatorio(t)} target="_blank" rel="noopener"><${Icono} n="whatsapp" t=${18} grosor=${2} />Recordatorio por WhatsApp</a>
          <a class="btn btn-texto" href=${armarRuta('/turno', { reprogramar: t.id })}>Reprogramar</a>
          <button type="button" class="btn btn-texto texto-peligro" onClick=${() => cancelarTurno(t)}>Cancelar turno</button>
        </div>
      </div>`)}
    </section>

    <section class="tarjeta" aria-labelledby="datos">
      <h2 class="tarjeta-titulo" id="datos">Datos</h2>
      <dl class="datos">
        <dt>Teléfono</dt><dd>${p.telefono}</dd>
        <dt>Email</dt><dd>${p.sin_email ? 'No tiene' : p.email}</dd>
        <dt>DNI</dt><dd>${p.dni || '—'}</dd>
        <dt>Obra social</dt><dd>${nombreObraSocial(p)}</dd>
        ${!esParticular(p) && html`<dt>N° de afiliado</dt><dd>${p.nro_afiliado || '—'}</dd>
          <dt>Plan</dt><dd>${p.plan || '—'}</dd>`}
        <dt>Observaciones</dt><dd>${p.observaciones || '—'}</dd>
      </dl>
    </section>

    <section class="tarjeta" aria-labelledby="historial">
      <div class="tarjeta-titulo-fila">
        <h2 class="tarjeta-titulo" id="historial">Turnos anteriores</h2>
        <span class="sub">${historial === null ? 'Cargando…' : `${pluralizar(atendidos, 'atendido', 'atendidos')} · ${pluralizar(ausencias, 'ausencia', 'ausencias')}`}</span>
      </div>
      ${historial !== null && anteriores.length === 0 && html`<p class="vacio vacio-tarjeta">Todavía no tiene turnos anteriores.</p>`}
      <ol class="lista-historial">
        ${anteriores.map((t) => html`<li key=${t.id}>
          <span class="turno-ficha-cuando"><strong>${fechaNumerica(t.fecha)}</strong><span>${hhmm(t.hora)}</span></span>
          <span class="fila-textos">
            <span class="fila-nombre">${tipoTurno(t)}</span>
            ${t.motivo && html`<span class="fila-sub">${t.motivo}</span>`}
          </span>
          <${EstadoTexto} estado=${t.estado} />
        </li>`)}
      </ol>
    </section>

    ${anotando && html`<${AnotarEnEspera} paciente=${p} onCerrar=${() => setAnotando(false)} />`}
  </div>`;
}

function EditarPaciente({ p, onCerrar }) {
  const [datos, setDatos] = useState(datosDePaciente(p));
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const guardar = async (e) => {
    e.preventDefault();
    const errs = validarPaciente(datos);
    setErrores(errs);
    if (Object.keys(errs).length) return;
    setGuardando(true);
    try {
      await acciones.actualizarPaciente(p.id, limpiarPaciente(datos));
      aviso('Datos actualizados.');
      onCerrar();
    } catch (err) {
      avisoError(err);
      setGuardando(false);
    }
  };
  return html`<${Modal} titulo="Editar datos" onCerrar=${onCerrar}>
    <form onSubmit=${guardar}>
      <${FormPaciente} datos=${datos} setDatos=${setDatos} errores=${errores} />
      <div class="acciones-modal">
        <button type="button" class="btn btn-borde" onClick=${onCerrar}>Cancelar</button>
        <button type="submit" class="btn btn-primario" disabled=${guardando}>${guardando ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>
    </form>
  <//>`;
}

export const PREFERENCIAS = ['Cualquier lunes', 'Lo antes posible', 'Antes de las 15', 'Después de las 15'];

export function AnotarEnEspera({ paciente, onCerrar }) {
  const [preferencia, setPreferencia] = useState('Cualquier lunes');
  const [guardando, setGuardando] = useState(false);
  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await acciones.crearEspera({ paciente_id: paciente.id, preferencia: preferencia.trim() || null });
      aviso(`${paciente.apellido_nombre} quedó en la lista de espera.`);
      onCerrar();
    } catch (err) {
      avisoError(err);
      setGuardando(false);
    }
  };
  return html`<${Modal} titulo="Anotar en lista de espera" onCerrar=${onCerrar} chico=${true}>
    <form onSubmit=${guardar}>
      <p class="dialogo-texto"><strong>${paciente.apellido_nombre}</strong></p>
      <${CampoPreferencia} valor=${preferencia} onCambio=${setPreferencia} />
      <div class="acciones-modal">
        <button type="button" class="btn btn-borde" onClick=${onCerrar}>Cancelar</button>
        <button type="submit" class="btn btn-primario" disabled=${guardando}>Anotar</button>
      </div>
    </form>
  <//>`;
}

export function CampoPreferencia({ valor, onCambio }) {
  return html`<div class="campo">
    <span>¿Cuándo le sirve?</span>
    <div class="chips-opciones">
      ${PREFERENCIAS.map((op) => html`<button type="button" key=${op} class=${'chip-opcion ' + (valor === op ? 'activo' : '')} aria-pressed=${valor === op} onClick=${() => onCambio(op)}>${op}</button>`)}
    </div>
    <input class="entrada" value=${valor} onInput=${(e) => onCambio(e.target.value)} placeholder="Otra preferencia" aria-label="Preferencia" />
  </div>`;
}

