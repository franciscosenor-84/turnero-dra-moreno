// Lista de espera: pacientes que quieren un turno antes. Cuando se libera un horario, se les avisa en orden.
import { html, useState } from './lib.js';
import { estado, useStore, acciones, horariosLiberados, proximoLibre, nombreObraSocial } from './store.js';
import { Icono, Modal, aviso, avisoError, confirmar, armarRuta } from './ui.js';
import { buscarPacientes, FormPaciente, PACIENTE_VACIO, validarPaciente, limpiarPaciente, CampoPreferencia } from './pacientes.js';
import { fechaLarga, fechaCorta, fechaNumerica, hoyISO, linkWhatsApp, completarMensaje, datosMensaje } from './util.js';

export function ListaEspera() {
  const st = useStore();
  const [anotando, setAnotando] = useState(false);
  const liberados = horariosLiberados();
  const destacado = liberados[0] || null;
  const sugerido = destacado || proximoLibre();
  const hoy = hoyISO();
  const textoHorario = (h) => `${h.fecha === hoy ? 'hoy' : fechaCorta(h.fecha)} ${h.hora}`;

  const quitar = async (e, p) => {
    const ok = await confirmar({ titulo: '¿Quitar de la lista de espera?', mensaje: p?.apellido_nombre, textoSi: 'Quitar', textoNo: 'Volver' });
    if (!ok) return;
    try {
      await acciones.resolverEspera(e.id, 'quitado');
      aviso('Se quitó de la lista de espera.');
    } catch (err) {
      avisoError(err);
    }
  };

  return html`<div class="pagina pagina-angosta">
    <div class="titulo-pagina">
      <div>
        <h1>Lista de espera</h1>
        <p class="sub">Pacientes que quieren un turno antes. Se avisa en orden de llegada.</p>
      </div>
      <button type="button" class="btn btn-borde-azul btn-alto" onClick=${() => setAnotando(true)}><${Icono} n="mas" grosor=${2.6} />Anotar paciente</button>
    </div>

    ${destacado && html`<div class="banner">
      <${Icono} n="calendario" t=${24} grosor=${2} />
      <p><strong>Se liberó un turno:</strong> ${destacado.fecha === hoy ? 'hoy, ' + fechaLarga(destacado.fecha).toLowerCase() : fechaLarga(destacado.fecha)} a las ${destacado.hora}
        ${liberados.length > 1 ? ` (y ${liberados.length - 1} más)` : ''}.</p>
    </div>`}

    ${st.espera.length === 0
      ? html`<p class="vacio">No hay nadie en la lista de espera.</p>`
      : html`<ol class="tarjeta lista-espera" aria-label="Pacientes en espera">
          ${st.espera.map((e, i) => {
            const p = st.pacientesPorId.get(e.paciente_id);
            if (!p) return null;
            const mensaje = sugerido
              ? completarMensaje(st.config.mensaje_espera, datosMensaje(st.config, p, sugerido.fecha, sugerido.hora))
              : '';
            return html`<li key=${e.id} class="fila-espera">
              <span class=${'numero-orden ' + (i === 0 ? 'primero' : '')} aria-hidden="true">${i + 1}</span>
              <div class="fila-textos espera-textos">
                <a class="fila-nombre enlace-oscuro" href=${'#/pacientes/' + p.id}>${p.apellido_nombre}</a>
                <span class="fila-sub">${nombreObraSocial(p)} · ${p.telefono}</span>
                <span class="fila-sub">${e.preferencia ? e.preferencia + ' · ' : ''}Anotado el ${fechaNumerica(e.anotado_en).slice(0, 5)}</span>
              </div>
              <div class="acciones-fila">
                <a class="btn btn-wa" href=${linkWhatsApp(p.telefono, mensaje)} target="_blank" rel="noopener"><${Icono} n="whatsapp" t=${18} grosor=${2} />Avisar</a>
                ${sugerido
                  ? html`<a class=${'btn ' + (i === 0 ? 'btn-primario' : 'btn-borde-azul')} href=${armarRuta('/turno', { paciente: p.id, fecha: sugerido.fecha, hora: sugerido.hora })}>Darle ${textoHorario(sugerido)}</a>`
                  : html`<a class="btn btn-borde-azul" href=${armarRuta('/turno', { paciente: p.id })}>Darle turno</a>`}
                <button type="button" class="btn btn-texto texto-gris" aria-label=${'Quitar de la lista: ' + p.apellido_nombre} onClick=${() => quitar(e, p)}>Quitar</button>
              </div>
            </li>`;
          })}
        </ol>`}
    <p class="ayuda">Cuando le das el turno a alguien, sale de la lista solo.</p>

    ${anotando && html`<${AnotarPaciente} onCerrar=${() => setAnotando(false)} />`}
  </div>`;
}

