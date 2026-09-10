# Guide utilisateur

CTRL KANB organise le travail local confié à Codex et Claude. Un projet correspond à un dossier de votre ordinateur ; une tâche associe une consigne, un état, un agent et, si nécessaire, une conversation ou un horaire.

## Comprendre l’interface

La barre latérale gauche donne accès aux vues globales, aux projets et à l’état séparé des deux agents. Les tâches récemment modifiées apparaissent sous leur projet ; les tâches épinglées restent visibles avant la liste progressive.

Le panneau droit regroupe trois outils liés au projet sélectionné :

- **Chat** pour une conversation directe avec Codex ou Claude ;
- **Terminal** pour un shell local dans le dossier du projet ;
- **Fichiers** pour parcourir le dossier, ouvrir un fichier, copier son chemin ou l’ajouter au chat.

La largeur des deux panneaux se règle en faisant glisser leur bord. Un double-clic sur la séparation rétablit la largeur par défaut.

## Ajouter un projet

1. Choisissez **Nouveau projet**.
2. Sélectionnez son dossier local.
3. Donnez-lui un nom et une couleur si nécessaire.

CTRL KANB conserve une référence vers le dossier. Supprimer le projet de l’application retire ses cartes et ses réglages après confirmation, mais ne supprime jamais le dossier du disque.

Dans la barre latérale, ouvrez un projet avec son chevron. Utilisez **Afficher plus** pour révéler davantage de tâches et épinglez celles qui doivent rester accessibles. Le menu contextuel d’une tâche permet notamment de l’ouvrir ou de l’archiver lorsqu’elle est terminée.

## Créer une tâche

Le formulaire rapide demande l’essentiel : titre, projet et agent. Le détail avancé permet ensuite de définir :

- la consigne complète ;
- le modèle et la profondeur d’effort ;
- la priorité, le classement et les catégories ;
- les dépendances ;
- le mode d’accès de l’agent ;
- une échéance, un lancement programmé ou une récurrence ;
- la conversation à reprendre.

Une **échéance** place un repère dans l’Agenda. Un **lancement programmé** demande au planificateur d’envoyer la consigne à l’heure définie. Ces deux choix ne sont pas interchangeables.

## Tableaux Classique et Routines

Le tableau **Classique** suit une tâche ponctuelle de l’idée à la fin. Le tableau **Routines** suit les tâches récurrentes. Leurs colonnes sont fixes afin que les vues Flux, Agenda, Suivi et Historique interprètent toujours les mêmes états.

Une routine conserve une seule occurrence exécutable. Après validation, CTRL KANB crée la suivante. L’Agenda affiche aussi des projections futures pour rendre le rythme visible sans remplir le Kanban de doublons.

## Files et concurrence

Codex et Claude disposent de limites de concurrence séparées dans les réglages. Plusieurs conversations distinctes peuvent avancer en parallèle si la CLI et le compte le permettent.

Deux instructions visant la même conversation sont toujours sérialisées : la seconde attend la fin de la première. Cette règle évite l’erreur de rédacteur actif et protège l’ordre des réponses. Le rang de file affiché vient de CTRL KANB ; le fournisseur peut appliquer en plus ses propres limites.

## Flux

Flux rassemble les décisions et actions du moment sans reproduire tout le Kanban :

- blocages et résultats à relire ;
- tâches actives ou déjà en file ;
- tâches prêtes à lancer ;
- priorités sans horaire ;
- éléments prévus aujourd’hui et dans les sept prochains jours.

Les compteurs représentent le nombre de cartes dans chaque bloc. Ils ne représentent pas un quota Codex ou Claude.

## Agenda

Les vues Jour, Semaine et Mois réunissent :

- tâches planifiées ;
- échéances ;
- occurrences futures de routines ;
- réalisations terminées.

Les réglages permettent de choisir le fuseau affiché, le premier jour de semaine et le format 12 ou 24 heures. Une heure programmée est enregistrée comme un instant précis ; changer de fuseau modifie son affichage, pas son moment réel. Les récurrences suivent l’heure locale configurée et tiennent compte des changements saisonniers.

Glissez une tâche pour déplacer sa planification ou son échéance. Redimensionnez-la par pas de quinze minutes. Une tâche terminée n’est plus déplaçable afin de conserver sa date de réalisation.

Le planificateur examine les tâches toutes les trente secondes. L’ordinateur doit être allumé et la session ouverte. Le moteur d’arrière-plan est facultatif et désactivé lors de la première utilisation.

## Validations et Suivi

Le centre **Validations** affiche les demandes de commande, de modification de fichiers ou de réponse humaine émises par l’agent. Lisez le contenu exact avant de décider. Une autorisation et l’acceptation du résultat final sont deux décisions distinctes.

La vue **Suivi** regroupe les tâches à relire, les échecs et les résultats terminés. Vous pouvez approfondir la conversation existante ou créer une tâche complémentaire. Les demandes actives ne peuvent pas reprendre après l’arrêt du processus de l’agent ; elles sont alors marquées comme interrompues.

## Historique, archivage et suppression

