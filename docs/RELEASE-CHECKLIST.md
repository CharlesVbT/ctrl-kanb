# Contrôles avant publication

Cette liste fige le périmètre de la première version publique. Une nouvelle fonction n’entre dans la version que si elle corrige un défaut bloquant.

## Contrôles automatiques

```sh
npm ci
npm test
npm run build
```

Les contrôles couvrent notamment le premier lancement vide, l’export et la restauration, les libellés d’accessibilité, les thèmes, les conversations, les files, la sécurité des fichiers et quarante cycles d’agenda répartis sur plusieurs fuseaux horaires avec coupure puis reprise de synchronisation.

## Essai utilisateur sur un profil vierge

- ouvrir l’application sans données existantes ;
- vérifier que le guide ne crée aucun projet ni aucune tâche ;
- ajouter un dossier de test, créer une tâche Codex puis une tâche Claude Code ;
- exporter les données, modifier une tâche, restaurer l’export et vérifier la copie `board.before-import-*.json` ;
- parcourir toutes les vues au clavier, agrandir la police et vérifier les thèmes clair et sombre ;
- supprimer ensuite le profil de test.

## Essai prolongé macOS

- laisser une tâche ponctuelle et une routine programmées pendant une nuit ;
- fermer la fenêtre, mettre le Mac en veille avant un créneau, puis le réveiller après ;
- couper le réseau avant une synchronisation et vérifier que l’état reste explicite jusqu’à la reprise ;
- changer le fuseau horaire de l’Agenda et confirmer que l’instant prévu ne change pas ;
- vérifier les notifications avec la fenêtre visible, masquée et fermée.

Ces essais doivent utiliser un dossier et des comptes dédiés au test. Un résultat observé doit être daté dans la note de version ; une absence d’essai reste indiquée comme telle.

## Contrôles Windows

```powershell
npm ci
npm run test:static
npm run test:ui
cargo fmt --manifest-path Platforms/Windows/src-tauri/Cargo.toml --check
cargo clippy --manifest-path Platforms/Windows/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path Platforms/Windows/src-tauri/Cargo.toml
npm --prefix Platforms/Windows run build
```

- installer le paquet avec `Platforms\Windows\validate-installed.ps1` ;
- lancer le raccourci du menu Démarrer et confirmer que la release démarre sans fenêtre PowerShell, Invite de commandes ou Windows Terminal ;
- vérifier le terminal PowerShell dans un dossier contenant des espaces ;
- tester une tâche programmée, une récurrence et deux conversations simultanées ;
- fermer la fenêtre avec le moteur activé, rouvrir depuis la zone de notification puis redémarrer la session ;
- désinstaller, confirmer le retrait du démarrage automatique et vérifier que les données sont conservées ;
- observer les thèmes et la grande police aux échelles 100 %, 125 %, 150 % et 200 %.

## Publication

- vérifier les liens du README anglais et du README français, puis régénérer les captures fictives si l’interface a changé ;
- vérifier la présence de `LICENSE`, `NOTICE` et des mentions tierces dans le dépôt et dans les paquets macOS/Windows ;
- vérifier qu’aucune donnée personnelle, clé, jeton ou chemin privé n’est suivi par Git ;
- exécuter `npm run test:privacy` sur l’arbre propre juste avant le tag ;
- mettre à jour la version et les notes de version ;
- confirmer que le dépôt reste privé tant que les paquets, la documentation et le signalement de sécurité ne sont pas prêts ;
- activer le signalement privé de vulnérabilités et protéger la branche `main` avant le passage public ;
- pour une application précompilée, signer avec Developer ID, notariser et vérifier le téléchargement sur un autre Mac ;
- signer l’exécutable et l’installateur Windows avec Authenticode, puis vérifier le téléchargement sur une autre machine ;
- ne publier les mises à jour automatiques qu’après mise en place d’un flux signé et vérifié.
