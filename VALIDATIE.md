# Controle eerste oplevering

Uitgevoerd op 28 oktober 2026, op macOS met Node.js 24.22.1.

## Geslaagd

- TypeScriptcontrole en Vite-productiebouw.
- Drie geautomatiseerde integratietests met tijdelijke databases: accounts en rechten, eigen taken, afgeschermde beheerfuncties, wijzigingsconflicten, archiveren, privé- en teamnotities, Excelimport, dubbele import, back-up, transactioneel herstel, sessie-intrekking, origincontrole en serveren van productieassets.
- Controle van productieafhankelijkheden met `pnpm audit --prod`: geen bekende kwetsbaarheden op het controlemoment.
- HTTP-controle van startpagina en healthcheck op de lokale testserver.
- Browsercontrole van inloggen, weekagenda, taak met notitie opslaan, dashboard, notitie vanuit titel openen, gebruikersoverzicht, back-up/restorebediening, wiswaarschuwing met geblokkeerde bevestigingsknop en verborgen runnergame.
- Het aangeleverde Excelmodel is met de echte importparser uitgelezen: 185 geldige taken, 57 op Takenlijst en 128 in het archief, zonder importwaarschuwingen. De originele spreadsheet staat niet in de repository.

## Grenzen van deze controle

- Op de ontwikkel-Mac is geen Docker-engine beschikbaar. De Docker-image en Compose-stack zijn daarom niet daadwerkelijk gebouwd of gestart. De Dockerfile voert dezelfde build en tests tijdens een imagebuild uit.
- Installatie op de Proxmox/Arcane-VM, netwerktoegang, reverse proxy en HTTPS moeten op de doelserver worden gecontroleerd.
- Dit is een functionele eerste versie; er is geen formele penetratietest of belastingtest uitgevoerd.
- Browsercontroles zijn uitgevoerd op desktopbreedtes. De interface bevat mobiele breekpunten, maar is nog niet op fysieke telefoons gecontroleerd.

## Uitbreiding projecten (versie 1.1)

- Vijf integratietests slagen, inclusief projecten met taken van meerdere medewerkers, aanmaken door medewerkers, bewerken door maker/superadmin, bescherming tegen het vervalsen van de projecteigenaar en afscherming voor lezers.
- Getest: projectkleur, koppeling aan taken, weigeren van een onbekend project, bewerkconflicten, back-upformaat 2 met projecten en herstel van oude back-ups zonder projecten.
- Een oude database zonder projectentabel en zonder projectveld in bestaande taken wordt automatisch uitgebreid zonder de bestaande taken te wijzigen.

- Browsercontrole als medewerker: project aangemaakt, eigen project bewerkt met het kleurenpalet en rechtstreeks een eigen taak aan dat project toegevoegd. Projectkaarten, projectfilter en gekoppelde taken in de agenda zijn gecontroleerd. Ook het uitloggen is gecontroleerd; schrijfverzoeken zonder body sturen geen lege JSON-contentheader meer.

## Pauzegames (versie 1.2)

- Acht tests: bestaande planning/projecten plus haalbaarheid van alle runner-obstakels bij begin-, midden- en topsnelheid; oplopende begrensde snelheid en voldoende tussenruimte.
- Tetris: zeven-stenenverdeling, verwijderen van vier lijnen, punten, draaien langs de rechterrand en oplopende valsnelheid.
- Competitie: ingelogde accounts inclusief lezers, top 3, persoonlijke records die niet dalen, gescheiden ranglijsten, weigeren van andermans ronde, herhaald indienen en onmogelijke scores.
- Scores worden meegenomen in back-upformaat 3; wissen, terugzetten en herstellen van een oudere back-up zonder scores zijn getest.

- Browsercontrole: runner gestart en game-over met opgeslagen persoonlijk record gezien. Tetris gestart, bewogen, gedraaid, gepauzeerd, hervat en uitgespeeld tot game-over; het aparte Tetris-record is opgeslagen en getoond.

## Arcane standalone Compose

- `docker-compose.arcane.yml` gebruikt de openbare GitHub-repository op `main` als remote buildcontext en heeft geen lokale bronbestanden nodig.
- YAML-parsing en validatie tegen het officiële Compose Specification JSON-schema (draft 2020-12) slagen. Poort, volume, omgevingsvariabelen en buildconfiguratie zijn gecontroleerd.
- Docker/Arcane zelf is op deze ontwikkel-Mac niet beschikbaar; een echte build en deployment op de VM zijn nog niet uitgevoerd.

## Versie 1.2.1 — HTTP-client

Een regressietest reproduceert HTTP 415 bij een lege octet-stream POST. De echte browserclient wordt vervolgens doorgelust naar de API met een gesimuleerde proxy; runner starten, Tetris starten en uitloggen moeten met expliciete JSON slagen. De image-tag, pakketversie, Docker-label en zichtbare voettekst dragen versie 1.2.1.

## Gebruikers verwijderen (versie 1.3.0)

Elf tests slagen, inclusief twee nieuwe integratietests voor het definitief verwijderen van een account. Getest zijn de eigen actieve en gearchiveerde taken, notities, spelrecords en inlogsessies; verwijderen van eigen/lege projecten; behoud en overdracht van gedeelde projecten; voorrang voor een actieve opvolger; behoud van andermans archieftaken en projecten; beheerrechten van de opvolger; weigeren van zelfverwijdering, verkeerde bevestiging en verkeerd wachtwoord; bescherming tegen gewijzigde gegevens sinds het voorbeeld; herstelbaarheid van een back-up na verwijderen.

Browsercontrole: in Beheer → Gebruikers is het verwijdervoorbeeld geopend, aantallen en projectacties zijn weergegeven en de definitieve knop bleef uitgeschakeld zonder bevestiging en wachtwoord. Daarna is geannuleerd; in de demo zijn geen gebruikers verwijderd.
