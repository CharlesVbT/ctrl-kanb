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

## Publication

- choisir et ajouter la licence ;
- vérifier qu’aucune donnée personnelle, clé, jeton ou chemin privé n’est suivi par Git ;
- mettre à jour la version et les notes de version ;
- pour une application précompilée, signer avec Developer ID, notariser et vérifier le téléchargement sur un autre Mac ;
- ne publier les mises à jour automatiques qu’après mise en place d’un flux signé et vérifié.
