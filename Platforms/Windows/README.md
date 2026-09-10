# Hôte Windows

Ce dossier contient l’hôte Tauri 2 de CTRL KANB. Il charge l’interface partagée depuis `Resources/` et conserve les données utilisateur dans `%LOCALAPPDATA%\CTRL KANB Data`, séparément du programme.

## Préparer la machine de développement

Dans PowerShell :

```powershell
.\setup.ps1
```

Si Rust manque :

```powershell
.\setup.ps1 -InstallMissing
```

La construction demande Git, Node.js, Rust MSVC, WebView2 et les outils **Développement Desktop en C++** de Visual Studio. Aucun de ces outils n’est requis par l’utilisateur d’un installateur déjà construit, à l’exception du runtime WebView2 pris en charge par l’installateur.

## Développer et construire

```powershell
npm run check
npm run dev
.\build.ps1
```

L’installateur NSIS est produit sous `src-tauri\target\release\bundle\nsis`.

## Vérifier le paquet installé

```powershell
.\validate-installed.ps1 -Installer "src-tauri\target\release\bundle\nsis\CTRL KANB_6.11.0_x64-setup.exe"
```

Le script vérifie l’installation, le lancement dans la session interactive, le verrou d’instance unique, la séparation des données et l’empreinte du programme. L’état détaillé des essais réels et les limites de publication sont consignés dans [`docs/WINDOWS-PORT.md`](../../docs/WINDOWS-PORT.md).
