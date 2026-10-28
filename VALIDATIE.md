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
