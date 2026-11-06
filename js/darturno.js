// Dar turno (o reprogramar): paciente → día y hora → motivo → guardar.
import { html, useState } from './lib.js';
import { estado, useStore, acciones, armarDia, proximasFechas, nombreObraSocial, esperaActivaDe } from './store.js';
import { Icono, armarRuta } from './ui.js';
import { tipoTurno, promoverSobreturnos } from './agenda.js';
import { buscarPacientes, FormPaciente, PACIENTE_VACIO, datosDePaciente, validarPaciente, limpiarPaciente } from './pacientes.js';
import {
  fechaCorta, fechaLarga, diaMes, hoyISO, minutos, hhmm, pluralizar, linkWhatsApp, completarMensaje, datosMensaje,
} from './util.js';

function Paso({ numero, titulo, extra, children }) {
  return html`<section class="tarjeta paso" aria-labelledby=${'paso' + numero}>
    <h2 class="paso-titulo" id=${'paso' + numero}><span class="paso-numero" aria-hidden="true">${numero}</span>${titulo}${extra && html`<span class="paso-extra">${extra}</span>`}</h2>
    ${children}
  </section>`;
}

export function DarTurno({ query }) {
  const st = useStore();
  const original = query.reprogramar ? st.turnos.find((t) => t.id === query.reprogramar) : null;
  const dur = st.config.duracion_min;

  const [pacienteId, setPacienteId] = useState(query.paciente || original?.paciente_id || null);
  const [esNuevo, setEsNuevo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [datos, setDatos] = useState(PACIENTE_VACIO);
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [errores, setErrores] = useState({});

  const [fecha, setFecha] = useState(query.fecha || original?.fecha || null);
  const [hora, setHora] = useState(query.hora || null);
  const [esPractica, setEsPractica] = useState(original?.es_practica || false);
  const [primeraVez, setPrimeraVez] = useState(original ? original.primera_vez : null);
  const [sobreturno, setSobreturno] = useState(false);
  const [motivo, setMotivo] = useState(original?.motivo || '');
  const [observaciones, setObservaciones] = useState(original?.observaciones || '');
  const [verObs, setVerObs] = useState(!!original?.observaciones);
  const [cantidadFechas, setCantidadFechas] = useState(8);

  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(null);
  const [errorGeneral, setErrorGeneral] = useState('');

  if (query.reprogramar && !original) {
    return html`<div class="pagina pagina-angosta">
      <a class="volver" href="#/agenda"><${Icono} n="izq" t=${18} />Volver a la agenda</a>
      <p class="vacio">No se encontró el turno a reprogramar.</p>
    </div>`;
  }

  const paciente = pacienteId ? st.pacientesPorId.get(pacienteId) : null;
  if (guardado) return html`<${TurnoGuardado} turno=${guardado} reprogramado=${!!original} />`;

  // ---------- Día y hora ----------
  const hoy = hoyISO();
  const fechas = proximasFechas(cantidadFechas);
  if (fecha && !fechas.includes(fecha) && fecha >= hoy) fechas.push(fecha);
  fechas.sort();
  const dia = fecha ? armarDia(fecha, { excluir: original?.id }) : null;
  const filaDe = (h) => dia?.filas.find((f) => f.hora === h);
  // ¿Entra como turno común? (libre y, si es práctica, también el horario siguiente)
  const cabe = (f) => {
    if (!f.libre) return false;
    if (!esPractica) return true;
    const siguiente = dia.filas.find((g) => minutos(g.hora) === minutos(f.hora) + dur);
    return !!siguiente && siguiente.libre;
  };
  const opciones = !dia || dia.cerrado ? [] : dia.filas.filter((f) => !f.bloqueo && !f.yaPaso && (sobreturno || cabe(f)));
  const horaValida = !!hora && opciones.some((o) => o.hora === hora);
  const filaElegida = horaValida ? filaDe(hora) : null;
  const esSobreturno = !!filaElegida && !cabe(filaElegida);
  const primeraVezEf = primeraVez ?? esNuevo;

  // ---------- Paciente ----------
  const resultados = !paciente && !esNuevo ? buscarPacientes(busqueda, 6) : [];
  const elegirPaciente = (p) => {
    setPacienteId(p.id);
    setEsNuevo(false);
    setEditandoDatos(false);
    setErrores({});
  };
  const empezarNuevo = () => {
    const texto = busqueda.trim();
    setEsNuevo(true);
    setPacienteId(null);
    setDatos({ ...PACIENTE_VACIO, apellido_nombre: /\d/.test(texto) ? '' : texto, dni: /^\d[\d.]*$/.test(texto) ? texto : '' });
  };
  const cambiarPaciente = () => {
    setPacienteId(null);
    setEsNuevo(false);
    setEditandoDatos(false);
    setErrores({});
  };

  const guardar = async () => {
    setErrorGeneral('');
    const errs = esNuevo || editandoDatos ? validarPaciente(datos) : {};
    setErrores(errs);
    if (!pacienteId && !esNuevo) return setErrorGeneral('Elegí el paciente o cargá uno nuevo.');
    if (Object.keys(errs).length) return setErrorGeneral('Revisá los datos del paciente.');
    if (!fecha || !horaValida) return setErrorGeneral('Elegí el día y el horario.');
    if (primeraVez === null) setPrimeraVez(primeraVezEf); // si falla el guardado, no cambia al reintentar
    setGuardando(true);
    try {
      let pid = pacienteId;
      if (esNuevo) {
        const p = await acciones.crearPaciente(limpiarPaciente(datos));
        pid = p.id;
        setPacienteId(p.id);
        setEsNuevo(false);
      } else if (editandoDatos) {
        await acciones.actualizarPaciente(pid, limpiarPaciente(datos));
        setEditandoDatos(false);
      }
      const datosTurno = {
        paciente_id: pid,
        fecha,
        hora,
        duracion_min: esPractica ? dur * 2 : dur,
        es_practica: esPractica,
        primera_vez: primeraVezEf,
        sobreturno: esSobreturno,
        motivo: motivo.trim() || null,
        observaciones: observaciones.trim() || null,
      };
      const turno = original
        ? await acciones.actualizarTurno(original.id, { ...datosTurno, estado: 'reservado' })
        : await acciones.crearTurno(datosTurno);
      if (original && (original.fecha !== turno.fecha || hhmm(original.hora) !== hhmm(turno.hora))) {
        await promoverSobreturnos(original);
      }
      if (estado.espera.some((e) => e.paciente_id === pid)) {
        await acciones.resolverEsperaDePaciente(pid).catch((e) => console.warn('No se pudo sacar de la lista de espera', e));
      }
      setGuardado(turno);
    } catch (e) {
      console.error(e);
      if (e.codigo === 'ocupado') {
        setErrorGeneral('Ese horario se acaba de ocupar. Elegí otro.');
        setHora(null);
      } else {
        setErrorGeneral('No se pudo guardar. Revisá la conexión e intentá de nuevo.');
      }
    }
    setGuardando(false);
  };

  const nombrePaciente = esNuevo ? datos.apellido_nombre.trim() : paciente?.apellido_nombre;
  const resumen = [
    nombrePaciente || null,
    fecha && horaValida ? `${fecha === hoy ? 'hoy' : fechaLarga(fecha).toLowerCase()} a las ${hora}` : null,
    esPractica ? 'Práctica · 30 min' : primeraVezEf ? 'Primera vez' : 'Control',
    esSobreturno ? 'Sobreturno' : null,
  ].filter(Boolean);

  return html`<div class="pagina pagina-angosta pagina-form">
    <a class="volver" href="#/agenda"><${Icono} n="izq" t=${18} />Volver a la agenda</a>
    <h1>${original ? 'Reprogramar turno' : 'Dar turno'}</h1>
    ${original && html`<p class="sub">Turno actual: ${fechaLarga(original.fecha)} a las ${hhmm(original.hora)}</p>`}

    <${Paso} numero="1" titulo="¿Para quién es el turno?">
      ${paciente && html`<div class="paciente-elegido">
        <span class="circulo-chico" aria-hidden="true"><${Icono} n="check" t=${16} grosor=${3} /></span>
        <span class="fila-textos">
          <span class="fila-nombre">${paciente.apellido_nombre}
            ${esperaActivaDe(paciente.id) && html` <span class="chip chip-azul">En lista de espera</span>`}
          </span>
          <span class="fila-sub">${nombreObraSocial(paciente)}${paciente.dni ? ' · DNI ' + paciente.dni : ''} · Tel. ${paciente.telefono}</span>
        </span>
        ${!original && html`<button type="button" class="btn btn-texto" onClick=${cambiarPaciente}>Cambiar</button>`}
      </div>
      ${editandoDatos
        ? html`<${FormPaciente} datos=${datos} setDatos=${setDatos} errores=${errores} />`
        : html`<div class="fila-ayuda"><span>Sus datos ya están cargados.</span>
            <button type="button" class="btn btn-texto" onClick=${() => { setDatos(datosDePaciente(paciente)); setEditandoDatos(true); }}>Ver o corregir datos</button>
          </div>`}`}

      ${esNuevo && html`<div class="fila-ayuda"><strong>Paciente nuevo</strong>
          <button type="button" class="btn btn-texto" onClick=${cambiarPaciente}>Buscar uno existente</button>
        </div>
        <${FormPaciente} datos=${datos} setDatos=${setDatos} errores=${errores} />`}

      ${!paciente && !esNuevo && html`<label class="campo">
          <span>Buscá por apellido, nombre o DNI</span>
          <span class="buscador buscador-grande">
            <${Icono} n="buscar" />
            <input class="entrada entrada-destacada" type="search" value=${busqueda} onInput=${(e) => setBusqueda(e.target.value)} placeholder="Ej.: Sosa" autocomplete="off" />
          </span>
        </label>
        ${busqueda.trim() && resultados.length === 0 && html`<p class="ayuda">No hay pacientes con esa búsqueda.</p>`}
        <ul class="lista-elegir">
          ${resultados.map((p) => html`<li key=${p.id}><button type="button" class="opcion-paciente" onClick=${() => elegirPaciente(p)}>
            <span class="circulo-vacio-chico" aria-hidden="true"></span>
            <span class="fila-textos">
              <span class="fila-nombre">${p.apellido_nombre}${esperaActivaDe(p.id) && html` <span class="chip chip-azul">En lista de espera</span>`}</span>
              <span class="fila-sub">${nombreObraSocial(p)}${p.dni ? ' · DNI ' + p.dni : ''} · Tel. ${p.telefono}</span>
            </span>
          </button></li>`)}
          <li><button type="button" class="opcion-paciente opcion-nuevo" onClick=${empezarNuevo}>
            <span class="circulo-mas" aria-hidden="true"><${Icono} n="mas" t=${16} grosor=${2.8} /></span>Es un paciente nuevo
          </button></li>
        </ul>`}
    <//>

    <${Paso} numero="2" titulo="¿Qué día y a qué hora?">
      <fieldset class="grupo">
        <legend>Día</legend>
        <div class="chips-dias">
          ${fechas.map((f) => {
            const d = armarDia(f, { excluir: original?.id });
            const etiqueta = f === hoy ? `Hoy ${diaMes(f)}` : fechaCorta(f);
            if (d.cerrado) {
              return html`<span key=${f} class="chip-dia chip-dia-cerrado"><strong>${etiqueta}</strong><small>${d.feriado?.tipo === 'feriado' ? 'Feriado' : 'Bloqueado'}</small></span>`;
            }
            const sub = `${d.feriado ? 'No lab. · ' : ''}${d.libres ? pluralizar(d.libres, 'libre', 'libres') : 'Completo'}`;
            return html`<button type="button" key=${f} class=${'chip-dia ' + (fecha === f ? 'activo' : '')} aria-pressed=${fecha === f}
              onClick=${() => { setFecha(f); if (f !== fecha) setHora(null); }}>
              <strong>${etiqueta}</strong><small>${sub}</small>
            </button>`;
          })}
          <button type="button" class="chip-dia chip-dia-mas" onClick=${() => setCantidadFechas(cantidadFechas + 8)}>Más fechas<${Icono} n="der" t=${16} /></button>
        </div>
      </fieldset>

      ${fecha && html`<fieldset class="grupo">
        <legend>${sobreturno ? 'Horarios' : 'Horarios libres'} del ${fechaCorta(fecha).toLowerCase()}</legend>
        ${opciones.length === 0
          ? html`<p class="ayuda">${dia?.cerrado ? 'Ese día no se atiende.' : esPractica && !sobreturno ? 'No hay dos turnos libres seguidos ese día para una práctica.' : 'No quedan horarios libres ese día.'}</p>`
          : html`<div class="chips-horas">
              ${opciones.map((f) => html`<button type="button" key=${f.hora} class=${'chip-hora ' + (hora === f.hora ? 'activo' : '') + (cabe(f) ? '' : ' chip-hora-ocupada')}
                aria-pressed=${hora === f.hora} onClick=${() => setHora(f.hora)}>
                ${f.hora}${!cabe(f) && html`<small>${f.libre ? 'sobreturno' : 'ocupado'}</small>`}
              </button>`)}
            </div>`}
      </fieldset>`}

      <label class="casilla casilla-grande">
        <input type="checkbox" checked=${sobreturno} onChange=${(e) => setSobreturno(e.target.checked)} />
        Dar sobreturno (mostrar también los horarios ocupados)
      </label>

      <div class="grilla-opciones">
        <fieldset class="grupo">
          <legend>Tipo de turno</legend>
          <div class="grilla-2">
            <label class=${'opcion-radio ' + (!esPractica ? 'activo' : '')}>
              <input type="radio" name="tipo" checked=${!esPractica} onChange=${() => setEsPractica(false)} />
              <span><strong>Consulta</strong><small>${dur} min</small></span>
            </label>
            <label class=${'opcion-radio ' + (esPractica ? 'activo' : '')}>
              <input type="radio" name="tipo" checked=${esPractica} onChange=${() => setEsPractica(true)} />
              <span><strong>Práctica</strong><small>${dur * 2} min · 2 turnos</small></span>
            </label>
          </div>
        </fieldset>
        <fieldset class="grupo">
          <legend>¿Viene por primera vez?</legend>
          <div class="grilla-2">
            <label class=${'opcion-radio ' + (primeraVezEf ? 'activo' : '')}>
              <input type="radio" name="vez" checked=${primeraVezEf} onChange=${() => setPrimeraVez(true)} />
              <span><strong>Primera vez</strong></span>
            </label>
            <label class=${'opcion-radio ' + (!primeraVezEf ? 'activo' : '')}>
              <input type="radio" name="vez" checked=${!primeraVezEf} onChange=${() => setPrimeraVez(false)} />
              <span><strong>Control</strong></span>
            </label>
          </div>
        </fieldset>
      </div>
    <//>

    <${Paso} numero="3" titulo="Motivo de consulta" extra="(opcional)">
      <label class="campo">
        <span class="solo-lector">Motivo de consulta</span>
        <input class="entrada entrada-destacada" value=${motivo} onInput=${(e) => setMotivo(e.target.value)} placeholder="Ej.: control de lunares" autocomplete="off" />
      </label>
      ${verObs
        ? html`<label class="campo"><span>Observaciones del turno</span>
            <textarea class="entrada" rows="2" value=${observaciones} onInput=${(e) => setObservaciones(e.target.value)}></textarea>
          </label>`
        : html`<button type="button" class="btn btn-texto alineado-izq" onClick=${() => setVerObs(true)}><${Icono} n="mas" t=${16} grosor=${2.6} />Agregar una observación</button>`}
    <//>

    <section class="tarjeta confirmar" aria-label="Confirmar turno">
      <p class="resumen">${resumen.length ? resumen.join(' · ') : 'Completá los pasos para dar el turno.'}</p>
      ${errorGeneral && html`<p class="error-general" role="alert">${errorGeneral}</p>`}
      <div class="acciones-fila">
        <button type="button" class="btn btn-primario btn-enorme" disabled=${guardando} onClick=${guardar}>
          <${Icono} n="check" grosor=${2.8} />${guardando ? 'Guardando…' : original ? 'Guardar cambio' : 'Guardar turno'}
        </button>
        <a class="btn btn-borde btn-enorme" href="#/agenda">Cancelar</a>
      </div>
      ${!original && paciente && esperaActivaDe(paciente.id) && html`<p class="ayuda">Al guardar, sale de la lista de espera.</p>`}
    </section>
  </div>`;
}

function TurnoGuardado({ turno, reprogramado }) {
  const st = useStore();
  const p = st.pacientesPorId.get(turno.paciente_id);
  const mensaje = completarMensaje(st.config.mensaje_confirmacion, datosMensaje(st.config, p, turno.fecha, turno.hora));
  return html`<div class="pagina pagina-angosta">
    <section class="tarjeta exito" aria-live="polite">
      <span class="exito-icono" aria-hidden="true"><${Icono} n="check" t=${34} grosor=${3} /></span>
      <h1>${reprogramado ? 'Turno reprogramado' : 'Turno guardado'}</h1>
      <p class="resumen"><strong>${p?.apellido_nombre}</strong><br />${fechaLarga(turno.fecha)} a las ${hhmm(turno.hora)} · ${tipoTurno(turno)}${turno.sobreturno ? ' · Sobreturno' : ''}</p>
      <a class="btn btn-wa btn-enorme" href=${linkWhatsApp(p?.telefono, mensaje)} target="_blank" rel="noopener">
        <${Icono} n="whatsapp" grosor=${2} />Enviar confirmación por WhatsApp
      </a>
      <div class="acciones-fila centrado">
        <a class="btn btn-borde btn-alto" href=${armarRuta('/agenda', { dia: turno.fecha })}>Volver a la agenda</a>
        <a class="btn btn-texto" href=${armarRuta('/turno', { otro: Date.now() })}>Dar otro turno</a>
      </div>
    </section>
  </div>`;
}
