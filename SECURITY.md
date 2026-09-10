# Sécurité

## Signaler un problème

Utilisez de préférence la fonction de signalement privé de GitHub lorsqu’elle est disponible pour ce dépôt. Ne publiez pas de secret, de donnée personnelle, de chemin privé ni de preuve d’exploitation contenant des données réelles dans une issue publique.

Décrivez la version concernée, le comportement observé, les étapes minimales pour le reproduire et l’impact attendu. Utilisez des noms de projets, chemins et contenus fictifs.

## Périmètre

Les sujets de sécurité comprennent notamment :

- lecture ou écriture en dehors du dossier projet choisi ;
- injection de contenu actif dans l’interface WebKit ;
- exécution de commande non demandée ;
- exposition de jetons, données de compte, conversations ou chemins locaux ;
- contournement des validations humaines ou du verrou de l’application.

Les problèmes propres aux services Codex ou Claude Code doivent aussi être signalés à leur fournisseur respectif.

## Pratiques du projet

- les données de l’application restent hors du dépôt ;
- les fichiers locaux sont écrits avec des permissions limitées au compte utilisateur ;
- les chemins de projet sont normalisés et contrôlés avant les opérations du navigateur et les demandes des outils Read, Glob et Grep de Claude Code en mode sans modification ; Claude Code peut encore charger ses fichiers d’instructions CLAUDE.md au démarrage ;
- le terminal intégré est un shell local complet qui démarre dans le projet et conserve les droits du compte macOS ;
- les messages affichés dans la WebView sont échappés ;
- les processus d’agent reçoivent des arguments structurés ;
- le contrôle `npm run test:privacy` recherche les chemins absolus, emails, secrets courants et artefacts de données avant publication.
