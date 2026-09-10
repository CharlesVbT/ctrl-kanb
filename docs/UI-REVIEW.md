# Revue de l’interface

Cette note décrit les principes retenus pour l’interface publique de CTRL KANB. Les comptes rendus internes version par version ne font pas partie de la documentation distribuée.

## Hiérarchie

La navigation principale reste dans le panneau gauche. Les actions globales occupent la barre supérieure. Le panneau droit regroupe les outils liés au projet courant : chat, terminal et fichiers. Les deux panneaux sont redimensionnables et conservent leur largeur.

## Tâches

La création rapide demande uniquement les informations nécessaires. Les réglages avancés apparaissent selon le type d’exécution. Les cartes conservent des actions directes pour lancer, terminer, archiver, restaurer ou supprimer sans imposer l’ouverture du détail.

## États

Codex et Claude disposent chacun d’un état de disponibilité, de connexion et de synchronisation daté. Une animation ou un message temporaire signale une actualisation en cours ; l’interface ne présente jamais un simple état « à jour » comme une preuve de connexion.

## Accessibilité visuelle

Les thèmes clairs et sombres utilisent les mêmes niveaux de surface, bordure, texte et accent. La taille du texte est réglable sans modifier la disposition des boutons. Les commandes à icône possèdent un libellé accessible et une aide au survol.

## Largeurs réduites

Les barres d’actions conservent des boutons compacts. Les textes secondaires se replient avant les actions essentielles. Le chat garde sa zone de saisie visible et l’historique utilise un seul défilement.

## Contrôles avant publication

- parcourir toutes les vues en mode clair et sombre ;
- vérifier le panneau gauche replié et les différentes largeurs du panneau droit ;
- tester les états vides, chargés, en erreur et en synchronisation ;
- utiliser uniquement des données fictives dans les captures et exemples publics.
