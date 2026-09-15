# Captures de présentation

Les images publiées dans le README sont générées depuis l’interface réelle avec un jeu de données entièrement fictif. Elles ne doivent jamais être remplacées par une capture du profil d’un utilisateur.

La bannière `docs/assets/ctrl-kanb-banner.png` est une illustration marketing sans texte ni donnée utilisateur. Les huit autres images sont des captures reproductibles de l’interface.

Les GIF `ctrl-kanb-demo.gif` et `ctrl-kanb-demo-fr.gif` sont assemblés uniquement à partir de ces captures fictives. Ils ne lisent jamais le profil de données installé.

## Régénérer les images

Sur macOS avec Google Chrome :

```sh
npm run docs:screenshots
npm run docs:demo
```

Pour utiliser un autre navigateur Chromium :

```sh
CHROME_BIN="/chemin/vers/chromium" npm run docs:screenshots
```

Le script charge l’interface présente dans `Shared/Web/`, injecte temporairement les projets **Atelier Atlas**, **Lumen Studio** et **Signal Notes**, puis écrit une série anglaise et une série française :

```text
docs/assets/ctrl-kanb-hero.png
docs/assets/ctrl-kanb-board.png
docs/assets/ctrl-kanb-agenda.png
docs/assets/ctrl-kanb-chat.png
docs/assets/ctrl-kanb-hero-fr.png
docs/assets/ctrl-kanb-board-fr.png
docs/assets/ctrl-kanb-agenda-fr.png
docs/assets/ctrl-kanb-chat-fr.png
```

Le dossier temporaire et les profils Chromium de capture sont supprimés à la fin. Le script n’ouvre ni le profil réel de CTRL KANB, ni le profil Chrome de l’utilisateur.

## Contrôle avant commit

1. lire tous les noms, chemins, titres et messages visibles ;
2. vérifier les métadonnées PNG avec `npm run test:privacy` ;
3. confirmer les dimensions `1600 × 1000` ;
4. contrôler au moins une vue claire, l’Agenda et une vue sombre ;
5. refuser toute image contenant une donnée provenant d’un compte réel.
