# Hôte macOS

Ce dossier contient l’application native macOS de CTRL KANB. Elle charge l’interface commune depuis [`Shared/Web`](../../Shared/Web) et conserve les données utilisateur dans `~/Library/Application Support/CTRL KANB`, séparément du programme.

## Structure

- `Sources/App` : fenêtre AppKit, WebKit, pont natif et exécution des agents ;
- `Sources/CLI` : commande locale `ctrl-kanb` ;
- `Sources/Helper` : moteur facultatif utilisé avec `launchd` ;
- `Resources` : métadonnées et icône propres au paquet Apple ;
- `Tests` : scénarios natifs et faux exécutables de test ;
- `build.sh` : construction de `dist/CTRL KANB.app` ;
- `install.sh` : contrôles, construction et installation locale.

## Construire et installer

Depuis la racine du dépôt :

```sh
npm ci
npm test
npm run build
npm run install:macos
```

Les prérequis et les chemins d’installation sont détaillés dans [`docs/INSTALLATION.md`](../../docs/INSTALLATION.md).
