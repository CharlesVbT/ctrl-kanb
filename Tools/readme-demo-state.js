(() => {
  const parameters = new URLSearchParams(location.search);
  const view = parameters.get("view") || "flow";
  const language = parameters.get("lang") === "fr" ? "fr" : "en";
  const tx = (fr, en) => language === "fr" ? fr : en;
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const instant = (offset, hour, minute = 0) => {
    const date = new Date(base);
    date.setDate(date.getDate() + offset);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  const created = instant(-8, 9);
  const spaces = [
    { id: "atlas", name: "Atelier Atlas", rootPath: "/Projects/Atelier-Atlas", accentHex: "527A9A", pinned: true },
    { id: "lumen", name: "Lumen Studio", rootPath: "/Projects/Lumen-Studio", accentHex: "B46B45", pinned: false },
    { id: "signal", name: "Signal Notes", rootPath: "/Projects/Signal-Notes", accentHex: "6F67A8", pinned: false }
  ];
  const conversation = (id, name, preview, engine = "codex") => ({
    id, name, preview, cwd: "/Projects/Atelier-Atlas", role: "main", engine,
    accountID: engine === "codex" ? "codex:default" : "claude-code:default",
    addedAt: created
  });
  const card = (id, spaceID, title, status, priorityLevelID, priorityNumber, extra = {}) => ({
    id, spaceID, boardPresetID: "classic", title,
    prompt: extra.prompt || tx("Analyse le besoin, propose une solution claire et vérifie le résultat.", "Analyze the need, propose a clear solution, and verify the result."),
    status, priorityLevelID, priority: priorityLevelID, priorityNumber,
    labels: extra.labels || [], subtasks: [], dependencies: [],
    categoryAssignments: extra.categoryAssignments || {},
    agentEngine: extra.agentEngine || "codex",
    model: extra.model || (extra.agentEngine === "claude-code" ? "default" : "gpt-5.6-sol"),
    reasoningEffort: extra.reasoningEffort || "medium",
    runMode: extra.runMode || "workspaceWrite",
    launchMode: extra.launchMode || "manual",
    recurrence: extra.recurrence || "none",
    recurrenceSource: "board",
    durationMinutes: extra.durationMinutes || 60,
    scheduledAt: extra.scheduledAt || "",
    dueDate: extra.dueDate || "",
    scheduleState: extra.scheduleState || "",
    conversations: extra.conversations || [],
    activeConversationID: extra.activeConversationID || "",
    lastRun: extra.lastRun,
    completedAt: extra.completedAt,
    archived: false,
    createdAt: created,
    updatedAt: extra.updatedAt || instant(-1, 16)
  });
  const cards = [
    card("positioning", "atlas", tx("Clarifier le positionnement produit", "Clarify product positioning"), "review", "high", 1, {
      labels: [tx("Stratégie", "Strategy")], agentEngine: "claude-code",
      conversations: [conversation("claude-positioning", tx("Positionnement de la page de lancement", "Launch page positioning"), tx("Trois propositions comparées avec leurs compromis.", "Three proposals compared with their tradeoffs."), "claude-code")],
      activeConversationID: "claude-positioning",
      lastRun: { finishedAt: instant(-1, 15, 20), exitCode: 0, summary: tx("Trois angles de positionnement sont prêts à être relus.", "Three positioning angles are ready for review.") }
    }),
    card("onboarding", "atlas", tx("Tester le premier lancement", "Test the first-run experience"), "running", "high", 2, {
      labels: [tx("Expérience", "Experience")], conversations: [conversation("codex-onboarding", tx("Audit du premier lancement", "First-run audit"), tx("Vérification des états vides et de la première tâche.", "Checking empty states and the first task."))],
      activeConversationID: "codex-onboarding",
      lastRun: { summary: tx("Codex vérifie les états vides et le parcours clavier.", "Codex is checking empty states and keyboard navigation.") }
    }),
    card("release-notes", "atlas", tx("Préparer les notes de version", "Prepare release notes"), "ready", "normal", 1, {
      labels: [tx("Publication", "Release")], dueDate: instant(1, 17)
    }),
    card("screens", "atlas", tx("Mettre à jour les captures de présentation", "Update presentation screenshots"), "queued", "normal", 2, {
      labels: ["Documentation"], agentEngine: "claude-code", dueDate: instant(2, 11)
    }),
    card("accessibility", "lumen", tx("Contrôler les contrastes des thèmes", "Check theme contrast"), "needsInput", "high", 1, {
      labels: [tx("Accessibilité", "Accessibility")], lastRun: { summary: tx("Une validation humaine est nécessaire pour le thème Minuit.", "Human review is required for the Midnight theme.") }
    }),
    card("ideas", "lumen", tx("Comparer trois variantes d’accueil", "Compare three welcome screens"), "backlog", "low", 1, {
      labels: ["Design"]
    }),
    card("routine-weekly", "signal", tx("Revue hebdomadaire des tâches", "Weekly task review"), "ready", "normal", 1, {
      boardPresetID: "routines", launchMode: "scheduled", recurrence: "weekly",
      scheduledAt: instant(1, 9), scheduleState: "pending", durationMinutes: 45,
      labels: ["Routine"]
    }),
    card("publish-check", "atlas", tx("Vérifier les notes de version", "Review the release notes"), "done", "normal", 3, {
      completedAt: instant(-1, 17), lastRun: { finishedAt: instant(-1, 17), exitCode: 0, summary: tx("La liste de publication est complète.", "The release checklist is complete.") }
    }),
    card("agenda-plan", "lumen", tx("Planifier la démonstration produit", "Schedule the product demo"), "ready", "normal", 2, {
      launchMode: "scheduled", scheduledAt: instant(0, 14), scheduleState: "pending", durationMinutes: 90,
      labels: [tx("Démonstration", "Demo")]
    }),
    card("review-metrics", "signal", tx("Synthétiser les retours utilisateurs", "Summarize user feedback"), "ready", "low", 2, {
      dueDate: instant(3, 16), durationMinutes: 60, agentEngine: "claude-code"
    })
  ];
  const chatConversation = {
    id: "demo-chat-main",
    name: tx("Préparer la démonstration", "Prepare the demo"),
    preview: tx("Le plan de démonstration est structuré en quatre séquences.", "The demo plan is structured into four steps."),
    engine: "codex",
    accountID: "codex:default",
    cwd: "/Projects/Atelier-Atlas",
    role: "main",
    addedAt: created,
    messages: [
      { role: "user", text: tx("Prépare un déroulé court pour présenter le Kanban, l’agenda et les routines.", "Prepare a short walkthrough of the Kanban, calendar, and routines."), at: instant(-1, 10) },
      { role: "assistant", text: tx("Je propose quatre séquences : cadrage du projet, lancement d’une tâche, planification d’une routine, puis relecture du résultat. Chaque séquence tient en moins d’une minute.", "I suggest four steps: frame the project, launch a task, schedule a routine, then review the result. Each step takes less than a minute."), at: instant(-1, 10, 4) },
      { role: "user", text: tx("Ajoute un passage sur la synchronisation indépendante de Codex et Claude.", "Add a section about independent Codex and Claude synchronization."), at: instant(-1, 10, 8) },
      { role: "assistant", text: tx("Le passage précise les trois états distincts : moteur détecté, connexion testée et conversations synchronisées. Les horodatages restent visibles pour éviter toute ambiguïté.", "The section distinguishes three states: executable detected, connection tested, and conversations synchronized. Timestamps remain visible to avoid ambiguity."), at: instant(-1, 10, 10) }
    ]
  };
  const theme = view === "chat" ? "dark" : "light";
  const palette = view === "chat" ? "midnight" : view === "agenda" ? "azure" : "slate";
  const board = {
    version: 22,
    spaces,
    cards,
    utilityChats: [{
      id: "utility-chat-atlas-codex",
      utilityChat: true,
      spaceID: "atlas",
      title: tx("Préparer la démonstration", "Prepare the demo"),
      prompt: "",
      status: "ready",
      agentEngine: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
      runMode: "workspaceWrite",
      messages: chatConversation.messages,
      conversations: [chatConversation],
      activeConversationID: chatConversation.id,
      createdAt: created,
      updatedAt: instant(-1, 10, 10)
    }],
    templates: [],
    validations: [],
    settings: {
      language,
      maxConcurrencyCodex: 2,
      maxConcurrencyClaude: 2,
      autoSync: false,
      backgroundSchedulerEnabled: false,
      autoArchiveCompletedDays: 0,
      defaultModelCodex: "gpt-5.6-sol",
      defaultModelClaude: "default",
      defaultEffortCodex: "medium",
      defaultEffortClaude: "medium",
      sidebarCollapsed: false,
      sidebarWidth: 252,
      expandedProjectIDs: ["atlas"],
      defaultBoardPreset: "classic",
      activePresetByScope: { global: "classic" },
      surfaceMode: view === "flow" ? "flow" : "board",
      accounts: [],
      activeAccount: {},
      accountChecks: {
        "codex:default": { engine: "codex", account: "codex:default", state: "ready", detail: tx("Connexion testée", "Connection tested"), at: instant(0, 8, 42) },
        "claude-code:default": { engine: "claude-code", account: "claude-code:default", state: "ready", detail: tx("Connexion testée", "Connection tested"), at: instant(0, 8, 43) }
      },
      conversationSyncChecks: {
        codex: { phase: "success", completed: 2, total: 2, failed: 0, durationMs: 640, lastAt: instant(0, 8, 45), message: "" },
        "claude-code": { phase: "success", completed: 2, total: 2, failed: 0, durationMs: 410, lastAt: instant(0, 8, 45), message: "" }
      },
      agendaMode: "week",
      agendaTimeZone: "auto",
      agendaWeekStart: "1",
      agendaHourCycle: "h23",
      theme,
      themePalette: palette,
      fontSize: "normal",
      inAppNotifications: "all",
      systemNotificationsEnabled: true,
      notificationWhen: "background",
      notificationEvents: { taskComplete: true, taskFailed: true, approval: true, chatReply: true, scheduleIssue: true },
      utilityPanelOpen: view === "chat",
      utilityPanelWidth: 430,
      utilityTab: "chat",
      utilityAgent: "codex",
      utilitySpaceID: "atlas",
      utilityCustomPath: ""
    },
    modifiedAt: instant(0, 8, 45)
  };
  window.CodexBoard.load(board);
  window.CodexBoard.appInfo({ version: "6.11.3" });
  window.CodexBoard.agentStatus({ codex: true, claude: true });
  window.CodexBoard.securityStatus({ checked: true, lockEnabled: false, biometry: "Touch ID" });
  window.CodexBoard.runsRestored({ running: ["onboarding"], queued: ["screens"] });
  if (view === "agenda") document.querySelector('[data-select="agendaView"]')?.click();
  document.documentElement.dataset.documentationCapture = view;
})();
