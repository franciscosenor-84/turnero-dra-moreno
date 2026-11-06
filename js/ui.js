// Piezas de interfaz compartidas: íconos, avisos, diálogos, encabezado y menú.
import { html, useEffect, useState, useReducer } from './lib.js';
import { estado, useStore, setQuien } from './store.js';
import { armarRuta, navegar } from './router.js';

// ---------- Íconos ----------

const TRAZOS = {
  izq: '<polyline points="15 18 9 12 15 6"></polyline>',
  der: '<polyline points="9 18 15 12 9 6"></polyline>',
  abajo: '<polyline points="6 9 12 15 18 9"></polyline>',
  mas: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  check: '<polyline points="20 6 9 17 4 12"></polyline>',
  x: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
  reloj: '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline>',
  buscar: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
  whatsapp: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>',
  imprimir: '<polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect>',
  descargar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>',
  candado: '<rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
  flecha: '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
  lapiz: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>',
  ajustes: '<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>',
  usuario: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
  seguir: '<polyline points="15 10 20 15 15 20"></polyline><path d="M4 4v7a4 4 0 0 0 4 4h12"></path>',
  basura: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>',
  lista: '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>',
};

export function Icono({ n, t = 20, grosor = 2.2, clase = '' }) {
  if (n === 'puntos') {
    return html`<svg class=${'icono ' + clase} width=${t} height=${t} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>`;
  }
  return html`<svg class=${'icono ' + clase} width=${t} height=${t} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${grosor} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: TRAZOS[n] || '' }}></svg>`;
}

// ---------- Avisos breves (toasts) ----------

let avisos = [];
const oyentesAvisos = new Set();
let idAviso = 0;

function notificarAvisos() {
  for (const f of oyentesAvisos) f();
}

export function aviso(texto, { accion, textoAccion, tipo = 'normal', duracion = 5000 } = {}) {
  const id = ++idAviso;
  avisos = [...avisos, { id, texto, accion, textoAccion, tipo }].slice(-2); // como mucho dos a la vez
  notificarAvisos();
  setTimeout(() => cerrarAviso(id), duracion);
}

function cerrarAviso(id) {
  avisos = avisos.filter((a) => a.id !== id);
  notificarAvisos();
}

export function avisoError(e, porDefecto = 'No se pudo guardar. Revisá la conexión e intentá de nuevo.') {
  console.error(e);
  aviso(e?.codigo === 'ocupado' ? 'Ese horario se acaba de ocupar. Elegí otro.' : porDefecto, { tipo: 'error', duracion: 7000 });
}

export function Avisos() {
  const [, forzar] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    oyentesAvisos.add(forzar);
    return () => oyentesAvisos.delete(forzar);
  }, []);
  return html`<div class="avisos" role="status" aria-live="polite">
    ${avisos.map(
      (a) => html`<div class=${'aviso ' + (a.tipo === 'error' ? 'aviso-error' : '')} key=${a.id}>
        <span>${a.texto}</span>
        ${a.accion &&
        html`<button type="button" class="aviso-accion" onClick=${() => { cerrarAviso(a.id); a.accion(); }}>${a.textoAccion}</button>`}
      </div>`
    )}
  </div>`;
}

// ---------- Diálogo de confirmación ----------

let dialogo = null;
const oyentesDialogo = new Set();

export function confirmar({ titulo, mensaje, textoSi = 'Sí', textoNo = 'No', peligro = false }) {
  return new Promise((resolver) => {
    dialogo = { titulo, mensaje, textoSi, textoNo, peligro, resolver };
    for (const f of oyentesDialogo) f();
  });
}

function responderDialogo(valor) {
  const d = dialogo;
  dialogo = null;
  for (const f of oyentesDialogo) f();
  d?.resolver(valor);
}

export function Dialogos() {
  const [, forzar] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    oyentesDialogo.add(forzar);
    return () => oyentesDialogo.delete(forzar);
  }, []);
  if (!dialogo) return null;
  return html`<${Modal} titulo=${dialogo.titulo} onCerrar=${() => responderDialogo(false)} chico=${true}>
    ${dialogo.mensaje && html`<p class="dialogo-texto">${dialogo.mensaje}</p>`}
    <div class="acciones-modal">
      <button type="button" class="btn btn-borde" onClick=${() => responderDialogo(false)}>${dialogo.textoNo}</button>
      <button type="button" class=${'btn ' + (dialogo.peligro ? 'btn-peligro' : 'btn-primario')} onClick=${() => responderDialogo(true)}>${dialogo.textoSi}</button>
    </div>
  <//>`;
}

// ---------- Ventana modal ----------

export function Modal({ titulo, onCerrar, children, chico = false }) {
  useEffect(() => {
    const alTeclear = (e) => e.key === 'Escape' && onCerrar();
    document.addEventListener('keydown', alTeclear);
    document.body.classList.add('con-modal');
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.classList.remove('con-modal');
    };
  }, [onCerrar]);
  return html`<div class="modal-fondo" onClick=${(e) => e.target === e.currentTarget && onCerrar()}>
    <div class=${'modal ' + (chico ? 'modal-chico' : '')} role="dialog" aria-modal="true" aria-label=${titulo}>
      <div class="modal-cabecera">
        <h2>${titulo}</h2>
        <button type="button" class="btn-icono" aria-label="Cerrar" onClick=${onCerrar}><${Icono} n="x" /></button>
      </div>
      <div class="modal-cuerpo">${children}</div>
    </div>
  </div>`;
}

