# Dépannage

## Un agent est indiqué comme introuvable

Ouvrez d’abord un terminal système et vérifiez la commande :

```sh
codex --version
claude --version
```

Sous Windows, exécutez les mêmes commandes dans PowerShell. Si la commande fonctionne dans le terminal mais pas dans CTRL KANB, relancez l’application puis utilisez **Réglages → Agents et modèles → Actualiser la détection**.

Un lancement graphique peut recevoir un `PATH` différent. Vous pouvez indiquer un exécutable précis avant de lancer l’application :

```text
CTRL_KANB_CODEX_PATH
CTRL_KANB_CLAUDE_PATH
```

Utilisez toujours un chemin absolu vers un exécutable que vous avez installé et vérifié.

## L’agent est détecté mais la connexion échoue

La détection confirme uniquement la présence du programme. Connectez le compte avec la commande officielle :

```sh
codex login
claude auth login
```

Relancez ensuite **Tester la connexion** dans CTRL KANB. Un message de jeton Claude révoqué exige une nouvelle connexion. Une limite d’usage Codex exige d’attendre le rétablissement du quota ou d’utiliser un compte autorisé.

Ne copiez jamais de jeton, de dossier de configuration ou de journal contenant des données privées dans une issue publique.

## Le modèle choisi est indisponible

Le catalogue dépend du fournisseur, de la version de la CLI, du compte et de la politique de l’organisation. Actualisez la CLI avec sa méthode officielle, puis utilisez un modèle réellement proposé.

Pour Claude, choisissez **Automatique** afin de laisser la CLI sélectionner un modèle compatible. Le réglage de profondeur contrôle l’effort demandé quand l’agent et le modèle le prennent en charge ; il ne débloque pas un modèle absent du compte.

## La synchronisation paraît bloquée

La commande d’actualisation traite Codex et Claude séparément. L’interface affiche pour chacun une phase et un horodatage.

- **Disponible** : l’exécutable existe ;
- **Connexion testée** : une requête réelle a répondu ;
- **Synchronisé** : les conversations ou journaux locaux ont été relus ;
- **Aucune session** : rien de correspondant n’a été trouvé ;
- **Échec** : le détail doit être consulté avant une nouvelle tentative.

La synchronisation Claude relit via Claude Code CLI les sessions locales et n’envoie pas de nouveau prompt. Une connexion testée et une synchronisation réussie décrivent donc deux opérations différentes.

## « La conversation a déjà un rédacteur actif »

CTRL KANB n’envoie qu’une instruction à la fois dans une même conversation. Attendez la fin de la réponse en cours ou créez une nouvelle conversation. Des conversations distinctes peuvent s’exécuter en parallèle dans la limite réglée pour l’agent.

Si aucun tour n’est visible comme actif après un arrêt brutal, relancez l’application : la restauration doit replacer la carte dans un état explicite. N’effacez pas les fichiers de session de l’agent pour contourner ce verrou.

## Une tâche programmée ne démarre pas

Vérifiez :

1. la date, l’heure, le fuseau et le premier jour de semaine dans l’Agenda ;
2. le mode **Lancement programmé**, distinct d’une simple échéance ;
3. la présence et la connexion de l’agent choisi ;
4. les dépendances de la carte ;
5. l’état du moteur local dans les réglages.

L’ordinateur doit être allumé et la session utilisateur ouverte. Quand le moteur est désactivé, l’application doit rester en cours d’exécution. Après une veille, une tâche configurée pour rattraper son créneau est examinée au réveil ; une tâche configurée pour ignorer un retard dépassé ne démarre pas.

## Une routine n’apparaît pas chaque semaine dans l’Agenda

L’Agenda projette les occurrences futures pour aider à planifier, tout en conservant une seule carte exécutable. La prochaine carte réelle est créée lorsque l’occurrence courante est validée. Vérifiez que la carte utilise le tableau **Routines**, une récurrence hebdomadaire et une date programmée.

## Le terminal ne fonctionne pas comme un terminal système

Le terminal intégré utilise zsh sur macOS et PowerShell sans profil utilisateur sur Windows. Cette absence de profil évite qu’une configuration personnelle, un environnement Python ou un script de démarrage modifie son comportement.

Il démarre dans le dossier du projet, mais reste un shell complet avec les droits de votre compte. La commande **Ouvrir dans le terminal système** permet d’utiliser votre profil habituel. Fermer le panneau ne termine pas automatiquement un processus en cours ; utilisez l’action de fermeture de session si nécessaire.

## Windows ouvre une console extérieure

Une console est normale pendant `npm run dev`, `setup.ps1` ou `build.ps1`. Elle ne doit pas rester ouverte avec la version release installée depuis le paquet NSIS. Si cela arrive, vérifiez que vous lancez bien le raccourci installé et non un script de développement.

## Restaurer un tableau

Utilisez l’import depuis les réglages. CTRL KANB valide le document et crée une copie `board.before-import-*.json` de l’état courant avant remplacement. Un export peut contenir des consignes, réponses et chemins : gardez-le privé.

Les données se trouvent sous :

```text
macOS   ~/Library/Application Support/CTRL KANB/
Windows %LOCALAPPDATA%\CTRL KANB Data\
```

Si un problème persiste, consultez [SUPPORT.md](../SUPPORT.md) avant d’ouvrir un rapport.
