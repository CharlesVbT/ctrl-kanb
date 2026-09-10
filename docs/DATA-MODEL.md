# Modèle de données

## Tableau

```json
{
  "version": 22,
  "settings": {
    "maxConcurrency": 2,
    "autoSync": true,
    "backgroundSchedulerEnabled": false,
    "autoArchiveCompletedDays": 0,
    "sidebarCollapsed": false,
    "agendaMode": "week",
    "agendaTimeZone": "auto",
    "agendaWeekStart": "auto",
    "agendaHourCycle": "auto",
    "defaultBoardPreset": "classic",
    "activePresetByScope": {},
    "accounts": [],
    "activeAccount": {},
    "accountChecks": {},
    "conversationSyncChecks": {},
    "inAppNotifications": "all",
    "systemNotificationsEnabled": true,
    "notificationWhen": "background",
    "notificationEvents": {
      "taskComplete": true,
      "taskFailed": true,
      "approval": true,
      "chatReply": true,
      "scheduleIssue": true
    },
    "priorities": [],
    "taxonomy": []
  },
  "spaces": [],
  "cards": [],
  "validations": [],
  "templates": []
}
```

## Carte

- `id`, `spaceID`, `boardPresetID`, `title`, `prompt` ;
- `status`, `priorityLevelID`, `priorityNumber`, `runMode` ;
- `executionState` : chaîne vide, `pausing` ou `paused` ; `pausedAt` conserve la date de suspension ;
- `agentEngine`, `model`, `reasoningEffort` ;
- `notificationMode` : `inherit`, `always` ou `mute` pour reprendre, forcer ou couper les notifications système de cette tâche ;
- `columnAssignments` : ancien classement conservé pour compatibilité, mais ignoré par les deux tableaux fixes ;
- `categoryAssignments` : valeurs sélectionnées, regroupées par identifiant d'axe ;
- `labels[]`, `subtasks[]`, `dependencies[]` ;
- `dueDate`, `recurrence`, `recurrenceSource`, `routineName` ;
- `launchMode`, `scheduledAt`, `durationMinutes`, `missedRunPolicy` ;
- `scheduleState`, `scheduleNextAttemptAt`, `scheduleAttempts`, `scheduleTriggeredAt` ;
- `archived`, `archivedAt`, `archiveReason` (`manual` ou `automatic`) ;
- `conversations[]`, `activeConversationID` ; chaque conversation peut conserver `accountID` pour retrouver le bon dossier de compte lors d’une actualisation ;
- `completedAt` : date ISO enregistrée au passage réel à l’état Terminé ;
- `lastRun`, `createdAt`, `updatedAt`.

Les champs historiques `conversationID`, `conversationName`, `conversationPreview` et `conversationCwd` restent maintenus pour la compatibilité avec la CLI V2. Ils reflètent la conversation active.

Le champ historique `priority` reflète `priorityLevelID` pour la compatibilité. Les anciennes cartes sont migrées vers le schéma 22, numérotées automatiquement et reçoivent une durée visuelle de 60 minutes. Une ancienne planification locale est convertie en instant UTC selon le fuseau configuré, ou celui du système en mode automatique. Une carte existante manuelle et non récurrente rejoint `classic` ; une carte programmée, reliée à Codex Scheduled ou récurrente rejoint `routines`. Si une ancienne carte est déjà terminée, `completedAt` est reconstruit depuis la fin de sa dernière exécution ou sa dernière modification. Une suspension interrompue par une fermeture de l’application est normalisée vers `paused`. Une ancienne archive reçoit `archivedAt` sans perdre sa date de réalisation. La migration reprend l’ancien réglage `notifications` : `none` coupe le canal système, `all` conserve l’affichage permanent et `background` conserve l’affichage hors premier plan. Les cinq catégories sont activées lors de cette reprise et chaque ancienne carte reçoit `notificationMode: inherit`. La migration n’active ni le moteur d’arrière-plan ni l’archivage automatique : ces options restent désactivées tant que l’utilisateur ne les choisit pas.

