# Portage de CTRL KANB vers Windows

## Décision

La première version Windows conservera la même interface, le même modèle de données et les mêmes règles métier que l’application macOS. Elle utilisera un hôte natif **Tauri 2** construit en Rust autour de WebView2.

L’application Windows exécutera d’abord **Codex et Claude Code installés nativement dans Windows**. WSL restera une compatibilité facultative à étudier après la première version Windows. Ce choix évite de mélanger les chemins, les comptes et les historiques de deux systèmes lors du portage initial.

L’application macOS actuelle reste en Objective-C pendant le portage. Il n’est pas utile de réécrire une version stable avant que l’hôte Windows ait atteint la même couverture fonctionnelle.

## Pourquoi Tauri 2

CTRL KANB possède déjà une interface HTML, CSS et JavaScript sans framework. Tauri peut charger directement ces ressources dans WebView2 et limiter le code spécifique à Windows au pont natif.

Tauri apporte aussi les éléments nécessaires à une application locale distribuable :

- fenêtres et menus natifs ;
- commandes Rust explicitement autorisées ;
- accès aux boîtes de dialogue, au presse-papiers, aux notifications et au démarrage automatique ;
- génération d’un installateur NSIS `.exe` ou MSI ;
- utilisation de WebView2 déjà livré avec Windows 11.

Electron simplifierait certaines intégrations Node, mais ajouterait un moteur Chromium et un runtime Node complets à chaque installation. Les fonctions sensibles de CTRL KANB — processus agents, fichiers, terminal, verrouillage et planificateur — gagneront à rester dans un moteur Rust étroitement contrôlé.

## État vérifié de la machine Windows de test

Contrôle effectué le 10 septembre 2026 sur une machine Windows dédiée aux essais :

| Élément | État |
|---|---|
| Système | Windows 11 Professionnel, x64, build 26200 |
| WebView2 | installé, version 152.0.4191.66 |
| Git | installé, version 2.54.0 |
| Node.js | installé, version 22.22.3 |
| Codex | natif, `codex-cli 0.137.0` |
| Claude Code | natif, version 2.1.165 |
| Protocoles utilisés par CTRL KANB | `codex app-server --stdio` et flux JSON Claude disponibles |
| WSL | Ubuntu disponible |
| Rust / Cargo | à installer avant compilation |
| Outils C++ Visual Studio | à installer avant compilation |

Les versions ci-dessus décrivent seulement l’environnement de développement au jour du contrôle. CTRL KANB devra détecter les outils par capacité et par chemin, sans dépendre de ces numéros de version.

## Architecture cible

```text
Resources/                         Interface et logique partagées
Sources/App/                       Hôte macOS actuel
Platforms/Windows/src-tauri/       Hôte Windows Tauri/Rust
Platforms/Windows/tests/           Tests natifs Windows
Scripts/                           Contrôles partagés et scripts par plateforme
```

Le JavaScript envoie déjà toutes les demandes natives par une seule fonction `bridge`. Le point d’entrée accepte maintenant un adaptateur `window.ctrlKanbNative` avant de revenir au pont WebKit macOS. L’hôte Windows pourra donc fournir son adaptateur sans dupliquer `app.js`.

Le contrat du pont doit rester identique sur les deux systèmes : même nom d’action, même structure de données et mêmes fonctions de retour vers l’interface. Toute différence de comportement doit vivre dans l’adaptateur de plateforme.

## Ce qui est partagé

- vues Flux, Tableau, Agenda, Validations, Suivi, Historique et Réglages ;
- panneaux chat, terminal et fichiers ;
- thèmes, tailles de police, raccourcis applicatifs et traductions ;
- schéma du tableau et migrations ;
- logique des cartes, projets, routines, récurrences, files et synchronisations ;
- tests JavaScript, sécurité de rendu et contrôle de confidentialité.

## Ce qui doit être adapté à Windows

| Fonction | macOS actuel | Windows cible |
|---|---|---|
| Fenêtre et menus | AppKit | Tauri et menus Windows |
| WebView | WKWebView | WebView2 |
| Processus agents | `NSTask` | `tokio::process` avec arrêt de l’arbre de processus |
| Terminal intégré | pseudo-terminal macOS | ConPTY via `portable-pty`, rendu avec xterm.js |
| Fichiers | `NSOpenPanel` et `NSWorkspace` | dialogues Windows et API Shell |
| Notifications | UserNotifications | notifications toast Windows |
| Verrouillage | trousseau et authentification macOS | Windows Credential Manager et Windows Hello |
| Moteur en arrière-plan | `launchd` et helper | démarrage à la connexion, zone de notification et rattrapage au réveil |
| Données | `~/Library/Application Support/CTRL KANB` | `%LOCALAPPDATA%\CTRL KANB` |
| Protection des chemins | chemins réels et liens symboliques | chemins canoniques, jonctions et points de réanalyse |

Les tâches programmées resteront pilotées par le planificateur interne de CTRL KANB. Il n’est pas nécessaire de créer une tâche Windows distincte pour chaque carte. Quand le moteur facultatif est activé, l’application démarre avec la session et reste disponible dans la zone de notification.

## Détection des agents sous Windows

La détection doit être indépendante pour chaque agent et suivre cet ordre :

