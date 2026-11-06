// Punto de entrada: elige la pantalla según la dirección (#/agenda, #/turno, …).
import { html, render, useState, useEffect, useRef } from './lib.js';
import { useStore, iniciar, refrescar, proximasFechas } from './store.js';
import { backend } from './backend.js';
import { useRuta } from './router.js';
import { Encabezado, PreguntaQuien, Cargando, Avisos, Dialogos, useEsCompu, Icono } from './ui.js';
import { itemsMenu } from './menu.js';
import { Agenda } from './agenda.js';
import { DarTurno } from './darturno.js';
import { ListaEspera } from './espera.js';
import { Pacientes, FichaPaciente } from './pacientes.js';
import { Planilla } from './planilla.js';
import { Ajustes } from './ajustes.js';

const TITULOS = {
  agenda: 'Agenda',
  turno: 'Dar turno',
  espera: 'Lista de espera',
  pacientes: 'Pacientes',
  planilla: 'Planilla del día',
  ajustes: 'Ajustes',
};

const esFecha = (t) => /^\d{4}-\d{2}-\d{2}$/.test(t || '');

function Pagina({ ruta, esCompu }) {
  const [seccion, parametro] = ruta.partes;
  switch (seccion) {
    case 'turno':
      return html`<${DarTurno} query=${ruta.query} />`;
    case 'espera':
      return html`<${ListaEspera} />`;
    case 'pacientes':
      return parametro ? html`<${FichaPaciente} id=${parametro} />` : html`<${Pacientes} />`;
    case 'planilla':
      return html`<${Planilla} fecha=${esFecha(parametro) ? parametro : proximasFechas(1)[0]} />`;
    case 'ajustes':
      return html`<${Ajustes} query=${ruta.query} />`;
    default:
      return html`<${Agenda} esCompu=${esCompu} query=${ruta.query} />`;
  }
}

// Pantalla de entrada: se pide la clave del consultorio una sola vez por dispositivo.
function Entrar({ onEntrar, mensaje = '' }) {
  const [clave, setClave] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState(mensaje);
  const [entrando, setEntrando] = useState(false);
  const entrada = useRef(null);
  useEffect(() => entrada.current?.focus(), []);
  const enviar = async (e) => {
    e.preventDefault();
    if (!clave.trim()) return setError('Escribí la clave.');
    setEntrando(true);
    setError('');
    try {
      await backend.entrar(clave.trim());
      onEntrar();
    } catch (err) {
      setError({
        clave: 'La clave no es correcta.',
        muchos: 'Hubo demasiados intentos. Esperá unos minutos y probá de nuevo.',
      }[err.codigo] || 'No se pudo conectar. Revisá que haya internet y probá de nuevo.');
      setEntrando(false);
      entrada.current?.select();
    }
  };
  return html`<div class="pantalla-entrar">
    <form class="tarjeta entrar" onSubmit=${enviar}>
      <img class="logo" src="img/logo.png" alt="CC Consultorios" width="76" height="76" />
      <div class="entrar-titulos">
        <h1>Turnero</h1>
        <p class="entrar-doctora">Dra. María Carolina Moreno · Dermatología</p>
      </div>
      <p class="ayuda">Escribí la clave del consultorio. Se pide una sola vez en cada computadora o celular.</p>
      <input type="text" name="username" autocomplete="username" value="Turnero Dra. Moreno" readonly tabindex="-1" aria-hidden="true" class="solo-lector" />
      <div class="campo">
        <label for="clave-consultorio">Clave</label>
        <span class="clave-fila">
          <input ref=${entrada} id="clave-consultorio" class="entrada entrada-destacada" type=${ver ? 'text' : 'password'} name="password"
            autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck=${false}
            value=${clave} onInput=${(e) => setClave(e.target.value)} aria-invalid=${!!error} />
          <button type="button" class="btn btn-texto" aria-pressed=${ver} aria-controls="clave-consultorio"
            aria-label=${ver ? 'Ocultar la clave' : 'Mostrar la clave'} onClick=${() => setVer(!ver)}>${ver ? 'Ocultar' : 'Mostrar'}</button>
        </span>
      </div>
      ${error && html`<p class="error-general" role="alert">${error}</p>`}
      <button type="submit" class="btn btn-primario btn-enorme" disabled=${entrando}>${entrando ? 'Entrando…' : 'Entrar'}</button>
      <p class="ayuda centrado-texto">Si nadie recuerda la clave, pedile una nueva a quien administra el turnero.</p>
    </form>
  </div>`;
}