## Notifications

- `inAppNotifications` vaut `all` ou `essential`. Le second mode masque les confirmations de routine mais conserve les erreurs, demandes d’action et résultats d’agent ;
- `systemNotificationsEnabled` coupe ou active globalement les alertes remises au système de notifications ;
- `notificationWhen` vaut `background` ou `all` ;
- `notificationEvents` active séparément les résultats réussis, échecs manuels, validations/questions, réponses du chat latéral et problèmes de planification ;
- le réglage historique `notifications` reste écrit en miroir pour les anciennes versions de l’application.

Le moteur natif applique d’abord `notificationMode` de la carte, puis les réglages globaux. `mute` bloque toujours l’alerte. `always` force l’alerte de la tâche même si sa catégorie ou le canal global sont coupés. La remise effective dépend encore de l’autorisation accordée à CTRL KANB par le système, dont l’état est affiché dans Réglages.

## Comptes

- `accounts[]` référence les comptes supplémentaires et leur dossier de configuration séparé ;
- `activeAccount` conserve le compte choisi indépendamment pour Codex et Claude ;
- `accountChecks` conserve, par identifiant de compte, l’état terminal du dernier test (`ready`, `blocked`, `missing` ou `login`), sa date et un éventuel diagnostic.
- `conversationSyncChecks` conserve séparément le dernier contrôle Codex et Claude : état, date, nombre de conversations relues, échecs et durée.

Un état `ready` signifie qu’un aller-retour réel a réussi à la date enregistrée. Il ne remplace pas l’authentification du CLI et ne stocke aucun secret. Les identifiants restent dans `~/.codex`, `~/.claude` ou le dossier séparé du compte. Un état transitoire `running` reste uniquement en mémoire et n’est jamais écrit dans le tableau.

L’actualisation Codex utilise `thread/read`. L’actualisation Claude lit via Claude Code CLI sans modification le journal JSONL de chaque session principale sous le dossier `projects` du compte associé. Elle n’envoie aucun prompt et signale une session absente ou illisible au lieu de la déclarer à jour.

## Projet

- `id`, `name`, `rootPath`, `accentHex` ;
- `pinned` : maintient le projet au-dessus des projets non épinglés ;
- l’ordre manuel correspond directement à l’ordre des objets dans `spaces[]`.

Le glisser-déposer et les commandes Monter/Descendre réordonnent `spaces[]`. Les projets épinglés et non épinglés constituent deux groupes ordonnables séparément afin qu’un déplacement ne change jamais silencieusement l’état d’épinglage.

Le bouton d’affichage progressif du panneau latéral est un état d’interface temporaire : il ne modifie ni `spaces[]`, ni l’épinglage, ni les données du projet. Le projet actuellement sélectionné reste visible même lorsque la liste est réduite.

## Validation

```json
{
  "id": "identifiant-local",
  "requestID": 42,
  "cardID": "carte",
  "spaceID": "projet",
  "agentEngine": "codex",
  "kind": "command",
  "status": "pending",
  "params": {},
  "requestedAt": "date ISO",
  "decidedAt": "date ISO",
  "accessMode": "workspaceWrite",
  "approvalMode": "manual",
  "model": "gpt-5.6-sol",
  "reasoningEffort": "medium",
  "threadID": "conversation"
}
```

`kind` vaut `command`, `file` ou `input`. `status` passe de `pending` à `accepted`, `acceptedForSession`, `declined`, `answered`, `resolved` ou `interrupted`. Les 200 demandes les plus récentes sont conservées. Une demande encore `pending` au redémarrage devient `interrupted`, car la requête App Server d’origine ne peut plus recevoir de réponse.

## Agenda

L’Agenda ne duplique aucune donnée. Il dérive un événement par carte : `completedAt` pour une tâche terminée, y compris archivée, `scheduledAt` pour un lancement planifié, sinon `dueDate` pour une échéance manuelle. `durationMinutes` règle uniquement la hauteur temporelle de l’événement, de 15 à 480 minutes. Une suppression explicite de carte reste le seul moyen de retirer définitivement sa réalisation de l’Agenda.

