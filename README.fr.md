# CTRL KANB

[English](README.md) · **Français**

![CTRL KANB — poste de pilotage visuel du travail confié aux agents](docs/assets/ctrl-kanb-banner.png)

**Le poste de pilotage local pour organiser, planifier et suivre le travail confié à Codex et Claude sur macOS et Windows.**

> **Statut — version 6.11.3 candidate.** Le code source fonctionne sur macOS et Windows et les principaux parcours sont couverts par des contrôles automatisés et des essais réels. Consultez [la compatibilité et les validations](docs/COMPATIBILITY.md) avant toute utilisation importante.

## Pourquoi CTRL KANB existe

Codex et Claude savent accomplir des tâches complexes. Dès que plusieurs projets, conversations, validations et routines s’accumulent, leurs files d’attente ne suffisent plus à donner une vue claire du travail en cours.

CTRL KANB est une proposition parmi les outils qui existent déjà. Hermes et d’autres projets montrent plusieurs façons d’organiser le travail avec des agents. **Charles VbT**, utilisateur régulier de Codex et Claude sans être développeur de métier, cherchait une approche simple et locale qui réunisse précisément les critères utiles à son quotidien : projets, conversations, tâches programmées et routines. Ne trouvant pas cette combinaison sous la forme qui lui convenait, il a façonné CTRL KANB avec l’aide intensive de Codex et Claude, puis l’a consolidé par des contrôles d’interface, de fonctionnement et de sécurité.

L’application réunit :

- un Kanban pensé pour les tâches confiées à des agents ;
- un agenda pour les lancements programmés, les échéances et les routines ;
- une vue Flux pour les priorités, exécutions et décisions ;
- un suivi des résultats et des conversations ;
- un chat, un terminal et un navigateur de fichiers liés au projet courant ;
- une prise en charge séparée de Codex et Claude via leurs outils locaux ;
- un stockage local, sans compte ni serveur CTRL KANB.

L’architecture pourra accueillir d’autres moteurs si leurs permissions, diagnostics et garanties de stockage restent explicites.

## L’application en action

Toutes les captures sont générées depuis un jeu fictif. Elles ne contiennent ni compte, ni conversation, ni chemin provenant d’un utilisateur réel.

![Vue Flux de CTRL KANB avec des projets et tâches fictifs](docs/assets/ctrl-kanb-hero-fr.png)

| Tableau | Agenda |
|---|---|
| ![Tableau Classique avec des tâches fictives](docs/assets/ctrl-kanb-board-fr.png) | ![Agenda hebdomadaire avec des tâches fictives](docs/assets/ctrl-kanb-agenda-fr.png) |

![Chat latéral en thème sombre avec une conversation fictive](docs/assets/ctrl-kanb-chat-fr.png)

## Fonctions principales

- projets associés à des dossiers locaux, avec épinglage et affichage progressif ;
- deux tableaux fixes : **Classique** pour les tâches ponctuelles et **Routines** pour les tâches récurrentes ;
- création rapide, détails avancés, dépendances, priorités et catégories ;
- agenda Jour, Semaine et Mois avec fuseau, premier jour de semaine et format 12/24 heures ;
- tâches manuelles, lancements programmés et récurrences quotidiennes, hebdomadaires ou mensuelles ;
- aperçu des occurrences futures sans dupliquer les cartes exécutables ;
- files et limites de concurrence séparées pour Codex et Claude ;
- sérialisation des consignes visant une même conversation ;
- validations humaines pour les commandes, modifications de fichiers et questions des agents ;
- historique, archivage réversible, restauration et suppression avec confirmation ;
- synchronisation datée et indépendante des conversations Codex et Claude ;
- chat avec choix du modèle, pièces jointes et conversations distinctes ;
- terminal local complet : zsh sur macOS, PowerShell sur Windows ;
- navigateur de fichiers confiné au dossier du projet ;
- notifications par catégorie et par tâche ;
- thèmes clairs et sombres, palettes et taille de police ;
- export JSON et restauration avec copie préalable de l’état courant ;
- palette de commandes avec `⌘ K` sur macOS ou `Ctrl K` sur Windows ;
- planificateur d’arrière-plan facultatif, désactivé au premier lancement.

## Compatibilité

