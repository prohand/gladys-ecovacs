# Ecovacs

Steuern Sie Ihre **Ecovacs-Deebot-Saugroboter** und **Ecovacs-GOAT-Mähroboter**
aus Gladys: Auftrag starten und stoppen, den Roboter zu seiner Ladestation
zurückschicken, die Saugleistung einstellen, Akku, Fehler und Verschleiß der
Teile verfolgen.

Die Integration läuft über die **Ecovacs-Cloud**, mit dem Konto der App
**Ecovacs Home**: Ecovacs bietet keine lokale Verbindung an. Gladys braucht
Internetzugang, und der Roboter muss in der App erscheinen.

## Bevor Sie beginnen

1. Installieren Sie die App **Ecovacs Home** und fügen Sie Ihre Roboter hinzu.
2. Notieren Sie die **E-Mail-Adresse** und das **Passwort** des Kontos sowie
   das **Land**, das bei der Erstellung des Kontos gewählt wurde.
3. Konto mit Google-, Apple- oder Facebook-Anmeldung erstellt: Es hat kein
   Passwort. Legen Sie eines in der App fest (Profil, Kontoeinstellungen).

## Konfiguration

1. Öffnen Sie den Tab **Konfiguration** der Integration.
2. Geben Sie die **E-Mail-Adresse**, das **Passwort** und das **Land des
   Kontos** ein.
3. Wählen Sie das **Aktualisierungsintervall** (standardmäßig 1 Minute).
4. Speichern Sie und klicken Sie dann auf **Verbindung testen**: Die Meldung
   listet die gefundenen Roboter auf.
5. Öffnen Sie den Tab **Entdecken** und fügen Sie Ihre Roboter hinzu.

### Geräteverifizierung

Ecovacs kann verlangen, Gladys als neues Gerät zu bestätigen (die Meldung sagt
es, die Cloud antwortet mit dem Code 1013 „Please update to the latest
version“):

1. Klicken Sie auf **Bestätigungscode senden**: Ecovacs schickt einen Code an
   die E-Mail-Adresse des Kontos (sehen Sie auch im Spam-Ordner nach).
2. Geben Sie ihn unter **Gerät bestätigen** ein und klicken Sie: Die Roboter
   werden aufgelistet.

Gladys behält für das Konto dieselbe Gerätekennung, auch nach einem Neustart.

Das Passwort wird nie im Klartext gesendet: Wie in der App geht nur sein
MD5-Fingerabdruck an Ecovacs.

## Was Sie erhalten

| Funktion                           | Saugroboter | Mähroboter | Detail                                                                                 |
| ---------------------------------- | ----------- | ---------- | -------------------------------------------------------------------------------------- |
| Zustand                            | ✔           | ✔          | Gestoppt, in Betrieb, pausiert, Fehler, Rückkehr zur Ladestation, lädt, an der Station |
| Reinigung / Mähen                  | ✔           | ✔          | 1 startet (oder setzt nach einer Pause fort), 0 stoppt                                 |
| Rückkehr zur Ladestation / Station | ✔           | ✔          | 1 schickt den Roboter zurück                                                           |
| Saugleistung                       | ✔           |            | Leise, Standard, Max, Max+ (je nach Modell)                                            |
| Akku, Laden                        | ✔           | ✔          | In %                                                                                   |
| Letzter Fehler                     | ✔           | ✔          | Englischer Text mit seinem Code, siehe Tabelle unten                                   |
| Hauptbürste, Seitenbürste, Filter  | ✔           |            | Verbleibende Lebensdauer in %, alle 30 Minuten gelesen                                 |
| Messer, Bürste der Kameralinse     |             | ✔          | Verbleibende Lebensdauer in %, alle 30 Minuten gelesen                                 |

Ein Badge **Cloud** erscheint auf der Karte des Roboters, wenn er antwortet,
und **Nicht erreichbar**, wenn er nicht mehr antwortet (ausgeschaltet, außerhalb
des WLANs).

## Aktionen

- **Verbindung testen**: meldet sich an und listet die gefundenen Roboter auf.
- **Bestätigungscode senden** / **Gerät bestätigen**: Geräteverifizierung,
  wenn Ecovacs sie verlangt (siehe oben).
- **Roboter orten**: Der Roboter spielt seinen Ton „Ich bin hier“ ab.

## Szenen (Gladys 5.1 oder neuer)

Die Integration fügt dem Szenen-Editor eigene Karten hinzu, unter
**Integrationen**. Jeder Auslöser lässt sich auf einen Roboter einschränken;
leer gelassen, gilt er für alle. Gemeinsame Variable:
`{{triggerEvent.data.name}}` (Name des Roboters).

Auslöser:

- **Reinigung oder Mähen gestartet**: Der Roboter beginnt zu arbeiten (nicht
  beim Fortsetzen nach einer Pause).
