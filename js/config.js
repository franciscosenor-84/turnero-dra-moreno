// Conexión con la base de datos (Supabase).
// La clave publicable está pensada para usarse en el navegador:
// lo que se puede leer o modificar lo deciden las reglas de la base,
// que solo dejan entrar a la cuenta del consultorio (con su clave).
export const SUPABASE_URL = 'https://cakvyszaxleqhvlotpba.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_nxMZeW-GkEPVcV6BhqAOcw_DWCMnQq_';

// Cuenta compartida del consultorio: en la pantalla de entrada solo se pide la clave.
// (Dirección ficticia a propósito: no recibe correos.)
export const EMAIL_ACCESO = 'consultorio@turnero-moreno.invalid';