| Élément | État |
|---|---|
| macOS | macOS 14 ou plus récent ; testé sur Apple Silicon ; outils Apple requis pour compiler |
| Windows | Windows 11 x64 validé ; installateur NSIS et WebView2 |
| Codex | facultatif ; nécessaire uniquement aux fonctions Codex |
| Claude | facultatif ; nécessite Claude Code CLI installé et authentifié localement |
| Hors connexion | Kanban, Agenda et données locales restent accessibles ; les agents et leur synchronisation nécessitent leurs services |

CTRL KANB fonctionne avec Codex seul, Claude seul, les deux, ou sans agent pour l’organisation locale. La présence d’un exécutable, l’authentification du compte et la fraîcheur de la synchronisation sont trois états distincts.

Les versions testées et les limites observées sont consignées dans [COMPATIBILITY.md](docs/COMPATIBILITY.md).

## Télécharger CTRL KANB

- **Applications prêtes à installer** : la page [Releases](https://github.com/charlesvbtpro-ship-it/ctrl-kanb/releases/latest) regroupe les paquets macOS et Windows, les notes de version et le fichier `SHA256SUMS.txt` de chaque version publiée.
- **Sources d’une version** : chaque release GitHub propose automatiquement les archives `Source code (zip)` et `Source code (tar.gz)` correspondant à son tag.
- **Code courant** : le bouton **Code → Download ZIP** de GitHub ou [l’archive de `main`](https://github.com/charlesvbtpro-ship-it/ctrl-kanb/archive/refs/heads/main.zip) permet de télécharger le dépôt sans utiliser Git.

Tant qu’aucune release n’est publiée, l’installation se fait depuis les sources. Le dépôt reste privé pendant sa préparation ; ces liens deviendront accessibles aux visiteurs lors de son ouverture.

## Démarrage rapide

### Agents facultatifs

- [Codex CLI — documentation officielle](https://developers.openai.com/codex/cli)
- [Claude Code — installation officielle](https://docs.anthropic.com/en/docs/claude-code/getting-started)

CTRL KANB ne fournit aucun abonnement, quota ou identifiant pour ces services.

### macOS depuis les sources

```sh
git clone https://github.com/charlesvbtpro-ship-it/ctrl-kanb.git
cd ctrl-kanb
npm ci
./Scripts/install.sh
```

Pour installer dans le compte courant :

```sh
CTRL_KANB_INSTALL_DIR="$HOME/Applications" ./Scripts/install.sh
```

### Windows depuis les sources

Avec Git, Node.js, Rust MSVC, WebView2 et les outils C++ de Visual Studio :

```powershell
git clone https://github.com/charlesvbtpro-ship-it/ctrl-kanb.git
cd ctrl-kanb\Platforms\Windows
.\setup.ps1
.\build.ps1
```

L’installateur est créé sous `Platforms\Windows\src-tauri\target\release\bundle\nsis`.

Le guide détaillé couvre l’installation, les mises à jour et la suppression : [INSTALLATION.md](docs/INSTALLATION.md).

## Première configuration

1. Ajoutez un projet et choisissez son dossier.
2. Ouvrez **Réglages → Agents et modèles**.
3. Actualisez la détection, puis testez séparément Codex et/ou Claude.
4. Choisissez l’agent et les modèles proposés par défaut.
5. Créez une tâche dans **Classique** ou configurez une routine.

Les libellés ont un sens précis :

- **Disponible sur cet ordinateur** : l’exécutable a été trouvé ;
- **Connexion testée** : un aller-retour réel a réussi à la date affichée ;
- **Synchronisé** : les conversations liées ont été relues à la date affichée ;
- **Aucune session** : aucune conversation locale correspondante n’a été trouvée.

Un test de connexion ne garantit ni quota disponible, ni accès à tous les modèles. Une synchronisation ne teste pas l’authentification. Pour Claude, elle relit les sessions de Claude Code CLI sans envoyer de nouvelle consigne.

## Détection des agents

Au démarrage, CTRL KANB cherche séparément `codex` et `claude` dans les emplacements connus et le `PATH` transmis à l’application. Un lancement graphique peut recevoir un `PATH` différent de celui d’un terminal.

Pour une installation personnalisée, définissez un chemin absolu :

```text
CTRL_KANB_CODEX_PATH
CTRL_KANB_CLAUDE_PATH
```

Les anciens alias `CODEX_PATH` et `CLAUDE_PATH` restent reconnus. Les identifiants demeurent gérés par les outils officiels ; CTRL KANB ne copie ni jeton ni mot de passe dans son tableau.

L’exécution des tâches utilise les interfaces locales documentées par les fournisseurs : Codex App Server et le mode non interactif de Claude Code CLI. Lors de l’initialisation de Codex App Server, CTRL KANB s’identifie comme `ctrl-kanb`. L’application ne fournit pas l’accès à d’autres utilisateurs et ne revend pas de compte fournisseur. La synchronisation Claude relit seulement les sessions déjà présentes dans le profil local de l’utilisateur ; elle ne s’authentifie pas et n’envoie aucune consigne.

## Données et permissions

```text
macOS   ~/Library/Application Support/CTRL KANB/
Windows %LOCALAPPDATA%\CTRL KANB Data\
```

Ces données peuvent contenir consignes, réponses, chemins, identifiants de conversation et journaux. Un export JSON contient ces mêmes données et doit rester privé.

Le navigateur de fichiers reste dans le projet. Le terminal et les agents sont des processus locaux exécutés avec les droits du compte utilisateur et peuvent avoir un accès plus large selon leurs permissions. Le verrou protège la fenêtre ; il ne chiffre pas `board.json`.

Consultez [PRIVACY.md](PRIVACY.md) et [SECURITY.md](SECURITY.md).

## Documentation

| Document | Contenu |
|---|---|
| [Guide utilisateur](docs/USER-GUIDE.md) | projets, tâches, Agenda, routines, conversations et réglages |
| [Installation](docs/INSTALLATION.md) | prérequis, compilation, mise à jour et suppression |
| [Compatibilité](docs/COMPATIBILITY.md) | systèmes testés et limites observées |
| [Dépannage](docs/TROUBLESHOOTING.md) | agents, modèles, synchronisation, Agenda et terminal |
| [Architecture](docs/ARCHITECTURE.md) | hôtes, stockage, files, permissions et planificateur |
| [Modèle de données](docs/DATA-MODEL.md) | schéma persistant et migrations |
| [Version Windows](docs/WINDOWS-PORT.md) | implémentation et validation Tauri |
| [Publication](docs/RELEASE-CHECKLIST.md) | contrôles avant une release |
| [Historique](CHANGELOG.md) | changements visibles par version |
| [Assistance](SUPPORT.md) | rapports de bugs et demandes d’évolution |

## Développement

```sh
npm ci
npm test
npm run build
```

Sous Windows :

```powershell
npm ci
npm run test:static
npm run test:ui
npm ci --prefix Platforms/Windows
cargo fmt --manifest-path Platforms/Windows/src-tauri/Cargo.toml --check
cargo clippy --manifest-path Platforms/Windows/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path Platforms/Windows/src-tauri/Cargo.toml
npm --prefix Platforms/Windows run build
```

Consultez [CONTRIBUTING.md](CONTRIBUTING.md) avant une modification.

## Limites connues

- l’ordinateur doit être allumé et la session ouverte pour une tâche programmée ;
- une validation active ne survit pas à l’arrêt du processus d’agent ;
- le terminal intégré est un shell complet, pas un bac à sable ;
- modèles, quotas et services dépendent du fournisseur ;
- WSL n’est pas pris en charge ;
- les essais prolongés veille/réveil et plusieurs échelles Windows restent à compléter.

## Indépendance et licence

CTRL KANB est indépendant et n’est ni affilié, ni validé, ni parrainé par OpenAI ou Anthropic. Les noms « Codex », « Claude » et « Claude Code CLI » servent uniquement à décrire la compatibilité et l’agent local choisi par l’utilisateur. CTRL KANB n’embarque aucun logo OpenAI ou Anthropic ; les icônes d’agents sont des symboles d’interface originaux et neutres. Voir [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

CTRL KANB est imaginé et piloté par **Charles VbT**. Son code original et sa documentation sont distribués sous [Apache License 2.0](LICENSE). Les conditions d’attribution figurent dans [NOTICE](NOTICE).
