// Utilidades: fechas, horarios, texto y WhatsApp.

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const pad = (n) => String(n).padStart(2, '0');

// ---------- Fechas (siempre como texto AAAA-MM-DD, en hora local) ----------

export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ahoraHHMM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function aFecha(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function aISO(fecha) {
  return fecha.toISOString().slice(0, 10);
}

export function sumarDias(iso, n) {
  const f = aFecha(iso);
  f.setUTCDate(f.getUTCDate() + n);
  return aISO(f);
}

// 1 = lunes … 7 = domingo
export function diaSemana(iso) {
  const d = aFecha(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

export function proximaFecha(desde, dia) {
  let f = desde;
  for (let i = 0; i < 7; i++) {
    if (diaSemana(f) === dia) return f;
    f = sumarDias(f, 1);
  }
  return desde;
}

export function fechasDeAtencion(desde, dia, cantidad) {
  const lista = [];
  let f = proximaFecha(desde, dia);
  for (let i = 0; i < cantidad; i++) {
    lista.push(f);
    f = sumarDias(f, 7);
  }
  return lista;
}

export function nombreDia(iso) {
  return DIAS[aFecha(iso).getUTCDay()];
}

// "Lunes 9 de noviembre"
export function fechaLarga(iso) {
  const f = aFecha(iso);
  const dia = DIAS[f.getUTCDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}`;
}

// "Lunes 9 de noviembre de 2026"
export function fechaLargaConAnio(iso) {
  return `${fechaLarga(iso)} de ${iso.slice(0, 4)}`;
}

// "Lun 9/11"
export function fechaCorta(iso) {
  const f = aFecha(iso);
  return `${DIAS_CORTOS[f.getUTCDay()]} ${f.getUTCDate()}/${f.getUTCMonth() + 1}`;
}

// "9/11"
export function diaMes(iso) {
  const f = aFecha(iso);
  return `${f.getUTCDate()}/${f.getUTCMonth() + 1}`;
}

// "09/11/2026"
export function fechaNumerica(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// "marzo 2025"
export function mesAnio(isoFechaHora) {
  const [y, m] = isoFechaHora.slice(0, 7).split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}

// ---------- Horarios ----------

export const hhmm = (t) => (t || '').slice(0, 5);

export function minutos(t) {
  const [h, m] = hhmm(t).split(':').map(Number);
  return h * 60 + m;
}

export const deMinutos = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

// Lista de horarios del día según la configuración: ["14:00", "14:15", ...]
export function horariosDelDia(config) {
  const lista = [];
  const paso = config.duracion_min;
  for (let m = minutos(config.hora_inicio); m + paso <= minutos(config.hora_fin); m += paso) {
    lista.push(deMinutos(m));
  }
  return lista;
}

// ---------- Texto ----------

export function normalizar(texto) {
  return (texto || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// "Sosa, Graciela" -> "Graciela"
export function primerNombre(apellidoNombre) {
  const t = (apellidoNombre || '').trim();
  if (t.includes(',')) return t.split(',')[1].trim().split(/\s+/)[0] || t;
  return t;
}

// "Sosa, Graciela" -> "Sosa, G."
export function nombreAbreviado(apellidoNombre) {
  const t = (apellidoNombre || '').trim();
  if (!t.includes(',')) return t;
  const [apellido, nombres] = t.split(',');
  const inicial = (nombres || '').trim().charAt(0);
  return inicial ? `${apellido.trim()}, ${inicial.toUpperCase()}.` : apellido.trim();
}

export function pluralizar(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

// ---------- WhatsApp ----------

// Convierte un teléfono argentino al formato de WhatsApp (549 + característica + número).
// Si no tiene característica, asume Rosario (341). Devuelve null si no se puede interpretar.
export function numeroWhatsApp(telefono) {
  let d = (telefono || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) {
    d = d.slice(2);
    if (d.startsWith('9')) d = d.slice(1);
  }
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) {
    // característica + "15" + número: se quita el 15
    for (const corte of [3, 2, 4]) {
      if (d.substr(corte, 2) === '15') {
        d = d.slice(0, corte) + d.slice(corte + 2);
        break;
      }
    }
  }
  if (d.length === 9 && d.startsWith('15')) d = '341' + d.slice(2);
  if (d.length === 7) d = '341' + d;
  if (d.length !== 10) return null;
  return '549' + d;
}

export function linkWhatsApp(telefono, mensaje) {
  const numero = numeroWhatsApp(telefono);
  const texto = mensaje ? `?text=${encodeURIComponent(mensaje)}` : '';
  return numero ? `https://wa.me/${numero}${texto}` : `https://wa.me/${texto}`;
}

export function completarMensaje(plantilla, datos) {
  return (plantilla || '').replace(/\{(\w+)\}/g, (todo, clave) =>
    datos[clave] !== undefined && datos[clave] !== null ? datos[clave] : todo
  );
}

// Datos para completar los mensajes de WhatsApp de un turno
export function datosMensaje(config, paciente, fecha, hora) {
  return {
    nombre: primerNombre(paciente?.apellido_nombre),
    dia: nombreDia(fecha),
    fecha: diaMes(fecha),
    hora: hhmm(hora),
    profesional: config.profesional,
    especialidad: config.especialidad,
    consultorio: config.consultorio,
    direccion: config.direccion,
  };
}
