# Moteur macOS facultatif

## Principe de consentement

Le moteur est livré désactivé. Tant que l’utilisateur ne coche pas **Réglages → Moteur local → Lancer le moteur à l’ouverture de session** puis n’enregistre pas, CTRL KANB ne crée aucun LaunchAgent et ne démarre rien automatiquement à la connexion.

La même option désactive le service : CTRL KANB demande à `launchd` de le décharger, supprime son plist et remet `backgroundSchedulerEnabled` à `false`.

## Fichiers et identifiants

- label : `app.ctrlkanb.macos.scheduler` ;
- plist conditionnel : `~/Library/LaunchAgents/app.ctrlkanb.macos.scheduler.plist` ;
- helper embarqué : `CTRL KANB.app/Contents/Resources/ctrl-kanb-wake` ;
- heartbeat : `~/Library/Application Support/CTRL KANB/scheduler-status.json` ;
- journaux : `~/Library/Application Support/CTRL KANB/Logs/`.

Le plist utilise `RunAtLoad` et `StartInterval=60`. Le helper est volontairement court : il lit la préférence, cherche l’application par son bundle identifier et quitte immédiatement après le contrôle ou la relance. Le planificateur et la file restent dans l’application principale.

## États visibles

- **Désactivé** : préférence coupée et aucun service attendu ;
- **Activation…** : préférence enregistrée, réponse native encore attendue ;
- **Actif** : plist présent et dernier heartbeat disponible ou attendu ;
- **À vérifier** : helper absent, plist manquant ou erreur `launchctl`.

## Rattrapage et limites

Le moteur ne contourne ni l’extinction ni la veille du Mac. Après un réveil, une ouverture de session ou une relance, le planificateur examine immédiatement les cartes échues. La politique `catchUp` les remet dans la file ; `skip` ignore un créneau dépassé de plus de quinze minutes.

Une erreur reconnue comme limite d’usage Codex conserve la carte et espace les nouveaux essais de 15 à 240 minutes. Les autres erreurs demandent une intervention afin d’éviter une boucle incontrôlée.

## Test sans modifier le compte utilisateur

Le mode suivant écrit le tableau et le plist dans des emplacements temporaires, sans appeler `launchctl` :

```sh
CTRL_KANB_DATA_FILE=/private/tmp/ctrl-kanb-test.json \
CTRL_KANB_LAUNCH_AGENTS_DIR=/private/tmp/ctrl-kanb-launchagents \
CTRL_KANB_SKIP_LAUNCHCTL=1 \
"dist/CTRL KANB.app/Contents/MacOS/CTRL KANB"
```

## Traçabilité de l’automatisation

L’état livré et installé par défaut est **désactivé** : aucune automatisation récurrente n’est créée sur le Mac et aucune trace calendrier n’est donc requise à l’installation de la V1.1. Si l’utilisateur active durablement le moteur dans un environnement qui impose un registre calendrier des automatisations, cette activation doit être ajoutée à ce registre. CTRL KANB fournit parallèlement une trace opérationnelle locale dans Réglages, le heartbeat et les journaux.
