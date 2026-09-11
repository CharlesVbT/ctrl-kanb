# Confidentialité

CTRL KANB est une application locale pour macOS et Windows. Elle n’exploite aucun compte CTRL KANB, serveur intermédiaire, outil d’analyse d’usage ou télémétrie propre au projet.

## Données enregistrées

Le tableau, les réglages, les états de synchronisation, les journaux de diagnostic et le planificateur sont stockés dans le profil utilisateur :

```text
macOS   ~/Library/Application Support/CTRL KANB/
Windows %LOCALAPPDATA%\CTRL KANB Data\
```

Ces fichiers peuvent contenir des titres, consignes, réponses, chemins de dossiers, identifiants de conversation, préférences et diagnostics. Ils ne sont pas chiffrés par CTRL KANB. Le verrou de l’application protège l’ouverture de la fenêtre, pas le fichier `board.json` contre un autre processus déjà autorisé sur le compte système.

La sauvegarde `board.previous.json`, les copies `board.before-import-*.json` et le journal `events.jsonl` restent dans le même dossier. La désinstallation conserve ces données afin de permettre une réinstallation.

## Export et restauration

Un export JSON contient l’organisation complète, y compris les textes, historiques, chemins de projets, identifiants de conversation et réglages de comptes. Il ne copie pas le contenu des projets ni les jetons gérés par les CLI. Traitez néanmoins chaque export comme une donnée privée.

Avant une restauration, CTRL KANB valide le document et crée une copie de l’état courant. L’import ne modifie pas les dossiers de projets.

## Comptes Codex et Claude

CTRL KANB ne copie aucun mot de passe ou jeton dans son tableau. Les identifiants restent gérés par Codex CLI et Claude Code CLI dans leurs propres dossiers de configuration.

L’application conserve le compte sélectionné, le chemin du dossier de configuration isolé et le résultat daté du dernier test. Ajouter ou retirer ce raccourci ne connecte, ne déconnecte et n’efface pas automatiquement le compte dans la CLI.

## Quand un contenu quitte l’ordinateur

Quand vous lancez une tâche ou envoyez un message, CTRL KANB transmet la consigne, les pièces jointes choisies et le contexte autorisé à la CLI officielle installée. Cette CLI communique alors avec son fournisseur selon les conditions, politiques et réglages du compte concerné.

CTRL KANB ne place aucun serveur entre la CLI et son fournisseur. La synchronisation Codex interroge les conversations associées. La synchronisation Claude relit via Claude Code CLI les journaux de sessions locaux et n’envoie pas de nouvelle consigne.

L’installation depuis les sources télécharge les dépendances de compilation depuis leurs registres respectifs. Sur Windows, l’installateur peut demander ou installer WebView2 si le runtime manque. Ces échanges appartiennent aux outils de construction, à Microsoft ou aux agents, pas à une télémétrie CTRL KANB.

## Fichiers, terminal et agents

Le navigateur de fichiers refuse les chemins qui sortent du projet. Le terminal démarre dans ce dossier mais reste un shell complet : il peut accéder à tout ce que le compte système peut lire ou modifier.

Les tâches suivent le mode d’accès, le bac à sable et les autorisations du moteur choisi. En mode sans modification, CTRL KANB limite Claude Code CLI aux outils Read, Glob et Grep, ignore les autorisations personnelles ou propres au projet, puis refuse leurs demandes de chemin qui sortent du projet. Claude Code CLI peut néanmoins charger ses fichiers d’instructions `CLAUDE.md` et leurs imports selon le fonctionnement de la CLI.

Ajouter un fichier au chat transmet son contenu ou sa référence à l’agent lors de l’envoi. Supprimer un projet de CTRL KANB ne supprime jamais son dossier. Supprimer une conversation ou une carte retire sa référence locale ; cela ne garantit pas l’effacement des données déjà conservées par la CLI ou son fournisseur.

## Notifications et journaux

Les notifications internes et système sont configurables par catégorie et par tâche. Quand le verrou est actif, le titre de la tâche est masqué dans les notifications système.

Les journaux locaux servent au diagnostic du démarrage, du planificateur et des exécutions. Ils ne sont pas envoyés automatiquement. Examinez-les et anonymisez-les avant tout partage.

## Publication et contributions

Le dépôt ne doit contenir aucun tableau réel, journal, export, capture utilisateur, configuration d’agent, secret ou chemin personnel. Les captures officielles sont générées avec des données fictives. Le contrôle `npm run test:privacy` recherche les chemins absolus, emails, secrets courants, métadonnées PNG et artefacts locaux dans l’ensemble des fichiers suivis par Git.
