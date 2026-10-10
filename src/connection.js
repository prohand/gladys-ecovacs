// -----------------------------------------------------------------------------
// Messages about the link to the Ecovacs cloud, shown in the Configuration
// screen (connection status, "Test the connection" button). Bilingual: Gladys
// picks the user's language, `en` being the fallback.
// -----------------------------------------------------------------------------

export const NOT_CONFIGURED = {
  en: 'Enter the email and password of your Ecovacs Home account.',
  fr: 'Renseignez l’e-mail et le mot de passe de votre compte Ecovacs Home.',
};

/** What went wrong, for the user. */
export function failureMessage(err) {
  switch (err?.kind) {
    case 'credentials':
      return {
        en: 'Ecovacs refused the email or password. Check them, and the country of the account.',
        fr: 'Ecovacs a refusé l’e-mail ou le mot de passe. Vérifiez-les, ainsi que le pays du compte.',
      };
    case 'network':
      return {
        en: 'The Ecovacs cloud cannot be reached. Check the Internet access of Gladys.',
        fr: 'Le cloud Ecovacs est injoignable. Vérifiez l’accès Internet de Gladys.',
      };
    default:
      return {
        en: `Ecovacs refused the connection: ${err?.message ?? 'unknown error'}`,
        fr: `Ecovacs a refusé la connexion : ${err?.message ?? 'erreur inconnue'}`,
      };
  }
}

/** Result of a successful connection: the robots found. */
export function successMessage(account, robots, unsupported = []) {
  const names = robots.map((robot) => robot.name).join(', ');
  const message =
    robots.length === 0
      ? {
          en: `Connected to ${account}, but no robot is bound to this account.`,
          fr: `Connecté à ${account}, mais aucun robot n’est associé à ce compte.`,
        }
      : {
          en: `Connected to ${account}: ${robots.length} robot(s) found (${names}). Add them from the Discover tab.`,
          fr: `Connecté à ${account} : ${robots.length} robot(s) trouvé(s) (${names}). Ajoutez-les depuis l’onglet Découverte.`,
        };
  if (unsupported.length > 0) {
    const list = unsupported.join(', ');
    message.en += ` Not supported (too old): ${list}.`;
    message.fr += ` Non pris en charge (trop ancien) : ${list}.`;
  }
  return message;
}
