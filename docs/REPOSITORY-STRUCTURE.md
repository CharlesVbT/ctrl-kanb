# Organisation du dépôt

CTRL KANB partage une seule interface entre deux applications natives. La structure du dépôt reflète cette séparation : le comportement visuel commun reste dans `Shared`, tandis que chaque système possède son propre hôte dans `Platforms`.

```text
ctrl-kanb/
├── Shared/
│   └── Web/                 Interface et logique métier communes
├── Platforms/
│   ├── macOS/               Application AppKit/WebKit, helper, CLI et ressources Apple
│   └── Windows/             Application Tauri/Rust, ressources Windows et scripts PowerShell
├── Tests/
│   ├── Web/                 Parcours et règles de l’interface commune
│   ├── Windows/             Contrat du pont et comportement Windows
│   └── Privacy/             Absence de données privées dans les fichiers publiés
├── Tools/                   Génération des captures de documentation
├── docs/                    Guides utilisateur, architecture et publication
└── package.json             Commandes communes de construction et de contrôle
```

## Code partagé

`Shared/Web` contient l’interface HTML, CSS et JavaScript chargée par les deux applications. `platform.js` expose un contrat commun et transmet chaque action à WebKit sur macOS ou à Tauri sur Windows. Cette zone ne contient aucun code natif propre à un système.

## macOS

`Platforms/macOS` rassemble tout ce qui sert uniquement à macOS :

- `Sources/App` pour l’hôte AppKit/WebKit et le pont natif ;
- `Sources/CLI` pour la commande locale d’automatisation ;
- `Sources/Helper` pour le moteur facultatif lancé par `launchd` ;
- `Resources` pour `Info.plist` et l’icône Apple ;
- `Tests` pour les scénarios natifs et leurs faux exécutables ;
- `build.sh` et `install.sh` pour construire et installer l’application.

## Windows

`Platforms/Windows` est le pendant direct du dossier macOS :

- `src-tauri` contient l’hôte Rust, le pont natif, ConPTY et la configuration NSIS ;
- `icons` et les ressources Tauri servent au paquet Windows ;
- les scripts PowerShell préparent, construisent et valident l’installation réelle.

## Tests et outils

Les tests propres à macOS restent auprès de l’hôte macOS. Les contrôles qui s’appliquent au code partagé, au contrat Windows ou à la confidentialité publique sont regroupés dans `Tests`. `Tools` contient uniquement des utilitaires de maintenance ; il ne fait pas partie du programme installé.

Les commandes à retenir depuis la racine sont :

```sh
npm test
npm run build
npm run install:macos
npm run docs:screenshots
```

La construction Windows se lance depuis `Platforms/Windows`, comme indiqué dans [INSTALLATION.md](INSTALLATION.md).
