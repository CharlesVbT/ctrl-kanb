# Architecture de CTRL KANB

## Composants

- `Shared/Web/app.js` : état du Kanban, migration, Agenda, centres de validations et de suivi, ordre, épinglage, liste progressive et menu des projets, deux tableaux fixes indépendants, priorités, taxonomie, planificateur local, cartes, récurrence, conversations et interactions.
- `Shared/Web/app.css` : navigation repliable, barres d'actions, interfaces Agenda/Tableau/Flux/Validations/Suivi, Réglages et panneau de conversation.
- `Shared/Web/platform.js` : adaptateur léger qui dirige le pont vers WebKit sur macOS ou Tauri sur Windows.
- `Platforms/macOS/Sources/App/main.m` : fenêtre macOS, pont WebKit, App Server, file, synchronisation, stockage et notifications.
- `Platforms/macOS/Sources/App/AppServerClient.m` : client JSONL pour `codex app-server --stdio`.
- `Platforms/macOS/Sources/Helper/main.m` : watchdog macOS court, lancé par `launchd` uniquement après activation volontaire.
- `Platforms/macOS/Sources/CLI/main.m` : commandes déterministes pour l’automatisation locale.
- `Platforms/Windows/src-tauri` : hôte Windows Tauri 2, contrat natif fermé, processus agents, ConPTY et stockage local atomique.

## Détection des agents

Codex CLI et Claude Code CLI sont détectés séparément au chargement. Sur macOS, la recherche couvre les bundles connus, Homebrew, le `PATH` et les gestionnaires utilisateur courants. Sur Windows, elle couvre le `PATH`, l’installation Codex dans `%LOCALAPPDATA%` et les exécutables utilisateur dans `%USERPROFILE%\.local\bin`. Un chemin absolu peut être imposé sur les deux systèmes avec `CTRL_KANB_CODEX_PATH` ou `CTRL_KANB_CLAUDE_PATH`.

La présence d’un exécutable et l’état du compte sont deux informations différentes. Le pont `agentStatus` confirme seulement la présence locale. Le test de connexion lance un aller-retour réel et conserve séparément son résultat pour chaque agent et chaque compte.

L’absence d’un agent ne bloque pas l’autre ni les fonctions locales d’organisation. Elle bloque uniquement les lancements, le chat et les synchronisations qui dépendent de cet agent.

## Exécution d'une carte

1. Le JavaScript place la carte dans `queued` et transmet une copie au code natif.
2. Le gestionnaire natif démarre la tâche si une place est libre, sinon il la conserve dans `pendingRuns`.
3. Un App Server temporaire est initialisé.
4. La conversation est créée avec `thread/start` ou reprise avec `thread/resume`.
5. Le prompt est envoyé avec `turn/start`.
6. Événements, autorisations et questions sont retransmis à WebKit et les demandes sont enregistrées dans le centre de validations.
7. Une réponse du centre est renvoyée avec l’identifiant App Server exact ; l’exécution reprend.
8. À `turn/completed`, la carte passe dans À revoir/À vérifier, ou y est projetée comme échec ; la tâche suivante démarre.

Une suspension marque d’abord la carte `pausing`, puis demande `turn/interrupt` à l’App Server ou retire la requête de `pendingRuns`. Le code natif renvoie `runnerCanceled`, distinct d’un échec. La carte passe alors à `executionState=paused` tout en gardant `status=running`, ce qui la maintient dans En cours/Actives. **Reprendre** crée un nouveau tour dans la conversation principale ; CTRL KANB ne prétend pas conserver un processus gelé au milieu d’une instruction.

Chaque exécution possède son propre processus App Server et peut viser une conversation différente. La concurrence est plafonnée de 1 à 4 ; le surplus reste dans `pendingRuns` en FIFO. Les conversations restent persistées par Codex. Le moteur facultatif ne remplace pas l’App Server : il vérifie uniquement que le processus principal CTRL KANB reste disponible.

## Synchronisation

Pour chaque conversation liée, CTRL KANB appelle `thread/read` avec les tours. L'interface rapproche les résultats par identifiant et met à jour l'état de la carte sans modifier une carte déjà marquée Terminée.

## Stockage

Toutes les écritures utilisent un verrou interprocessus, une sérialisation JSON validée, un remplacement atomique, une copie `board.previous.json` et une ligne dans `events.jsonl`. Une restauration validée crée en plus une copie privée horodatée `board.before-import-*.json` avant de remplacer le tableau. L’implémentation repose sur `flock` et `NSDataWritingAtomic` sur macOS, et sur un verrou de fichier avec écriture atomique sur Windows.

Le verrou empêche deux écritures physiques simultanées. Tout outil externe qui modifie le tableau doit relire l’état courant sous le même verrou avant sa mutation afin d’éviter une écriture fondée sur un état ancien.

## Migration et taxonomie

Le schéma 22 conserve les deux structures fixes, `classic` et `routines`, persiste l’état de suspension séparément du workflow, la date et la cause de l’archivage, le dernier test de chaque compte et le dernier contrôle des conversations pour chaque moteur. Tableau reste la représentation des étapes. Flux est une projection opérationnelle des mêmes cartes selon six besoins : aujourd’hui, prêtes, actives, décisions, priorités et sept prochains jours. `completedAt` distingue la réalisation réelle d’une simple dernière modification. La migration est sauvegardée par le même mécanisme atomique que les autres changements.

La page Suivi est une projection des cartes `review`, `done` et des échecs sans validation en attente, comme l’Agenda est une projection temporelle. Elle affiche `lastRun.summary` ou l’aperçu de la conversation active. Une consigne d’approfondissement repart par la file dans la conversation principale ; une tâche complémentaire crée une nouvelle carte. Aucun journal distinct ne peut diverger du Kanban.

