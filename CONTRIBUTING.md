# Contribuer

## Préparer l’environnement

CTRL KANB se développe sur macOS 14 ou plus récent avec les outils Apple en ligne de commande, Node.js 20 ou plus récent et Python 3.

```sh
npm ci
npm test
npm run build
```

## Règles de contribution

- conservez les workflows **Classique** et **Routines** ;
- ne transformez jamais la suppression d’un projet en suppression de son dossier Finder ;
- préservez la planification et la récurrence lors d’une simplification d’interface ;
- accompagnez une correction fonctionnelle d’un scénario de test utile ;
- vérifiez les modes clair et sombre pour toute modification visuelle ;
- n’ajoutez aucune donnée personnelle, conversation, capture réelle, clé, jeton ou chemin absolu.

Avant une proposition de changement :

```sh
npm test
git status --short
```

Les captures destinées à la documentation doivent utiliser exclusivement des projets, tâches, chemins et conversations fictifs.
