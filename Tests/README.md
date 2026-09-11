# Contrôles transversaux

- `Web` vérifie l’interface et les parcours communs aux deux plateformes.
- `Windows` vérifie le contrat du pont et les adaptations visibles sous Windows.
- `Privacy` recherche les secrets, chemins personnels, données locales et identifiants de machine dans les fichiers publiés.

Les scénarios natifs macOS sont placés auprès de leur hôte dans [`Platforms/macOS/Tests`](../Platforms/macOS/Tests). Tous les contrôles se lancent depuis la racine avec `npm test`.
