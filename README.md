# YAPlaning

Yet Another Planning — een eigen Nederlandstalige planning voor een groeiend team.

## Starten op je VM

Vereist: Docker Engine met Docker Compose. Plaats deze volledige map op je Linux-VM en voer in die map uit:

```sh
docker compose up -d --build
```

Open `http://IP-VAN-JE-VM:3210`. Maak op het eerste scherm je eigen superadmin aan. Er zijn **geen standaardaccounts of standaardwachtwoorden**. Voeg via Beheer medewerkers en lezers toe. Vul desgewenst bij Werkplek de teamnaam in.

De SQLite-database staat in het Docker-volume `yaplaning_data`. Containerupdates behouden je gegevens. **`docker compose down -v` verwijdert het datavolume.** Voor normaal stoppen gebruik je `docker compose down`.

Instellingen voor poort, bindadres en HTTPS staan in `.env.example`. Kopieer die naar `.env` als je ze wilt wijzigen. Een voorbeeld voor gebruik achter een HTTPS-proxy:

```dotenv
APP_PORT=3210
APP_ORIGIN=https://planning.jouwdomein.nl
COOKIE_SECURE=true
TRUST_PROXY=true
```

De reverse proxy moet het verkeer naar poort 3210 sturen en forwarded headers zelf overschrijven. Laat de eerste installatie alleen door de beheerder uitvoeren: degene die het lege systeem als eerste opent kan het eerste beheeraccount aanmaken.

## Arcane op Proxmox

YAPlaning draait als normale Compose-stack in de VM waarop je Docker/Arcane draait; Proxmox heeft geen app-specifieke instellingen nodig. Gebruik de volledige projectmap als buildcontext. Alleen de YAML plakken zonder de bronbestanden is niet voldoende, omdat Compose de image lokaal bouwt.

De voorspelbare route is om de Git-repository op de VM te clonen, in die map `docker compose up -d --build` uit te voeren en vervolgens de container/stack in Arcane te beheren. Bij een update: `git pull` en opnieuw `docker compose up -d --build`. Maak vooraf een back-up. Als jouw Arcane-versie Git-stacks met een lokale buildcontext ondersteunt, kun je dezelfde repository en `docker-compose.yml` daarvoor gebruiken.

## Projecten (versie 1.1)

Iedere medewerker kan projecten aanmaken met een naam, omschrijving en kleur, en de eigen projecten bewerken. De superadmin kan alle projecten bewerken; lezers kunnen ze alleen bekijken. De maker van een project krijgt geen extra rechten op taken van anderen.

Kies Projecten in de zijbalk voor kaarten met voortgang, betrokken medewerkers en ingeschatte openstaande uren (exclusief taken zonder ureninschatting). De voortgang telt alle taken mee, inclusief gearchiveerde taken. Klik op een project voor de gezamenlijke takenlijst, met persoonstabbladen en een optie om archieftaken te tonen. Een taak hoort bij maximaal één project; koppelen is optioneel.

In het taakformulier kies je het project. De agenda gebruikt de projectkleur voor gekoppelde taken en de persoonskleur voor taken zonder project. Naam van de medewerker blijft zichtbaar bij de tijdblokken; projectnaam staat bij grotere blokken en in de tooltip. Met het projectfilter kun je agenda, takenlijst en archief beperken tot één project of taken zonder project.

Bestaande databases worden bij opstarten automatisch uitgebreid; bestaande taken krijgen geen project. Nieuwe back-ups gebruiken formaat 2 en nemen ook de projecten en projecteigenaren mee. Back-ups van formaat 1 blijven herstelbaar. Herstel van een oude back-up vervangt ook alle huidige projecten, omdat die niet in die back-up bestaan. Database legen verwijdert eveneens projecten.

## Wat zit erin?

