# Confidentialité

CTRL KANB est une application locale. La version distribuable actuelle cible macOS et une préversion Windows est en préparation. Ce document décrit les données qu’elle conserve et les situations dans lesquelles un contenu quitte l’ordinateur.

## Données enregistrées localement

L’application stocke son tableau, ses réglages, ses états de synchronisation, ses journaux de diagnostic et les informations nécessaires au planificateur dans :

```text
~/Library/Application Support/CTRL KANB/
```

La préversion Windows utilise :

```text
%LOCALAPPDATA%\CTRL KANB Data\
```

Ces fichiers peuvent contenir des titres de tâches, des consignes, des réponses, des chemins de dossiers, des identifiants de conversation et des préférences. Le dossier et ses fichiers sont limités au compte de l’utilisateur du système.

La sauvegarde courante `board.previous.json`, les copies créées avant restauration `board.before-import-*.json` et le journal `events.jsonl` restent dans ce même dossier. La suppression de l’application ne supprime pas automatiquement ces données.

Un export JSON contient l’organisation complète, y compris les textes, historiques et chemins de projets ou de comptes configurés. Il ne copie pas le contenu des dossiers de projets ni les secrets de connexion gérés par Codex et Claude Code. Traitez donc tout export comme une donnée privée.

## Comptes Codex et Claude Code

CTRL KANB ne copie pas les jetons de connexion dans son tableau. Les identifiants restent gérés par Codex et Claude Code dans leurs dossiers de configuration. L’application conserve uniquement le compte sélectionné, le dossier de configuration associé et le résultat daté du dernier test.

## Échanges avec des services externes

CTRL KANB n’exploite aucun serveur intermédiaire et n’ajoute pas de télémétrie. Quand une tâche ou un message est envoyé à Codex ou Claude Code, le contenu est transmis par l’outil officiel installé sur le Mac. Le fournisseur concerné peut alors traiter la consigne, les pièces jointes et le contexte autorisé selon ses propres conditions et réglages.

Une actualisation Codex interroge les conversations associées. Une actualisation Claude Code relit les journaux de sessions présents sur le Mac et n’envoie pas de nouvelle consigne.

## Accès aux fichiers

L’utilisateur choisit le dossier d’un projet. Le navigateur de fichiers refuse les chemins qui en sortent. Le terminal démarre dans ce dossier mais reste un shell zsh complet : il peut accéder à tout ce que le compte macOS peut lire ou modifier. Les tâches suivent le mode d’accès, le bac à sable et les autorisations du moteur choisi. En mode sans modification, CTRL KANB limite Claude Code aux outils Read, Glob et Grep, ignore les autorisations personnelles ou propres au projet, puis refuse leurs demandes de chemin qui sortent du projet. Claude Code peut néanmoins charger au démarrage ses fichiers d’instructions CLAUDE.md selon son fonctionnement officiel, y compris leurs imports déjà configurés. Ajouter un fichier au chat transmet son contenu ou sa référence à l’agent choisi lors de l’envoi.

Supprimer un projet de CTRL KANB ne supprime jamais son dossier dans le Finder. Supprimer une carte retire ses données du tableau après confirmation.

## Notifications et journaux

Les notifications macOS sont configurables par catégorie et par tâche. Quand le verrou de l’application est actif, le titre de la tâche est masqué dans les notifications.

Les journaux locaux servent au diagnostic du démarrage, du planificateur et des exécutions. Ils ne sont pas envoyés automatiquement.

## Publication et contributions

N’ajoutez jamais au dépôt un tableau réel, un journal, une capture contenant des données, un fichier de configuration d’agent, un jeton, un chemin personnel ou un export de conversation. Exécutez `npm run test:privacy` avant toute publication.
