# Version Windows de CTRL KANB

## État actuel

CTRL KANB possède un hôte Windows Tauri 2 fonctionnel qui réutilise la même interface, le même schéma de données et les mêmes règles métier que la version macOS. Il exécute Codex et Claude Code installés nativement dans Windows. WSL n’est pas utilisé implicitement.

Le contrôle du 10 septembre 2026 a été réalisé sur Windows 11 Professionnel x64 avec WebView2, Codex CLI 0.154.0 et Claude Code 2.1.165. Codex a été actualisé depuis la version 0.137.0 avec sa commande officielle `codex update`. Un installateur NSIS a été construit, installé, lancé et désinstallé sur cette machine.

## Architecture

```text
Resources/                         Interface et logique partagées
Sources/App/                       Hôte macOS AppKit et WebKit
Platforms/Windows/src-tauri/       Hôte Windows Tauri, Rust et WebView2
Platforms/Windows/                 Scripts de préparation et de validation
Scripts/                           Contrôles partagés
```

`Resources/platform.js` dirige chaque demande du pont vers WebKit sur macOS ou vers Tauri sur Windows. L’interface n’accède directement ni à Node.js ni au système. L’hôte Windows accepte une liste fermée de 44 actions natives.

Les données sont conservées dans `%LOCALAPPDATA%\CTRL KANB Data`, séparément du programme installé. Les écritures sont verrouillées, validées, atomiques et précédées d’une sauvegarde de l’état antérieur.

## Fonctions validées sur Windows

| Parcours | Résultat observé |
|---|---|
| Installation NSIS | programme installé dans le profil utilisateur et lancé dans la session active |
| Instance unique | deux lancements simultanés conservent un seul processus |
| Désinstallation | programme et démarrage automatique retirés, tableau utilisateur conservé |
| Interface | vues, menus Windows, panneau droit, thèmes et grande police rendus dans WebView2 |
| Fichiers | navigation dans le projet, ouverture avec Windows et ajout au chat |
| Limite du projet | une jonction pointant hors du projet est refusée |
| Terminal | PowerShell interactif dans le projet, commande et chemin contrôlés, sans profil utilisateur injecté |
| Détection | Codex et Claude Code trouvés séparément dans leurs emplacements natifs |
| Connexion | diagnostic réel et explicite quand le compte ou le quota bloque la requête |
| Concurrence | deux processus Codex et deux processus Claude peuvent démarrer en parallèle sur des sessions distinctes |
| Même conversation | une seconde consigne reste en file jusqu’à la fin de la première |
| Planification | une tâche échue est lancée par le contrôle de 30 secondes et reprogrammée après une limite d’usage |
| Récurrence | la validation d’une occurrence hebdomadaire crée la suivante et l’Agenda projette les semaines futures |
| Arrière-plan | fermeture de la fenêtre, zone de notification et démarrage à la connexion sans droit administrateur |

Le test de bout en bout a atteint les deux exécutables. Claude Code a répondu qu’aucun compte n’était connecté ; CTRL KANB affiche maintenant cette cause précise en français. Après sa mise à jour, Codex 0.154.0 a accepté `gpt-5.6-sol`, initialisé la session et signalé ensuite la limite d’usage du compte. Les réponses externes en erreur restent affichées comme des blocages et ne sont pas transformées en faux succès.

## Détection des agents

La détection suit cet ordre :

1. `CTRL_KANB_CODEX_PATH` ou `CTRL_KANB_CLAUDE_PATH` ;
2. anciens alias `CODEX_PATH` ou `CLAUDE_PATH` pour compatibilité ;
3. version active installée avec l’application Codex ou emplacement utilisateur connu de Claude Code ;
4. ancien emplacement Codex compatible ;
5. commande présente dans le `PATH` de l’application.

Les emplacements natifs reconnus comprennent notamment :

- `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe` ;
- `%USERPROFILE%\.local\bin\claude.exe`.

La présence de l’exécutable et l’authentification sont deux états séparés. Le test de connexion lance un vrai aller-retour. CTRL KANB réutilise les sessions propres aux agents et ne copie aucun jeton dans son tableau.

## Planificateur et arrière-plan

Les cartes restent pilotées par le planificateur interne. L’application ne crée pas une tâche Windows par carte. Si l’utilisateur active le moteur, CTRL KANB ajoute une entrée dans `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, démarre avec `--background` à la prochaine ouverture de session et reste dans la zone de notification lorsque la fenêtre est fermée.

La désinstallation retire cette entrée. Les données restent conservées volontairement pour permettre une réinstallation. Au premier lancement suivant, un réglage d’arrière-plan encore actif restaure l’entrée de démarrage.

## Construire et contrôler

Depuis `Platforms\Windows` dans PowerShell :

```powershell
.\setup.ps1
.\build.ps1
```

L’installateur est produit sous `src-tauri\target\release\bundle\nsis`. Pour vérifier un paquet installé :

```powershell
.\validate-installed.ps1 -Installer "chemin\vers\CTRL KANB_6.11.1_x64-setup.exe"
```

Ce contrôle installe le paquet silencieusement, lance deux ouvertures dans la session interactive, puis vérifie l’instance unique, le processus, la séparation des données et l’empreinte SHA-256.

## Limites avant publication binaire

- l’installateur local n’a pas encore de signature Authenticode ;
- un cycle veille/réveil prolongé et les échelles Windows 125 %, 150 % et 200 % doivent encore être observés sur du matériel réel ;
- un résultat complet de tâche Codex demande un quota disponible, et Claude Code doit être connecté sur la machine de test ;
- WSL n’est pas pris en charge dans cette première version ;
- une demande de validation active ne survit pas à l’arrêt de son processus d’agent.

Ces limites ne bloquent ni l’organisation locale, ni le Kanban, ni l’Agenda, ni les fichiers, ni le terminal.
