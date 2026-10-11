# Ecovacs

Pilotez depuis Gladys vos **aspirateurs robots Ecovacs Deebot** et vos
**tondeuses Ecovacs GOAT** : lancer et arrêter le travail, renvoyer le robot à
sa base, régler la puissance d'aspiration, suivre la batterie, les erreurs et
l'usure des pièces.

L'intégration passe par le **cloud Ecovacs**, avec le compte de l'application
**Ecovacs Home** : Ecovacs ne propose pas de connexion locale. Il faut donc un
accès Internet, et le robot doit être visible dans l'application.

## Avant de commencer

1. Installez l'application **Ecovacs Home** et ajoutez-y vos robots.
2. Notez l'**e-mail** et le **mot de passe** du compte, ainsi que le **pays**
   choisi à la création du compte.
3. Compte créé avec Google, Apple ou Facebook : il n'a pas de mot de passe.
   Définissez-en un dans l'application (Profil, paramètres du compte).

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Renseignez l'**e-mail**, le **mot de passe** et le **pays du compte**.
3. Choisissez l'**intervalle de rafraîchissement** (1 minute par défaut).
4. Enregistrez, puis cliquez sur **Tester la connexion** : le message liste
   les robots trouvés.
5. Ouvrez l'onglet **Découverte** et ajoutez vos robots.

### Vérification de l'appareil

Ecovacs peut demander de confirmer Gladys comme nouvel appareil (le message
l'indique, le cloud répond le code 1013 « Please update to the latest
version ») :

1. Cliquez sur **Envoyer le code de vérification** : Ecovacs envoie un code
   par e-mail au compte (regardez aussi dans les spams).
2. Saisissez-le dans **Confirmer l'appareil** et cliquez : les robots sont
   listés.

Gladys garde le même identifiant d'appareil pour le compte, même après un
redémarrage.

Le mot de passe n'est jamais envoyé en clair : seule son empreinte MD5 part
vers Ecovacs, comme le fait l'application.

## Ce que vous obtenez

| Fonctionnalité                             | Aspirateur | Tondeuse | Détail                                                                        |
| ------------------------------------------ | ---------- | -------- | ----------------------------------------------------------------------------- |
| État                                       | ✔          | ✔        | Arrêté, en marche, en pause, erreur, retour à la base, en charge, sur la base |
| Nettoyage / Tonte                          | ✔          | ✔        | 1 démarre (ou reprend après une pause), 0 arrête                              |
| Retour à la base / station                 | ✔          | ✔        | 1 renvoie le robot à sa base                                                  |
| Puissance d'aspiration                     | ✔          |          | Silencieux, Standard, Max, Max+ (selon le modèle)                             |
| Batterie, En charge                        | ✔          | ✔        | En %                                                                          |
| Dernière erreur                            | ✔          | ✔        | Texte en anglais avec son code, voir le tableau plus bas                      |
| Brosse principale, Brosse latérale, Filtre | ✔          |          | Durée de vie restante en %, lue toutes les 30 minutes                         |
| Lames, Brosse de caméra                    |            | ✔        | Durée de vie restante en %, lue toutes les 30 minutes                         |

Un badge **cloud** s'affiche sur la carte du robot quand il répond, et
**injoignable** quand il ne répond plus (éteint, hors Wi-Fi).

## Actions

- **Tester la connexion** : se connecte au compte et liste les robots trouvés.
- **Envoyer le code de vérification** / **Confirmer l'appareil** :
  vérification de l'appareil, quand Ecovacs la demande (voir plus haut).
- **Localiser un robot** : le robot joue son son « Je suis ici ».

## Scènes (Gladys 5.1 ou plus récent)

L'intégration ajoute ses cartes à l'éditeur de scènes, dans la catégorie
**Intégrations**. Chaque déclencheur peut être filtré sur un robot ; laissé
vide, il vaut pour tous. Variable commune : `{{triggerEvent.data.name}}` (nom
du robot).

Déclencheurs :

- **Nettoyage ou tonte démarré** : le robot commence à travailler (pas quand
  il reprend après une pause).
- **Nettoyage ou tonte terminé** : le robot a fini de travailler (terminé,
  arrêté ou en route vers sa base).
