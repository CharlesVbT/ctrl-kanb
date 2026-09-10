# Hôte Windows

Ce dossier contient la préversion Tauri 2 de CTRL KANB. Elle charge directement l’interface partagée depuis `Resources/` et conserve ses données de développement dans `%LOCALAPPDATA%\CTRL KANB Data`, séparément du programme installé.

## Préparer la machine

Dans PowerShell, depuis ce dossier :

```powershell
.\setup.ps1
```

Si Rust manque :

```powershell
.\setup.ps1 -InstallMissing
```

Les outils **Développement Desktop en C++** de Visual Studio et WebView2 doivent aussi être présents. Le script vérifie leur présence mais ne modifie pas Visual Studio à la place de l’utilisateur. Node.js, npm, Rust et ces outils sont nécessaires pour construire l’application ; ils ne seront pas requis pour utiliser l’installateur final.

## Contrôler et ouvrir la préversion

```powershell
npm run check
npm run dev
```

## Construire l’installateur local

```powershell
.\build.ps1
```

L’installateur NSIS est produit sous `src-tauri\target\release\bundle\nsis`. Son cycle installation, lancement et désinstallation est contrôlé sur la machine Windows de test, y compris la conservation des données. Il reste une préversion non signée tant que les fonctions natives listées dans `docs/WINDOWS-PORT.md` ne sont pas toutes validées sur Windows.
