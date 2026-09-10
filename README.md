# CTRL KANB

![Aperçu de CTRL KANB](docs/assets/ctrl-kanb-hero.png)

**Le poste de pilotage macOS pour organiser, planifier et suivre le travail confié à Codex et Claude Code.**

## Pourquoi CTRL KANB existe

Codex et Claude Code savent accomplir des tâches complexes. Dès que plusieurs projets, conversations, validations et routines s’accumulent, il devient cependant difficile de garder une vision claire du travail en cours.

CTRL KANB est né de ce problème.

Je suis un utilisateur régulier de Codex et de Claude Code, sans être développeur de métier. Les files d’attente existantes ne suffisaient pas à organiser mon travail, et je n’ai trouvé aucune application Kanban qui réunissait les fonctions dont j’avais besoin.

J’ai donc demandé à Codex de m’aider à construire l’application que je cherchais.

Le projet a commencé avec un Kanban capable de suivre les tâches confiées à un agent. Il s’est progressivement enrichi d’un agenda, de tâches programmées, de routines, d’un suivi des conversations, de validations humaines, puis de la prise en charge de Claude Code.

CTRL KANB propose aujourd’hui un espace de travail local qui réunit :

- un Kanban pensé pour le travail avec des agents ;
- un agenda pour planifier les tâches et les routines ;
- une vue claire des exécutions, résultats et décisions en attente ;
- un chat, un terminal et un navigateur de fichiers intégrés ;
- une prise en charge distincte de Codex et Claude Code ;
- des données conservées localement sur le Mac.

L’objectif est de construire la couche d’organisation qui manque encore entre l’utilisateur et ses agents. L’architecture pourra ensuite accueillir d’autres moteurs et outils, sans enfermer l’utilisateur dans un seul fournisseur.

CTRL KANB est aussi un projet réalisé avec l’aide intensive de l’IA. Son code est public, ses principaux comportements sont testés et sa documentation décrit clairement son fonctionnement et ses limites.

La version actuelle constitue la première étape publique du projet. Elle fonctionne sans serveur CTRL KANB ni compte propre à l’application.

## Fonctions principales

- plusieurs projets associés à des dossiers du Mac ;
- deux tableaux protégés : **Classique** pour les tâches ponctuelles et **Routines** pour les tâches récurrentes ;
- vue **Flux** pour les priorités, les tâches prêtes, les exécutions et les décisions en attente ;
- agenda Jour, Semaine et Mois avec fuseau horaire, premier jour de semaine et format 12/24 heures configurables ;
- aperçu des occurrences futures quotidiennes, hebdomadaires ou mensuelles dans l’agenda, sans dupliquer les cartes dans le Kanban ;
- historique, archivage réversible, restauration et suppression avec confirmation ;
- suivi des réponses et poursuite d’une conversation existante ;
- centre de validations pour les commandes, modifications de fichiers et questions des agents ;
- chat latéral Codex ou Claude Code avec choix du modèle, pièces jointes et conversations séparées ;
- navigateur de fichiers limité au dossier sélectionné ;
- terminal zsh démarrant dans ce dossier, avec les droits complets du compte macOS ;
- synchronisation explicite des conversations Codex et Claude Code ;
- comptes séparés par agent, sans copie des identifiants dans le tableau ;
- thèmes clairs et sombres, palettes de couleurs et taille de police réglable ;
- premier lancement guidé, sans projet ni tâche d’exemple imposés ;
- export JSON et restauration avec copie de sécurité automatique ;
- raccourcis macOS, palette de commandes avec `⌘ K` et panneaux redimensionnables ;
- planificateur macOS facultatif, livré désactivé.

## Prérequis

- macOS 14 Sonoma ou une version plus récente ;
- les outils de développement Apple en ligne de commande ;
- Codex et/ou Claude Code installés et connectés si vous souhaitez exécuter des tâches avec ces agents.

Installez les outils Apple si nécessaire :

```sh
xcode-select --install
```

Node.js 20 ou plus récent et Python 3 sont utiles pour le développement et les tests. Ils ne sont pas nécessaires pour utiliser une application déjà compilée.

## Codex, Claude Code ou les deux

Les deux agents sont indépendants. CTRL KANB fonctionne avec **Codex seul**, **Claude Code seul** ou **les deux**. Sans agent installé, le Kanban et l’agenda restent utilisables pour organiser le travail, mais les lancements, le chat et la synchronisation correspondante restent indisponibles.

Au démarrage, l’application cherche séparément les commandes `codex` et `claude` :

- dans les applications officielles qui embarquent Codex ;
- dans les emplacements Homebrew et Unix habituels ;
- dans le `PATH` reçu par l’application ;
- dans les installations utilisateur et les gestionnaires courants : NVM, fnm, Volta, mise, asdf, Bun et pnpm.