- **Robot revenu sur sa base** : le robot est sur sa base ou sa station et se
  recharge.
- **Erreur du robot** : le robot signale une nouvelle erreur. Variables
  `{{triggerEvent.data.code}}` et `{{triggerEvent.data.message}}` (en
  anglais). Idéal pour une notification « robot coincé ».
- **Consommable usé** : une brosse, un filtre ou une lame descend à 10 % de
  sa durée de vie ou moins. Filtrable par consommable ; variables
  `{{triggerEvent.data.consumable_name}}` (en anglais) et
  `{{triggerEvent.data.percent}}`.

Actions (sortie `sent` ou `located` : vrai si le robot a pris l'ordre, pour
conditionner la suite de la scène) :

- **Démarrer un robot** (reprend s'il est en pause), **Mettre un robot en
  pause**, **Arrêter un robot**, **Renvoyer un robot à sa base**,
  **Localiser un robot**.

## Widget de tableau de bord

Ajoutez le widget **Robot Ecovacs** à un tableau de bord et choisissez le
robot dans ses réglages. Il affiche :

- la batterie, en direct ;
- l'état, la dernière erreur, la puissance d'aspiration, l'usure des
  consommables (en orange sous 10 %) et la connexion ;
- quatre boutons : **Démarrer** (ou **Reprendre**, ou **Pause** pendant le
  travail), **Arrêter**, **Base** et **Localiser**.

Le widget s'appuie sur la dernière lecture du robot : l'afficher ne coûte
aucune requête au cloud Ecovacs.

## Codes d'erreur fréquents

| Code | Signification                   |
| ---- | ------------------------------- |
| 101  | Batterie faible                 |
| 102  | Robot bloqué dans une boucle    |
| 103  | Problème de roue                |
| 104  | Problème de capteur anti-chute  |
| 105  | Robot coincé                    |
| 106  | Brosse latérale usée            |
| 107  | Bac à poussière plein           |
| 108  | Brosse latérale bloquée         |
| 109  | Brosse principale bloquée       |
| 110  | Bac à poussière absent          |
| 111  | Problème de pare-chocs          |
| 112  | Problème du capteur laser       |
| 113  | Brosse principale usée          |
| 115  | Problème de batterie            |
| 118  | Filtre bouché                   |
| 119  | Problème de ventilateur         |
| 120  | Problème de réservoir d'eau     |
| 204  | Roue coincée                    |
| 312  | Remplacez le sac à poussière    |
| 1007 | Support de serpillière mal fixé |

## Robots pris en charge

- Les Deebot récents (protocole JSON) : OZMO 920/950, T8, T9, T10, T20, T30,
  X1, X2, N8, N10… Les commandes de nouvelle génération (`_V2`) et les
  anciennes sont détectées automatiquement.
- Les tondeuses GOAT : prise en charge **à confirmer**, retours bienvenus.
- **Non pris en charge** : les très anciens Deebot (séries 600/900 de
  première génération, protocole XMPP). Ils sont cités dans le message de
  « Tester la connexion ».

## Dépannage

- **« Ecovacs a refusé l'e-mail ou le mot de passe »** : vérifiez-les dans
  l'application, et surtout le **pays du compte**. Après ce refus,
  l'intégration ne réessaie plus seule (pour ne pas bloquer le compte) :
  corrigez la configuration ou cliquez sur **Tester la connexion**.
- **« Ecovacs demande de confirmer Gladys comme nouvel appareil »** : suivez
  la [vérification de l'appareil](#vérification-de-lappareil). L'intégration
  ne réessaie pas seule d'ici là.
- **« Ecovacs a refusé le code de vérification »** : le code est faux ou trop
  ancien ; demandez-en un nouveau.
- **« Le cloud Ecovacs est injoignable »** : vérifiez l'accès Internet de
  Gladys. L'intégration réessaie toutes les 5 minutes.
- **Le robot est injoignable** : il est éteint ou hors Wi-Fi ; vérifiez qu'il
  répond dans l'application Ecovacs Home.
- Les logs de l'intégration (interface Gladys ou `docker logs`) ne
  contiennent jamais le mot de passe ni les jetons.
