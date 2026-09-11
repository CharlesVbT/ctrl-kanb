# Historique des versions

Ce fichier suit les changements visibles de CTRL KANB. Le projet utilise une numérotation `MAJEURE.MINEURE.CORRECTIF` sans promettre encore une stabilité d’API publique.

## Non publié

- organisation explicite du dépôt entre interface partagée, hôtes macOS et Windows, tests transversaux et outils de documentation ;
- mise à jour des dépendances Rust `time` et `serde_with` vers leurs versions corrigées ;
- maintenance des livrables GitHub ;
- préparation automatisée des paquets et empreintes de release ;
- validation prolongée veille, réseau et échelles Windows à compléter.

## 6.11.3 — 11 septembre 2026

### Corrigé

- remplacement vérifié de l’exécutable lors d’une réinstallation Windows, sans toucher aux données utilisateur ;
- échec explicite du contrôle d’installation si le binaire présent diffère du binaire fraîchement construit, hors marqueur NSIS appliqué par Tauri.

## 6.11.2 — 10 septembre 2026

### Ajouté

- hôte Windows Tauri 2 avec installateur NSIS, WebView2, PowerShell intégré et zone de notification ;
- synchronisation et diagnostics distincts pour Codex et Claude ;
- chat de projet avec modèles, pièces jointes et gestion des conversations ;
- terminal et navigateur de fichiers dans le panneau droit ;
- agenda Jour, Semaine et Mois avec fuseau horaire, premier jour de semaine, format horaire et projection des récurrences ;
- thèmes clairs et sombres, palettes et taille de police ;
- export, restauration et copies de sécurité avant import ;
- contrôles de confidentialité, de sécurité, d’accessibilité et de résilience.

### Modifié

- formulaires de tâches simplifiés avec options avancées conservées ;
- files Codex et Claude séparées, avec sérialisation des tours d’une même conversation ;
- barre latérale, Flux, Historique, Suivi, Réglages et panneau projet réorganisés ;
- archivage et suppression accessibles depuis les vues où une tâche apparaît ;
- détection des CLI adaptée aux installations graphiques macOS et aux emplacements natifs Windows ;
- identification de Codex et Claude par des pictogrammes génériques propres à CTRL KANB, sans logo de fournisseur embarqué.
- identification explicite de CTRL KANB auprès de Codex App Server sous le nom `ctrl-kanb`.

### Sécurité

- contrôle des chemins du navigateur de fichiers et des outils de lecture ;
- écriture atomique, verrou interprocessus et sauvegarde de l’état précédent ;
- échappement des contenus rendus et contrat fermé du pont natif ;
- absence de télémétrie et conservation des identifiants par les CLI officielles.