**Disponible sur ce Mac** signifie seulement que la commande a été trouvée. **Connexion testée** signifie qu’un aller-retour réel a réussi avec le compte sélectionné. Ces deux états sont affichés séparément dans **Réglages → Agents et modèles**. Le bouton **Actualiser la détection** relance la recherche après une installation.

Pour une installation personnalisée, les variables `CTRL_KANB_CODEX_PATH` et `CTRL_KANB_CLAUDE_PATH` peuvent désigner les exécutables avec des chemins absolus. CTRL KANB utilise ensuite les sessions et identifiants conservés par chaque outil ; il ne copie pas leurs clés dans ses données.

## Installation depuis les sources

```sh
git clone <url-du-depot> ctrl-kanb
cd ctrl-kanb
./Scripts/install.sh
```

Le script compile l’application, exécute les contrôles disponibles, puis l’installe dans `/Applications`. Pour choisir une autre destination :

```sh
CTRL_KANB_INSTALL_DIR="$HOME/Applications" ./Scripts/install.sh
```

Pour compiler sans installer :

```sh
./Scripts/package_app.sh
open "dist/CTRL KANB.app"
```

L’application produite localement utilise une signature ad hoc. Une distribution binaire publique devra être signée avec un certificat Developer ID et notariée pour éviter les avertissements Gatekeeper.

## Première configuration

1. Ajoutez un projet et choisissez son dossier.
2. Ouvrez **Réglages → Agents et modèles**, puis **Comptes** si vous utilisez plusieurs connexions.
3. Vérifiez la disponibilité et la connexion de Codex et/ou Claude Code.
4. Choisissez l’agent utilisé par défaut et le niveau d’effort souhaité.
5. Créez une tâche dans **Classique** ou configurez une tâche dans **Routines**.

Un état **Connexion testée** signifie qu’un aller-retour réel a réussi à la date affichée. La synchronisation des conversations possède un état séparé pour Codex et Claude Code.

Dans **Routines**, seule la prochaine occurrence est une carte exécutable. L’agenda affiche aussi les répétitions futures en pointillé, semaine après semaine. Valider le passage courant crée la prochaine carte réelle ; modifier la routine met à jour les aperçus suivants.

## Données et confidentialité

Les données de CTRL KANB restent dans :

```text
~/Library/Application Support/CTRL KANB/
```

Le dépôt ne contient pas ce dossier. Les identifiants Codex et Claude Code restent dans les dossiers gérés par leurs outils respectifs. CTRL KANB ne contient aucun service de télémétrie et ne stocke pas de clé d’API dans son tableau.

Dans **Réglages → Données**, vous pouvez exporter l’organisation complète dans un fichier JSON. Une restauration remplace les données visibles après confirmation et conserve automatiquement une copie privée de l’état précédent. L’export contient les briefs, résultats, historiques et chemins configurés dans l’application ; il ne contient ni les fichiers des projets ni les secrets de connexion gérés par les agents.

Une consigne envoyée à Codex ou Claude Code suit ensuite les règles de confidentialité du service choisi. Consultez [PRIVACY.md](PRIVACY.md) pour le détail des données locales, des échanges externes et des journaux.

## Développement

```sh
npm ci
npm test
npm run build
```

Les contrôles couvrent l’interface, les traductions, le câblage des actions, les injections HTML, les conversations, la synchronisation, les ponts natifs, les notifications et les données publiables.

Structure du dépôt :

```text
Resources/  Interface, icônes et ressources de marque
Scripts/    Construction, installation et contrôles
Sources/    Application macOS, helper et CLI
Tests/      Doubles de test et scénarios natifs
docs/       Architecture, modèle de données et revue UI
```

Documentation technique :

- [Architecture](docs/ARCHITECTURE.md)
- [Modèle de données](docs/DATA-MODEL.md)
- [Moteur macOS facultatif](docs/BACKGROUND-ENGINE.md)
- [Revue de l’interface](docs/UI-REVIEW.md)
- [Contrôles avant publication](docs/RELEASE-CHECKLIST.md)
- [Politique de sécurité](SECURITY.md)

## Limites connues

- le Mac doit être allumé pour lancer une tâche programmée ;
- les demandes de validation en cours ne survivent pas à l’arrêt du processus d’agent ;
- la signature ad hoc convient à une compilation locale, pas à une distribution binaire fluide ;
- les logos Codex et Claude Code restent la propriété de leurs détenteurs respectifs.

## Licence

Aucune licence open source n’est incluse pour le moment. Ajoutez une licence avant d’annoncer le projet comme logiciel libre ou d’accepter des contributions externes.
