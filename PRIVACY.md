# Confidentialité

CTRL KANB est une application macOS locale. Ce document décrit les données qu’elle conserve et les situations dans lesquelles un contenu quitte le Mac.

## Données enregistrées localement

L’application stocke son tableau, ses réglages, ses états de synchronisation, ses journaux de diagnostic et les informations nécessaires au planificateur dans :

```text
~/Library/Application Support/CTRL KANB/
```

Ces fichiers peuvent contenir des titres de tâches, des consignes, des réponses, des chemins de dossiers, des identifiants de conversation et des préférences. Le dossier et ses fichiers sont limités au compte macOS de l’utilisateur.

Les sauvegardes `board.previous.json` et le journal `events.jsonl` restent dans ce même dossier. La suppression de l’application ne supprime pas automatiquement ces données.

## Comptes Codex et Claude Code

CTRL KANB ne copie pas les jetons de connexion dans son tableau. Les identifiants restent gérés par Codex et Claude Code dans leurs dossiers de configuration. L’application conserve uniquement le compte sélectionné, le dossier de configuration associé et le résultat daté du dernier test.

## Échanges avec des services externes

CTRL KANB n’exploite aucun serveur intermédiaire et n’ajoute pas de télémétrie. Quand une tâche ou un message est envoyé à Codex ou Claude Code, le contenu est transmis par l’outil officiel installé sur le Mac. Le fournisseur concerné peut alors traiter la consigne, les pièces jointes et le contexte autorisé selon ses propres conditions et réglages.

Une actualisation Codex interroge les conversations associées. Une actualisation Claude Code relit les journaux de sessions présents sur le Mac et n’envoie pas de nouvelle consigne.

## Accès aux fichiers

L’utilisateur choisit le dossier d’un projet. Le navigateur, le terminal et les tâches travaillent dans ce périmètre. Ajouter un fichier au chat transmet son contenu ou sa référence à l’agent choisi lors de l’envoi.

Supprimer un projet de CTRL KANB ne supprime jamais son dossier dans le Finder. Supprimer une carte retire ses données du tableau après confirmation.

## Notifications et journaux

Les notifications macOS sont configurables par catégorie et par tâche. Quand le verrou de l’application est actif, le titre de la tâche est masqué dans les notifications.

Les journaux locaux servent au diagnostic du démarrage, du planificateur et des exécutions. Ils ne sont pas envoyés automatiquement.

## Publication et contributions

N’ajoutez jamais au dépôt un tableau réel, un journal, une capture contenant des données, un fichier de configuration d’agent, un jeton, un chemin personnel ou un export de conversation. Exécutez `npm run test:privacy` avant toute publication.