// ---------- Tamaño de pantalla ----------

const CONSULTA_COMPU = '(min-width: 900px)';

export function useEsCompu() {
  const [es, setEs] = useState(() => window.matchMedia(CONSULTA_COMPU).matches);
  useEffect(() => {
    const mq = window.matchMedia(CONSULTA_COMPU);
    const alCambiar = () => setEs(mq.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  return es;
}

// ---------- Menú "más opciones" ----------

export function MenuMas({ items, clase = '' }) {
  const [abierto, setAbierto] = useState(false);
  return html`<div class=${'menu-mas ' + clase}>
    <button type="button" class="btn-icono btn-icono-grande" aria-label="Más opciones" aria-expanded=${abierto} onClick=${() => setAbierto(!abierto)}>
      <${Icono} n="puntos" t=${22} />
    </button>
    ${abierto &&
    html`<div class="menu-fondo" onClick=${() => setAbierto(false)}></div>
      <div class="menu-lista" role="menu">
        ${items.map(
          (it) => html`<button type="button" role="menuitem" class="menu-item" onClick=${() => { setAbierto(false); it.accion(); }}>
            <${Icono} n=${it.icono} t=${18} />${it.texto}
          </button>`
        )}
      </div>`}
  </div>`;
}

// ---------- Encabezado ----------

function Logo({ t = 44 }) {
  return html`<img class="logo" src="img/logo.png" alt="CC Consultorios" width=${t} height=${t} />`;
}

export function Encabezado({ seccion, esCompu, itemsMenu }) {
  const st = useStore();
  const nEspera = st.espera.length;
  if (esCompu) {
    return html`<header class="encabezado">
      <div class="encabezado-interior">
        <a class="marca" href="#/agenda">
          <${Logo} />
          <span class="marca-textos">
            <span class="marca-nombre">${st.config?.profesional || 'Turnero'}</span>
            <span class="marca-sub">${st.config ? `${st.config.especialidad} · ${st.config.consultorio}` : ''}</span>
          </span>
        </a>
        <nav class="nav" aria-label="Secciones">
          <a class=${'nav-item ' + (seccion === 'agenda' ? 'activo' : '')} href="#/agenda" aria-current=${seccion === 'agenda' ? 'page' : undefined}>Agenda</a>
          <a class=${'nav-item ' + (seccion === 'pacientes' ? 'activo' : '')} href="#/pacientes" aria-current=${seccion === 'pacientes' ? 'page' : undefined}>Pacientes</a>
          <a class=${'nav-item ' + (seccion === 'espera' ? 'activo' : '')} href="#/espera" aria-current=${seccion === 'espera' ? 'page' : undefined}>
            Lista de espera${nEspera > 0 && html`<span class="insignia">${nEspera}</span>`}
          </a>
        </nav>
        <button type="button" class="quien" onClick=${() => navegar('/ajustes')} title="Cambiar quién usa este dispositivo">
          <${Icono} n="usuario" t=${16} />${st.quien || 'Elegir usuario'}
        </button>
      </div>
    </header>`;
  }
  return html`<header class="encabezado encabezado-celular">
    <a class="marca" href="#/agenda">
      <${Logo} t=${38} />
      <span class="marca-textos">
        <span class="marca-nombre">Dra. Moreno</span>
        <span class="marca-sub">${st.config?.especialidad || ''}</span>
      </span>
    </a>
    <a class="btn-icono btn-icono-grande" href="#/pacientes" aria-label="Buscar paciente"><${Icono} n="buscar" /></a>
    <a class="btn-icono btn-icono-grande con-insignia" href="#/espera" aria-label=${`Lista de espera: ${nEspera} pacientes`}>
      <${Icono} n="reloj" />${nEspera > 0 && html`<span class="insignia insignia-flotante" aria-hidden="true">${nEspera}</span>`}
    </a>
    <${MenuMas} items=${itemsMenu} />
  </header>`;
}

// ---------- ¿Quién usa este dispositivo? ----------

export function PreguntaQuien() {
  const [otro, setOtro] = useState('');
  const elegir = (nombre) => nombre.trim() && setQuien(nombre.trim());
  return html`<div class="modal-fondo">
    <div class="modal modal-chico" role="dialog" aria-modal="true" aria-label="¿Quién usa este dispositivo?">
      <div class="modal-cabecera"><h2>¿Quién usa este dispositivo?</h2></div>
      <div class="modal-cuerpo">
        <p class="dialogo-texto">Se guarda en cada turno quién lo cargó o lo modificó. Se pregunta una sola vez por dispositivo.</p>
        <div class="grilla-2">
          <button type="button" class="btn btn-primario btn-grande" onClick=${() => elegir('Doctora')}>Doctora</button>
          <button type="button" class="btn btn-primario btn-grande" onClick=${() => elegir('Secretaria')}>Secretaria</button>
        </div>
        <form class="fila-form" onSubmit=${(e) => { e.preventDefault(); elegir(otro); }}>
          <label class="campo campo-flex">
            <span>Otra persona</span>
            <input class="entrada" value=${otro} onInput=${(e) => setOtro(e.target.value)} placeholder="Nombre" />
          </label>
          <button type="submit" class="btn btn-borde" disabled=${!otro.trim()}>Listo</button>
        </form>
      </div>
    </div>
  </div>`;
}

export function Cargando({ texto = 'Cargando…' }) {
  return html`<div class="cargando" role="status"><span class="ruedita" aria-hidden="true"></span>${texto}</div>`;
}

export { armarRuta, navegar };