1. chemin absolu choisi dans les réglages ou défini par variable d’environnement ;
2. commande trouvée dans le `PATH` de l’application ;
3. emplacements officiels connus dans le profil utilisateur ;
4. installations WinGet et npm usuelles ;
5. diagnostic clair si plusieurs installations concurrentes sont trouvées.

Les chemins officiels déjà observés font partie des emplacements à tester :

- Codex : `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe` ;
- Claude Code : `%USERPROFILE%\.local\bin\claude.exe`.

La présence de l’exécutable et l’authentification restent deux états distincts. Le bouton de test doit lancer un vrai aller-retour, comme sur macOS. CTRL KANB ne copie jamais les jetons des agents.

Codex sera piloté par `codex app-server --stdio`. Claude Code conservera son protocole en flux JSON. Les files séparées, la limite de concurrence par agent et la mise en file d’une même conversation doivent produire le même résultat sur les deux systèmes.

## Compatibilité WSL ultérieure

Une option WSL demandera plus qu’un appel à `wsl.exe`. Elle devra choisir une distribution, convertir les chemins Windows/WSL, détecter les agents et leurs comptes dans cette distribution, puis conserver l’origine de chaque conversation. Elle ne sera ajoutée qu’avec des tests dédiés et une indication visible du moteur utilisé.

## Sécurité à conserver

- aucune clé d’API dans le tableau ;
- commandes natives exposées par liste fermée ;
- validation stricte de chaque message du pont ;
- écritures atomiques et sauvegarde précédente ;
- verrou interprocessus pour les écritures ;
- refus des sorties de dossier par `..`, jonction, lien symbolique ou point de réanalyse ;
- arrêt de tout l’arbre d’un processus agent ou terminal ;
- politique de contenu stricte dans WebView2 ;
- aucun accès Node direct depuis l’interface ;
- signature Authenticode des binaires publics et contrôle de confidentialité avant publication.

## Phases de réalisation

### 1. Socle Windows

- installer Rust MSVC et les outils C++ sur le Minisforum ;
- créer `Platforms/Windows/src-tauri` sans déplacer les ressources partagées ;
- afficher l’interface complète dans WebView2 ;
- mettre en place les menus, les raccourcis et les événements natifs ;
- produire un premier installateur local.

Critère de sortie : toutes les vues s’ouvrent en clair et en sombre, à 100 %, 125 %, 150 % et 200 % de mise à l’échelle.

### 2. Données et intégration Windows

- stockage, migration, sauvegarde et restauration ;
- projets, dialogues de fichiers et menu contextuel ;
- presse-papiers, notifications, verrouillage et ouverture dans l’Explorateur ;
- démarrage facultatif en arrière-plan et comportement de fermeture explicite.

Critère de sortie : le Kanban, l’Agenda, les routines et l’historique fonctionnent sans agent installé.

### 3. Codex et Claude Code

- détection et test de connexion ;
- exécution, arrêt, reprise, validations et questions ;
- synchronisation des conversations ;
- chat, pièces jointes, modèles et effort ;
- files indépendantes et concurrence réelle.

Critère de sortie : une tâche réelle avec chaque agent, deux tâches parallèles sur des conversations distinctes et deux instructions successives sur une même conversation passent sur la machine Windows de test.

### 4. Terminal et moteur planifié

- terminal ConPTY interactif ;
- arrêt fiable des processus enfants ;
- lancement à l’heure, récurrence, rattrapage après veille et reprise après redémarrage ;
- icône de zone de notification et état du moteur.

Critère de sortie : une tâche programmée et une routine hebdomadaire sont observées à l’heure réelle, puis après un cycle veille/réveil.

### 5. Publication

- batterie de tests Windows dans l’intégration continue ;
- audit de sécurité et de confidentialité sur l’artefact ;
- installation, mise à jour, désinstallation et conservation volontaire des données ;
- installateur x64 signé ;
- documentation Windows séparant installation de CTRL KANB et installation des agents.

## Points d’amélioration encore utiles avant publication générale

Le produit macOS est suffisamment complet pour figer les nouvelles fonctions pendant le portage. Les prochains efforts doivent viser :

- un accueil de premier lancement qui vérifie les agents, les notifications et le moteur local ;
- un export/import vérifié avec restauration guidée ;
- des essais longs couvrant veille, réveil, changement de fuseau, perte de réseau et mise à jour des CLI ;
- l’accessibilité au clavier, la lecture d’écran et le contraste ;
- une licence, une chaîne de publication reproductible et des binaires signés ;
- un mécanisme de mise à jour compréhensible et désactivable.

Ces chantiers renforcent la publication sans ajouter de nouvelles vues ni alourdir les cartes.

## Références techniques

- [Codex natif et bac à sable Windows](https://learn.chatgpt.com/docs/windows/windows-sandbox)
- [Codex avec WSL](https://learn.chatgpt.com/docs/windows/wsl)
- [Installation de Claude Code](https://code.claude.com/docs/en/getting-started)
- [Prérequis Windows de Tauri 2](https://v2.tauri.app/start/prerequisites/)
- [Installateurs Windows de Tauri 2](https://v2.tauri.app/distribute/windows-installer/)
- [Pseudoconsoles ConPTY](https://learn.microsoft.com/fr-fr/windows/console/pseudoconsoles)