Une tâche terminée peut être archivée depuis sa carte, son détail, l’Agenda, l’Historique ou la barre latérale. L’archive est réversible et garde la date de réalisation.

Une tâche archivée peut être restaurée ou supprimée. La suppression demande une confirmation et retire ses données de CTRL KANB. Elle ne supprime pas automatiquement la conversation stockée par l’agent.

## Chat du projet

Sélectionnez Codex ou Claude, puis le modèle disponible. Le bouton **+** joint des fichiers du projet. Après l’envoi, le champ est vidé et reste prêt pour la consigne suivante.

Chaque nouveau chat reçoit un titre dérivé de son premier message. Vous pouvez changer de conversation ou supprimer la conversation locale depuis la barre d’outils. La suppression retire sa référence et son affichage de CTRL KANB ; elle ne promet pas d’effacer les données conservées par le fournisseur ou la CLI.

Un fichier ajouté au chat est transmis à l’agent lors de l’envoi. Vérifiez son contenu avant de le joindre.

## Terminal et fichiers

Le terminal utilise zsh sur macOS et PowerShell sur Windows. Il démarre dans le projet sans charger le profil personnel, afin d’éviter les environnements ou scripts propres à une machine. Il reste un shell complet avec les droits du compte utilisateur.

Le navigateur de fichiers refuse de sortir du dossier projet, y compris par une jonction ou un lien symbolique contrôlé par l’hôte. Son menu contextuel propose :

- ouvrir ;
- afficher dans Finder ou l’Explorateur ;
- ouvrir avec ;
- enregistrer sous ;
- copier le chemin d’accès ;
- ajouter au chat.

L’action **Enregistrer sous** crée une copie à l’emplacement choisi ; elle ne déplace pas le fichier original.

## États de Codex et Claude

Chaque agent possède ses propres indicateurs :

- **Disponible** : l’exécutable a été détecté ;
- **Connexion testée** : une requête réelle a réussi à la date affichée ;
- **Synchronisé** : les conversations ou sessions locales ont été relues ;
- **Aucune session** : aucune session correspondante n’a été trouvée ;
- **Erreur** : le diagnostic reste visible jusqu’à une nouvelle tentative.

Le bouton d’actualisation lance la synchronisation des deux agents. Un message transitoire indique l’opération, puis chaque ligne conserve son résultat indépendant. Le réglage de fréquence pilote l’actualisation automatique des deux agents lorsqu’elle est activée.

## Comptes séparés

Un compte CTRL KANB est un raccourci vers un dossier de configuration isolé pour la CLI choisie. Il ne contient pas le jeton dans le tableau.

Pour changer de compte :

1. ajoutez un compte dans les réglages ;
2. ouvrez sa commande de connexion dans le terminal ;
3. connectez-vous avec la CLI officielle ;
4. testez la connexion ;
5. choisissez **Utiliser ce compte**.

Retirer un compte de CTRL KANB enlève son raccourci. Cela ne déconnecte pas la CLI et n’efface pas son dossier de configuration.

## Notifications et apparence

Les notifications internes et système se règlent par catégorie : fin, échec, validation requise, réponse du chat et problème de planification. Une tâche peut aussi remplacer la règle globale. Lorsque le verrou de l’application est actif, le titre de la tâche est masqué dans les notifications système.

Les thèmes proposent plusieurs palettes en modes clair et sombre. La taille de police s’applique à l’interface entière. Après un changement important, vérifiez les colonnes du Tableau, les blocs des Réglages et le panneau droit à la largeur que vous utilisez.

## Export et restauration

L’export JSON contient l’organisation complète : textes, historique, chemins, identifiants de conversation et réglages. Il ne contient pas les secrets gérés par les CLI, mais doit rester privé.

Avant une restauration, CTRL KANB valide le fichier puis sauvegarde l’état courant dans `board.before-import-*.json`. La restauration remplace ensuite le tableau visible. Elle ne modifie pas les dossiers de projets.

## Raccourcis

| Action | macOS | Windows |
|---|---|---|
| Palette de commandes | `⌘ K` | `Ctrl K` |
| Nouvelle tâche | `N` ou `⌘ N` | `N` ou `Ctrl N` |
| Capture rapide | `⇧ N` | `Maj N` |
| Chat du projet | `⌥⌘ C` | `Ctrl Alt C` |
| Terminal du projet | `⌥⌘ T` | `Ctrl Alt T` |
| Fichiers du projet | `⌥⌘ F` | `Ctrl Alt F` |
| Enregistrer ou envoyer | `⌘ ↵` | `Ctrl Entrée` |
| Flux, Tableau, Agenda | `1`, `2`, `3` | `1`, `2`, `3` |
| Validations, Suivi | `4`, `5` | `4`, `5` |
| Fermer le panneau courant | `Esc` | `Échap` |
| Afficher les raccourcis | `?` | `?` |

Les raccourcis sans touche de commande sont ignorés pendant la saisie.

Pour les erreurs de détection, de modèle, de synchronisation ou de planification, consultez [Dépannage](TROUBLESHOOTING.md).