// Anotar en la lista: buscar un paciente existente o cargar uno nuevo
function AnotarPaciente({ onCerrar }) {
  const [busqueda, setBusqueda] = useState('');
  const [paciente, setPaciente] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [datos, setDatos] = useState(PACIENTE_VACIO);
  const [errores, setErrores] = useState({});
  const [preferencia, setPreferencia] = useState('Cualquier lunes');
  const [guardando, setGuardando] = useState(false);
  const resultados = !paciente && !nuevo ? buscarPacientes(busqueda, 6) : [];

  const guardar = async (ev) => {
    ev.preventDefault();
    let pid = paciente?.id;
    if (nuevo) {
      const errs = validarPaciente(datos);
      setErrores(errs);
      if (Object.keys(errs).length) return;
    } else if (!pid) {
      return;
    }
    setGuardando(true);
    try {
      if (nuevo) pid = (await acciones.crearPaciente(limpiarPaciente(datos))).id;
      if (estado.espera.some((e) => e.paciente_id === pid)) {
        aviso('Ese paciente ya estaba en la lista de espera.');
      } else {
        await acciones.crearEspera({ paciente_id: pid, preferencia: preferencia.trim() || null });
        aviso('Quedó anotado en la lista de espera.');
      }
      onCerrar();
    } catch (err) {
      avisoError(err);
      setGuardando(false);
    }
  };

  return html`<${Modal} titulo="Anotar en lista de espera" onCerrar=${onCerrar}>
    <form onSubmit=${guardar}>
      ${paciente && html`<div class="paciente-elegido">
        <span class="circulo-chico" aria-hidden="true"><${Icono} n="check" t=${16} grosor=${3} /></span>
        <span class="fila-textos"><span class="fila-nombre">${paciente.apellido_nombre}</span><span class="fila-sub">${nombreObraSocial(paciente)} · ${paciente.telefono}</span></span>
        <button type="button" class="btn btn-texto" onClick=${() => setPaciente(null)}>Cambiar</button>
      </div>`}
      ${nuevo && html`<div class="fila-ayuda"><strong>Paciente nuevo</strong><button type="button" class="btn btn-texto" onClick=${() => setNuevo(false)}>Buscar uno existente</button></div>
        <${FormPaciente} datos=${datos} setDatos=${setDatos} errores=${errores} />`}
      ${!paciente && !nuevo && html`<label class="buscador buscador-grande">
          <span class="solo-lector">Buscar paciente</span>
          <${Icono} n="buscar" />
          <input class="entrada" type="search" value=${busqueda} onInput=${(e) => setBusqueda(e.target.value)} placeholder="Buscar por apellido o DNI" autocomplete="off" />
        </label>
        <ul class="lista-elegir">
          ${resultados.map((p) => html`<li key=${p.id}><button type="button" class="opcion-paciente" onClick=${() => setPaciente(p)}>
            <span class="circulo-vacio-chico" aria-hidden="true"></span>
            <span class="fila-textos"><span class="fila-nombre">${p.apellido_nombre}</span><span class="fila-sub">${nombreObraSocial(p)} · ${p.telefono}</span></span>
          </button></li>`)}
          <li><button type="button" class="opcion-paciente opcion-nuevo" onClick=${() => { setNuevo(true); setDatos({ ...PACIENTE_VACIO, apellido_nombre: /\d/.test(busqueda) ? '' : busqueda.trim() }); }}>
            <span class="circulo-mas" aria-hidden="true"><${Icono} n="mas" t=${16} grosor=${2.8} /></span>Es un paciente nuevo
          </button></li>
        </ul>`}
      ${(paciente || nuevo) && html`<${CampoPreferencia} valor=${preferencia} onCambio=${setPreferencia} />`}
      <div class="acciones-modal">
        <button type="button" class="btn btn-borde" onClick=${onCerrar}>Cancelar</button>
        <button type="submit" class="btn btn-primario" disabled=${guardando || (!paciente && !nuevo)}>Anotar</button>
      </div>
    </form>
  <//>`;
}