- **Reinigung oder Mähen beendet**: Der Roboter hat die Arbeit beendet
  (fertig, gestoppt oder auf dem Rückweg).
- **Roboter zurück an der Ladestation**: Der Roboter steht an seiner
  Ladestation oder Station und lädt.
- **Roboterfehler**: Der Roboter hat einen neuen Fehler gemeldet. Variablen
  `{{triggerEvent.data.code}}` und `{{triggerEvent.data.message}}` (auf
  Englisch). Ideal für eine Benachrichtigung „Roboter festgefahren“.
- **Verschleißteil abgenutzt**: Eine Bürste, ein Filter oder ein Messer ist auf
  10 % seiner Lebensdauer oder weniger gesunken. Lässt sich nach Verschleißteil
  einschränken; Variablen `{{triggerEvent.data.consumable_name}}` (auf
  Englisch) und `{{triggerEvent.data.percent}}`.

Aktionen (Ausgabe `sent` oder `located`: wahr, wenn der Roboter den Befehl
angenommen hat, um den Rest der Szene davon abhängig zu machen):

- **Roboter starten** (setzt fort, wenn pausiert), **Roboter pausieren**,
  **Roboter stoppen**, **Roboter zur Ladestation schicken**, **Roboter orten**.

## Dashboard-Widget

Fügen Sie das Widget **Ecovacs-Roboter** zu einem Dashboard hinzu und wählen
Sie den Roboter in seinen Einstellungen. Es zeigt:

- den Akku, live;
- den Zustand, den letzten Fehler, die Saugleistung, den Verschleiß der
  Verschleißteile (orange unter 10 %) und die Verbindung;
- vier Tasten: **Starten** (oder **Fortsetzen**, oder **Pause** während der
  Arbeit), **Stopp**, **Station** und **Orten**.

Das Widget nutzt die letzte Abfrage des Roboters: Seine Anzeige kostet keine
Anfrage an die Ecovacs-Cloud.

## Häufige Fehlercodes

| Code | Bedeutung                              |
| ---- | -------------------------------------- |
| 101  | Akku schwach                           |
| 102  | Roboter in einer Schleife festgefahren |
| 103  | Problem mit einem Rad                  |
| 104  | Problem mit dem Absturzsensor          |
| 105  | Roboter festgefahren                   |
| 106  | Seitenbürste abgenutzt                 |
| 107  | Staubbehälter voll                     |
| 108  | Seitenbürste blockiert                 |
| 109  | Hauptbürste blockiert                  |
| 110  | Staubbehälter fehlt                    |
| 111  | Problem mit dem Stoßfänger             |
| 112  | Problem mit dem Lasersensor            |
| 113  | Hauptbürste abgenutzt                  |
| 115  | Akkuproblem                            |
| 118  | Filter verstopft                       |
| 119  | Problem mit dem Gebläse                |
| 120  | Problem mit dem Wassertank             |
| 204  | Rad blockiert                          |
| 312  | Ersetzen Sie den Staubbeutel           |
| 1007 | Wischplatte locker                     |

## Unterstützte Roboter

- Aktuelle Deebots (JSON-Protokoll): OZMO 920/950, T8, T9, T10, T20, T30, X1,
  X2, N8, N10… Die Befehle der neuen Generation (`_V2`) und die älteren werden
  automatisch erkannt.
- GOAT-Mähroboter: Unterstützung **noch zu bestätigen**, Rückmeldungen
  willkommen.
- **Nicht unterstützt**: die sehr alten Deebots (erste Serien 600/900,
  XMPP-Protokoll). „Verbindung testen“ nennt sie.

## Fehlerbehebung

- **„Ecovacs hat die E-Mail-Adresse oder das Passwort abgelehnt“**: Prüfen Sie
  sie in der App und vor allem das **Land des Kontos**. Nach einer solchen
  Ablehnung versucht es die Integration nicht mehr von selbst (um das Konto
  nicht zu sperren): Korrigieren Sie die Konfiguration oder klicken Sie auf
  **Verbindung testen**.
- **„Ecovacs verlangt, Gladys als neues Gerät zu bestätigen“**: Folgen Sie der
  [Geräteverifizierung](#geräteverifizierung). Bis dahin versucht es die
  Integration nicht von selbst.
- **„Ecovacs hat den Bestätigungscode abgelehnt“**: Der Code ist falsch oder zu
  alt; fordern Sie einen neuen an.
- **„Die Ecovacs-Cloud ist nicht erreichbar“**: Prüfen Sie den Internetzugang
  von Gladys. Die Integration versucht es alle 5 Minuten erneut.
- **Der Roboter ist nicht erreichbar**: Er ist ausgeschaltet oder außerhalb des
  WLANs; prüfen Sie, ob er in der App Ecovacs Home antwortet.
- Die Protokolle der Integration (Gladys-Oberfläche oder `docker logs`)
  enthalten nie das Passwort oder die Tokens.