## Autorisations et validation humaine

L’App Server émet une requête JSON-RPC lorsqu’une commande, une modification de fichiers ou une question exige une décision. Le code natif transmet la requête à WebKit avec son identifiant original et le contexte de l’exécution. JavaScript crée alors une entrée `validations[]`, place la carte en intervention et affiche le centre de validations.

La réponse utilise toujours l’identifiant stocké, sans le reconstruire depuis le DOM. La décision est historisée avant l’envoi. L’événement `serverRequest/resolved` remet la carte en cours si l’exécution est encore active. Les résultats de tours terminés sont présentés dans un bloc distinct : accepter une permission et valider le résultat final sont deux opérations différentes.

Les demandes App Server ne survivent pas à l’arrêt du processus. Au chargement, une entrée encore `pending` devient donc `interrupted` au lieu de présenter un bouton devenu inopérant.

## Agenda

L’Agenda est une projection du tableau, pas un second stockage. Il sélectionne `completedAt`, `scheduledAt` ou `dueDate` selon l’état de chaque carte, puis positionne les événements sur une grille par jour et par demi-heure dans le fuseau choisi. Une création depuis l’Agenda appelle le formulaire commun avec `dueDate`, `scheduledAt` et `launchMode=scheduled` préremplis ; toutes les règles existantes de file, dépendances, récurrence et quota restent donc appliquées. Le premier jour de semaine et le format 12/24 heures suivent les réglages régionaux du système par défaut et restent configurables.

Une heure saisie est convertie en instant UTC ISO 8601 avant l’enregistrement. Le planificateur compare donc des instants absolus ; changer de fuseau ne déplace jamais l’exécution réelle. Les récurrences conservent l’heure murale du fuseau configuré, y compris lors d’un changement d’heure saisonnier. Une heure inexistante pendant ce changement est refusée dans l’éditeur.

Le glisser-déposer modifie `scheduledAt` pour une planification ou `dueDate` pour une échéance manuelle. Il ne convertit jamais implicitement une échéance en lancement automatique. Le redimensionnement agit sur `durationMinutes` par pas de quinze minutes. Les intervalles qui se chevauchent sont répartis en couloirs côte à côte ; l’état actif ou la position FIFO vient de la file native. Les tâches terminées ne sont pas déplaçables afin de protéger `completedAt` comme trace historique.

## Grands tableaux

Le nombre de cartes stockées n’est pas limité par l’interface. Pour éviter un DOM trop lourd, chaque colonne rend 30 cartes puis propose des lots supplémentaires de 30. Historique rend séparément les tâches terminées et les archives par lots de 50. Les compteurs portent toujours les totaux réels. Flux limite chaque bloc du cockpit à huit lignes compactes. L’archivage retire les cartes terminées du Tableau et de Flux, mais pas d’Historique ni de l’Agenda.

## Archivage et historique

L’archivage est réversible et ne supprime aucune donnée. Une action manuelle, un archivage en lot ou la règle `autoArchiveCompletedDays` définissent `archived`, `archivedAt` et `archiveReason`. Le contrôle automatique s’exécute au chargement puis avec le tick du planificateur. Historique affiche séparément les tâches encore présentes dans Terminées et les archives. L’Agenda inclut explicitement les cartes terminées archivées, car leur date de réalisation reste un fait historique.

La suppression d’un projet est une mutation de `spaces[]`, `cards[]` et des validations locales associées. Elle ne transmet aucune commande de suppression au code natif et ne demande jamais au système de supprimer le dossier : le chemin `rootPath` est seulement affiché dans la confirmation de sécurité. Les conversations Codex ne sont pas supprimées.

## Planificateur local

Un contrôle est effectué au chargement puis toutes les 30 secondes. Une carte éligible et échue est transmise à la même file que les lancements manuels. Les dépendances, le nombre maximal d’exécutions et le stockage restent donc communs aux deux modes.

La fermeture de la fenêtre ne termine pas le processus quand le moteur facultatif est activé. Sur macOS, `launchd` exécute le helper `ctrl-kanb-wake`. Sur Windows, une entrée de démarrage du profil utilisateur relance l’application avec `--background`, sans droit administrateur. La zone de notification permet de rouvrir l’interface ou de quitter réellement.

Une extinction de l’ordinateur reste une limite physique. Au réveil ou à la prochaine ouverture de session, le processus principal exécute immédiatement le contrôle : les cartes `catchUp` sont reprises ; les cartes `skip` sont ignorées quand le créneau est dépassé de plus de 15 minutes. L’état du moteur et son dernier contrôle restent visibles dans Réglages.

Une erreur reconnue comme limite d’usage remet uniquement une carte programmée à l’état `waitingQuota`. Le délai double progressivement de 15 à 240 minutes. Les autres erreurs passent dans À revoir/À vérifier et dans Suivi afin d’éviter une boucle automatique sur un défaut de dossier, de permission ou de configuration.

## Limites actuelles

- la file d'exécution vit dans le processus ; après une sortie complète, seules les cartes programmées avec reprise sont remises en attente automatiquement ;
- une demande d’autorisation en attente ne peut pas être reprise après l’arrêt de son App Server ; elle reste visible comme interrompue ;
- aucun travail ne peut s’exécuter pendant que l’ordinateur est éteint ;
- la référence à une routine Scheduled est informative, car la CLI ne fournit pas son interface de gestion ;
- le panneau affiche les huit derniers tours disponibles ;
- les notifications système nécessitent l’autorisation de macOS ou Windows ; l’interface garde ce canal distinct des messages internes ;
- le moteur filtre chaque notification par catégorie et par règle de tâche avant de la remettre au Centre de notifications. Les messages internes restent gérés par l’interface WebKit.