function ErrorCarga() {
  const [reintentando, setReintentando] = useState(false);
  return html`<div class="pantalla-error" role="alert">
    <img src="img/logo.png" alt="" width="64" height="64" />
    <h1>No se pudo abrir la agenda</h1>
    <p>Revisá que haya conexión a internet y volvé a intentar.</p>
    <button type="button" class="btn btn-primario btn-alto" disabled=${reintentando}
      onClick=${async () => { setReintentando(true); await refrescar(); setReintentando(false); }}>
      ${reintentando ? 'Intentando…' : 'Volver a intentar'}
    </button>
  </div>`;
}

function SinConexion() {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    const si = () => setEnLinea(true);
    const no = () => setEnLinea(false);
    window.addEventListener('online', si);
    window.addEventListener('offline', no);
    return () => {
      window.removeEventListener('online', si);
      window.removeEventListener('offline', no);
    };
  }, []);
  if (enLinea) return null;
  return html`<div class="sin-conexion no-imprimir" role="status">
    <${Icono} n="x" t=${16} grosor=${2.6} />Sin conexión: lo que ves puede no estar al día y no se pueden guardar cambios.
  </div>`;
}

function App() {
  const st = useStore();
  const ruta = useRuta();
  const esCompu = useEsCompu();
  const seccion = ruta.partes[0] || 'agenda';
  // revisando → pedir (pantalla de clave) → adentro
  const [acceso, setAcceso] = useState('revisando');
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    backend.sesionActual()
      .then((sesion) => setAcceso(sesion ? 'adentro' : 'pedir'))
      .catch(() => setAcceso('pedir'));
    backend.alPerderSesion(() => {
      setMotivo('Se cerró la sesión en este dispositivo. Volvé a escribir la clave.');
      setAcceso('pedir');
    });
  }, []);

  useEffect(() => {
    if (acceso === 'adentro') iniciar();
  }, [acceso]);

  // Si la base rechaza la sesión (por ejemplo, porque se dio de baja la cuenta), se vuelve a pedir la clave.
  useEffect(() => {
    if (acceso === 'adentro' && !st.config && st.error?.codigo === 'sin_permiso') {
      backend.salir().catch(() => {});
      setMotivo('La sesión ya no es válida. Volvé a escribir la clave.');
      setAcceso('pedir');
    }
  }, [acceso, st.error]);

  useEffect(() => {
    document.title = `${TITULOS[seccion] || 'Turnero'} · Dra. Moreno`;
  }, [seccion]);

  if (acceso === 'revisando') return html`<${Cargando} texto="Abriendo la agenda…" />`;
  if (acceso === 'pedir') return html`<${Entrar} mensaje=${motivo} onEntrar=${() => { setMotivo(''); setAcceso('adentro'); }} />`;
  if (!st.config) return st.cargando || !st.error ? html`<${Cargando} texto="Abriendo la agenda…" />` : html`<${ErrorCarga} />`;

  const fechaReferencia = seccion === 'planilla' && esFecha(ruta.partes[1]) ? ruta.partes[1] : proximasFechas(1)[0];
  return html`<div class=${'app ' + (esCompu ? 'es-compu' : 'es-celular') + ' seccion-' + seccion}>
    <${SinConexion} />
    <${Encabezado} seccion=${seccion} esCompu=${esCompu} itemsMenu=${itemsMenu(fechaReferencia)} />
    <main id="contenido" key=${location.hash || '#/agenda'}>
      <${Pagina} ruta=${ruta} esCompu=${esCompu} />
    </main>
    ${!st.quien && html`<${PreguntaQuien} />`}
    <${Avisos} />
    <${Dialogos} />
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
