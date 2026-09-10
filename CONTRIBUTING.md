# Contribuer

Merci de contribuer à CTRL KANB. Une modification doit rester compréhensible sur macOS et Windows, protéger les données locales et indiquer honnêtement ce qui a été testé.

## Préparer l’environnement

Le tronc commun utilise Node.js 20 ou plus récent et Python 3 :

```sh
npm ci
npm test
```

La construction macOS exige macOS 14 ou plus récent et les outils Apple en ligne de commande :

```sh
npm run build
```

La construction Windows exige Rust MSVC, WebView2 et les outils C++ de Visual Studio. Les commandes complètes figurent dans [INSTALLATION.md](docs/INSTALLATION.md).

## Préparer une modification

1. ouvrez une issue pour un changement de comportement important ;
2. partez de `main` et gardez une branche centrée sur un seul problème ;
3. ajoutez un scénario de test quand il protège une règle métier ou une régression ;
4. documentez les plateformes réellement contrôlées ;
5. exécutez les contrôles adaptés avant la pull request.

## Règles du produit

- conservez les workflows fixes **Classique** et **Routines** ;
- supprimer un projet ne doit jamais supprimer son dossier Finder ou Explorateur ;
- préservez planification, récurrence, comptes et classement lors d’une simplification d’interface ;
- gardez les files Codex et Claude Code indépendantes et sérialisez une même conversation ;
- n’élargissez pas le périmètre du terminal, des fichiers ou des agents sans expliquer les permissions ;
- vérifiez les modes clair et sombre et la grande police pour toute modification visuelle ;
- rendez les erreurs lisibles dans l’interface au lieu d’afficher une réponse brute de CLI.

## Confidentialité

N’ajoutez jamais :

- tableau, conversation, capture ou journal réel ;
- nom civil, adresse email personnelle ou chemin utilisateur ;
- jeton, clé, cookie, fichier `.env` ou configuration d’agent ;
- installateur, paquet de compilation ou dossier de données local.

Les captures de documentation se génèrent avec des données fictives :

```sh
node Scripts/capture-docs.js
npm run test:privacy
```

Le détail du procédé figure dans [SCREENSHOTS.md](docs/SCREENSHOTS.md).

## Contrôles avant une pull request

```sh
npm test
git status --short
```

Si l’hôte Windows change, ajoutez les contrôles Rust indiqués dans [RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md). Une capture ou un test simulé ne doit pas être présenté comme un essai complet d’un agent externe.

## Commits et pull requests

Utilisez un message court qui décrit la zone réellement modifiée. La pull request doit présenter le problème, le nouveau comportement, les contrôles effectués, les risques restants et les plateformes non vérifiées.

Un pseudonyme public et une adresse GitHub `noreply` sont acceptés ; aucune identité civile n’est exigée dans le dépôt.

## Licence des contributions

Sauf indication explicite, toute contribution volontairement proposée pour inclusion est fournie sous les conditions de l’[Apache License 2.0](LICENSE), conformément à sa section 5.