`agendaTimeZone` vaut `auto` ou un fuseau IANA, `agendaWeekStart` vaut `auto`, `0`, `1` ou `6`, et `agendaHourCycle` vaut `auto`, `h23` ou `h12`. Les valeurs automatiques suivent les réglages régionaux du système. Le fuseau règle l’affichage et la saisie ; il ne décale pas l’instant déjà enregistré.

## Organisations de tableau

Les deux organisations sont définies dans le code et ne sont pas éditables :

- `classic` : Idées, Prêtes, Planifiées, En cours, Validation, À revoir, Terminées ;
- `routines` : À configurer, Planifiées, Actives, Validation, À vérifier, Terminées.

`boardPresetID` vaut `classic` ou `routines` et définit l’unique tableau auquel la carte appartient. `defaultBoardPreset` indique le tableau proposé lors d’une création sans contexte. `activePresetByScope` mémorise le tableau affiché dans la vue Tableau pour la vue globale et chaque projet. La vue Tableau filtre sur `boardPresetID`. Flux ne constitue pas une troisième structure : il projette les cartes ouvertes selon leur utilité opérationnelle du moment et une même carte peut donc apparaître dans plusieurs blocs du cockpit.

La page Suivi n’ajoute aucun stockage parallèle. Elle sélectionne les cartes `review`, `done` ou en échec sans validation en attente possédant un résumé, une date de fin ou une conversation. Une tâche complémentaire est une nouvelle carte standard ; une instruction d’approfondissement réutilise la carte et sa conversation principale.

## Lancement programmé

- `launchMode` : `manual`, `scheduled` ou `codex` ;
- `scheduledAt` : instant UTC ISO 8601. L’interface le convertit vers le fuseau choisi pour l’affichage et la modification ;
- `missedRunPolicy` : `catchUp` ou `skip` ;
- `scheduleState` : `pending`, `waitingDependency`, `queued`, `launched`, `waitingQuota`, `completed`, `paused`, `skipped` ou `failed` ;
- `scheduleNextAttemptAt` : date ISO du prochain essai après une limite d’usage ;
- `scheduleAttempts` : nombre de refus de quota consécutifs.

Les cartes V4 migrent vers `manual` par défaut afin qu’une ancienne échéance ne provoque jamais un lancement automatique inattendu. Une ancienne carte reliée à une routine Codex migre vers `codex`.

## Priorité

```json
{
  "id": "high",
  "name": "Haute",
  "code": "H",
  "color": "E59B42",
  "weight": 1
}
```

Le niveau classe les cartes ; `priorityNumber` règle leur ordre à l'intérieur du niveau et de l'espace. La référence affichée combine les deux, par exemple `H-03`.

## Axe de catégorisation

```json
{
  "id": "subproject",
  "name": "Sous-projet",
  "kind": "subproject",
  "multiple": false,
  "parentDimensionID": "objective",
  "values": [
    {
      "id": "website",
      "name": "Site web",
      "color": "6E75FF",
      "parentValueID": "launch"
    }
  ]
}
```

Types : `objective`, `subproject` ou `generic`. Une valeur de sous-projet peut référencer une valeur de l'axe Objectif. Sur une carte, sélectionner un sous-projet doté d'un parent aligne automatiquement l'objectif.

## Conversation liée

```json
{
  "id": "thread-id",
  "name": "Nom affiché",
  "preview": "Dernière activité",
  "cwd": "/chemin/du/projet",
  "role": "main",
  "addedAt": "date ISO"
}
```

Rôles : `main`, `attempt`, `delegated`, `validation`.

## Récurrence

- `recurrence` : `none`, `daily`, `weekly` ou `monthly` ;
- `recurrenceSource` : `board` ou `codex` ;
- `routineName` : référence libre vers une tâche Scheduled ;
- `nextOccurrenceCreated` : protection contre une création en double.
