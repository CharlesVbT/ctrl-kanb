# Plateformes natives

Les versions macOS et Windows sont deux hôtes de même niveau. Elles chargent l’interface commune située dans [`Shared/Web`](../Shared/Web), puis fournissent les fonctions natives propres au système : fichiers, terminal, agents, stockage, notifications et planificateur d’arrière-plan.

- [`macOS`](macOS) : AppKit, WebKit et Objective-C.
- [`Windows`](Windows) : Tauri 2, Rust et WebView2.

Les choix d’architecture communs sont décrits dans [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
