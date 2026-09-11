# Compatibilité et validations

Ce document sépare les comportements contrôlés automatiquement, les observations faites sur une machine réelle et les points qui restent à valider. Une réussite de compilation ne vaut pas validation d’un service externe.

## Version examinée

- CTRL KANB : 6.11.3 ;
- schéma de données : 22 ;
- date du dernier passage complet : 11 septembre 2026.

## Systèmes testés

| Plateforme | Environnement observé | Résultat |
|---|---|---|
| macOS | macOS sur Apple Silicon et runner GitHub macOS | suite `npm test`, construction de l’application et vérification du bundle réussies |
| Windows | Windows 11 x64 avec WebView2 et runner GitHub Windows | contrôles JavaScript/Rust et construction de l’installateur NSIS réussis |

Le minimum déclaré par l’application macOS est macOS 14. Windows 11 x64 est la seule version Windows incluse dans la validation actuelle.

## Agents testés

| Agent | Version observée | Ce qui a été confirmé | Limite de l’essai |
|---|---:|---|---|
| Codex CLI sur macOS | 0.153.4 | détection, démarrage App Server, synchronisation et routage des tâches | les modèles et quotas restent propres au compte connecté |
| Claude Code CLI sur macOS | 2.1.145 | détection, lecture des sessions, routage et diagnostics d’authentification | une authentification révoquée ou absente exige `claude auth login` |
| Codex CLI sur Windows | 0.154.0 | détection native, initialisation d’une session avec le modèle choisi et remontée explicite de la limite d’usage | l’essai n’a pas produit de réponse finale faute de quota disponible |
| Claude Code CLI sur Windows | 2.1.165 | détection native et diagnostic réel du compte | la machine de test n’était pas connectée ; aucune réponse finale réussie n’est revendiquée |

La disponibilité d’un modèle change indépendamment de CTRL KANB. Le mode Claude **Automatique** laisse Claude Code CLI choisir le modèle autorisé par le compte. Forcer Sonnet, Opus ou Haiku peut produire une erreur valide si ce modèle n’est pas accessible.

## Contrôles couverts

La suite automatisée couvre notamment :

- migrations, stockage atomique et protection des fichiers précédents ;
- échappement du contenu affiché et contrat fermé du pont natif ;
- périmètre du navigateur de fichiers et refus des chemins qui sortent du projet ;
- files indépendantes Codex et Claude, limite de concurrence et sérialisation d’une même conversation ;
- pause, reprise, échec, quota et restauration après interruption ;
- synchronisations séparées et horodatées ;
- agenda, fuseaux horaires, changements d’heure, récurrences et reprises après coupure ;
- navigation au clavier, libellés accessibles, tailles de police et thèmes ;
- recherche de données privées, chemins absolus, secrets courants et artefacts locaux dans les fichiers destinés au dépôt.

Des essais utilisateurs réels ont aussi validé le premier lancement, la création et l’archivage de tâches, une tâche programmée, une récurrence, des exécutions simultanées sur des conversations distinctes, l’export/restauration et les parcours du panneau projet.

## Validé sur Windows réel

- installation et désinstallation du paquet NSIS ;
- démarrage depuis le menu Démarrer sans terminal extérieur persistant ;
- instance unique ;
- terminal PowerShell intégré dans un chemin contenant des espaces ;
- détection indépendante de Codex CLI et Claude Code CLI ;
- fichiers, menu contextuel et contrôle des jonctions ;
- planification, récurrence et files concurrentes ;
- moteur en arrière-plan dans la zone de notification et démarrage à la connexion ;
- conservation des données après désinstallation.

Les détails techniques sont consignés dans [WINDOWS-PORT.md](WINDOWS-PORT.md).

## Points encore ouverts

- validation d’un Mac Intel ;
- essais prolongés veille/réveil, réseau intermittent et changement de fuseau sur plusieurs jours ;
- contrôle visuel Windows matériel aux échelles 125 %, 150 % et 200 % ;
- réponse finale réussie des deux agents sur la machine Windows avec des comptes connectés et des quotas disponibles ;
- mécanisme de mise à jour automatique vérifié.

Ces points restent explicitement non validés dans les notes de version. La [liste de contrôle](RELEASE-CHECKLIST.md) encadre la construction, la vérification et la livraison de chaque paquet.
