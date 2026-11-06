// Ajustes: quién usa el dispositivo, bloqueos, feriados, obras sociales, horario, mensajes y respaldo.
import { html, useState, useEffect } from './lib.js';
import { estado, useStore, acciones, setQuien, proximasFechas, armarDia } from './store.js';
import { Icono, aviso, avisoError, confirmar } from './ui.js';
import { exportarExcel } from './excel.js';
import { backend } from './backend.js';
import { fechaLarga, fechaCorta, fechaNumerica, hoyISO, hhmm, horariosDelDia, pluralizar, diaSemana } from './util.js';

const DIAS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [7, 'Domingo']];

function Seccion({ id, titulo, descripcion, children }) {
  return html`<section class="tarjeta seccion-ajustes" id=${id} aria-labelledby=${'t-' + id}>
    <h2 class="tarjeta-titulo" id=${'t-' + id}>${titulo}</h2>
    ${descripcion && html`<p class="ayuda">${descripcion}</p>`}
    ${children}
  </section>`;
}

export function Ajustes({ query }) {
  useEffect(() => {
    if (query.seccion) setTimeout(() => document.getElementById(query.seccion)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [query.seccion]);
  return html`<div class="pagina pagina-angosta">
    <a class="volver" href="#/agenda"><${Icono} n="izq" t=${18} />Volver a la agenda</a>
    <h1>Ajustes</h1>
    <${QuienUsa} />
    <${Bloqueos} />
    <${Feriados} />
    <${ObrasSociales} />
    <${Horario} />
    <${Mensajes} />
    <${Consultorio} />
    <${Acceso} />
    <${Seccion} id="respaldo" titulo="Respaldo" descripcion="Descarga un Excel con todos los turnos, pacientes y la lista de espera.">
      <button type="button" class="btn btn-borde-azul btn-alto alineado-izq" onClick=${() => exportarExcel()}><${Icono} n="descargar" />Exportar todo a Excel</button>
    <//>
  </div>`;
}

function QuienUsa() {
  const st = useStore();
  const [otro, setOtro] = useState(['Doctora', 'Secretaria'].includes(st.quien) ? '' : st.quien);
  return html`<${Seccion} id="quien" titulo="¿Quién usa este dispositivo?" descripcion="Se guarda en cada turno quién lo cargó o lo modificó.">
    <div class="chips-opciones">
      ${['Doctora', 'Secretaria'].map((n) => html`<button type="button" key=${n} class=${'chip-opcion ' + (st.quien === n ? 'activo' : '')} aria-pressed=${st.quien === n} onClick=${() => { setQuien(n); aviso('Listo.'); }}>${n}</button>`)}
    </div>
    <form class="fila-form" onSubmit=${(e) => { e.preventDefault(); if (otro.trim()) { setQuien(otro.trim()); aviso('Listo.'); } }}>
      <label class="campo campo-flex"><span>Otra persona</span><input class="entrada" value=${otro} onInput=${(e) => setOtro(e.target.value)} placeholder="Nombre" /></label>
      <button type="submit" class="btn btn-borde" disabled=${!otro.trim()}>Guardar</button>
    </form>
  <//>`;
}

function Bloqueos() {
  const st = useStore();
  const fechas = proximasFechas(16);
  const [fecha, setFecha] = useState(fechas[0]);
  const [todoElDia, setTodoElDia] = useState(true);
  const [hora, setHora] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const horas = horariosDelDia(st.config);
  const hoy = hoyISO();
  const proximos = st.bloqueos.filter((b) => b.fecha >= hoy);

  const bloquear = async (e) => {
    e.preventDefault();
    if (!todoElDia && !hora) return aviso('Elegí el horario a bloquear.', { tipo: 'error' });
    const dia = armarDia(fecha);
    const conTurno = dia.filas.filter((f) => (todoElDia || f.hora === hora) && (f.principal || f.sobreturnos.length)).length;
    if (conTurno) {
      const ok = await confirmar({
        titulo: 'Hay turnos dados',
        mensaje: `${todoElDia ? 'Ese día' : 'Ese horario'} tiene ${pluralizar(conTurno, 'turno', 'turnos')}. Bloquear no los cancela: avisales y cancelalos desde la agenda si hace falta.`,
        textoSi: 'Bloquear igual',
        textoNo: 'Volver',
      });
      if (!ok) return;
    }
    setGuardando(true);
    try {
      await acciones.crearBloqueo({ fecha, hora: todoElDia ? null : hora, motivo: motivo.trim() || null });
      aviso(todoElDia ? `${fechaLarga(fecha)} quedó bloqueado.` : `${fechaCorta(fecha)} a las ${hora} quedó bloqueado.`);
      setMotivo('');
    } catch (err) {
      avisoError(err, err.codigo === 'duplicado' ? 'Eso ya estaba bloqueado.' : undefined);
    }
    setGuardando(false);
  };

  return html`<${Seccion} id="bloqueos" titulo="Bloquear días u horarios" descripcion="Para vacaciones, congresos o cualquier día u horario en que no se atiende.">
    <form class="form-bloqueo" onSubmit=${bloquear}>
      <label class="campo"><span>Día</span>
        <select class="entrada" value=${fecha} onChange=${(e) => setFecha(e.target.value)}>
          ${fechas.map((f) => html`<option key=${f} value=${f}>${fechaLarga(f)}</option>`)}
        </select>
      </label>
      <div class="chips-opciones">
        <button type="button" class=${'chip-opcion ' + (todoElDia ? 'activo' : '')} aria-pressed=${todoElDia} onClick=${() => setTodoElDia(true)}>Todo el día</button>
        <button type="button" class=${'chip-opcion ' + (!todoElDia ? 'activo' : '')} aria-pressed=${!todoElDia} onClick=${() => setTodoElDia(false)}>Un horario</button>
      </div>
      ${!todoElDia && html`<label class="campo"><span>Horario</span>
        <select class="entrada" value=${hora} onChange=${(e) => setHora(e.target.value)}>
          <option value="">Elegir…</option>
          ${horas.map((h) => html`<option key=${h} value=${h}>${h}</option>`)}
        </select>
      </label>`}
      <label class="campo"><span>Motivo (opcional)</span><input class="entrada" value=${motivo} onInput=${(e) => setMotivo(e.target.value)} placeholder="Ej.: congreso" /></label>
      <button type="submit" class="btn btn-primario btn-alto alineado-izq" disabled=${guardando}><${Icono} n="candado" />Bloquear</button>
    </form>
    ${proximos.length > 0 && html`<ul class="lista-simple">
      ${proximos.map((b) => html`<li key=${b.id}>
        <span><strong>${fechaCorta(b.fecha)}</strong> · ${b.hora ? hhmm(b.hora) : 'todo el día'}${b.motivo ? ' · ' + b.motivo : ''}</span>
        <button type="button" class="btn btn-texto" onClick=${() => acciones.borrarBloqueo(b.id).then(() => aviso('Desbloqueado.')).catch((e) => avisoError(e))}>Desbloquear</button>
      </li>`)}
    </ul>`}
  <//>`;
}

function Feriados() {
  const st = useStore();
  const hoy = hoyISO();
  const [fecha, setFecha] = useState('');
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('feriado');
  const proximos = st.feriados.filter((f) => f.fecha >= hoy);
  const agregar = async (e) => {
    e.preventDefault();
    if (!fecha || !nombre.trim()) return aviso('Completá la fecha y el nombre.', { tipo: 'error' });
    try {
      await acciones.crearFeriado({ fecha, nombre: nombre.trim(), tipo });
      aviso('Feriado agregado.');
      setFecha('');
      setNombre('');
    } catch (err) {
      avisoError(err, err.codigo === 'duplicado' ? 'Esa fecha ya estaba cargada.' : undefined);
    }
  };
  const quitar = async (f) => {
    if (!(await confirmar({ titulo: '¿Quitar este feriado?', mensaje: `${fechaNumerica(f.fecha)} · ${f.nombre}`, textoSi: 'Quitar', textoNo: 'Volver' }))) return;
    acciones.borrarFeriado(f.fecha).then(() => aviso('Feriado quitado.')).catch((e) => avisoError(e));
  };
  return html`<${Seccion} id="feriados" titulo="Feriados" descripcion="Los feriados cierran la agenda ese día. Los días no laborables se marcan pero dejan dar turnos. Los traslados de 2027 están sin confirmar: revisalos cuando salga el calendario oficial.">
    <ul class="lista-simple">
      ${proximos.map((f) => html`<li key=${f.fecha}>
        <span><strong>${fechaNumerica(f.fecha)}</strong> · ${f.nombre}${f.tipo === 'no_laborable' ? ' (no laborable)' : ''}</span>
        <button type="button" class="btn btn-texto" onClick=${() => quitar(f)}>Quitar</button>
      </li>`)}
    </ul>
    <form class="form-feriado" onSubmit=${agregar}>
      <label class="campo"><span>Fecha</span><input class="entrada" type="date" value=${fecha} onInput=${(e) => setFecha(e.target.value)} /></label>
      <label class="campo campo-flex"><span>Nombre</span><input class="entrada" value=${nombre} onInput=${(e) => setNombre(e.target.value)} placeholder="Ej.: Día de la Virgen del Rosario" /></label>
      <label class="campo"><span>Tipo</span>
        <select class="entrada" value=${tipo} onChange=${(e) => setTipo(e.target.value)}>
          <option value="feriado">Feriado (no se atiende)</option>
          <option value="no_laborable">No laborable (se puede atender)</option>
        </select>
      </label>
      <button type="submit" class="btn btn-borde-azul btn-alto"><${Icono} n="mas" grosor=${2.6} />Agregar</button>
    </form>
  <//>`;
}

function ObrasSociales() {
  const st = useStore();
  const [nombre, setNombre] = useState('');
  const agregar = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    try {
      await acciones.crearObraSocial(nombre.trim());
      aviso('Obra social agregada.');
      setNombre('');
    } catch (err) {
      avisoError(err, err.codigo === 'duplicado' ? 'Esa obra social ya está en la lista.' : undefined);
    }
  };
  const activas = st.obras.filter((o) => o.activa).length;
  return html`<${Seccion} id="obras" titulo="Obras sociales" descripcion=${`${activas} en la lista. Las que se quitan dejan de aparecer al dar turno, pero los pacientes que ya la tienen la conservan.`}>
    <form class="fila-form" onSubmit=${agregar}>
      <label class="campo campo-flex"><span>Agregar obra social</span><input class="entrada" value=${nombre} onInput=${(e) => setNombre(e.target.value)} placeholder="Nombre" /></label>
      <button type="submit" class="btn btn-borde-azul" disabled=${!nombre.trim()}>Agregar</button>
    </form>
    <ul class="lista-simple lista-obras">
      ${st.obras.map((o) => html`<li key=${o.id} class=${o.activa ? '' : 'inactiva'}>
        <span>${o.nombre}${!o.activa ? ' (quitada)' : ''}</span>
        ${!o.es_particular && html`<button type="button" class="btn btn-texto"
          onClick=${() => acciones.actualizarObraSocial(o.id, { activa: !o.activa }).catch((e) => avisoError(e))}>${o.activa ? 'Quitar' : 'Volver a agregar'}</button>`}
      </li>`)}
    </ul>
  <//>`;
}

function Horario() {
  const st = useStore();
  const [d, setD] = useState({
    dia_semana: st.config.dia_semana,
    hora_inicio: hhmm(st.config.hora_inicio),
    hora_fin: hhmm(st.config.hora_fin),
    duracion_min: st.config.duracion_min,
  });
  const guardar = async (e) => {
    e.preventDefault();
    if (!d.hora_inicio || !d.hora_fin || d.hora_fin <= d.hora_inicio) return aviso('La hora de fin tiene que ser posterior al inicio.', { tipo: 'error' });
    const hoy = hoyISO();
    const enOtroDia = estado.turnos.filter((t) => t.estado === 'reservado' && t.fecha >= hoy && diaSemana(t.fecha) !== Number(d.dia_semana)).length;
    const ok = await confirmar({
      titulo: '¿Cambiar el horario de atención?',
      mensaje: 'Los turnos ya dados no se mueven. Solo cambian los horarios que se ofrecen de acá en adelante.'
        + (enOtroDia ? ` Ojo: hay ${pluralizar(enOtroDia, 'turno reservado', 'turnos reservados')} en otro día de la semana que no se van a ver en la agenda (sí en la ficha de cada paciente) hasta que los reprogramés.` : ''),
      textoSi: 'Cambiar',
      textoNo: 'Volver',
    });
    if (!ok) return;
    try {
      await acciones.guardarConfiguracion({ ...d, dia_semana: Number(d.dia_semana), duracion_min: Number(d.duracion_min) });
      aviso('Horario actualizado.');
    } catch (err) {
      avisoError(err);
    }
  };
  return html`<${Seccion} id="horario" titulo="Horario de atención">
    <form class="form-horario" onSubmit=${guardar}>
      <label class="campo"><span>Día</span>
        <select class="entrada" value=${d.dia_semana} onChange=${(e) => setD({ ...d, dia_semana: e.target.value })}>
          ${DIAS.map(([n, t]) => html`<option key=${n} value=${n}>${t}</option>`)}
        </select>
      </label>
      <label class="campo"><span>Desde</span><input class="entrada" type="time" step="300" value=${d.hora_inicio} onInput=${(e) => setD({ ...d, hora_inicio: e.target.value })} /></label>
      <label class="campo"><span>Hasta</span><input class="entrada" type="time" step="300" value=${d.hora_fin} onInput=${(e) => setD({ ...d, hora_fin: e.target.value })} /></label>
      <label class="campo"><span>Turnos de</span>
        <select class="entrada" value=${d.duracion_min} onChange=${(e) => setD({ ...d, duracion_min: e.target.value })}>
          ${[10, 15, 20, 30].map((m) => html`<option key=${m} value=${m}>${m} minutos</option>`)}
        </select>
      </label>
      <button type="submit" class="btn btn-borde-azul btn-alto">Guardar horario</button>
    </form>
  <//>`;
}

function Mensajes() {
  const st = useStore();
  const [m, setM] = useState({
    mensaje_confirmacion: st.config.mensaje_confirmacion,
    mensaje_recordatorio: st.config.mensaje_recordatorio,
    mensaje_espera: st.config.mensaje_espera,
  });
  const guardar = async (e) => {
    e.preventDefault();
    try {
      await acciones.guardarConfiguracion(m);
      aviso('Mensajes guardados.');
    } catch (err) {
      avisoError(err);
    }
  };
  const area = (campo, etiqueta) => html`<label class="campo"><span>${etiqueta}</span>
    <textarea class="entrada" rows="3" value=${m[campo]} onInput=${(e) => setM({ ...m, [campo]: e.target.value })}></textarea>
  </label>`;
  return html`<${Seccion} id="mensajes" titulo="Mensajes de WhatsApp"
    descripcion="Palabras que se completan solas: {nombre}, {dia}, {fecha}, {hora}, {profesional}, {especialidad}, {consultorio}, {direccion}.">
    <form class="form-mensajes" onSubmit=${guardar}>
      ${area('mensaje_confirmacion', 'Al dar un turno')}
      ${area('mensaje_recordatorio', 'Recordatorio')}
      ${area('mensaje_espera', 'Aviso a la lista de espera')}
      <button type="submit" class="btn btn-borde-azul btn-alto alineado-izq">Guardar mensajes</button>
    </form>
  <//>`;
}

function Consultorio() {
  const st = useStore();
  const [c, setC] = useState({
    profesional: st.config.profesional,
    especialidad: st.config.especialidad,
    consultorio: st.config.consultorio,
    direccion: st.config.direccion,
  });
  const guardar = async (e) => {
    e.preventDefault();
    if (Object.values(c).some((v) => !v.trim())) return aviso('Completá todos los datos.', { tipo: 'error' });
    try {
      await acciones.guardarConfiguracion(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.trim()])));
      aviso('Datos guardados.');
    } catch (err) {
      avisoError(err);
    }
  };
  const campo = (k, etiqueta) => html`<label class="campo"><span>${etiqueta}</span><input class="entrada" value=${c[k]} onInput=${(e) => setC({ ...c, [k]: e.target.value })} /></label>`;
  return html`<${Seccion} id="consultorio" titulo="Datos del consultorio" descripcion="Se usan en los mensajes de WhatsApp y en la planilla impresa.">
    <form class="form-consultorio" onSubmit=${guardar}>
      ${campo('profesional', 'Profesional')}
      ${campo('especialidad', 'Especialidad')}
      ${campo('consultorio', 'Consultorio')}
      ${campo('direccion', 'Dirección')}
      <button type="submit" class="btn btn-borde-azul btn-alto alineado-izq">Guardar datos</button>
    </form>
  <//>`;
}

