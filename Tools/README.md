# Outils de maintenance

Ce dossier contient les utilitaires destinés aux mainteneurs. `capture-docs.js` produit les captures du README à partir de données fictives avec `npm run docs:screenshots`. `render-readme-demo.js` pilote l’interface réelle dans un profil Chromium temporaire, enregistre les interactions et produit les deux GIF avec `npm run docs:demo` ; cette commande nécessite FFmpeg. Les deux outils partagent le jeu fictif défini dans `readme-demo-state.js`.

Ces outils ne sont pas intégrés aux applications distribuées.
