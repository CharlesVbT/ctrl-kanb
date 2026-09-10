# Hôte Windows

Ce dossier contient l’hôte Tauri 2 de CTRL KANB. Il charge l’interface partagée depuis `Resources/` et conserve les données utilisateur dans `%LOCALAPPDATA%\CTRL KANB Data`, séparément du programme.

## Installer CTRL KANB (utilisateur)

Depuis une release GitHub, téléchargez `CTRL KANB_<version>_x64-setup.exe` et ouvrez-le par double-clic. L’installateur NSIS place le programme dans votre profil utilisateur et ajoute le raccourci du menu Démarrer. Aucun terminal ne doit rester ouvert pour que CTRL KANB fonctionne : l’exécutable Windows est construit comme une application graphique et lance ses agents et son terminal intégré en arrière-plan.

WebView2 est pris en charge par l’installateur. Codex et Claude Code restent facultatifs : installez et connectez uniquement l’agent que vous souhaitez utiliser. Pour une release non signée, Windows peut afficher SmartScreen ; contrôlez l’empreinte SHA-256 fournie avec la release avant de poursuivre.

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
.\validate-installed.ps1 -Installer "src-tauri\target\release\bundle\nsis\CTRL KANB_6.11.1_x64-setup.exe"
```

Le script vérifie l’installation, le lancement dans la session interactive, le verrou d’instance unique, la séparation des données et l’empreinte du programme. L’état détaillé des essais réels et les limites de publication sont consignés dans [`docs/WINDOWS-PORT.md`](../../docs/WINDOWS-PORT.md).