- Weekagenda met persoonskleuren, weeknavigatie, vandaagknop, optionele weekends en instelbare werktijden.
- Datum en prioriteit zijn optioneel. Taken zonder datum staan bij Nog te plannen. Taken met datum zonder tijd staan in Hele dag, gesorteerd op prioriteit (1 is het hoogst). Taken met tijd staan op hun begintijd; de ureninschatting bepaalt de blokhoogte (visueel maximaal 8 uur). Gelijktijdige blokken staan naast elkaar. Buiten ingestelde werktijden staan taken met hun tijd in de rij Hele dag.
- Een deadline is apart van een plandatum. Alleen de plandatum zet een taak in de agenda. Zonder opgegeven duur gebruikt de agenda een visueel blok van één uur.
- Sorteerbare takenkolommen, zoeken in omschrijving, notitie, opdrachtgever en medewerker, persoonstabbladen onderaan en statusfilters.
- Taaknotities, termijn, opdrachtgever met automatisch opgebouwde suggesties, ureninschatting en statussen Open / In Process / On Hold / Afgewerkt.
- Dashboard met open taken op prioriteit en een notitiebord. Teamnotities zijn voor iedereen leesbaar; privénotities zijn alleen zichtbaar voor de auteur. Een volledige beheerback-up bevat ook privénotities.
- Handmatig archiveren van afgewerkte taken. Open een archieftaak en vink archiveren uit om terug te zetten.
- Rollen: superadmin beheert alles; medewerkers wijzigen alleen eigen taken en notities; lezers kunnen alleen bekijken en krijgen geen persoonstabblad. Medewerkers zien de taken van het hele team. Een superadmin kan een gedeelde notitie aanpassen.
- Gebruikers aanmaken, wachtwoord opnieuw instellen, kleuren en rollen aanpassen en accounts uitschakelen. Er is geen e-mailservice of zelfbedienings-wachtwoordreset nodig. Een medewerker met taken moet zijn taken eerst laten overdragen voordat zijn planning uitgeschakeld kan worden. Een inactieve medewerker blijft via de filter terug te vinden.
- Excelimport met preview, rapportage van ongeldige regels en bescherming tegen dubbele import.
- Downloadbare back-up, gevalideerd herstel in één databasetransactie en database legen met wachtwoord en bevestigingstekst. Alle sessies vervallen bij herstel.
- Activiteitenlog voor beheeracties.
- Verborgen zwart-wit runnergame: probeer de drie puntjes in het kaartje onderin de zijbalk.

## Thijs' Excel importeren

1. Maak Thijs aan als medewerker met eigen planning.
2. Open Beheer → Excel importeren en kies Thijs.
3. Selecteer `Planning Thijs Valkenburg.xlsx`.
4. Bekijk het voorbeeld en eventuele waarschuwingen; klik daarna op Definitief importeren.

Het originele model heeft kolomkoppen op rij 2: Wie?, Omschrijving, Soort, Status, Prioriteit, Opdrachtgever, Urenschatting, Deadline, Bron. De tabbladen Takenlijst en Afgerond worden gelezen; Gegevensblad wordt niet geïmporteerd. De gekozen medewerker vervangt de kolom Wie?. Bron wordt de taaknotitie, Completed wordt Afgewerkt. Afgewerkte regels uit Afgerond worden gearchiveerd. Een onbekende/ongeldige deadline wordt leeg gelaten met een waarschuwing. Een ongeldige taakregel wordt overgeslagen en in de preview vermeld. Exact dezelfde taakinhoud wordt binnen dezelfde medewerker niet opnieuw toegevoegd. Dit is geen synchronisatie: latere Excelwijzigingen worden niet automatisch samengevoegd met eerder geïmporteerde taken. Import gebeurt alleen door de superadmin.

Het Excelbestand en productiegegevens zijn **niet** opgenomen in deze broncode.

## Back-up en herstel

Beheer → Gegevens & back-up → Back-up downloaden. Dit JSON-bestand bevat alle gebruikers (inclusief gezouten wachtwoordhashes), projecten, taken, archief, notities, instellingen en importhistorie. Bewaar het buiten de VM op een veilige plek. De download is een handmatige back-up; er is nog geen automatische offsite-back-up. Proxmox-VM-back-ups kunnen aanvullend gebruikt worden.

Herstel vervangt de huidige inhoud en accounts. Maak eerst een back-up, kies het herstelbestand, controleer de aantallen, typ HERSTELLEN en geef je **huidige** beheerwachtwoord op. Log daarna in met een account uit de herstelde back-up. YAPlaning controleert het formaat, de versie, de velden, koppelingen en de aanwezigheid van een actieve superadmin voordat de transactie wordt uitgevoerd. Een mislukte validatie laat de bestaande data staan. Back-ups tot circa 15 MB worden via het venster ondersteund.

