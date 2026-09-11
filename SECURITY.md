# Sécurité

## Versions prises en charge

Les correctifs sont appliqués à la branche `main` et à la version distribuée la plus récente. Les versions précédentes peuvent servir à reproduire un problème, mais ne bénéficient pas d’un calendrier de maintenance rétroactive.

## Signaler une vulnérabilité

Utilisez le [signalement privé GitHub](https://github.com/charlesvbtpro-ship-it/ctrl-kanb/security/advisories/new). N’ouvrez pas d’issue publique pour une vulnérabilité exploitable.

Le rapport doit contenir :

- la version et la plateforme ;
- les préconditions ;
- les étapes minimales de reproduction ;
- l’impact concret ;
- une preuve utilisant uniquement des projets, chemins et contenus fictifs.

Ne transmettez jamais de jeton, clé, donnée de compte, export, conversation, chemin personnel ou journal réel. Le projet ne garantit aucun délai contractuel de réponse ou de correction.

## Périmètre

Les sujets couverts comprennent notamment :

- lecture ou écriture en dehors du dossier projet choisi par le navigateur de fichiers ;
- contournement du contrat fermé entre l’interface et l’hôte natif ;
- injection de contenu actif dans WebKit ou WebView2 ;
- exécution de commande non demandée ;
- exposition de jetons, données de compte, conversations ou chemins locaux ;
- contournement d’une validation humaine ou du verrou de l’application ;
- corruption ou remplacement non atomique du tableau ;
- lancement d’un exécutable d’agent différent de celui détecté ou configuré.

Les failles propres à Codex CLI, Claude Code CLI, WebKit, WebView2, Tauri ou au système d’exploitation doivent aussi être signalées au projet ou fournisseur concerné.

## Frontières de confiance

CTRL KANB est une application locale, mais les processus qu’elle lance ne sont pas tous confinés au même périmètre :

- le navigateur de fichiers reste dans le dossier projet contrôlé ;
- le terminal intégré démarre dans le projet et reste un shell complet avec les droits du compte utilisateur ;
- Codex CLI et Claude Code CLI appliquent leurs propres bacs à sable, permissions, instructions et politiques de compte ;
- les fichiers d’instructions tels que `AGENTS.md` ou `CLAUDE.md` peuvent modifier le comportement de l’agent ;
- le verrou de l’interface ne chiffre pas les fichiers de données ;
- un export JSON doit être traité comme une donnée privée.

## Protections présentes

- données hors du dépôt et fichiers locaux créés avec des permissions limitées au compte ;
- verrou interprocessus, validation JSON, écriture atomique et copie `board.previous.json` ;
- normalisation et contrôle des chemins avant les opérations du navigateur ;
- contrôle des chemins demandés par Read, Glob et Grep de Claude Code CLI en mode sans modification ;
- messages affichés dans la WebView échappés ;
- actions natives accessibles par une liste fermée et arguments de processus structurés ;
- sérialisation des instructions visant une même conversation ;
- demandes d’autorisation liées à leur identifiant natif exact ;
- contrôle `npm run test:privacy` sur l’ensemble des fichiers suivis par Git.

## Dépendances

Les dépendances JavaScript et Rust sont verrouillées et surveillées par Dependabot. Une alerte est corrigée dès qu’une version compatible existe. Le `Cargo.lock` de l’hôte Windows peut aussi référencer des bibliothèques propres à d’autres cibles de Tauri : elles sont évaluées selon la plateforme réellement compilée et le contenu du paquet distribué.
