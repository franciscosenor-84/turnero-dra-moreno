// Acceso a la base de datos (Supabase). Todo el resto de la app usa solo este objeto.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';
import { SUPABASE_URL, SUPABASE_KEY, EMAIL_ACCESO } from './config.js';

// La sesión queda guardada en el dispositivo: la clave se pide una sola vez.
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'turnero-sesion' },
});

const TABLAS = ['configuracion', 'obras_sociales', 'pacientes', 'turnos', 'lista_espera', 'bloqueos', 'feriados'];
const POR_PAGINA = 1000;

function traducirError(e) {
  const err = new Error(e?.message || 'Error de conexión');
  const codigos = {
    '23P01': 'ocupado', '23505': 'duplicado', '23514': 'invalido', '23503': 'en_uso',
    '42501': 'sin_permiso', PGRST301: 'sin_permiso', PGRST302: 'sin_permiso',
  };
  err.codigo = codigos[e?.code] || 'error';
  err.original = e;
  return err;
}

function revisar({ data, error }) {
  if (error) throw traducirError(error);
  return data;
}

async function todasLasFilas(armarConsulta) {
  const filas = [];
  for (let desde = 0; ; desde += POR_PAGINA) {
    const pagina = revisar(await armarConsulta().range(desde, desde + POR_PAGINA - 1));
    filas.push(...pagina);
    if (pagina.length < POR_PAGINA) return filas;
  }
}

function errorDeAcceso(e) {
  const err = new Error(e?.message || 'Error de conexión');
  if (e?.status === 429 || e?.code === 'over_request_rate_limit') err.codigo = 'muchos';
  else if (e?.code === 'same_password') err.codigo = 'misma';
  else if (e?.code === 'weak_password') err.codigo = 'debil';
  else if (e?.code === 'invalid_credentials' || e?.status === 400) err.codigo = 'clave';
  else err.codigo = 'error';
  err.original = e;
  return err;
}

export const backend = {
  // Acceso con la clave del consultorio
  async sesionActual() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  async entrar(clave) {
    const { error } = await sb.auth.signInWithPassword({ email: EMAIL_ACCESO, password: clave });
    if (error) throw errorDeAcceso(error);
  },
  async salir() {
    await sb.auth.signOut({ scope: 'local' });
  },
  async cambiarClave(nueva) {
    const { error } = await sb.auth.updateUser({ password: nueva });
    if (error) throw errorDeAcceso(error);
  },
  // Avisa si la sesión se pierde (se cerró desde otro lado o venció sin poder renovarse).
  alPerderSesion(avisar) {
    sb.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') setTimeout(avisar, 0);
    });
  },

  // Configuración
  async cargarConfiguracion() {
    return revisar(await sb.from('configuracion').select('*').eq('id', 1).single());
  },
  async guardarConfiguracion(cambios) {
    return revisar(await sb.from('configuracion').update(cambios).eq('id', 1).select().single());
  },

  // Obras sociales
  async listarObrasSociales() {
    return revisar(await sb.from('obras_sociales').select('*').order('nombre'));
  },
  async crearObraSocial(nombre) {
    return revisar(await sb.from('obras_sociales').insert({ nombre }).select().single());
  },
  async actualizarObraSocial(id, cambios) {
    return revisar(await sb.from('obras_sociales').update(cambios).eq('id', id).select().single());
  },

  // Pacientes
  async listarPacientes() {
    return todasLasFilas(() => sb.from('pacientes').select('*').order('apellido_nombre').order('id'));
  },
  async crearPaciente(datos) {
    return revisar(await sb.from('pacientes').insert(datos).select().single());
  },
  async actualizarPaciente(id, cambios) {
    return revisar(await sb.from('pacientes').update(cambios).eq('id', id).select().single());
  },

  // Turnos
  async listarTurnos(desde) {
    return todasLasFilas(() =>
      sb.from('turnos').select('*').gte('fecha', desde).order('fecha').order('hora').order('id')
    );
  },
  async listarTurnosEntre(desde, hasta) {
    return todasLasFilas(() =>
      sb.from('turnos').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha').order('hora').order('id')
    );
  },
  async turnosDePaciente(pacienteId) {
    return revisar(
      await sb.from('turnos').select('*').eq('paciente_id', pacienteId)
        .order('fecha', { ascending: false }).order('hora', { ascending: false })
    );
  },
  async todosLosTurnos() {
    return todasLasFilas(() => sb.from('turnos').select('*').order('fecha').order('hora').order('id'));
  },
  async crearTurno(datos) {
    return revisar(await sb.from('turnos').insert(datos).select().single());
  },
  async actualizarTurno(id, cambios) {
    return revisar(await sb.from('turnos').update(cambios).eq('id', id).select().single());
  },

  // Lista de espera
  async listarEspera() {
    return revisar(await sb.from('lista_espera').select('*').is('resuelto_en', null).order('anotado_en'));
  },
  async todaLaEspera() {
    return todasLasFilas(() => sb.from('lista_espera').select('*').order('anotado_en').order('id'));
  },
  async crearEspera(datos) {
    return revisar(await sb.from('lista_espera').insert(datos).select().single());
  },
  async resolverEspera(id, resultado) {
    return revisar(
      await sb.from('lista_espera')
        .update({ resuelto_en: new Date().toISOString(), resultado })
        .eq('id', id).select().single()
    );
  },
  async resolverEsperaDePaciente(pacienteId) {
    return revisar(
      await sb.from('lista_espera')
        .update({ resuelto_en: new Date().toISOString(), resultado: 'turno' })
        .eq('paciente_id', pacienteId).is('resuelto_en', null).select()
    );
  },

  // Bloqueos
  async listarBloqueos(desde) {
    return revisar(await sb.from('bloqueos').select('*').gte('fecha', desde).order('fecha').order('hora', { nullsFirst: true }));
  },
  async crearBloqueo(datos) {
    return revisar(await sb.from('bloqueos').insert(datos).select().single());
  },
  async borrarBloqueo(id) {
    revisar(await sb.from('bloqueos').delete().eq('id', id));
  },

  // Feriados
  async listarFeriados() {
    return revisar(await sb.from('feriados').select('*').order('fecha'));
  },
  async crearFeriado(datos) {
    return revisar(await sb.from('feriados').insert(datos).select().single());
  },
  async borrarFeriado(fecha) {
    revisar(await sb.from('feriados').delete().eq('fecha', fecha));
  },

  // Cambios en vivo: avisa (tabla, tipo, fila nueva, fila vieja) cada vez que alguien modifica algo.
  async suscribir(alCambiar, alReconectar) {
    // Los cambios en vivo también van con la sesión del consultorio (si no, la base no los manda).
    const { data } = await sb.auth.getSession();
    if (data.session) await sb.realtime.setAuth(data.session.access_token);
    const canal = sb.channel('turnero-cambios');
    for (const tabla of TABLAS) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, (cambio) =>
        alCambiar(tabla, cambio.eventType, cambio.new, cambio.old)
      );
    }
    let yaConectado = false;
    canal.subscribe((estado) => {
      enVivo = estado === 'SUBSCRIBED';
      if (estado === 'SUBSCRIBED') {
        if (yaConectado) alReconectar();
        yaConectado = true;
      }
    });
    return () => sb.removeChannel(canal);
  },

  // ¿Están llegando los cambios en vivo?
  enVivo() {
    return enVivo;
  },
};

let enVivo = false;