function Acceso() {
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [guardando, setGuardando] = useState(false);
  const cambiar = async (e) => {
    e.preventDefault();
    if (nueva.trim().length < 8) return aviso('La clave nueva tiene que tener al menos 8 letras o números.', { tipo: 'error' });
    if (nueva.trim() !== repetida.trim()) return aviso('Las dos claves no coinciden.', { tipo: 'error' });
    setGuardando(true);
    try {
      await backend.cambiarClave(nueva.trim());
      aviso('Clave cambiada. Donde ya habían entrado sigue funcionando; en dispositivos nuevos se usa la clave nueva.', { duracion: 9000 });
      setNueva('');
      setRepetida('');
    } catch (err) {
      aviso({
        misma: 'Esa ya es la clave actual.',
        debil: 'Esa clave es muy fácil de adivinar. Probá con una más larga.',
      }[err.codigo] || 'No se pudo cambiar la clave. Revisá la conexión e intentá de nuevo.', { tipo: 'error', duracion: 7000 });
    }
    setGuardando(false);
  };
  const salir = async () => {
    const ok = await confirmar({
      titulo: '¿Cerrar la sesión en este dispositivo?',
      mensaje: 'Para volver a entrar va a hacer falta la clave del consultorio.',
      textoSi: 'Cerrar sesión',
      textoNo: 'Volver',
    });
    if (!ok) return;
    await backend.salir().catch(() => {});
    location.hash = '#/agenda';
    location.reload();
  };
  return html`<${Seccion} id="acceso" titulo="Clave del consultorio"
    descripcion="Se pide una sola vez en cada computadora o celular. Si la cambiás, avisales la nueva a quienes la usen.">
    <form class="form-clave" onSubmit=${cambiar}>
      <input type="text" name="username" autocomplete="username" value="Turnero Dra. Moreno" readonly tabindex="-1" aria-hidden="true" class="solo-lector" />
      <label class="campo"><span>Clave nueva</span>
        <input class="entrada" type="password" autocomplete="new-password" autocapitalize="none" value=${nueva} onInput=${(e) => setNueva(e.target.value)} />
      </label>
      <label class="campo"><span>Repetí la clave nueva</span>
        <input class="entrada" type="password" autocomplete="new-password" autocapitalize="none" value=${repetida} onInput=${(e) => setRepetida(e.target.value)} />
      </label>
      <button type="submit" class="btn btn-borde-azul" disabled=${guardando || !nueva || !repetida}>${guardando ? 'Cambiando…' : 'Cambiar clave'}</button>
    </form>
    <button type="button" class="btn btn-texto texto-peligro alineado-izq" onClick=${salir}>Cerrar sesión en este dispositivo</button>
  <//>`;
}
