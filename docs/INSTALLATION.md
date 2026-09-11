# Installer CTRL KANB

CTRL KANB fonctionne sans compte propre. Codex et Claude sont facultatifs. Les fonctions Codex nécessitent Codex CLI ; les fonctions Claude nécessitent Claude Code CLI. Installez seulement l’agent que vous souhaitez utiliser. Le Kanban, l’Agenda et les données locales restent utilisables sans eux.

## Télécharger ou construire

La page [Releases](https://github.com/charlesvbtpro-ship-it/ctrl-kanb/releases/latest) fournit les applications macOS et Windows, les notes de version et `SHA256SUMS.txt` pour chaque version disponible. GitHub ajoute aussi les archives du code source correspondant au tag. Pour une révision sans paquet, utilisez les instructions de construction ci-dessous.

## Installer un agent

Suivez la documentation de l’éditeur, puis connectez l’outil dans un terminal :

- [Codex CLI — documentation officielle](https://developers.openai.com/codex/cli)
- [Claude Code — démarrage officiel](https://docs.anthropic.com/en/docs/claude-code/getting-started)

CTRL KANB ne fournit ni abonnement, ni quota, ni identifiant pour ces services. Il utilise la session déjà gérée par chaque CLI.

## macOS

### Prérequis

- macOS 14 ou plus récent ;
- Git ;
- outils Apple en ligne de commande, installables avec `xcode-select --install` ;
- Node.js 20 ou plus récent et Python 3 pour exécuter toute la suite de contrôles.

La version actuellement validée l’a été sur Apple Silicon. Les Mac Intel ne font pas encore partie de la matrice testée.

### Construire et installer

```sh
git clone https://github.com/charlesvbtpro-ship-it/ctrl-kanb.git
cd ctrl-kanb
npm ci
npm run install:macos
```

`npm ci` installe les dépendances de test verrouillées. Le script exécute ensuite les contrôles installés, compile l’application et la copie dans `/Applications`.

Pour une installation réservée au compte courant :

```sh
CTRL_KANB_INSTALL_DIR="$HOME/Applications" npm run install:macos
```

Pour produire uniquement le paquet local :

```sh
npm ci
npm test
npm run build
```

Le résultat se trouve dans `dist/CTRL KANB.app`.

## Windows

### Prérequis de construction

- Windows 11 x64 ;
- Git et Node.js 20 ou plus récent ;
- Rust 1.88 ou plus récent avec la chaîne `stable-x86_64-pc-windows-msvc` ;
- Microsoft Visual Studio Build Tools avec **Desktop development with C++** ;
- Microsoft Edge WebView2 Runtime.

### Construire l’installateur

Dans PowerShell :

```powershell
git clone https://github.com/charlesvbtpro-ship-it/ctrl-kanb.git
cd ctrl-kanb\Platforms\Windows
.\setup.ps1
.\build.ps1
```

L’installateur NSIS est créé sous :

```text
Platforms\Windows\src-tauri\target\release\bundle\nsis\
```

Le script PowerShell sert uniquement à la construction. Après installation, CTRL KANB se lance depuis le menu Démarrer sans console PowerShell, Invite de commandes ou Windows Terminal persistante.

## Première ouverture

1. Ajoutez un projet et choisissez son dossier local.
2. Ouvrez **Réglages → Agents et modèles**.
3. Actualisez la détection.
4. Testez séparément la connexion de Codex et/ou Claude.
5. Créez une première tâche manuelle avant d’activer le planificateur d’arrière-plan.

Un exécutable détecté n’implique pas que son compte soit connecté. Un test réussi n’implique pas qu’un quota ou chaque modèle soit disponible.

## Mettre à jour

Avant une mise à jour, exportez le tableau depuis les réglages et conservez le fichier dans un emplacement privé.

Depuis une copie Git :

```sh
git pull --ff-only
npm run install:macos
```

Sous Windows, récupérez la nouvelle version puis reconstruisez et réexécutez l’installateur. Les données sont séparées du programme et sont conservées pendant la mise à jour.

## Désinstaller et effacer les données

La désinstallation conserve volontairement les données utilisateur :

```text
macOS   ~/Library/Application Support/CTRL KANB/
Windows %LOCALAPPDATA%\CTRL KANB Data\
```

Pour une suppression complète, quittez CTRL KANB, vérifiez ou exportez ce que vous voulez conserver, puis supprimez vous-même le dossier correspondant. Cette opération efface le tableau, les réglages, les conversations référencées par l’application et les journaux locaux de CTRL KANB. Elle ne supprime ni les dossiers de projets, ni les comptes gérés par Codex CLI ou Claude Code CLI.

Consultez [le guide de dépannage](TROUBLESHOOTING.md) si un agent, un modèle ou le planificateur n’apparaît pas comme prévu.