Database legen verwijdert projecten, taken, archief, notities en importhistorie; gebruikers, instellingen en activiteitenlog blijven bestaan. Daarvoor zijn LEEGMAKEN en het beheerwachtwoord vereist.

## Lokaal ontwikkelen

Node.js 24 en pnpm 11.25.0:

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Open `http://127.0.0.1:3210`. Voor ontwikkelverversing start je `pnpm dev` en in een tweede terminal `pnpm dev:web`; Vite proxyt `/api` naar de backend. Zet tijdens dit gebruik `APP_ORIGIN=http://localhost:5173` als je de Vite-URL `http://localhost:5173` opent. Gebruik één consistente hostname. De productiebouw wordt rechtstreeks door de API geserveerd; Vite draait niet in de container.

`pnpm test` controleert met een tijdelijke database onder meer rechten, archiveren, bewerkconflicten, privénotities, import, dubbele import, back-up, herstel en bescherming tegen vreemde origins. De Docker-build voert de TypeScriptcontrole, frontendbuild en tests uit voordat de runtime-image wordt gemaakt.

## Techniek en werking

TypeScript, React, Vite, Fastify en SQLite (de ingebouwde Node.js-driver). Cookies zijn HttpOnly en SameSite Strict, sessietokens staan alleen gehasht in de database. Wachtwoorden zijn gezouten met scrypt. De API controleert rechten, invoer en de herkomst van schrijfverzoeken. Loginverzoeken hebben een aparte limiet. React ontsnapt notitietekst; HTML in notities wordt niet uitgevoerd. Taken en notities hebben een wijzigingsversie om onbedoeld overschrijven bij gelijktijdig bewerken te voorkomen.

De app is bedoeld voor één appcontainer met een lokaal Docker-volume. Deel het SQLite-bestand niet via NFS en start geen meerdere replicas op hetzelfde volume. Bewaar de volume-inhoud bij updates. Nieuwe tabellen worden bij starten automatisch aangemaakt; nieuwe back-ups gebruiken formaat 2; herstel ondersteunt formaat 1 en 2. Het dashboard vernieuwt bij eigen wijzigingen en bij opnieuw laden; live synchronisatie tussen browsers is nog niet ingebouwd. De agenda toont tijden in de lokale browsertijdzone; voor jullie team is Europe/Amsterdam voorzien.

## GitHub

De openbare broncode staat op https://github.com/monomo71/YAPlaning.

Op de VM:

```sh
git clone https://github.com/monomo71/YAPlaning.git
cd YAPlaning
docker compose up -d --build
```

`data/`, `.env`, `node_modules/` en buildbestanden staan in `.gitignore`. Voeg geen persoonlijke Excelbestanden of back-ups toe. Testgegevens en demoaccounts zijn niet onderdeel van de repository.

## Starten en bijwerken met docker run

Als alternatief voor Compose kun je vanuit de repository deze opdrachten gebruiken:

```sh
docker build -t yaplaning:latest .
docker run -d --name yaplaning --restart unless-stopped --init -p 3210:3210 -e TZ=Europe/Amsterdam -v yaplaning_data:/app/data yaplaning:latest
```

Een bestaande installatie bijwerken: maak eerst via beheer een back-up, haal de wijzigingen op en vervang de container met hetzelfde volume:

```sh
git pull
docker build -t yaplaning:latest .
docker stop yaplaning
docker rm yaplaning
docker run -d --name yaplaning --restart unless-stopped --init -p 3210:3210 -e TZ=Europe/Amsterdam -v yaplaning_data:/app/data yaplaning:latest
```

Gebruik dezelfde poort, omgevingsvariabelen en volumenaam als je huidige installatie wanneer die afwijken van dit voorbeeld. Het volume blijft bij het verwijderen van de container bestaan. Bestaande taken en accounts blijven zo behouden. Start je de installatie met Compose, blijf dan Compose gebruiken en voer na `git pull` opnieuw `docker compose up -d --build` uit.
