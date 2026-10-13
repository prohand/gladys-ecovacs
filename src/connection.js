// -----------------------------------------------------------------------------
// Messages about the link to the Ecovacs cloud, shown in the Configuration
// screen (connection status, "Test the connection" button). In English,
// French, German and Spanish: Gladys picks the user's language, `en` being the
// fallback.
// -----------------------------------------------------------------------------

// The languages of the messages, in the order an action error lists them.
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const NOT_CONFIGURED = {
  en: 'Enter the email and password of your Ecovacs Home account.',
  fr: 'Renseignez l’e-mail et le mot de passe de votre compte Ecovacs Home.',
  de: 'Gib die E-Mail-Adresse und das Passwort deines Ecovacs-Home-Kontos ein.',
  es: 'Introduzca el correo electrónico y la contraseña de su cuenta de Ecovacs Home.',
};

export const CODE_SENT = {
  en: 'Ecovacs sent a code by email to the account (check the spam folder too). Enter it in "Confirm the device".',
  fr: 'Ecovacs a envoyé un code par e-mail au compte (regardez aussi dans les spams). Saisissez-le dans « Confirmer l’appareil ».',
  de: 'Ecovacs hat einen Code per E-Mail an das Konto gesendet (sieh auch im Spam-Ordner nach). Gib ihn unter „Gerät bestätigen“ ein.',
  es: 'Ecovacs ha enviado un código por correo electrónico a la cuenta (revise también la carpeta de spam). Introdúzcalo en «Confirmar el dispositivo».',
};

/** What went wrong, for the user. */
export function failureMessage(err) {
  switch (err?.kind) {
    case 'credentials':
      return {
        en: 'Ecovacs refused the email or password. Check them, and the country of the account.',
        fr: 'Ecovacs a refusé l’e-mail ou le mot de passe. Vérifiez-les, ainsi que le pays du compte.',
        de: 'Ecovacs hat die E-Mail-Adresse oder das Passwort abgelehnt. Prüfe beides sowie das Land des Kontos.',
        es: 'Ecovacs ha rechazado el correo electrónico o la contraseña. Compruébelos, así como el país de la cuenta.',
      };
    case 'verification':
      return {
        en: 'Ecovacs asks to confirm Gladys as a new device: click "Send the verification code", then enter the code received by email in "Confirm the device".',
        fr: 'Ecovacs demande de confirmer Gladys comme nouvel appareil : cliquez sur « Envoyer le code de vérification », puis saisissez le code reçu par e-mail dans « Confirmer l’appareil ».',
        de: 'Ecovacs verlangt, Gladys als neues Gerät zu bestätigen: Klicke auf „Bestätigungscode senden“ und gib dann den per E-Mail erhaltenen Code unter „Gerät bestätigen“ ein.',
        es: 'Ecovacs pide confirmar Gladys como nuevo dispositivo: pulse «Enviar el código de verificación» y luego introduzca el código recibido por correo electrónico en «Confirmar el dispositivo».',
      };
    case 'code':
      return {
        en: 'Ecovacs refused the verification code (wrong or expired). Ask for a new one.',
        fr: 'Ecovacs a refusé le code de vérification (faux ou expiré). Demandez-en un nouveau.',
        de: 'Ecovacs hat den Bestätigungscode abgelehnt (falsch oder abgelaufen). Fordere einen neuen an.',
        es: 'Ecovacs ha rechazado el código de verificación (incorrecto o caducado). Solicite uno nuevo.',
      };
    case 'network':
      return {
        en: 'The Ecovacs cloud cannot be reached. Check the Internet access of Gladys.',
        fr: 'Le cloud Ecovacs est injoignable. Vérifiez l’accès Internet de Gladys.',
        de: 'Die Ecovacs-Cloud ist nicht erreichbar. Prüfe den Internetzugang von Gladys.',
        es: 'No se puede acceder a la nube de Ecovacs. Compruebe el acceso a Internet de Gladys.',
      };
    default:
      return {
        en: `Ecovacs refused the connection: ${err?.message ?? 'unknown error'}`,
        fr: `Ecovacs a refusé la connexion : ${err?.message ?? 'erreur inconnue'}`,
        de: `Ecovacs hat die Verbindung abgelehnt: ${err?.message ?? 'unbekannter Fehler'}`,
        es: `Ecovacs ha rechazado la conexión: ${err?.message ?? 'error desconocido'}`,
      };
  }
}

/**
 * An error for a Configuration action: the screen shows it as a failure (in
 * red) instead of a result. The SDK carries a plain text there, not a
 * multi-language object, so it stays English + French only, as it always
 * was: four languages in one red box read as noise.
 */
export function actionError(message) {
  return new Error(message.en === message.fr ? message.en : `${message.en} / ${message.fr}`);
}

/** Result of a successful connection: the robots found. */
export function successMessage(account, robots, unsupported = []) {
  const names = robots.map((robot) => robot.name).join(', ');
  const message =
    robots.length === 0
      ? {
          en: `Connected to ${account}, but no robot is bound to this account.`,
          fr: `Connecté à ${account}, mais aucun robot n’est associé à ce compte.`,
          de: `Verbunden mit ${account}, aber diesem Konto ist kein Roboter zugeordnet.`,
          es: `Conectado a ${account}, pero no hay ningún robot asociado a esta cuenta.`,
        }
      : {
          en: `Connected to ${account}: ${robots.length} robot(s) found (${names}). Add them from the Discover tab.`,
          fr: `Connecté à ${account} : ${robots.length} robot(s) trouvé(s) (${names}). Ajoutez-les depuis l’onglet Découverte.`,
          de: `Verbunden mit ${account}: ${robots.length} Roboter gefunden (${names}). Füge sie über den Tab „Entdecken“ hinzu.`,
          es: `Conectado a ${account}: ${robots.length} robot(s) encontrado(s) (${names}). Añádalos desde la pestaña «Descubrir».`,
        };
  if (unsupported.length > 0) {
    const list = unsupported.join(', ');
    message.en += ` Not supported (too old): ${list}.`;
    message.fr += ` Non pris en charge (trop ancien) : ${list}.`;
    message.de += ` Nicht unterstützt (zu alt): ${list}.`;
    message.es += ` No compatible (demasiado antiguo): ${list}.`;
  }
  return message;
}
