# Hôte Windows

Ce dossier contient l’hôte Tauri 2 de CTRL KANB. Il charge l’interface partagée depuis [`Shared/Web`](../../Shared/Web) et conserve les données utilisateur dans `%LOCALAPPDATA%\CTRL KANB Data`, séparément du programme.

## Installer CTRL KANB (utilisateur)

Depuis une release GitHub, téléchargez `CTRL KANB_<version>_x64-setup.exe` et ouvrez-le par double-clic. L’installateur NSIS place le programme dans votre profil utilisateur et ajoute le raccourci du menu Démarrer. Aucun terminal ne doit rester ouvert pour que CTRL KANB fonctionne : l’exécutable Windows est construit comme une application graphique et lance ses agents et son terminal intégré en arrière-plan.

WebView2 est pris en charge par l’installateur. Codex et Claude restent facultatifs. Les fonctions Claude nécessitent Claude Code CLI installé et connecté localement ; installez uniquement l’agent que vous souhaitez utiliser. Vérifiez l’empreinte SHA-256 publiée avec la release avant l’installation.

## Préparer la machine de développement

Dans PowerShell :

```powershell
.\setup.ps1
```

Si Rust manque :

```powershell
.\setup.ps1 -InstallMissing
```

La construction demande Git, Node.js, Rust 1.88 ou plus récent avec la chaîne MSVC, WebView2 et les outils **Développement Desktop en C++** de Visual Studio. Aucun de ces outils n’est requis par l’utilisateur d’un installateur déjà construit, à l’exception du runtime WebView2 pris en charge par l’installateur.

## Développer et construire

```powershell
npm run check
npm run dev
.\build.ps1
```

`npm run dev` est un lancement de développement : la fenêtre PowerShell qui exécute la commande reste attachée tant que le serveur de développement fonctionne. Elle n’est pas nécessaire avec l’installateur NSIS et ne doit pas être utilisée comme raccourci de lancement quotidien.

L’installateur NSIS est produit sous `src-tauri\target\release\bundle\nsis`.

## Vérifier le paquet installé

```powershell
.\validate-installed.ps1 -Installer "src-tauri\target\release\bundle\nsis\CTRL KANB_6.11.3_x64-setup.exe"
```

Le script vérifie l’installation, le lancement dans la session interactive, le verrou d’instance unique, la séparation des données et l’empreinte du programme. L’état détaillé des essais réels et les limites techniques sont consignés dans [`docs/WINDOWS-PORT.md`](../../docs/WINDOWS-PORT.md).
