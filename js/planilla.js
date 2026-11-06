// Planilla del día para imprimir o guardar en PDF (A4 apaisada).
import { html } from './lib.js';
import { useStore, armarDia, nombreObraSocial, esParticular } from './store.js';
import { Icono } from './ui.js';
import { fechaLargaConAnio, fechaNumerica, hoyISO, hhmm, sumarDias, pluralizar, ahoraHHMM } from './util.js';
import { finTurno } from './agenda.js';

export function Planilla({ fecha }) {
  const st = useStore();
  const dia = armarDia(fecha);
  const filas = [];
  let pacientes = 0;
  let sobreturnos = 0;
  let libres = 0;

  for (const f of dia.filas) {
    const turnos = [f.principal, ...f.sobreturnos].filter(Boolean);
    for (const t of turnos) {
      pacientes++;
      if (t.sobreturno) sobreturnos++;
      const p = st.pacientesPorId.get(t.paciente_id);
      filas.push(html`<tr key=${t.id}>
        <td class="pl-hora">${hhmm(t.hora)}${t.es_practica && html`<span class="pl-sub">a ${finTurno(t)}</span>`}${t.sobreturno && html`<span class="pl-st">ST</span>`}</td>
        <td class="pl-nombre">${p?.apellido_nombre}</td>
        <td>${nombreObraSocial(p)}${p?.plan ? ' ' + p.plan : ''}${!esParticular(p) && p?.nro_afiliado && html`<span class="pl-sub">${p.nro_afiliado}</span>`}</td>
        <td>${t.es_practica ? html`<strong>Práctica</strong><span class="pl-sub">${t.duracion_min} min</span>` : t.sobreturno ? html`Sobreturno<span class="pl-sub">${t.primera_vez ? 'Primera vez' : 'Control'}</span>` : t.primera_vez ? 'Primera vez' : 'Control'}</td>
        <td>${t.motivo || ''}</td>
        <td class="pl-tel">${p?.telefono}</td>
        <td class="pl-check">${t.estado === 'atendido' ? html`<span class="pl-circulo pl-hecho" role="img" aria-label="Atendido"><${Icono} n="check" t=${14} grosor=${3} /></span>` : t.estado === 'ausente' ? html`<span class="pl-ausente">Ausente</span>` : html`<span class="pl-circulo" aria-hidden="true"></span>`}</td>
      </tr>`);
    }
    if (!turnos.length && !f.cubiertoPor) {
      if (f.libre) libres++;
      filas.push(html`<tr key=${'v' + f.hora} class="pl-vacia">
        <td class="pl-hora">${f.hora}</td>
        <td colspan="6">${f.bloqueo ? 'Bloqueado' + (f.bloqueo.motivo ? ' · ' + f.bloqueo.motivo : '') : dia.cerrado ? '' : 'Libre'}</td>
      </tr>`);
    }
  }

  return html`<div class="pagina-planilla">
    <div class="barra-planilla no-imprimir">
      <a class="volver" href="#/agenda"><${Icono} n="izq" t=${18} />Volver a la agenda</a>
      <div class="acciones-fila">
        <a class="btn-icono btn-icono-grande con-borde" href=${'#/planilla/' + sumarDias(fecha, -7)} aria-label="Semana anterior"><${Icono} n="izq" /></a>
        <a class="btn-icono btn-icono-grande con-borde" href=${'#/planilla/' + sumarDias(fecha, 7)} aria-label="Semana siguiente"><${Icono} n="der" /></a>
        <button type="button" class="btn btn-primario btn-alto" onClick=${() => window.print()}><${Icono} n="imprimir" />Imprimir o guardar PDF</button>
      </div>
    </div>

    <article class="hoja">
      <header class="hoja-cabecera">
        <div class="hoja-marca">
          <img src="img/logo.png" alt="CC Consultorios" width="52" height="52" />
          <div>
            <span class="hoja-doctora">${st.config.profesional}</span>
            <span class="hoja-sub">${st.config.especialidad} · ${st.config.consultorio} · ${st.config.direccion}</span>
          </div>
        </div>
        <div class="hoja-fecha">
          <span class="sobretitulo">Planilla del día</span>
          <h1>${fechaLargaConAnio(fecha)}</h1>
        </div>
      </header>
      ${dia.cerrado && html`<p class="hoja-aviso">${dia.feriado?.tipo === 'feriado' ? 'Feriado: ' + dia.feriado.nombre : 'Día bloqueado' + (dia.bloqueoDia?.motivo ? ': ' + dia.bloqueoDia.motivo : '')}. No se dan turnos.</p>`}
      <table class="tabla-planilla">
        <colgroup>
          <col style="width: 8%" /><col style="width: 18%" /><col style="width: 19%" /><col style="width: 13%" />
          <col style="width: 18%" /><col style="width: 14%" /><col style="width: 10%" />
        </colgroup>
        <thead>
          <tr><th scope="col">Hora</th><th scope="col">Paciente</th><th scope="col">Obra social</th><th scope="col">Tipo</th><th scope="col">Motivo</th><th scope="col">Teléfono</th><th scope="col" class="pl-check">Atendido</th></tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <footer class="hoja-pie">
        <span>${pluralizar(pacientes, 'paciente', 'pacientes')}${sobreturnos ? ` · ${pluralizar(sobreturnos, 'sobreturno', 'sobreturnos')}` : ''} · ${pluralizar(libres, 'horario libre', 'horarios libres')}</span>
        <span>Impreso el ${fechaNumerica(hoyISO())} a las ${ahoraHHMM()}</span>
      </footer>
    </article>
  </div>`;
}
