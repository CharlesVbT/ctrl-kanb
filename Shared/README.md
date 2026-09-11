# Code partagé

[`Web`](Web) contient l’interface, les styles, les traductions et la logique métier utilisés à l’identique par macOS et Windows. Le fichier `platform.js` adapte uniquement les appels vers le pont natif fourni par chaque hôte.

Le code spécifique à un système reste dans [`Platforms`](../Platforms).
