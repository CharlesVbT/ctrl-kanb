(() => {
  const windowsApp = window.CTRL_KANB_PLATFORM === "windows";
  const platformCopy = value => {
    if(!windowsApp)return value;
    return String(value)
      .replaceAll("Application macOS", "Application Windows")
      .replaceAll("Notifications macOS", "Notifications Windows")
      .replaceAll("notifications macOS", "notifications Windows")
      .replaceAll("réglages macOS", "paramètres Windows")
      .replaceAll("macOS", "Windows")
      .replaceAll("LaunchAgent", "tâche de démarrage Windows")
      .replaceAll("Finder", "Explorateur de fichiers")
      .replaceAll("ce Mac", "ce PC").replaceAll("sur ce Mac", "sur ce PC")
      .replaceAll("du Mac", "du PC").replaceAll("Le Mac", "Le PC").replaceAll("Mac en", "PC en")
      .replaceAll("zsh", "PowerShell")
      .replaceAll("(0600)", "par les droits du compte Windows")
      .replace(/⌥⌘\s*/g,"Ctrl+Alt+").replace(/⌘\s*/g,"Ctrl+").replace(/⇧\s*/g,"Maj+").replaceAll("⌃C","Ctrl+C");
  };
  // --- Langue --------------------------------------------------------------
  // Le francais est la langue source du fichier : t() rend la chaine telle quelle
  // quand aucune traduction n existe, donc une chaine oubliee reste lisible.
  const languages = [["auto","Automatique"],["fr","Français"],["en","English"]];
  const normalizeLanguage = value => languages.some(([id])=>id===value) ? value : "auto";
  const systemLanguage = () => String(window.navigator?.language||"fr").toLowerCase().startsWith("en") ? "en" : "fr";
  const resolveLanguage = value => normalizeLanguage(value)==="auto" ? systemLanguage() : normalizeLanguage(value);
  let activeLanguage = "fr";
  function applyLanguage(value){
    activeLanguage = resolveLanguage(value);
    document.documentElement?.setAttribute?.("lang", activeLanguage);
  }
  function t(text, vars){
    let out = (activeLanguage!=="fr" && window.CTRL_KANB_TRANSLATIONS?.[activeLanguage]?.[text]) || text;
    if(vars) for(const key in vars) out = out.split(`{${key}}`).join(vars[key]);
    return platformCopy(out);
  }
  // Le pluriel n a pas la meme frontiere dans les deux langues : « 0 tâche »
  // au singulier en francais, « 0 tasks » au pluriel en anglais.
  function tn(count, one, many, vars){
    const plural = activeLanguage==="fr" ? Math.abs(count)>=2 : Math.abs(count)!==1;
    return t(plural?many:one, {n:count, ...(vars||{})});
  }
  const locale = () => activeLanguage==="en" ? "en-GB" : "fr-FR";

  const statuses = [
    ["backlog", "Idées", "□"], ["ready", t("Prêt"), "▷"], ["queued", "File", "≡"], ["running", "En cours", "⚡"],
    ["needsInput", "Validation", "!"], ["review", "À revoir", "?"], ["done", "Terminée", "✓"]
  ];
  const specialViews = { agendaView:t("Agenda"), reviewView:t("Validations"), followView:t("Suivi"), doneView:"Historique", settingsView:"Réglages" };
  const defaultPriorities = () => [
    {id:"urgent",name:t("Urgente"),code:"U",color:"E5525E",weight:0},
    {id:"high",name:t("Haute"),code:"H",color:"E59B42",weight:1},
    {id:"normal",name:t("Normale"),code:"N",color:"6E75FF",weight:2},
    {id:"low",name:t("Basse"),code:"B",color:"8C93A3",weight:3}
  ];
  const defaultTaxonomy = () => [
    {id:"objective",name:t("Objectif"),kind:"objective",multiple:false,values:[]},
    {id:"subproject",name:t("Sous-projet"),kind:"subproject",multiple:false,parentDimensionID:"objective",values:[]},
    {id:"category",name:t("Catégorie"),kind:"generic",multiple:true,values:[]}
  ];
  const fixedBoardPresets = () => [
    {id:"classic",name:t("Classique"),system:true,showDone:true,description:t("Le cycle complet d’une tâche ponctuelle, y compris sa planification."),columns:[{id:"classic-ideas",name:t("Idées"),color:"8C93A3",status:"backlog",kind:"ideas"},{id:"classic-ready",name:t("Prêtes"),color:"2F6FEB",status:"ready",kind:"ready"},{id:"classic-planned",name:t("Planifiées"),color:"5F73D8",status:"ready",kind:"planned"},{id:"classic-running",name:t("En cours"),color:"C47B22",status:"running",kind:"running"},{id:"classic-validation",name:t("Validation"),color:"D85A68",status:"needsInput",kind:"validation"},{id:"classic-review",name:t("À revoir"),color:"7D57C2",status:"review",kind:"review"},{id:"classic-done",name:t("Terminées"),color:"23845F",status:"done",kind:"done"}]},
    {id:"routines",name:t("Routines"),system:true,showDone:true,description:t("Le suivi de chaque passage d’une tâche récurrente."),columns:[{id:"routine-setup",name:t("À configurer"),color:"8C93A3",status:"backlog",kind:"setup"},{id:"routine-planned",name:t("Planifiées"),color:"2F6FEB",status:"ready",kind:"planned"},{id:"routine-active",name:t("Actives"),color:"C47B22",status:"running",kind:"running"},{id:"routine-validation",name:t("Validation"),color:"D85A68",status:"needsInput",kind:"validation"},{id:"routine-review",name:t("À vérifier"),color:"7D57C2",status:"review",kind:"review"},{id:"routine-done",name:t("Terminées"),color:"23845F",status:"done",kind:"done"}]}
  ];
  const columnHelp = (presetID,kind) => ({
    classic:{ideas:t("Une idée reste ici tant qu’elle n’est pas suffisamment définie pour être lancée."),ready:t("La consigne est prête. Lance la carte manuellement quand tu veux confier le travail à l’agent choisi."),planned:t("La tâche démarrera automatiquement à la date prévue si le moteur local est disponible."),running:t("La carte arrive ici dès sa mise en file. Elle peut être arrêtée puis reprise dans sa conversation principale."),validation:t("L’agent attend une autorisation ou une réponse humaine avant de continuer."),review:t("Le résultat est disponible. Termine la tâche ou demande un approfondissement dans la même conversation."),done:t("Le travail est validé. Archive la carte pour alléger le tableau sans perdre son historique ni sa présence dans l’Agenda.")},
    routines:{setup:t("Prépare ici la consigne, la fréquence et le mode de lancement de la routine."),planned:t("La prochaine occurrence est configurée et attend son créneau de lancement."),running:t("Le passage actuel est en file, actif ou suspendu. Une reprise conserve la conversation principale."),validation:t("La routine attend une autorisation ou une information humaine."),review:t("Vérifie le résultat de ce passage avant de créer l’occurrence suivante ou d’arrêter la routine."),done:t("Le passage est validé. Son archivage retire la carte du tableau mais conserve sa trace dans Historique et Agenda.")}
  }[presetID]?.[kind]||t("Cette colonne représente une étape du workflow de la carte."));
  let board = { version:22, spaces:[], cards:[], utilityChats:[], templates:[], validations:[], settings:{maxConcurrency:2,maxConcurrencyCodex:2,maxConcurrencyClaude:1,autoSync:true,backgroundSchedulerEnabled:false,autoArchiveCompletedDays:0,defaultModel:"gpt-5.6-sol",defaultEffort:"medium",defaultEffortCodex:"medium",defaultEffortClaude:"medium",sidebarCollapsed:false,expandedProjectIDs:[],defaultBoardPreset:"classic",activePresetByScope:{},accounts:[],activeAccount:{},accountChecks:{},conversationSyncChecks:{},agendaMode:"week",agendaTimeZone:"auto",agendaWeekStart:"auto",agendaHourCycle:"auto",theme:"auto",themePalette:"graphite",fontSize:"normal",inAppNotifications:"all",systemNotificationsEnabled:true,notificationWhen:"background",notificationEvents:{taskComplete:true,taskFailed:true,approval:true,chatReply:true,scheduleIssue:true},utilityPanelOpen:false,utilityPanelWidth:390,utilityTab:"chat",utilityAgent:"codex",utilitySpaceID:"",utilityCustomPath:"",priorities:defaultPriorities(),taxonomy:defaultTaxonomy()}, modifiedAt:new Date().toISOString() };
  let selection = "global", lastWorkspaceSelection="global", surfaceMode = "board", labelFilter = "", taxonomyFilter = "", priorityFilter = "", syncing = false, claudeSyncing = false;
  let syncState = {phase:"idle",completed:0,total:0,durationMs:0,lastAt:"",message:""};
  let claudeSyncState = {phase:"idle",completed:0,total:0,durationMs:0,lastAt:"",message:""};
  let agendaMode = "week", agendaAnchor = new Date(), agendaResize = null, agendaDrag = null, suppressAgendaClick = false, agendaFocusSlotKey = "";
  const agendaScrollMemory = new Map();
  const activeRuns = new Set(), queuePositions = new Map(), queueReasons = new Map();
  // Le registre fait foi, et le natif le retablit apres chaque chargement via
  // runsRestored. Se rabattre sur le statut enregistre bloquerait a tort une
  // relance quand plus rien ne tourne.
  const cardIsBusy = card => Boolean(card) && (activeRuns.has(card.id)||queuePositions.has(card.id));
  const taskIsActivelyExecuting = card => Boolean(card&&(activeRuns.has(card.id)||queuePositions.has(card.id)||["queued","running"].includes(card.status)||["pausing","paused"].includes(card.executionState)));
  let folderCallback = null, conversationPickerCardID = null, conversations = [], conversationFilterAll = false;
  let detailCardID = null, detailThreadID = null;
  let projectMenuID = null, projectDragID = null, projectsExpanded = false;
  const projectTaskPageSize = 5, projectTaskLimits = new Map();
  const projectListLimit = 5;
  const cardsPerColumnPage = 30;
  const expandedColumnLimits = new Map();
  const utilityTerminals = new Map(), utilityFileStates = new Map();
  const utilityAttachmentLimit = 8;
  const utilityActiveWriterMessage = () => t("Cette conversation est déjà utilisée dans Codex. Lance un nouveau chat pour continuer.");
  const utilityActiveWriterRecoveredMessage = () => t("Cette conversation était déjà utilisée dans Codex. Le message a été envoyé dans un nouveau chat.");
  const errorText = value => {
    const seen=new Set();
    const visit=(candidate,depth=0)=>{
      if(candidate==null||depth>5)return "";
      if(typeof candidate==="object"){
        if(seen.has(candidate))return "";seen.add(candidate);
        const paths=[candidate.message,candidate.detail,candidate.error?.message,candidate.error,candidate.result,candidate.response?.error,candidate.response?.message,candidate.reason];
        for(const item of paths){const found=visit(item,depth+1);if(found)return found}
        if(Array.isArray(candidate))return candidate.map(item=>visit(item,depth+1)).filter(Boolean).join("\n");
        return "";
      }
      const raw=String(candidate).trim();if(!raw)return "";
      if((raw.startsWith("{")&&raw.endsWith("}"))||(raw.startsWith("[")&&raw.endsWith("]"))){try{const parsed=JSON.parse(raw),found=visit(parsed,depth+1);if(found)return found}catch{}}
      return raw;
    };
    return visit(value).replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g,"").replace(/\r/g,"").trim();
  };
  const technicalFailure = value => {
    const raw=String(value||"").trim(),plain=errorText(value);
    return /^[\[{]/.test(raw)||/\b(?:error|exception|stack trace|traceback|status\s*[:=]?\s*[45]\d\d|econn\w*|enoent|eacces|eperm|oauth|unauthorized|forbidden)\b/i.test(`${raw}\n${plain}`)||/\bat\s+\S+\s*\([^\n]+:\d+:\d+\)/.test(raw);
  };
  const friendlyAgentError = (value,engine="") => {
    const detail=errorText(value),label=engineLabel(normalizeEngine(engine||"codex"));
    if(!detail)return t("Le moteur n’a pas renvoyé de réponse. Réessaie dans quelques instants.");
    if(/already has an active writer/i.test(detail))return utilityActiveWriterMessage();
    if(/usage limit|usage_limit|rate.?limit|quota|too many requests|limit reached|limite d.usage/i.test(detail))return t("Limite d’usage atteinte pour {agent}. La tâche est conservée : réessaie après la réinitialisation de ton quota.",{agent:label});
    if(/401|oauth|access token.*(?:revoked|expired)|token.*(?:revoked|expired)|not logged in|login required|unauthorized|authentication required|auth login|connexion.*expir/i.test(detail))return t("{agent} n’est pas connecté. Ouvre Réglages → Agents et modèles, puis reconnecte ce compte.",{agent:label});
    if(/model.*(?:not found|unsupported|unavailable|requires? (?:a )?newer version)|unsupported model|unknown model|update.*codex|codex.*update|upgrade.*latest|latest (?:app|cli|version)/i.test(detail))return t("Ce modèle n’est pas disponible avec la version installée de {agent}. Mets le moteur à jour ou choisis un autre modèle.",{agent:label});
    if(/command.*not found|commande.*introuvable|executable.*not found|spawn\s+.*enoent|no such file or directory/i.test(detail))return t("{agent} est introuvable sur ce PC. Installe-le ou indique son emplacement dans Réglages → Agents et modèles.",{agent:label});
    if(/timed?\s*out|timeout|deadline exceeded|délai.*dépass/i.test(detail))return t("{agent} n’a pas répondu dans le délai prévu. La tâche est conservée et peut être relancée.",{agent:label});
    if(/\beconn\w*\b|network|socket|dns|connection (?:failed|refused|reset)|connexion.*(?:impossible|interrompue)/i.test(detail))return t("La connexion de {agent} a été interrompue. Vérifie le réseau, puis réessaie.",{agent:label});
    if(/eacces|eperm|access denied|permission denied|operation not permitted|accès refusé|autorisation refusée/i.test(detail))return t("{agent} n’a pas l’autorisation nécessaire pour accéder au projet. Vérifie le dossier et ses droits d’accès.",{agent:label});
    const clean=detail.replace(/^error\s*:\s*/i,"").split("\n").map(line=>line.trim()).filter(line=>line&&!/^\s*at\s+\S+/.test(line)&&!/^https?:\/\//i.test(line))[0]||"";
    if(clean&&clean.length<=320&&!technicalFailure(value))return clean;
    return t("{agent} n’a pas pu terminer la demande. La tâche est conservée : vérifie sa configuration, puis relance-la.",{agent:label});
  };
  const friendlyNativeError = value => {
    const detail=errorText(value);
    if(!detail)return t("L’action n’a pas pu être terminée. Réessaie dans quelques instants.");
    if(/already has an active writer/i.test(detail))return utilityActiveWriterMessage();
    if(/eacces|eperm|access denied|permission denied|operation not permitted|accès refusé/i.test(detail))return t("CTRL KANB n’a pas l’autorisation nécessaire pour cette action. Vérifie les droits du dossier, puis réessaie.");
    if(/timed?\s*out|timeout|deadline exceeded|délai.*dépass/i.test(detail))return t("L’action a pris trop de temps et a été arrêtée. Réessaie dans quelques instants.");
    if(/command.*not found|commande.*introuvable|spawn\s+.*enoent/i.test(detail))return t("Le programme nécessaire à cette action est introuvable sur ce PC.");
    if(!technicalFailure(value)&&detail.length<=320)return detail;
    return t("L’action n’a pas pu être terminée. Vérifie le dossier utilisé, puis réessaie.");
  };
  const friendlyUtilityError = (value,engine="codex") => friendlyAgentError(value,engine);
  const utilityConversationTitle=(text,attachments=[],engine="codex")=>{
    const seed=String(text||attachments[0]?.name||t("Nouvelle conversation")).replace(/\s+/g," ").trim(),short=seed.length>58?`${seed.slice(0,57).trimEnd()}…`:seed;
    return short||`${engineLabel(engine)} · ${t("Nouvelle conversation")}`;
  };
  const normalizeUtilityAttachment = item => {
    const path=String(item?.path||"").trim();if(!path)return null;
    const fallback=path.split("/").filter(Boolean).at(-1)||t("Fichier");
    return {path,name:String(item?.name||fallback).trim()||fallback};
  };
  let utilityDraft = "", utilityAttachments = [], utilityFileMenu = null;
  let appVersion = "";
  let notificationAuthorization = {status:"unknown"};
  // Source unique : la navigation et le suivi de defilement lisent la meme liste,
  // pour qu une section ajoutee ne puisse pas manquer dans le menu de gauche.
  const settingsGroups = () => [
    [t("Personnalisation"), [
      ["settings-appearance",t("Apparence"),"eye"],
      ["settings-interface",t("Notifications"),"bell"],
    ]],
    [t("Travail"), [
      ["settings-tasks",t("Tâches et tableaux"),"board"],
      ["settings-calendar",t("Agenda"),"calendar"],
      ["settings-archives",t("Archivage"),"archive"],
    ]],
    [t("Agents IA"), [
      ["settings-agents",t("Agents et modèles"),"sliders"],
      ["settings-sync",t("Synchronisation"),"sync"],
      ["settings-accounts",t("Comptes"),"users"],
    ]],
    [t("Système"), [
      ["settings-engine",t("Moteur local"),"cpu"],
      ["settings-security",t("Sécurité"),"shield"],
      ["settings-data",t("Données"),"history"],
      ["settings-about",t("À propos"),"check"],
    ]],
  ];
  const settingsSections = () => settingsGroups().flatMap(([,items])=>items);
  let activeSettingsSection = "settings-appearance";

  // Un seul catalogue pour les deux moteurs : les reglages, l editeur de carte et
  // la capture rapide y puisent, donc un modele ajoute apparait partout.
  // Le modele et l effort sont deux reglages distincts. Le catalogue ne colle
  // donc aucun qualificatif de profondeur au nom du modele.
  const builtinEngines = [
    ["codex","Codex",[["gpt-5.6-sol","GPT-5.6 Sol"],["gpt-5.6-terra","GPT-5.6 Terra"],["gpt-5.6-luna","GPT-5.6 Luna"]],"gpt-5.6-sol"],
    ["claude-code","Claude Code",[["opus","Claude Opus"],["sonnet","Claude Sonnet"],["haiku","Claude Haiku"]],"sonnet"],
  ];
  // Un agent ACP choisit son modele dans sa propre configuration : CTRL KANB ne
  // lui en impose pas, il liste seulement l agent.
  const engineCatalog = () => builtinEngines;
  const engineEntry = value => engineCatalog().find(([id])=>id===engineKey(value)) || builtinEngines[0];
  const normalizeEngine = value => engineCatalog().some(([id])=>id===value) ? value : "codex";
  const defaultEngine = () => normalizeEngine(board.settings?.defaultAgentEngine);
  // Chaque moteur garde son propre modele par defaut : basculer d agent sur une
  // carte ne doit pas imposer de rechoisir un modele a chaque fois.
  const defaultModelFor = engine => {
    const [, , models, fallback] = engineEntry(engine);
    const stored = engineKey(engine)==="claude-code" ? board.settings?.defaultModelClaude : board.settings?.defaultModelCodex;
    return models.some(([id])=>id===stored) ? stored : fallback;
  };
  const effortValues = ["low","medium","high","xhigh","max"];
  const effortCatalog = [["low","Faible"],["medium","Moyen"],["high","Élevé"],["xhigh","Très élevé"],["max","Maximal"]];
  const normalizeEffort = value => effortValues.includes(value) ? value : "medium";
  const effortOptions = selected => effortCatalog.map(([value,label])=>`<option value="${value}" ${value===selected?"selected":""}>${t(label)}</option>`).join("");
  const normalizeConcurrency = value => Math.max(1,Math.min(4,Number(value)||1));
  const defaultEffortFor = engine => normalizeEffort(engineKey(engine)==="claude-code"?board.settings?.defaultEffortClaude:board.settings?.defaultEffortCodex);
  const concurrencyFor = engine => normalizeConcurrency(engineKey(engine)==="claude-code"?board.settings?.maxConcurrencyClaude:board.settings?.maxConcurrencyCodex);

  // --- Comptes -------------------------------------------------------------
  // Un compte n est qu un dossier d authentification. Le compte « principal » a
  // un dossier vide : le CLI utilise alors son emplacement habituel, donc rien
  // ne change pour qui n en veut qu un.
  const accountRoot = windowsApp ? "%LOCALAPPDATA%\\CTRL KANB Data\\Comptes" : "~/Library/Application Support/CTRL KANB/Comptes";
  const accountHomePath = (engine,id) => windowsApp
    ? `${accountRoot}\\${engine}\\${id}`
    : `${accountRoot}/${engine}/${id}`;
  const accountsFor = engine => (board.settings?.accounts||[]).filter(a=>engineKey(a.engine)===engineKey(engine));
  function allAccountsFor(engine){
    const key=engineKey(engine);
    return [{id:`${key}:default`, engine:key, label:t("Compte principal"), home:"", builtin:true}, ...accountsFor(key)];
  }
  const accountByID = id => (board.settings?.accounts||[]).find(a=>a.id===id)
    || allAccountsFor("codex").concat(allAccountsFor("claude-code")).find(a=>a.id===id) || null;
  const activeAccountID = engine => {
    const key=engineKey(engine), chosen=(board.settings?.activeAccount||{})[key];
    return allAccountsFor(key).some(a=>a.id===chosen) ? chosen : `${key}:default`;
  };
  const activeAccount = engine => accountByID(activeAccountID(engine)) || allAccountsFor(engine)[0];
  const accountHomeFor = engine => activeAccount(engine)?.home || "";
  // Un « compte » est un dossier de configuration : le nommer sans montrer le
  // dossier laissait deviner ce que la bascule change reellement.
  const defaultAccountHome = engine => engineKey(engine)==="claude-code" ? "~/.claude" : "~/.codex";
  const accountFolder = account => account.home || defaultAccountHome(account.engine);
  function setActiveAccount(engine, id){
    const key=engineKey(engine);
    const account=accountByID(id);
    if(!account||engineKey(account.engine)!==key)return;
    board.settings.activeAccount={...(board.settings.activeAccount||{}), [key]:id};
    save(); render();
    toast(t("{agent} utilise maintenant « {compte} ».",{agent:engineEntry(key)[1],compte:account.label}));
  }

  const syncIntervals = [[30,t("Toutes les 30 secondes")],[60,t("Toutes les minutes")],[300,t("Toutes les 5 minutes")],[900,t("Tous les quarts d’heure")]];
  const normalizeSyncInterval = value => syncIntervals.some(([n])=>n===Number(value)) ? Number(value) : 60;
  // Les confirmations dans l application et les alertes macOS ont des rôles
  // différents. Les premières expliquent une action immédiate ; les secondes
  // ramènent l utilisateur vers un travail qui a évolué en son absence.
  const inAppNotificationModes = [["all","Tous les messages"],["essential","Essentiels uniquement"]];
  const normalizeInAppNotifications = value => inAppNotificationModes.some(([id])=>id===value) ? value : "all";
  const notificationWhenModes = [["background","Quand l’app n’est pas au premier plan"],["all","Toujours"]];
  const normalizeNotificationWhen = value => notificationWhenModes.some(([id])=>id===value) ? value : "background";
  const notificationEventCatalog = [
    ["taskComplete","Résultat prêt","Une tâche Codex ou Claude Code a terminé avec succès.","check"],
    ["taskFailed","Échec d’une tâche","Une exécution manuelle a échoué et demande ton attention.","alert"],
    ["approval","Validation ou question","Un agent attend une autorisation ou une réponse.","message"],
    ["chatReply","Réponse du chat latéral","Une réponse Codex ou Claude Code est arrivée dans le panneau droit.","chat"],
    ["scheduleIssue","Problème de planification","Une tâche programmée n’a pas pu se terminer normalement.","clock"]
  ];
  const defaultNotificationEvents = () => Object.fromEntries(notificationEventCatalog.map(([id])=>[id,true]));
  const normalizeNotificationEvents = value => {
    const source=value&&typeof value==="object"&&!Array.isArray(value)?value:{};
    return Object.fromEntries(notificationEventCatalog.map(([id])=>[id,typeof source[id]==="boolean"?source[id]:true]));
  };
  const normalizeTaskNotification = value => ["inherit","always","mute"].includes(value) ? value : "inherit";
  const agendaModes = [["day","Jour"],["week","Semaine"],["month","Mois"]];
  const normalizeAgendaMode = value => agendaModes.some(([id])=>id===value) ? value : "week";
  const agendaWeekStarts = [["auto","Automatique"],["1","Lundi"],["0","Dimanche"],["6","Samedi"]];
  const normalizeAgendaWeekStart = value => agendaWeekStarts.some(([id])=>id===String(value)) ? String(value) : "auto";
  const agendaHourCycles = [["auto","Automatique"],["h23","24 heures"],["h12","12 heures · AM/PM"]];
  const normalizeAgendaHourCycle = value => agendaHourCycles.some(([id])=>id===value) ? value : "auto";
  const systemTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const availableTimeZones = () => {
    const zones=typeof Intl.supportedValuesOf==="function"?Intl.supportedValuesOf("timeZone"):[];
    const fallback=["Africa/Casablanca","America/Los_Angeles","America/Montreal","America/New_York","Asia/Dubai","Asia/Tokyo","Australia/Sydney","Europe/Brussels","Europe/London","Europe/Paris","Indian/Reunion","Pacific/Auckland"];
    return [...new Set(["UTC",...(zones.length?zones:fallback)])];
  };
  const validAgendaTimeZone = value => { try { new Intl.DateTimeFormat("en",{timeZone:value}).format();return Boolean(value); } catch { return false; } };
  const normalizeAgendaTimeZone = value => value==="auto"||validAgendaTimeZone(value) ? value : "auto";
  const agendaTimeZone = () => normalizeAgendaTimeZone(board.settings?.agendaTimeZone)==="auto" ? systemTimeZone() : board.settings.agendaTimeZone;
  const agendaHour12 = () => {
    const choice=normalizeAgendaHourCycle(board.settings?.agendaHourCycle);
    if(choice!=="auto")return choice==="h12";
    return Boolean(Intl.DateTimeFormat(window.navigator?.language||undefined,{hour:"numeric"}).resolvedOptions().hour12);
  };
  const agendaFirstDay = () => {
    const chosen=normalizeAgendaWeekStart(board.settings?.agendaWeekStart);
    if(chosen!=="auto")return Number(chosen);
    try { const region=new Intl.Locale(window.navigator?.language||locale()),info=region.getWeekInfo?.()||region.weekInfo;return Number(info?.firstDay||1)%7; }
    catch { return 1; }
  };
  const agendaTimeZoneName = zone => zone==="UTC"?"UTC":zone.replaceAll("_"," ");
  const agendaOffsetLabel = (zone=agendaTimeZone(),date=new Date()) => {
    try { return new Intl.DateTimeFormat(locale(),{timeZone:zone,timeZoneName:"shortOffset"}).formatToParts(date).find(part=>part.type==="timeZoneName")?.value||zone; }
    catch { return zone; }
  };
  const agendaTimeZoneOptions = () => availableTimeZones().map(zone=>`<option value="${esc(zone)}" ${normalizeAgendaTimeZone(board.settings?.agendaTimeZone)===zone?"selected":""}>${esc(agendaTimeZoneName(zone))}</option>`).join("");

  const fontSizes = [["normal","Normale"],["comfort","Confort"],["large","Grande"],["xlarge","Très grande"]];
  const normalizeFontSize = value => fontSizes.some(([id])=>id===value) ? value : "normal";
  function applyFontSize(value){document.documentElement?.setAttribute?.("data-font-size",normalizeFontSize(value))}
  const themeModes = [["light","Clair","Toujours le thème clair","sun"],["dark","Sombre","Toujours le thème sombre","moon"],["auto","Système","Suit le réglage d’apparence de macOS","monitor"]];
  const themePalettes = [
    {id:"graphite",name:"Graphite",description:"Gris calmes, précis et discrets",preview:{light:["#fbfbfc","#f4f5f7","#ffffff","#1b1d21","#68707a"],dark:["#101113","#0b0c0e","#17191c","#e9ebed","#858b94"]}},
    {id:"azure",name:"Azur",description:"Bleu lumineux et surfaces aérées",preview:{light:["#f8faff","#f2f6ff","#ffffff","#172033","#3264c8"],dark:["#0b1530","#081027","#111e3b","#e8efff","#8eb3ff"]}},
    {id:"midnight",name:"Minuit",description:"Bleu-violet profond et concentré",preview:{light:["#fbfaff","#f6f3ff","#ffffff","#221b35","#6f5bbd"],dark:["#09081c","#060617","#100e29","#e6e0ff","#9b8ff0"]}},
    {id:"ember",name:"Braise",description:"Cuivre chaud et nuances de bronze",preview:{light:["#fffaf5","#fcf3e9","#ffffff","#2b1b14","#a65a20"],dark:["#160900","#100600","#211006","#ffdcc0","#e28a3b"]}},
    {id:"slate",name:"Ardoise",description:"Bleu acier sobre pour rester focalisé",preview:{light:["#f7f9fb","#f1f4f7","#ffffff","#18202a","#3d6f9f"],dark:["#0d1117","#090d13","#161b22","#d5dde6","#6da9df"]}},
    {id:"terminal",name:"Terminal",description:"Vert technique inspiré des consoles",preview:{light:["#f6fbf7","#edf7ef","#ffffff","#10261a","#238542"],dark:["#000a00","#000600","#061407","#d9f7df","#58f177"]}}
  ];
  const normalizeTheme = value => themeModes.some(([id])=>id===value) ? value : "auto";
  const normalizeThemePalette = value => themePalettes.some(item=>item.id===value) ? value : "graphite";
  const systemPrefersDark = () => Boolean(window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
  const resolvedThemeMode = value => normalizeTheme(value)==="auto"?(systemPrefersDark()?"dark":"light"):normalizeTheme(value);
  const themePreviewStyle = palette => {
    const [background,sidebar,surface,ink,accent]=palette.preview[resolvedThemeMode(board.settings?.theme)];
    return `--preview-bg:${background};--preview-sidebar:${sidebar};--preview-surface:${surface};--preview-ink:${ink};--preview-accent:${accent}`;
  };
  function applyTheme(value,paletteValue=board?.settings?.themePalette){
    const root=document.documentElement;if(!root)return;
    // « auto » est resolu ici, pas dans la feuille de style : celle-ci n a
    // ainsi qu un seul chemin sombre a maintenir.
    const theme=resolvedThemeMode(value),palette=normalizeThemePalette(paletteValue);
    root.setAttribute?.("data-theme",theme);
    root.setAttribute?.("data-palette",palette);
    bridge({action:"setAppearance",mode:normalizeTheme(value),resolvedMode:theme,palette});
  }
  window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change",()=>{
    if(normalizeTheme(board?.settings?.theme)==="auto")applyTheme("auto",board.settings?.themePalette);
  });
  const sidebarWidthDefault = 248, sidebarWidthMin = 196, sidebarWidthMax = 430;
  let sidebarResize = null;
  const clampSidebarWidth = value => Math.round(Math.min(sidebarWidthMax,Math.max(sidebarWidthMin,Number(value)||sidebarWidthDefault)));
  const applySidebarWidth = value => document.querySelector("#app")?.style.setProperty("--sidebar-w",`${clampSidebarWidth(value)}px`);
  function endSidebarResize(persist){
    if(!sidebarResize)return;
    const width=sidebarResize.width;sidebarResize=null;
    document.body.classList.remove("resizing-sidebar");
    if(persist){board.settings.sidebarWidth=width;save();}
    else applySidebarWidth(board.settings.sidebarWidth);
  }
  const utilityPanelWidthDefault=390,utilityPanelWidthMin=320,utilityPanelWidthMax=620;
  let utilityResize=null;
  const clampUtilityPanelWidth=value=>Math.round(Math.min(utilityPanelWidthMax,Math.max(utilityPanelWidthMin,Number(value)||utilityPanelWidthDefault)));
  const applyUtilityPanelWidth=value=>document.querySelector("#app")?.style.setProperty("--utility-panel-w",`${clampUtilityPanelWidth(value)}px`);
  function endUtilityResize(persist){
    if(!utilityResize)return;
    const width=utilityResize.width;utilityResize=null;
    document.body.classList.remove("resizing-utility");
    if(persist){board.settings.utilityPanelWidth=width;save();}
    else applyUtilityPanelWidth(board.settings.utilityPanelWidth);
  }
  const flowLateGraceMs = 5*60*1000;
  const flowSectionPageSize = 6;
  const expandedFlowSections = new Map();
  const historyPageSize = 50;
  let historyCurrentLimit = historyPageSize, historyArchiveLimit = historyPageSize;
  let backgroundSchedulerState = {enabled:false,installed:false,state:"disabled",message:"Aucun service ne tourne sans ton accord.",lastCheck:"",error:""};

  const bridge = payload => {
    if(typeof window.ctrlKanbNative?.postMessage==="function"){
      window.ctrlKanbNative.postMessage(payload);
      return;
    }
    window.webkit?.messageHandlers?.bridge?.postMessage(payload);
  };
  const esc = (value="") => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const safeHex = (value, fallback="6E75FF") => /^[0-9a-f]{6}$/i.test(String(value||"").replace(/^#/,"")) ? String(value).replace(/^#/,"") : fallback;
  const uid = () => crypto.randomUUID().toLowerCase();
  const now = () => new Date().toISOString();
  const today = () => agendaDateKeyFromValue(new Date());
  const getSpace = id => board.spaces.find(space => space.id === id) || (id==="utility-custom"&&board.settings?.utilityCustomPath?{id:"utility-custom",name:board.settings.utilityCustomPath.split("/").filter(Boolean).at(-1)||t("Dossier choisi"),rootPath:board.settings.utilityCustomPath,accentHex:"6E75FF",utilityCustom:true}:undefined);
  const getCard = id => board.cards.find(card => card.id === id) || (board.utilityChats||[]).find(chat => chat.id === id);
  const orderedSpaces = () => board.spaces.map((space,index)=>({space,index})).sort((a,b)=>Number(Boolean(b.space.pinned))-Number(Boolean(a.space.pinned))||a.index-b.index).map(item=>item.space);
  const activeConversation = card => { const compatible=(card.conversations||[]).filter(c=>engineKey(c.engine||"codex")===engineKey(card.agentEngine));return compatible.find(c=>c.id===card.activeConversationID)||compatible[0]; };
  const statusLabel = value => t(statuses.find(([id]) => id === value)?.[1] || value);
  const dependencyOpen = card => (card.dependencies || []).some(id => getCard(id)?.status !== "done");
  const hasPendingValidationForCard = card => (board.validations||[]).some(validation=>validation.cardID===card.id&&validation.status==="pending");
  const cardExecutionFailed = card => card.status!=="done"&&(card.status==="needsInput"&&!hasPendingValidationForCard(card)||Number(card.lastRun?.exitCode)>0||card.scheduleState==="failed");
  const isBlocked = card => hasPendingValidationForCard(card) || dependencyOpen(card);
  const icon = name => {
    const paths={menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',flow:'<path d="M5 6h6v4H5zM13 14h6v4h-6zM11 8h3a3 3 0 0 1 3 3v3M13 16h-3a3 3 0 0 1-3-3v-3"/>',board:'<rect x="4" y="4" width="6" height="16" rx="2"/><rect x="14" y="4" width="6" height="10" rx="2"/>',calendar:'<path d="M6 3v3M18 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/>',check:'<path d="m5 12 4 4L19 6"/>',folder:'<path d="M3 6h7l2 2h9v11H3z"/>',plus:'<path d="M12 5v14M5 12h14"/>',play:'<path d="m8 5 11 7-11 7Z"/>',edit:'<path d="m4 20 4.2-1 10.9-10.9a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"/><path d="m14.8 6.2 3 3"/>',alert:'<path d="M12 4 3 20h18L12 4Zm0 5v5m0 3v.1"/>',history:'<path d="M4 12a8 8 0 1 0 2.3-5.7L4 9M4 4v5h5M12 8v5l3 2"/>',archive:'<path d="M4 8h16v12H4zM3 4h18v4H3zm6 8h6"/>',settings:'<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l-.15-.09a2 2 0 0 0-.73-2.73l.22-.38a2 2 0 0 0 2.73-.73l-.15-.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',sync:'<path d="M20 7v5h-5M4 17v-5h5M18.5 10a7 7 0 0 0-12-3L4 9m16 6-2.5 2a7 7 0 0 1-12-3"/>',chevron:'<path d="m9 6 6 6-6 6"/>',previous:'<path d="m15 18-6-6 6-6"/>',next:'<path d="m9 18 6 6-6 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',columns:'<path d="M4 5h4v14H4zM10 5h4v14h-4zM16 5h4v14h-4z"/>',trash:'<path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7m3 4v5m4-5v5"/>',up:'<path d="m6 14 6-6 6 6"/>',down:'<path d="m6 10 6 6 6-6"/>'};
    paths.next='<path d="m9 18 6-6-6-6"/>';
    paths.settings='<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>';
    paths.shield='<path d="M12 3 5 6v5c0 4.6 2.7 8 7 10 4.3-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/>';
    paths.terminal='<path d="m5 7 4 4-4 4M11 17h8"/>';
    paths.file='<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>';
    paths.chat='<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/>';
    paths.message=paths.chat;
    paths.bell='<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>';
    paths.close='<path d="m6 6 12 12M18 6 6 18"/>';
    paths.panelRight='<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>';
    paths.question='<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.6 2.25c-.8.4-1.3.9-1.3 1.75M12 17h.01"/>';
    paths.eye='<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>';
    paths.pin='<path d="m9 4 6 0-1 5 3 3v2H7v-2l3-3-1-5ZM12 14v7"/>';
    paths.finder='<path d="M4 5h16v14H4z"/><path d="M12 5c-1.6 3.1-1.6 10.9 0 14M8 11h.01M16 11h.01M8 15c2.5 1.6 5.5 1.6 8 0"/>';
    paths.more='<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>';
    paths.openWith='<path d="M13 5h6v6M19 5l-8 8"/><path d="M17 13v6H5V7h6"/>';
    paths.save='<path d="M12 4v11m-4-4 4 4 4-4"/><path d="M5 20h14"/>';
    paths.copy='<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5H5v11h3"/>';
    paths.paperclip='<path d="m9.5 12.5 5-5a3 3 0 0 1 4.25 4.25l-7 7a5 5 0 0 1-7.08-7.08l7-7a2 2 0 0 1 2.83 2.83l-7 7"/>';
    paths.sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
    paths.moon='<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>';
    paths.monitor='<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>';
    return `<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.board}</svg>`;
  };
  const navIcon = name => `<span class="nav-icon">${icon(name)}</span>`;
  const presetScopeKey = () => selection==="settingsView"?lastWorkspaceSelection:selection;
  const normalizePresetID = id => id==="routines"?"routines":"classic";
  const presetIDForScope = scope => normalizePresetID(board.settings.activePresetByScope?.[scope]||board.settings.defaultBoardPreset);
  const activePresetID = () => presetIDForScope(presetScopeKey());
  const activePreset = () => fixedBoardPresets().find(preset=>preset.id===activePresetID())||fixedBoardPresets()[0];
  const setActivePreset = id => {board.settings.activePresetByScope||={};board.settings.activePresetByScope[presetScopeKey()]=normalizePresetID(id);};
  const cardBoardPresetID = card => normalizePresetID(card?.boardPresetID);
  const cardsForPreset = (cards,presetID) => cards.filter(card=>cardBoardPresetID(card)===presetID);
  // Une carte lancable tout de suite : prete, sans dependance ouverte, ni
  // planifiee par CTRL KANB ni pilotee par Codex. Cette regle sert a la fois au
  // compteur « prêtes » de l en-tete et au lancement groupe, qui doivent
  // toujours annoncer le meme nombre.
  const cardIsLaunchable = card => card?.status==="ready" && !dependencyOpen(card) && card.launchMode!=="scheduled" && card.launchMode!=="codex";
  const derivedColumnIndex = (card,preset) => {
    if(preset.id==="classic"){
      if(card.status==="done")return 6;
      if(card.status==="review"||cardExecutionFailed(card))return 5;
      if(card.status==="needsInput")return 4;
      if(["queued","running"].includes(card.status))return 3;
      if(card.launchMode==="scheduled"&&card.scheduledAt)return 2;
      if(card.status==="ready")return 1;
      return 0;
    }
    if(preset.id==="routines"){
      if(card.status==="done")return 5;
      if(card.status==="review"||cardExecutionFailed(card))return 4;
      if(card.status==="needsInput")return 3;
      if(["queued","running"].includes(card.status))return Math.min(2,preset.columns.length-1);
      if(card.launchMode==="scheduled"||card.launchMode==="codex"||card.recurrence&&card.recurrence!=="none")return Math.min(1,preset.columns.length-1);
      return 0;
    }
    const progress={backlog:0,ready:.32,queued:.42,running:.62,needsInput:.86,review:.9,done:1}[card.status]??0;
    return Math.min(preset.columns.length-1,Math.round(progress*(preset.columns.length-1)));
  };
  const columnForCard = (card,preset=activePreset()) => {
    return preset.columns[derivedColumnIndex(card,preset)] || preset.columns[0];
  };
  const statusOptionsForPreset = (presetID,selectedStatus) => {
    const preset=fixedBoardPresets().find(item=>item.id===normalizePresetID(presetID))||fixedBoardPresets()[0],seen=new Set();
    return preset.columns.filter(column=>!seen.has(column.status)&&seen.add(column.status)).map(column=>`<option value="${esc(column.status)}" ${column.status===selectedStatus?"selected":""}>${esc(column.name)}</option>`).join("");
  };
  function refreshCardStageSelect(form,presetID,currentStatus){
    const preset=fixedBoardPresets().find(item=>item.id===normalizePresetID(presetID))||fixedBoardPresets()[0],available=preset.columns.map(column=>column.status);
    const desired=available.includes(currentStatus)?currentStatus:"backlog",select=form?.elements?.status;
    if(select)select.innerHTML=statusOptionsForPreset(preset.id,desired);
  }

  function migrate(data) {
    const previousVersion=Number(data.version||0),storedSettings=data.settings&&typeof data.settings==="object"?data.settings:{};let changed = previousVersion !== 22;
    data.version = 22; data.spaces ||= []; data.cards ||= []; data.utilityChats ||= []; data.templates ||= []; data.validations ||= [];
    data.settings = { maxConcurrency:2, autoSync:true, backgroundSchedulerEnabled:false, autoArchiveCompletedDays:0, defaultModel:"gpt-5.6-sol", defaultEffort:"medium", sidebarCollapsed:false, expandedProjectIDs:[], defaultBoardPreset:"classic", activePresetByScope:{}, accounts:[], activeAccount:{}, accountChecks:{}, conversationSyncChecks:{}, theme:"auto", themePalette:"graphite", fontSize:"normal", inAppNotifications:"all", systemNotificationsEnabled:true, notificationWhen:"background", notificationEvents:defaultNotificationEvents(), utilityPanelOpen:false, utilityPanelWidth:390, utilityTab:"chat", utilityAgent:"codex", utilitySpaceID:"", utilityCustomPath:"", ...(data.settings || {}) };
    if(!["chat","terminal","files"].includes(data.settings.utilityTab)){data.settings.utilityTab="chat";changed=true;}
    if(!["codex","claude-code"].includes(data.settings.utilityAgent)){data.settings.utilityAgent="codex";changed=true;}
    if("utilityMode" in data.settings){delete data.settings.utilityMode;changed=true;}
    if(typeof data.settings.utilityPanelOpen!=="boolean"){data.settings.utilityPanelOpen=false;changed=true;}
    if(![0,1,7,14,30,60,90].includes(Number(data.settings.autoArchiveCompletedDays))){data.settings.autoArchiveCompletedDays=0;changed=true;}else data.settings.autoArchiveCompletedDays=Number(data.settings.autoArchiveCompletedDays);
    data.settings.activePresetByScope ||= {};
    if(!["board","flow"].includes(data.settings.surfaceMode)){data.settings.surfaceMode="board";changed=true;}
    const storedTheme=normalizeTheme(data.settings.theme);if(data.settings.theme!==storedTheme){data.settings.theme=storedTheme;changed=true;}
    const storedPalette=normalizeThemePalette(data.settings.themePalette);if(data.settings.themePalette!==storedPalette){data.settings.themePalette=storedPalette;changed=true;}
    const storedFontSize=normalizeFontSize(data.settings.fontSize);if(data.settings.fontSize!==storedFontSize){data.settings.fontSize=storedFontSize;changed=true;}
    const storedLanguage=normalizeLanguage(data.settings.language);if(data.settings.language!==storedLanguage){data.settings.language=storedLanguage;changed=true;}
    // « defaultModel » ne connaissait que Codex : on le reprend comme modele Codex
    // et on donne a Claude le sien, sans perdre le choix precedent.
    if(!data.settings.defaultModelCodex){data.settings.defaultModelCodex=data.settings.defaultModel||"gpt-5.6-sol";changed=true;}
    if(!data.settings.defaultModelClaude){data.settings.defaultModelClaude="sonnet";changed=true;}
    if(!effortValues.includes(data.settings.defaultEffortCodex)){data.settings.defaultEffortCodex=normalizeEffort(data.settings.defaultEffort);changed=true;}
    if(!effortValues.includes(data.settings.defaultEffortClaude)){data.settings.defaultEffortClaude=normalizeEffort(data.settings.defaultEffort);changed=true;}
    const codexConcurrency=normalizeConcurrency(data.settings.maxConcurrencyCodex??data.settings.maxConcurrency),claudeConcurrency=normalizeConcurrency(data.settings.maxConcurrencyClaude??1);
    if(data.settings.maxConcurrencyCodex!==codexConcurrency){data.settings.maxConcurrencyCodex=codexConcurrency;changed=true;}
    if(data.settings.maxConcurrencyClaude!==claudeConcurrency){data.settings.maxConcurrencyClaude=claudeConcurrency;changed=true;}
    // Cles historiques conservees pour une ancienne version de l application.
    data.settings.defaultEffort=data.settings.defaultEffortCodex;
    data.settings.maxConcurrency=data.settings.maxConcurrencyCodex;
    if(!data.settings.defaultAgentEngine){data.settings.defaultAgentEngine="codex";changed=true;}
    if(!Array.isArray(data.settings.accounts)){data.settings.accounts=[];changed=true;}
    // La couche ACP a ete retiree : on efface sa configuration et on ramene les
    // cartes qui la visaient sur un moteur encore disponible.
    if(data.settings.acpAgents!==undefined){delete data.settings.acpAgents;changed=true;}
    for(const card of data.cards||[])
      if(String(card.agentEngine||"").startsWith("acp:")){card.agentEngine="codex";card.model="";changed=true;}
    if(!data.settings.activeAccount||typeof data.settings.activeAccount!=="object"){data.settings.activeAccount={};changed=true;}
    if(!data.settings.accountChecks||typeof data.settings.accountChecks!=="object"||Array.isArray(data.settings.accountChecks)){data.settings.accountChecks={};changed=true;}
    const validAccountIDs=new Set(["codex:default","claude-code:default",...data.settings.accounts.map(account=>account.id)]);
    const cleanAccountChecks={};
    for(const [id,check] of Object.entries(data.settings.accountChecks)){
      if(!validAccountIDs.has(id)||!check||!['ready','blocked','missing','login'].includes(check.state))continue;
      const engine=engineKey(check.engine||id.split(':')[0]);
      cleanAccountChecks[id]={engine,account:id,state:check.state,at:String(check.at||""),detail:check.state==="ready"?"":technicalFailure(check.detail)?friendlyAgentError(check.detail,engine):String(check.detail||"").slice(0,500)};
    }
    if(JSON.stringify(cleanAccountChecks)!==JSON.stringify(data.settings.accountChecks)){data.settings.accountChecks=cleanAccountChecks;changed=true;}
    if(!data.settings.conversationSyncChecks||typeof data.settings.conversationSyncChecks!=="object"||Array.isArray(data.settings.conversationSyncChecks)){data.settings.conversationSyncChecks={};changed=true;}
    const cleanSyncChecks={};
    for(const engine of ["codex","claude-code"]){const check=data.settings.conversationSyncChecks[engine];if(!check||!["success","partial","error","empty"].includes(check.phase))continue;const rawMessage=String(check.message||"").slice(0,500),message=check.phase==="error"&&technicalFailure(rawMessage)?friendlyAgentError(rawMessage,engine):rawMessage;cleanSyncChecks[engine]={phase:check.phase,completed:Math.max(0,Number(check.completed)||0),total:Math.max(0,Number(check.total)||0),failed:Math.max(0,Number(check.failed)||0),durationMs:Math.max(0,Number(check.durationMs)||0),lastAt:String(check.lastAt||""),message};}
    if(JSON.stringify(cleanSyncChecks)!==JSON.stringify(data.settings.conversationSyncChecks)){data.settings.conversationSyncChecks=cleanSyncChecks;changed=true;}
    const legacyNotifications=["all","background","none"].includes(storedSettings.notifications)?storedSettings.notifications:"all";
    if(typeof storedSettings.systemNotificationsEnabled!=="boolean"){data.settings.systemNotificationsEnabled=legacyNotifications!=="none";changed=true;}
    const storedNotificationWhen=normalizeNotificationWhen(typeof storedSettings.notificationWhen==="string"?storedSettings.notificationWhen:(legacyNotifications==="all"?"all":"background"));if(data.settings.notificationWhen!==storedNotificationWhen){data.settings.notificationWhen=storedNotificationWhen;changed=true;}
    const storedInAppNotifications=normalizeInAppNotifications(data.settings.inAppNotifications);if(data.settings.inAppNotifications!==storedInAppNotifications){data.settings.inAppNotifications=storedInAppNotifications;changed=true;}
    const storedNotificationEvents=normalizeNotificationEvents(data.settings.notificationEvents);if(JSON.stringify(data.settings.notificationEvents)!==JSON.stringify(storedNotificationEvents)){data.settings.notificationEvents=storedNotificationEvents;changed=true;}
    // Conservé pour une ouverture temporaire avec une version antérieure.
    data.settings.notifications=data.settings.systemNotificationsEnabled?data.settings.notificationWhen:"none";
    for(const [key,normalize] of [["syncIntervalSeconds",normalizeSyncInterval],["agendaMode",normalizeAgendaMode],["agendaTimeZone",normalizeAgendaTimeZone],["agendaWeekStart",normalizeAgendaWeekStart],["agendaHourCycle",normalizeAgendaHourCycle]]){
      const stored=normalize(data.settings[key]);
      if(data.settings[key]!==stored){data.settings[key]=stored;changed=true;}
    }
    const storedWidth=clampSidebarWidth(data.settings.sidebarWidth);if(data.settings.sidebarWidth!==storedWidth){data.settings.sidebarWidth=storedWidth;changed=true;}
    const storedUtilityWidth=clampUtilityPanelWidth(data.settings.utilityPanelWidth);if(data.settings.utilityPanelWidth!==storedUtilityWidth){data.settings.utilityPanelWidth=storedUtilityWidth;changed=true;}
    const legacyDefault=previousVersion<15?data.settings.activeColumnPresetID:data.settings.defaultBoardPreset;
    data.settings.defaultBoardPreset=normalizePresetID(legacyDefault);
    for(const [scope,id] of Object.entries(data.settings.activePresetByScope)){const normalized=normalizePresetID(id);if(normalized!==id){data.settings.activePresetByScope[scope]=normalized;changed=true;}}
    for(const legacyKey of ["activeColumnPresetID","enabledPresetsByScope","columnPresets"]){if(legacyKey in data.settings){delete data.settings[legacyKey];changed=true;}}
    if (!Array.isArray(data.settings.priorities) || !data.settings.priorities.length) { data.settings.priorities=defaultPriorities(); changed=true; }
    data.settings.priorities.forEach((priority,index)=>{priority.weight=index;priority.code=(priority.code||priority.name?.[0]||"P").toUpperCase().slice(0,3);priority.color=(priority.color||"6E75FF").replace("#","");});
    if (!Array.isArray(data.settings.taxonomy) || !data.settings.taxonomy.length) { data.settings.taxonomy=defaultTaxonomy(); changed=true; }
    if(typeof data.settings.utilityCustomPath!=="string"){data.settings.utilityCustomPath="";changed=true;}
    const validSpaceIDs=new Set(data.spaces.map(space=>space.id));if(data.settings.utilityCustomPath)validSpaceIDs.add("utility-custom");const expandedProjectIDs=[...new Set(Array.isArray(data.settings.expandedProjectIDs)?data.settings.expandedProjectIDs:[])].filter(id=>data.spaces.some(space=>space.id===id));
    if(JSON.stringify(expandedProjectIDs)!==JSON.stringify(data.settings.expandedProjectIDs)){data.settings.expandedProjectIDs=expandedProjectIDs;changed=true;}
    for(const space of data.spaces){if(typeof space.pinned!=="boolean"){space.pinned=false;changed=true;}}
    for (const card of data.cards) {
      card.priority ||= "normal"; card.priorityLevelID ||= card.priority; card.runMode ||= "readOnly"; card.labels ||= []; card.subtasks ||= []; card.dependencies ||= []; card.conversations ||= [];
      const storedTaskNotification=normalizeTaskNotification(card.notificationMode);if(card.notificationMode!==storedTaskNotification){card.notificationMode=storedTaskNotification;changed=true;}
      card.agentEngine ||= "codex"; card.model ||= data.settings.defaultModel; card.reasoningEffort ||= defaultEffortFor(card.agentEngine); card.columnAssignments ||= {};
      for(const conversation of card.conversations){if(!conversation.engine){conversation.engine=normalizeEngine(card.agentEngine);changed=true;}if(!conversation.accountID){const key=engineKey(conversation.engine),chosen=data.settings.activeAccount[key];conversation.accountID=validAccountIDs.has(chosen)?chosen:`${key}:default`;changed=true;}if(technicalFailure(conversation.preview)){conversation.preview=friendlyAgentError(conversation.preview,conversation.engine);changed=true;}if(Array.isArray(conversation.messages))conversation.messages=conversation.messages.map(message=>{if(!message?.error&&!technicalFailure(message?.text))return message;const text=friendlyAgentError(message?.text,conversation.engine);if(text!==message?.text)changed=true;return {...message,text,error:true}});}
      if (!data.settings.priorities.some(p=>p.id===card.priorityLevelID)) card.priorityLevelID=data.settings.priorities.find(p=>p.id==="normal")?.id||data.settings.priorities[0].id;
      card.categoryAssignments ||= {};
      card.recurrence ||= "none"; card.recurrenceSource ||= "board";
      if(card.recurrence!=="none"&&card.recurrenceSource!=="codex"&&!card.recurrenceSeriesID){card.recurrenceSeriesID=uid();changed=true;}
      if(!["","pausing","paused"].includes(card.executionState)){card.executionState="";changed=true;}
      if(card.executionState==="pausing"){card.executionState="paused";card.pausedAt=card.pausedAt||now();changed=true;}
      if(card.executionState==="paused"&&card.status!=="running"){card.status="running";changed=true;}
      if(!Number.isFinite(Number(card.durationMinutes))||Number(card.durationMinutes)<15){card.durationMinutes=60;changed=true}else card.durationMinutes=Math.min(480,Math.round(Number(card.durationMinutes)/15)*15);
      if (!card.launchMode) { card.launchMode=card.recurrenceSource==="codex"?"codex":"manual"; changed=true; }
      if(!["classic","routines"].includes(card.boardPresetID)){card.boardPresetID=card.launchMode==="scheduled"||card.launchMode==="codex"||card.recurrence!=="none"?"routines":"classic";changed=true;}
      card.missedRunPolicy ||= "catchUp";
      if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(card.scheduledAt||"")){const instant=agendaWallToInstant(card.scheduledAt);if(instant){card.scheduledAt=instant;changed=true;}}
      if (card.launchMode==="scheduled" && card.scheduledAt && !card.scheduleState) { card.scheduleState="pending"; changed=true; }
      if (card.conversationID && !card.conversations.some(c => c.id === card.conversationID)) {
        card.conversations.push({ id:card.conversationID, name:card.conversationName || card.title, preview:card.conversationPreview || "", cwd:card.conversationCwd || "", role:"main", addedAt:now() }); changed = true;
      }
      if (!card.activeConversationID && card.conversations.length) { card.activeConversationID = card.conversationID || card.conversations[0].id; changed = true; }
      syncLegacyConversationFields(card);
      if (card.status === "queued") { card.status = "ready"; if(card.launchMode==="scheduled")card.scheduleState="pending"; card.lastRun = { ...(card.lastRun||{}), summary:card.launchMode==="scheduled"?"File interrompue. La programmation sera reprise.":"File interrompue par la fermeture de l’application. Relance manuelle requise." }; changed = true; }
      if (card.status === "running" && !card.conversationID && card.executionState!=="paused") { card.status = "needsInput"; if(card.launchMode==="scheduled")card.scheduleState="failed"; changed = true; }
      if (card.status === "done" && !card.completedAt) { card.completedAt=card.lastRun?.finishedAt||card.updatedAt||card.createdAt||now(); changed=true; }
      if(card.archived&&!card.archivedAt){card.archivedAt=card.updatedAt||card.completedAt||now();changed=true;}
      if(card.lastRun?.summary&&technicalFailure(card.lastRun.summary)){card.lastRun.summary=friendlyAgentError(card.lastRun.summary,card.agentEngine);changed=true;}
    }
    for(const template of data.templates||[]){if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(template.scheduledAt||"")){const instant=agendaWallToInstant(template.scheduledAt);if(instant){template.scheduledAt=instant;changed=true;}}}
    const seenUtilityChats=new Set();
    data.utilityChats=data.utilityChats.filter(chat=>{
      if(!chat||typeof chat!=="object"||!validSpaceIDs.has(chat.spaceID))return changed=true,false;
      const engine=normalizeEngine(chat.agentEngine),key=`${chat.spaceID}:${engine}`;
      if(seenUtilityChats.has(key))return changed=true,false;
      seenUtilityChats.add(key);chat.utilityChat=true;chat.agentEngine=engine;chat.id=chat.id||`utility-chat-${chat.spaceID}-${engine}`;
      chat.title=chat.title||`${engineLabel(engine)} · ${getSpace(chat.spaceID)?.name||t("Projet")}`;chat.prompt=chat.prompt||"";chat.status=cardIsBusy(chat)?chat.status||"running":"ready";
      if(chat.runMode!=="workspaceWrite"){chat.runMode="workspaceWrite";changed=true;}chat.model=chat.model||defaultModelFor(engine);chat.reasoningEffort=normalizeEffort(chat.reasoningEffort||defaultEffortFor(engine));
      chat.conversations=Array.isArray(chat.conversations)?chat.conversations:[];
      for(const conversation of chat.conversations){if(!conversation.engine){conversation.engine=engine;changed=true;}if(!conversation.accountID){const chosen=data.settings.activeAccount[engine];conversation.accountID=validAccountIDs.has(chosen)?chosen:`${engine}:default`;changed=true;}conversation.messages=Array.isArray(conversation.messages)?conversation.messages.slice(-120).map(message=>{if(!message?.error&&!technicalFailure(message?.text))return message;const text=friendlyUtilityError(message?.text,engine);if(text!==message?.text)changed=true;return {...message,text,error:true}}):[];if(technicalFailure(conversation.preview)){conversation.preview=friendlyUtilityError(conversation.preview,engine);changed=true;}const firstUser=conversation.messages.find(message=>message.role==="user")?.text;if(firstUser&&/^Chat (Codex|Claude Code) ·/i.test(String(conversation.name||""))){conversation.name=utilityConversationTitle(firstUser,[],engine);changed=true;}}
      chat.messages=Array.isArray(chat.messages)?chat.messages.slice(-120).map(message=>{const text=message?.error||technicalFailure(message?.text)?friendlyUtilityError(message?.text,engine):String(message?.text||"");if(text!==message?.text)changed=true;return {...message,text,attachments:Array.isArray(message?.attachments)?message.attachments.map(normalizeUtilityAttachment).filter(Boolean).slice(0,utilityAttachmentLimit):[]}}):[];
      if(chat.lastRun?.summary&&technicalFailure(chat.lastRun.summary)){chat.lastRun.summary=friendlyUtilityError(chat.lastRun.summary,engine);changed=true;}
      chat.createdAt=chat.createdAt||now();chat.updatedAt=chat.updatedAt||chat.createdAt;
      if(chat.utilityNewConversation){delete chat.activeConversationID;delete chat.conversationID;delete chat.conversationName;delete chat.conversationPreview;delete chat.conversationCwd;}else{syncLegacyConversationFields(chat);const current=activeConversation(chat);if(current&&!current.messages.length&&chat.messages.length)current.messages=structuredClone(chat.messages);}
      return true;
    });
    if(data.settings.utilitySpaceID&&!validSpaceIDs.has(data.settings.utilitySpaceID)){data.settings.utilitySpaceID="";changed=true;}
    for(const validation of data.validations){
      validation.agentEngine ||= "codex"; validation.kind ||= "command"; validation.requestedAt ||= validation.createdAt||now();
      if(validation.status==="pending"){validation.status="interrupted";validation.decidedAt=now();validation.note="L’application a été relancée avant la réponse. Relance la carte pour obtenir une nouvelle demande.";changed=true;}
    }
    if(data.validations.length>200){data.validations=data.validations.slice(-200);changed=true;}
    const counters={};
    for(const card of data.cards){const key=`${card.spaceID}:${card.priorityLevelID}`;if(!Number.isInteger(Number(card.priorityNumber))||Number(card.priorityNumber)<1){counters[key]=(counters[key]||0)+1;card.priorityNumber=counters[key];changed=true}else counters[key]=Math.max(counters[key]||0,Number(card.priorityNumber));}
    return changed;
  }

  const priorities = () => board.settings.priorities || defaultPriorities();
  const priorityByID = id => priorities().find(p=>p.id===id) || priorities()[0];
  const taxonomy = () => board.settings.taxonomy || [];
  const dimensionByID = id => taxonomy().find(d=>d.id===id);
  const taxonomyValue = (dimensionID,valueID) => dimensionByID(dimensionID)?.values?.find(v=>v.id===valueID);
  const assignedValues = card => taxonomy().flatMap(d=>(card.categoryAssignments?.[d.id]||[]).map(id=>({dimension:d,value:taxonomyValue(d.id,id)})).filter(x=>x.value));
  const nextPriorityNumber = (spaceID,priorityLevelID,excludeID="") => Math.max(0,...board.cards.filter(c=>c.id!==excludeID&&c.spaceID===spaceID&&c.priorityLevelID===priorityLevelID).map(c=>Number(c.priorityNumber)||0))+1;
  const cardReference = card => {const p=priorityByID(card.priorityLevelID);return `${p.code}-${String(card.priorityNumber||0).padStart(2,"0")}`};
  const scheduleTime = value => value ? new Date(value).getTime() : NaN;
  const formatSchedule = value => {
    if(!value)return "";const date=agendaDateFromValue(value);if(Number.isNaN(date.getTime()))return "";
    return new Intl.DateTimeFormat(locale(),{timeZone:agendaTimeZone(),day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:agendaHour12()}).format(date);
  };
  const parseLocalDate = value => { const [year,month,day]=String(value||today()).slice(0,10).split("-").map(Number); return new Date(year,Math.max(0,(month||1)-1),day||1); };
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const addDays = (date,amount) => { const copy=new Date(date);copy.setDate(copy.getDate()+amount);return copy; };
  const startOfWeek = date => { const copy=new Date(date);copy.setHours(0,0,0,0);copy.setDate(copy.getDate()-((copy.getDay()-agendaFirstDay()+7)%7));return copy; };
  const startOfMonth = date => new Date(date.getFullYear(),date.getMonth(),1);
  const agendaDateOnly = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value||""));
  const agendaZonedParts = (value,zone=agendaTimeZone()) => {
    const date=value instanceof Date?value:new Date(value);if(Number.isNaN(date.getTime()))return null;
    const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date).filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));
    return {year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),hour:Number(parts.hour),minute:Number(parts.minute),second:Number(parts.second)};
  };
  const agendaDateFromValue = value => agendaDateOnly(value)?parseLocalDate(value):new Date(value);
  const agendaDateKeyFromValue = value => {
    if(agendaDateOnly(value))return String(value);const parts=agendaZonedParts(value);return parts?`${parts.year}-${String(parts.month).padStart(2,"0")}-${String(parts.day).padStart(2,"0")}`:"";
  };
  const agendaWallValue = value => {
    if(!value)return "";if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return value;
    const parts=agendaZonedParts(value);return parts?`${parts.year}-${String(parts.month).padStart(2,"0")}-${String(parts.day).padStart(2,"0")}T${String(parts.hour).padStart(2,"0")}:${String(parts.minute).padStart(2,"0")}`:"";
  };
  const agendaWallToInstant = value => {
    const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);if(!match)return "";
    const [,year,month,day,hour,minute]=match.map(Number),target=Date.UTC(year,month-1,day,hour,minute,0);let guess=target;
    for(let pass=0;pass<6;pass++){const parts=agendaZonedParts(new Date(guess));if(!parts)return "";const shown=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,0),delta=target-shown;if(!delta)break;guess+=delta;}
    const parts=agendaZonedParts(new Date(guess));
    if(!parts||parts.year!==year||parts.month!==month||parts.day!==day||parts.hour!==hour||parts.minute!==minute)return "";
    return new Date(guess).toISOString();
  };
  const agendaTime = value => { if(!value||agendaDateOnly(value))return "";const date=new Date(value);return Number.isNaN(date.getTime())?"":new Intl.DateTimeFormat(locale(),{timeZone:agendaTimeZone(),hour:"numeric",minute:"2-digit",hour12:agendaHour12()}).format(date); };
  const agendaMinuteOfDay = value => { const parts=agendaZonedParts(value);return parts?parts.hour*60+parts.minute:0; };
  const agendaClockLabel = (hour,minute=0) => new Intl.DateTimeFormat(locale(),{timeZone:"UTC",hour:"numeric",minute:"2-digit",hour12:agendaHour12()}).format(new Date(Date.UTC(2024,0,1,hour,minute)));
  const agendaDayLabel = date => date.toLocaleDateString(locale(),{weekday:"short",day:"numeric",month:"short"}).replace(".","");
  const agendaLongDayLabel = date => date.toLocaleDateString(locale(),{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const quotaError = message => /rate.?limit|usage.?limit|quota|too many requests|credits? exhausted|limite d.utilisation/i.test(message||"");
  const scheduleEligible = card => card.launchMode==="scheduled" && card.scheduledAt && !card.archived && ["backlog","ready"].includes(card.status) && !["launched","completed","paused","skipped","failed"].includes(card.scheduleState);

  function schedulerTick() {
    if (!board?.cards?.length) return;
    const current=Date.now(); let changed=applyAutoArchiveCompleted()>0, queued=false;
    for (const card of board.cards) {
      if (!scheduleEligible(card) || activeRuns.has(card.id) || queuePositions.has(card.id)) continue;
      const trigger=card.scheduleNextAttemptAt||card.scheduledAt, triggerTime=scheduleTime(trigger);
      if (!Number.isFinite(triggerTime) || triggerTime>current) continue;
      if (card.missedRunPolicy==="skip" && !card.scheduleNextAttemptAt && current-triggerTime>15*60*1000) { card.scheduleState="skipped";card.scheduleNote="Créneau dépassé de plus de 15 minutes.";card.updatedAt=now();changed=true;continue; }
      if (dependencyOpen(card)) { if(card.scheduleState!=="waitingDependency"){card.scheduleState="waitingDependency";card.scheduleNote="En attente des dépendances.";card.updatedAt=now();changed=true}continue; }
      card.scheduleState="queued";card.scheduleTriggeredAt=now();card.scheduleNextAttemptAt="";
      // queueCard refuse une carte incomplete : brief vide, projet disparu,
      // agent inconnu. Sans etat terminal la carte reste eligible, donc le
      // planificateur la represente toutes les 30 secondes et alerte sans fin
      // pendant que rien ne part.
      if(queueCard(card,{scheduled:true}))queued=true;
      else{card.scheduleState="failed";card.scheduleNote="Lancement impossible en l’état. Corrige la tâche, puis relance la programmation.";card.updatedAt=now();changed=true}
    }
    if(changed&&!queued){save();render()}
  }

  function prepareImportedBoard(restored) {
    const safe=structuredClone(restored),settings=safe.settings&&typeof safe.settings==="object"?safe.settings:(safe.settings={});let changed=settings.backgroundSchedulerEnabled!==false;
    settings.backgroundSchedulerEnabled=false;
    for(const card of safe.cards||[]){
      if(["queued","running"].includes(card.status)){card.status="ready";changed=true}
      if(card.executionState||card.pausedAt){delete card.executionState;delete card.pausedAt;changed=true}
      if(card.launchMode==="scheduled"&&!card.archived&&card.status!=="done"){
        if(card.scheduleState!=="paused"||card.scheduleNextAttemptAt||card.scheduleTriggeredAt||Number(card.scheduleAttempts||0)!==0)changed=true;
        card.scheduleState="paused";card.scheduleNextAttemptAt="";card.scheduleTriggeredAt="";card.scheduleAttempts=0;card.scheduleNote=t("Programmation suspendue après restauration. Reprends-la quand tu l’as vérifiée.");
      }
    }
    for(const chat of safe.utilityChats||[]){if(["queued","running"].includes(chat.status)){chat.status="ready";changed=true}if(chat.executionState){delete chat.executionState;changed=true}}
    return {board:safe,changed};
  }

  function syncLegacyConversationFields(card) {
    const current = activeConversation(card);
    if (current) {
      card.activeConversationID = current.id; card.conversationID = current.id; card.conversationName = current.name || card.title;
      card.conversationPreview = current.preview || ""; card.conversationCwd = current.cwd || "";
    } else {
      delete card.activeConversationID; delete card.conversationID; delete card.conversationName; delete card.conversationPreview; delete card.conversationCwd;
    }
  }

  function save() { for(const card of board.cards||[])if(!Number.isFinite(Number(card.durationMinutes))||Number(card.durationMinutes)<15)card.durationMinutes=60;board.modifiedAt = now(); bridge({action:"save",data:board}); }
  function archiveCard(card,reason="manual"){
    if(!card||card.status!=="done"||card.archived)return false;
    card.archived=true;card.archivedAt=now();card.archiveReason=reason;card.updatedAt=now();return true;
  }
  function restoreArchivedCard(card){if(!card||!card.archived)return false;card.archived=false;delete card.archivedAt;delete card.archiveReason;card.updatedAt=now();return true;}
  function archiveCards(cards,reason="manual"){
    let count=0;for(const card of cards)if(archiveCard(card,reason))count+=1;return count;
  }
  function applyAutoArchiveCompleted(){
    const days=Number(board.settings?.autoArchiveCompletedDays||0);if(days<=0)return 0;
    const cutoff=Date.now()-days*86400000;
    return archiveCards((board.cards||[]).filter(card=>card.status==="done"&&!card.archived&&Date.parse(card.completedAt||card.lastRun?.finishedAt||card.updatedAt||card.createdAt)<=cutoff),"automatic");
  }
  let accessibleFieldID=0;
  function linkFieldLabels(root=document){
    root.querySelectorAll?.(".field").forEach(field=>{const label=field.querySelector("label"),control=field.querySelector("input,select,textarea");if(!label||!control)return;control.id||=`ctrl-kanb-field-${++accessibleFieldID}`;if(!label.htmlFor)label.htmlFor=control.id;});
  }
  function render() { document.querySelector("#app").classList.toggle("sidebar-collapsed",Boolean(board.settings.sidebarCollapsed)); document.querySelector("#app").classList.toggle("settings-mode",selection==="settingsView"); renderSidebar(); renderHeader(); renderBoard(); enhanceWorkspace(); renderUtilityPanel(); renderSyncStatus(); syncConversationPanel(); linkFieldLabels(); }

  const validations = () => board.validations || (board.validations=[]);
  const getValidation = id => validations().find(validation=>validation.id===id);
  const pendingValidations = () => validations().filter(validation=>validation.status==="pending" && getCard(validation.cardID));
  const validationAttentionCount = () => pendingValidations().length;
  const engineLabel = value => esc({codex:"Codex",claudeCode:"Claude Code","claude-code":"Claude Code"}[value]||value||t("Agent IA"));
  const engineLogo = value => {
    const claude=engineKey(value)==="claude-code";
    return `<img class="engine-logo ${claude?"claude-code-logo":"codex-logo"}" src="Brands/${claude?"Claude-Code":"Codex-light"}.png" alt="" aria-hidden="true">`;
  };
  const accessLabel = value => value==="workspaceWrite"?t("Modifications autorisées"):t("Sans modification");
  // Codex et Claude ont des limites separees : deux cartes peuvent donc etre
  // « n°1 » en meme temps, chacune dans la file de son moteur. Le libelle nomme
  // la file pour que la place annoncee reste comprehensible.
  const queueLabel = card => {
    const place = queuePositions.get(card.id);
    if(queueReasons.get(card.id)==="conversation")return isClaude(card)?t("Même session Claude en attente"):t("Même conversation Codex en attente");
    return place ? t("File {moteur} n°{place}", {moteur:engineLabel(card.agentEngine), place}) : "";
  };

  const approvalModeLabel = value => value==="autoReview"?"Examen automatique":"Validation manuelle";
  const validationKindLabel = kind => ({command:"Commande système",file:"Modification de fichiers",input:"Question de l’agent"}[kind]||"Autorisation");
  const validationKindIcon = kind => kind===t("file")?t("file"):kind==="input"?t("question"):"terminal";
  const validationStatusLabel = status => ({accepted:"Autorisée une fois",acceptedForSession:"Autorisée pour la session",declined:"Refusée",answered:"Réponse envoyée",resolved:"Résolue",interrupted:"Interrompue"}[status]||status);
  const validationTime = value => {const date=new Date(value);return Number.isNaN(date.getTime())?"":date.toLocaleString(locale(),{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});};
  function validationProjectPath(value,cwd=""){
    const path=String(value||"").trim(),root=String(cwd||"").replace(/\/$/,"");
    if(!path)return "";
    return root&&path.startsWith(`${root}/`)?path.slice(root.length+1):path;
  }
  function validationDetail(validation){
    const params=validation.params||{};
    if(validation.kind==="input")return (params.questions||[]).map(question=>question.question||question.header).filter(Boolean).join(" · ")||"L’agent attend une information pour continuer.";
    const input=params.input&&typeof params.input==="object"?params.input:{},tool=String(params.tool||"").trim();
    const path=validationProjectPath(input.file_path||input.path||params.path||params.filePath,params.cwd);
    if(validation.kind==="file"){
      if(path)return t("Créer ou modifier « {path} »",{path});
      return t("Modifier des fichiers dans le dossier du projet.");
    }
    const inputCommand=Array.isArray(input.command)?input.command.join(" "):input.command;
    if(inputCommand)return String(inputCommand);
    if(tool&&path)return `${tool} · ${path}`;
    if(tool)return t("Utiliser l’outil {tool}",{tool});
    const command=Array.isArray(params.command)?params.command.join(" "):params.command;
    if(command)return String(command);
    if(params.reason)return String(params.reason);
    if(path)return path;
    return t("Cette action dépasse les autorisations déjà accordées à la tâche.");
  }
  function registerValidation(payload){
    const card=getCard(payload.cardID);if(!card)return;
    let validation=validations().find(item=>item.cardID===payload.cardID&&String(item.requestID)===String(payload.requestID));
    const conversation=activeConversation(card);
    const values={requestID:payload.requestID,cardID:card.id,spaceID:card.spaceID,agentEngine:payload.agentEngine||card.agentEngine||"codex",kind:payload.kind||"command",status:"pending",params:payload.params||{},requestedAt:now(),accessMode:payload.mode||card.lastRun?.accessMode||card.runMode||"readOnly",approvalMode:payload.autoApprove||card.lastRun?.approvalMode==="autoReview"?"autoReview":"manual",model:card.model||defaultModelFor(card.agentEngine),reasoningEffort:card.reasoningEffort||defaultEffortFor(card.agentEngine),threadID:payload.threadID||conversation?.id||""};
    if(validation)Object.assign(validation,values);else{validation={id:uid(),...values};validations().push(validation);}
    if(validations().length>200)board.validations=validations().slice(-200);
    card.status="needsInput";card.updatedAt=now();save();
    if(selection!=="reviewView"){if(!specialViews[selection])lastWorkspaceSelection=selection;selection="reviewView";}
    render();toast(validation.kind==="input"?`${engineLabel(validation.agentEngine)} attend une réponse`:`Autorisation requise pour « ${card.title} »`,false,"essential");
  }
  function resolveValidation(cardID,requestID=null){
    const pending=validations().filter(item=>item.cardID===cardID&&item.status==="pending"&&(requestID===null||String(item.requestID)===String(requestID))).sort((a,b)=>String(b.requestedAt).localeCompare(String(a.requestedAt)))[0];
    if(pending){pending.status="resolved";pending.decidedAt=now();}
    const card=getCard(cardID);if(card&&activeRuns.has(cardID))card.status="running";
    save();render();
  }

  function baseVisibleCards() {
    const includeArchivedHistory=selection==="doneView",includeArchivedAgenda=selection==="agendaView";
    let cards = board.cards.filter(card => !card.archived||includeArchivedHistory&&card.status==="done"||includeArchivedAgenda&&card.status==="done");
    if (selection === "reviewView") cards = cards.filter(card => card.status === "review");
    else if (selection === "doneView") cards = cards.filter(card => card.status === "done");
    else if (selection.startsWith("taxonomy:")) { const [,dimensionID,valueID]=selection.split(":"); cards=cards.filter(card=>(card.categoryAssignments?.[dimensionID]||[]).includes(valueID)); }
    else if (selection !== "global" && !specialViews[selection]) cards = cards.filter(card => card.spaceID === selection);
    if (labelFilter) cards = cards.filter(card => card.labels?.includes(labelFilter));
    if (taxonomyFilter) { const [dimensionID,valueID]=taxonomyFilter.split(":"); cards=cards.filter(card=>(card.categoryAssignments?.[dimensionID]||[]).includes(valueID)); }
    if (priorityFilter) cards=cards.filter(card=>card.priorityLevelID===priorityFilter);
    return cards;
  }
  const followUpCards = (cards=board.cards) => cards.filter(card=>!card.archived&&(card.status==="review"||card.status==="done"||cardExecutionFailed(card))&&(card.lastRun?.summary||card.lastRun?.finishedAt||activeConversation(card))).sort((a,b)=>String(b.completedAt||b.lastRun?.finishedAt||b.updatedAt||"").localeCompare(String(a.completedAt||a.lastRun?.finishedAt||a.updatedAt||"")));

  function moveSpaceRelative(spaceID,direction){
    const space=getSpace(spaceID);if(!space)return;
    const group=orderedSpaces().filter(item=>Boolean(item.pinned)===Boolean(space.pinned)),index=group.findIndex(item=>item.id===spaceID),target=group[index+direction];
    if(!target)return;
    const sourceIndex=board.spaces.findIndex(item=>item.id===space.id),targetIndex=board.spaces.findIndex(item=>item.id===target.id);
    [board.spaces[sourceIndex],board.spaces[targetIndex]]=[board.spaces[targetIndex],board.spaces[sourceIndex]];save();renderSidebar();
  }
  function reorderSpace(spaceID,targetID,after=false){
    const space=getSpace(spaceID),target=getSpace(targetID);if(!space||!target||space.id===target.id)return;
    if(Boolean(space.pinned)!==Boolean(target.pinned)){toast("Épingle ou désépingle d’abord le projet pour changer de groupe.",true);return;}
    const sourceIndex=board.spaces.findIndex(item=>item.id===space.id);board.spaces.splice(sourceIndex,1);
    let targetIndex=board.spaces.findIndex(item=>item.id===target.id);if(after)targetIndex+=1;
    board.spaces.splice(targetIndex,0,space);save();renderSidebar();toast("Ordre des projets mis à jour");
  }

  const projectIsExpanded=spaceID=>(board.settings.expandedProjectIDs||[]).includes(spaceID);
  function setProjectExpanded(spaceID,expanded){
    const ids=new Set(board.settings.expandedProjectIDs||[]),had=ids.has(spaceID);
    if(expanded)ids.add(spaceID);else ids.delete(spaceID);
    board.settings.expandedProjectIDs=[...ids].filter(id=>getSpace(id));
    return had!==expanded;
  }

  function renderSidebar() {
    const live = board.cards.filter(c => !c.archived), count = cards => cards.filter(c => c.status !== "done").length;
    const objective=taxonomy().find(d=>d.kind==="objective"), objectiveValues=(objective?.values||[]).filter(v=>!v.archived);
    const ordered=orderedSpaces(),pinnedSpaces=ordered.filter(space=>space.pinned),unpinnedSpaces=ordered.filter(space=>!space.pinned);
    const keepVisible=new Set([selection,projectMenuID].filter(Boolean));
    const shownUnpinned=board.settings.sidebarCollapsed||projectsExpanded?unpinnedSpaces:unpinnedSpaces.filter((space,index)=>index<projectListLimit||keepVisible.has(space.id));
    const hiddenProjectCount=Math.max(0,unpinnedSpaces.length-shownUnpinned.length),showProjectToggle=!board.settings.sidebarCollapsed&&unpinnedSpaces.length>projectListLimit;
    const projectRow=space=>{
      const group=ordered.filter(item=>Boolean(item.pinned)===Boolean(space.pinned)),groupIndex=group.findIndex(item=>item.id===space.id),expanded=projectIsExpanded(space.id);
      const tasks=live.filter(card=>card.spaceID===space.id).sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))||String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||""))),pinnedTasks=tasks.filter(card=>card.pinned),unpinnedTasks=tasks.filter(card=>!card.pinned),showAllTasks=projectTaskLimits.get(space.id)===Infinity;
      const visibleTasks=showAllTasks?tasks:[...pinnedTasks,...unpinnedTasks.slice(0,projectTaskPageSize)],remaining=Math.max(0,unpinnedTasks.length-projectTaskPageSize);
      const taskToggle=remaining?`<button class="project-task-more" data-action="show-more-project-tasks" data-id="${esc(space.id)}">${showAllTasks?`${icon("up")}<span>${t("Réduire la liste")}</span>`:`${icon("down")}<span>${t("Afficher {n} de plus",{n:remaining})}</span>`}</button>`:"";
      const taskList=expanded?`<div class="project-task-list" aria-label="${t("Tâches de {name}",{name:esc(space.name)})}">${visibleTasks.length?visibleTasks.map(card=>`<div class="project-task-row ${card.pinned?"pinned":""}"><button class="project-task-nav status-${esc(card.status)}" data-action="open-sidebar-task" data-id="${esc(card.id)}" title="${esc(card.title)} — ${esc(statusLabel(card.status))}"><span class="project-task-state"></span><span>${esc(card.title)}</span></button><div class="project-task-actions">${card.status==="done"?`<button class="project-task-archive" data-action="archive-card" data-id="${esc(card.id)}" title="${t("Archiver la tâche")}" aria-label="${t("Archiver la tâche")}">${icon("archive")}</button>`:""}<button class="project-task-pin ${card.pinned?"pinned":""}" data-action="pin-card" data-id="${esc(card.id)}" title="${t(card.pinned?"Désépingler la tâche":"Épingler la tâche")}" aria-label="${t(card.pinned?"Désépingler la tâche":"Épingler la tâche")}" aria-pressed="${Boolean(card.pinned)}">${icon("pin")}</button></div></div>`).join(""):`<span class="project-task-empty">${t("Aucune tâche dans ce projet")}</span>`}${taskToggle}</div>`:"";
      return `<div class="project-nav-group ${expanded?"expanded":""}"><div class="project-nav-row ${selection===space.id?"active":""} ${projectMenuID===space.id?"menu-open":""} ${expanded?"expanded":""}" draggable="true" data-project-row="${esc(space.id)}"><button class="project-disclosure" data-action="toggle-project" data-id="${esc(space.id)}" title="${expanded?t("Fermer {name}",{name:esc(space.name)}):t("Ouvrir {name}",{name:esc(space.name)})}" aria-label="${expanded?t("Fermer {name}",{name:esc(space.name)}):t("Ouvrir {name}",{name:esc(space.name)})}" aria-expanded="${expanded}">${icon(expanded?"down":"chevron")}</button><button class="nav-item project-nav-main ${selection === space.id ? "active" : ""}" data-select="${esc(space.id)}" data-project-select="${esc(space.id)}" title="${t("{name} — glisser pour réordonner",{name:esc(space.name)})}"><span class="nav-label">${esc(space.name)}</span></button><button class="project-menu-trigger" data-action="project-menu" data-id="${esc(space.id)}" title="${t("Options de {name}",{name:esc(space.name)})}" aria-label="${t("Options de {name}",{name:esc(space.name)})}" aria-expanded="${projectMenuID===space.id}">${icon("more")}</button>${projectMenuID===space.id?`<div class="project-context-menu"><div class="project-menu-heading"><span class="project-folder-icon" style="--project-color:#${safeHex(space.accentHex)}">${icon("folder")}</span><span><strong>${esc(space.name)}</strong><small>${count(live.filter(card=>card.spaceID===space.id))} tâche(s) active(s) · ${esc(space.rootPath)}</small></span></div><button data-action="edit-space" data-id="${esc(space.id)}">${icon("edit")}<span>${t("Modifier le projet")}</span></button><button data-action="reveal-space" data-id="${esc(space.id)}">${icon("finder")}<span>${t("Afficher dans le Finder")}</span></button><button data-action="toggle-pin-space" data-id="${esc(space.id)}">${icon("pin")}<span>${space.pinned?t("Désépingler"):t("Épingler en haut")}</span></button><div class="project-menu-divider"></div><button data-action="move-space-up" data-id="${esc(space.id)}" ${groupIndex<=0?"disabled":""}>${icon("up")}<span>Monter</span></button><button data-action="move-space-down" data-id="${esc(space.id)}" ${groupIndex<0||groupIndex>=group.length-1?"disabled":""}>${icon("down")}<span>Descendre</span></button><div class="project-menu-divider"></div><button class="menu-danger" data-action="delete-space" data-id="${esc(space.id)}">${icon("trash")}<span>${t("Supprimer le projet…")}</span></button></div>`:""}</div>${taskList}</div>`;
    };
    const projectListHTML=`${pinnedSpaces.map(projectRow).join("")}${pinnedSpaces.length&&shownUnpinned.length?'<div class="project-group-divider"><span>Autres projets</span></div>':""}${shownUnpinned.map(projectRow).join("")}${showProjectToggle?`<button class="projects-more" data-action="toggle-projects" aria-expanded="${projectsExpanded}">${icon(projectsExpanded?"up":"down")}<span>${projectsExpanded?"Réduire la liste":`Afficher ${hiddenProjectCount} projet${hiddenProjectCount>1?"s":""} de plus`}</span></button>`:""}`;
    const toggle=document.querySelector(".sidebar-toggle"),toggleLabel=board.settings.sidebarCollapsed?"Ouvrir le menu":"Replier le menu";toggle.innerHTML=icon(board.settings.sidebarCollapsed?"chevron":"menu");toggle.title=toggleLabel;toggle.setAttribute("aria-label",toggleLabel);
    if(selection==="settingsView"){document.querySelector("#sidebar-nav").innerHTML=settingsNavMarkup();return}
    document.querySelector("#sidebar-nav").innerHTML = `
      <div class="nav-title">${t("Vues")}</div>
      <button class="nav-item ${surfaceMode === "flow" && selection === "global" ? "active" : ""}" data-surface="flow" data-select="global" title="${t("Flux global")}">${navIcon("flow")}<span class="nav-label">${t("Flux")}</span><span class="count">${live.filter(c=>c.status!=="done").length}</span></button>
      <button class="nav-item ${surfaceMode === "board" && selection === "global" ? "active" : ""}" data-surface="board" data-select="global" title="${t("Tableau")}">${navIcon("board")}<span class="nav-label">${t("Tableau")}</span><span class="count">${count(cardsForPreset(live,presetIDForScope("global")))}</span></button>
      <button class="nav-item ${selection === "agendaView" ? "active" : ""}" data-select="agendaView" title="${t("Agenda")}">${navIcon("calendar")}<span class="nav-label">${t("Agenda")}</span><span class="count">${board.cards.filter(c=>c.status==="done"?Boolean(c.completedAt||c.lastRun?.finishedAt||c.updatedAt):!c.archived&&Boolean(c.scheduledAt||c.dueDate)).length}</span></button>
      <button class="nav-item ${selection === "reviewView" ? "active" : ""}" data-select="reviewView" title="${t("Centre de validations")}">${navIcon("shield")}<span class="nav-label">${t("Validations")}</span><span class="count ${pendingValidations().length?"attention":""}">${validationAttentionCount()}</span></button>
      <button class="nav-item ${selection === "followView" ? "active" : ""}" data-select="followView" title="${t("Suivi des résultats")}">${navIcon("eye")}<span class="nav-label">${t("Suivi")}</span><span class="count ${followUpCards(live).some(card=>card.status==="review"||cardExecutionFailed(card))?"attention":""}">${followUpCards(live).length}</span></button>
      <div class="nav-title">${t("Projets")}</div>
      ${projectListHTML}
      <button class="nav-item add-space" data-action="add-space" title="${t("Nouveau projet")}">${navIcon("plus")}<span class="nav-label">${t("Nouveau projet")}</span></button>
      ${objectiveValues.length?`<div class="nav-title">${esc(objective.name)}</div>${objectiveValues.map(value=>`<button class="nav-item ${selection===`taxonomy:${objective.id}:${value.id}`?"active":""}" data-select="taxonomy:${esc(objective.id)}:${esc(value.id)}" title="${esc(value.name)}"><i class="space-dot" style="background:#${safeHex(value.color)}"></i><span class="nav-label">${esc(value.name)}</span><span class="count">${count(live.filter(c=>(c.categoryAssignments?.[objective.id]||[]).includes(value.id)))}</span></button>`).join("")}`:""}
      <div class="nav-title">${t("Système")}</div>
      <button class="nav-item ${selection === "doneView" ? "active" : ""}" data-select="doneView" title="${t("Historique")}">${navIcon("history")}<span class="nav-label">${t("Historique")}</span><span class="count">${board.cards.filter(c=>c.status==="done").length}</span></button>
      <div class="nav-divider"></div><button class="nav-item settings-nav-item ${selection === "settingsView" ? "active" : ""}" data-select="settingsView" title="${t("Réglages")}">${navIcon("settings")}<span class="nav-label">${t("Réglages")}</span></button>`;
  }

  function settingsNavMarkup(){
    const groups=settingsGroups();
    return `<button type="button" class="settings-back" data-select="${esc(lastWorkspaceSelection)}" data-surface="${esc(surfaceMode)}" title="${t("Retour au travail")}" aria-label="${t("Retour au travail")}">${icon("previous")}<span>${t("Retour au travail")}</span></button>
      ${groups.map(([group,items])=>`<div class="settings-nav-group"><span class="settings-nav-title">${esc(group)}</span>${items.map(([id,label,glyph])=>`<button type="button" class="settings-nav-item ${activeSettingsSection===id?"active":""}" data-action="scroll-setting" data-target="${esc(id)}" title="${esc(label)}" aria-label="${esc(label)}" ${activeSettingsSection===id?'aria-current="location"':""}>${icon(glyph)}<span>${esc(label)}</span></button>`).join("")}</div>`).join("")}`;
  }

  function allLabels() { return [...new Set(board.cards.flatMap(c => c.labels || []))].sort(); }
  function agendaEventForCard(card) {
    let value="",kind="due";
    if(card.status==="done"){value=card.completedAt||card.lastRun?.finishedAt||card.updatedAt||card.createdAt;kind="done"}
    else if(card.launchMode==="scheduled"&&card.scheduledAt){value=card.scheduledAt;kind="scheduled"}
    else if(card.dueDate){value=card.dueDate;kind="due"}
    if(!value)return null;const date=agendaDateFromValue(value);if(Number.isNaN(date.getTime()))return null;
    return {card,value,date,key:agendaDateKeyFromValue(value),kind,time:agendaTime(value),minuteOfDay:agendaDateOnly(value)?0:agendaMinuteOfDay(value),duration:Math.max(15,Number(card.durationMinutes)||60)};
  }
  function agendaEvents() { return baseVisibleCards().map(agendaEventForCard).filter(Boolean).sort((a,b)=>a.date-b.date||priorityOrder(a.card)-priorityOrder(b.card)); }
  function agendaRange() {
    if(agendaMode==="day"){const start=parseLocalDate(dateKey(agendaAnchor));return {start,end:addDays(start,1),label:agendaLongDayLabel(start)}}
    if(agendaMode==="week"){const start=startOfWeek(agendaAnchor),end=addDays(start,7);return {start,end,label:`${start.toLocaleDateString(locale(),{day:"numeric",month:"short"})} — ${addDays(end,-1).toLocaleDateString(locale(),{day:"numeric",month:"short",year:"numeric"})}`}}
    const start=startOfMonth(agendaAnchor),end=new Date(start.getFullYear(),start.getMonth()+1,1);return {start,end,label:start.toLocaleDateString(locale(),{month:"long",year:"numeric"})};
  }
  function projectedRecurrenceEvents(start,end){
    const startKey=dateKey(start),endKey=dateKey(end),visibleCards=baseVisibleCards();
    const realOccurrences=new Set((board.cards||[]).filter(card=>card.recurrenceSeriesID&&card.scheduledAt).map(card=>`${card.recurrenceSeriesID}:${agendaDateKeyFromValue(card.scheduledAt)}`));
    const projections=[];
    for(const card of visibleCards){
      if(card.archived||card.status==="done"||card.launchMode!=="scheduled"||!card.scheduledAt||!card.recurrence||card.recurrence==="none"||card.recurrenceSource==="codex")continue;
      let value=nextScheduledAt(card.scheduledAt,card.recurrence),guard=0;
      while(value&&guard++<5000){
        const key=agendaDateKeyFromValue(value);if(!key||key>=endKey)break;
        if(key>=startKey&&!realOccurrences.has(`${card.recurrenceSeriesID||card.id}:${key}`)){
          const date=agendaDateFromValue(value);
          projections.push({card,value,date,key,kind:"scheduled",time:agendaTime(value),minuteOfDay:agendaMinuteOfDay(value),duration:Math.max(15,Number(card.durationMinutes)||60),projected:true});
        }
        value=nextScheduledAt(value,card.recurrence);
      }
    }
    return projections;
  }
  function agendaEventsInRange(events=agendaEvents()) { const {start,end}=agendaRange(),startKey=dateKey(start),endKey=dateKey(end);return events.filter(event=>event.key>=startKey&&event.key<endKey).concat(projectedRecurrenceEvents(start,end)).sort((a,b)=>a.date-b.date||priorityOrder(a.card)-priorityOrder(b.card)); }
  const agendaHourHeight=58;
  const agendaPad=value=>String(value).padStart(2,"0");
  function layoutTimedEvents(events){
    const result=[],sorted=[...events].sort((a,b)=>a.date-b.date||b.duration-a.duration);let cluster=[],clusterEnd=-1;
    const flush=()=>{if(!cluster.length)return;const laneEnds=[];for(const item of cluster){let lane=laneEnds.findIndex(end=>item.start>=end);if(lane<0)lane=laneEnds.length;laneEnds[lane]=item.end;item.lane=lane}const laneCount=Math.max(1,laneEnds.length);for(const item of cluster)result.push({...item.event,agendaLane:item.lane,agendaLaneCount:laneCount});cluster=[];clusterEnd=-1};
    for(const event of sorted){const start=event.minuteOfDay,end=start+event.duration;if(cluster.length&&start>=clusterEnd)flush();cluster.push({event,start,end,lane:0});clusterEnd=Math.max(clusterEnd,end)}flush();return result;
  }
  function renderAgendaEvent(event,{compact=false,timed=false}={}) {
    const projected=Boolean(event.projected),space=getSpace(event.card.spaceID),positionInQueue=projected?0:queuePositions.get(event.card.id),runLabel=projected?"":activeRuns.has(event.card.id)?t("En cours"):positionInQueue?queueLabel(event.card):"",kindLabel=projected?t("Occurrence prévue"):runLabel||(event.kind==="done"?t("Réalisée"):event.kind==="scheduled"?t("Planifiée"):t("Échéance")),locked=event.kind==="done";
    const minuteOfDay=event.minuteOfDay,height=Math.max(28,event.duration/60*agendaHourHeight),top=minuteOfDay/60*agendaHourHeight;
    const lanes=Math.max(1,event.agendaLaneCount||1),lane=Math.max(0,event.agendaLane||0),lanePercent=100/lanes,leftOffset=4-5*lane/lanes,widthSubtract=3+5/lanes;
    const position=timed?`--agenda-top:${top}px;--agenda-height:${height}px;--agenda-left:calc(${lane*lanePercent}% + ${leftOffset}px);--agenda-width:calc(${lanePercent}% - ${widthSubtract}px);`:"";
    const standardActions=compact?"":projected?`<button data-action="edit-card" data-id="${esc(event.card.id)}" title="${t("Ouvrir la routine")}" aria-label="${t("Ouvrir la routine")}">${icon("edit")}</button>`:`${!locked?`<button data-action="agenda-complete" data-id="${esc(event.card.id)}" title="${t("Marquer comme terminée")}" aria-label="${t("Marquer comme terminée")}">${icon("check")}</button>`:""}${event.kind==="scheduled"&&!activeRuns.has(event.card.id)&&!positionInQueue?`<button data-action="run" data-id="${esc(event.card.id)}" title="${t("Lancer maintenant")}" aria-label="${t("Lancer maintenant")}">${icon("play")}</button>`:""}<button data-action="edit-card" data-id="${esc(event.card.id)}" title="${t("Ouvrir la tâche")}" aria-label="${t("Ouvrir la tâche")}">${icon("edit")}</button>`;
    const deleteAction=projected?"":`<button class="agenda-delete-action" data-action="confirm-delete-card" data-origin="agenda" data-id="${esc(event.card.id)}" title="${t("Supprimer la tâche")}" aria-label="${t("Supprimer la tâche")}">${icon("trash")}</button>`;
    const title=projected?t("Occurrence future de la routine"):locked?t("Historique verrouillé"):t("Glisser pour déplacer");
    return `<article class="agenda-event ${event.kind} ${projected?"projected":""} ${compact?"compact":""} ${timed?"timed":""} ${(event.agendaLaneCount||1)>1?"simultaneous":""} ${event.duration<45?"short-event":""} ${locked?"locked":""} ${runLabel?"live-run":""}" style="--event-color:#${safeHex(space?.accentHex)};${position}" data-agenda-card="${esc(event.card.id)}" ${locked||projected?"":'data-agenda-draggable="true"'} title="${title} — ${esc(event.card.title)}"><button class="agenda-event-main" data-action="edit-card" data-id="${esc(event.card.id)}"><span class="agenda-event-dot"></span><span class="agenda-event-copy"><strong>${event.time?`<time>${esc(event.time)}</time>`:""}${esc(event.card.title)}</strong>${compact?"":`<small>${esc(space?.name||"")} · ${esc(kindLabel)}<span class="agenda-duration"> · ${event.duration} min</span></small>`}</span></button>${standardActions||deleteAction?`<div class="agenda-event-actions">${standardActions}${deleteAction}</div>`:""}${timed&&!projected&&event.kind==="scheduled"&&!activeRuns.has(event.card.id)&&!positionInQueue?`<button class="agenda-resize-handle" data-agenda-resize="${esc(event.card.id)}" title="${t("Modifier la durée")}" aria-label="${t("Modifier la durée")}"></button>`:""}</article>`;
  }
  const agendaSlotKey = (date,hour,minute) => `${date}T${agendaPad(hour)}:${agendaPad(minute)}`;
  function defaultAgendaFocusSlot(days){
    const dayKeys=days.map(dateKey),currentDay=today(),parts=agendaZonedParts(new Date()),inCurrentRange=dayKeys.includes(currentDay),date=inCurrentRange?currentDay:dayKeys[0];
    const minute=inCurrentRange&&parts?Math.min(23*60+30,Math.floor((parts.hour*60+parts.minute)/30)*30):9*60;
    return agendaSlotKey(date,Math.floor(minute/60),minute%60);
  }
  function agendaSlotButton(day,date,hour,minute,position){
    const key=agendaSlotKey(date,hour,minute),time=agendaClockLabel(hour,minute),label=t("Créer une tâche le {day} à {time}",{day:agendaLongDayLabel(day),time});
    return `<button class="agenda-slot-target ${position}" data-action="agenda-create" data-date="${date}" data-hour="${agendaPad(hour)}" data-minute="${agendaPad(minute)}" tabindex="${key===agendaFocusSlotKey?"0":"-1"}" aria-label="${esc(label)}"></button>`;
  }
  function focusAdjacentAgendaSlot(slot,key){
    const date=parseLocalDate(slot.dataset.date),minute=Number(slot.dataset.hour)*60+Number(slot.dataset.minute);
    let targetDate=date,targetMinute=minute;
    if(key==="arrowup")targetMinute-=30;
    else if(key==="arrowdown")targetMinute+=30;
    else if(key==="arrowleft")targetDate=addDays(date,-1);
    else if(key==="arrowright")targetDate=addDays(date,1);
    else if(key==="home")targetMinute=0;
    else if(key==="end")targetMinute=23*60+30;
    else return false;
    if(targetMinute<0||targetMinute>23*60+30)return true;
    const targetKey=agendaSlotKey(dateKey(targetDate),Math.floor(targetMinute/60),targetMinute%60);
    const target=[...document.querySelectorAll(".agenda-slot-target")].find(candidate=>agendaSlotKey(candidate.dataset.date,Number(candidate.dataset.hour),Number(candidate.dataset.minute))===targetKey);
    if(!target)return true;
    document.querySelectorAll(".agenda-slot-target").forEach(candidate=>candidate.tabIndex=-1);
    target.tabIndex=0;agendaFocusSlotKey=targetKey;target.focus();target.scrollIntoView({block:"nearest",inline:"nearest"});return true;
  }
  function renderAgendaCalendar(days,events) {
    const timed=events.filter(event=>event.time),allDay=events.filter(event=>!event.time),hours=Array.from({length:24},(_,hour)=>hour),count=days.length;
    const zone=agendaTimeZone(),zoneLabel=agendaOffsetLabel(zone),visibleDays=new Set(days.map(dateKey));
    if(!visibleDays.has(agendaFocusSlotKey.slice(0,10)))agendaFocusSlotKey=defaultAgendaFocusSlot(days);
    return `<div class="agenda-time-calendar ${count===1?"single-day":""}" style="--agenda-days:${count}"><div class="agenda-days-header"><div class="agenda-corner"><span title="${esc(agendaTimeZoneName(zone))}">${esc(zoneLabel)}</span></div>${days.map(day=>{const key=dateKey(day);return `<button class="agenda-day-heading ${key===today()?"today":""}" data-action="agenda-open-day" data-date="${key}"><span>${day.toLocaleDateString(locale(),{weekday:"short"}).replace(".","")}</span><strong>${day.getDate()}</strong></button>`}).join("")}</div><div class="agenda-all-day-grid"><div class="agenda-all-day-label">${t("Journée")}</div>${days.map(day=>{const key=dateKey(day),items=allDay.filter(event=>event.key===key);return `<div class="agenda-all-day-cell" data-agenda-drop-date="${key}">${items.map(event=>renderAgendaEvent(event,{compact:true})).join("")}<button data-action="agenda-create-due" data-date="${key}" title="${t("Ajouter une échéance")}" aria-label="${t("Ajouter une échéance")}">${icon("plus")}</button></div>`}).join("")}</div><div class="agenda-time-scroll" data-agenda-scroll><div class="agenda-time-grid"><div class="agenda-time-gutter">${hours.map(hour=>`<time style="top:${hour*agendaHourHeight}px">${esc(agendaClockLabel(hour))}</time>`).join("")}</div>${days.map(day=>{const key=dateKey(day),items=layoutTimedEvents(timed.filter(event=>event.key===key));return `<div class="agenda-time-column ${key===today()?"today":""}" data-agenda-drop-date="${key}">${hours.map(hour=>`<div class="agenda-time-slot">${agendaSlotButton(day,key,hour,0,"first")}${agendaSlotButton(day,key,hour,30,"second")}</div>`).join("")}${items.map(event=>renderAgendaEvent(event,{timed:true})).join("")}</div>`}).join("")}</div></div></div>`;
  }
  function renderAgendaDay(events) {
    const day=parseLocalDate(dateKey(agendaAnchor));
    return `<div class="agenda-day-view">${renderAgendaCalendar([day],events)}</div>`;
  }
  function renderAgendaWeek(events) {
    const start=startOfWeek(agendaAnchor),days=Array.from({length:7},(_,index)=>addDays(start,index));
    return `<div class="agenda-week-view">${renderAgendaCalendar(days,events)}</div>`;
  }
  function renderAgendaMonth(events) {
    const monthStart=startOfMonth(agendaAnchor),gridStart=startOfWeek(monthStart),days=Array.from({length:42},(_,index)=>addDays(gridStart,index));
    const weekdayStart=startOfWeek(new Date(2024,0,3)),weekdays=Array.from({length:7},(_,index)=>addDays(weekdayStart,index).toLocaleDateString(locale(),{weekday:"short"}).replace(".",""));
    return `<div class="agenda-month-view"><div class="agenda-weekdays">${weekdays.map(day=>`<span>${esc(day)}</span>`).join("")}</div><div class="agenda-month-grid">${days.map(day=>{const key=dateKey(day),items=events.filter(event=>event.key===key),outside=day.getMonth()!==monthStart.getMonth();return `<section class="agenda-month-day ${outside?"outside":""} ${key===today()?"today":""}" data-agenda-drop-date="${key}"><header><button class="agenda-date-button" data-action="agenda-open-day" data-date="${key}">${day.getDate()}</button><button data-action="agenda-create" data-date="${key}" data-hour="09" data-minute="00" aria-label="Créer une tâche le ${esc(agendaLongDayLabel(day))}">${icon("plus")}</button></header><div>${items.slice(0,4).map(event=>renderAgendaEvent(event,{compact:true})).join("")}${items.length>4?`<button class="agenda-more" data-action="agenda-open-day" data-date="${key}">+ ${items.length-4} autre${items.length>5?"s":""}</button>`:""}</div></section>`}).join("")}</div></div>`;
  }
  function renderAgenda() {
    const events=agendaEventsInRange();
    return `<div class="agenda-shell"><div class="agenda-legend"><span><i class="scheduled"></i>${t("Planifiées")}</span><span><i class="projected"></i>${t("Récurrences à venir")}</span><span><i class="done"></i>${t("Réalisées")}</span><span><i class="due"></i>${t("Échéances")}</span><small>${t("Les occurrences futures sont des aperçus ; seule la prochaine est une tâche exécutable.")}</small></div>${agendaMode==="day"?renderAgendaDay(events):agendaMode==="month"?renderAgendaMonth(events):renderAgendaWeek(events)}</div>`;
  }
  function renderValidationRequest(validation){
    const card=getCard(validation.cardID),space=getSpace(card?.spaceID),conversation=activeConversation(card),detail=validationDetail(validation),question=validation.kind==="input",direct=Boolean(card?.utilityChat);
    const sourceAction=direct?`<button class="ui-button secondary" data-action="open-utility-chat">${icon("chat")}<span>${t("Revenir au chat")}</span></button>`:`<button class="ui-button secondary" data-action="edit-card" data-id="${esc(card?.id||"")}">${icon("eye")}<span>${t("Voir la carte")}</span></button>`;
    return `<article class="validation-request ${question?"question-request":""}"><div class="validation-request-top"><span class="validation-kind-icon">${icon(validationKindIcon(validation.kind))}</span><div class="validation-request-copy"><span class="validation-eyebrow">${esc(validationKindLabel(validation.kind))} · ${(engineLabel(validation.agentEngine))}</span><h3>${esc(card?.title||"Carte supprimée")}</h3><p><i style="background:#${safeHex(space?.accentHex)}"></i>${esc(space?.name||t("Projet inconnu"))} · ${direct?t("Chat direct"):esc(card?cardReference(card):"")}</p></div><time>${esc(validationTime(validation.requestedAt))}</time></div><div class="validation-action-preview"><span>${question?"Question reçue":"Action demandée"}</span><pre>${esc(detail)}</pre>${validation.params?.cwd?`<small>${esc(validation.params.cwd)}</small>`:""}</div><div class="validation-facts"><div><span>${t("Agent")}</span><strong>${(engineLabel(validation.agentEngine))} · ${esc(validation.model||"modèle par défaut")}</strong><small>${esc(effortLabel(validation.reasoningEffort||"medium"))}</small></div><div><span>${direct?t("Accès du chat"):t("Accès de la carte")}</span><strong>${esc(accessLabel(validation.accessMode))}</strong><small>${esc(approvalModeLabel(validation.approvalMode))}</small></div><div><span>Conversation</span><strong>${esc(conversation?.name||t("Nouvelle conversation"))}</strong><small>${esc(validation.threadID||"liée au lancement")}</small></div></div><div class="validation-actions">${sourceAction}${conversation&&!direct?`<button class="ui-button secondary" data-action="conversation-panel" data-id="${esc(card.id)}">Conversation</button>`:""}<span class="grow"></span>${question?`<button class="ui-button secondary danger-text" data-action="cancel-validation" data-validation="${esc(validation.id)}">${t("Arrêter")}</button><button class="ui-button primary" data-action="answer-validation" data-validation="${esc(validation.id)}">${t("Répondre")}</button>`:`<button class="ui-button secondary danger-text" data-action="validation-decision" data-decision="decline" data-validation="${esc(validation.id)}">Refuser</button><button class="ui-button secondary" data-action="validation-decision" data-decision="accept" data-validation="${esc(validation.id)}">${t("Autoriser une fois")}</button>${!isClaude(validation)?`<button class="ui-button primary" data-action="validation-decision" data-decision="acceptForSession" data-validation="${esc(validation.id)}">${t("Pour la session")}</button>`:""}`}</div></article>`;
  }
  function renderResultReview(card){
    const space=getSpace(card.spaceID),conversation=activeConversation(card);
    return `<article class="result-review-card"><div><span class="result-review-icon">${icon("check")}</span><div><small>${esc(space?.name||"")} · ${esc(cardReference(card))}</small><strong>${esc(card.title)}</strong><p>${esc(card.lastRun?.summary||"L’exécution est terminée. Vérifie le résultat avant de clore la tâche.")}</p></div></div><div class="result-review-actions">${conversation?`<button class="ui-button secondary" data-action="conversation-panel" data-id="${esc(card.id)}">Relire</button>`:`<button class="ui-button secondary" data-action="edit-card" data-id="${esc(card.id)}">${t("Détails")}</button>`}<button class="ui-button primary" data-action="validation-complete-card" data-id="${esc(card.id)}">${t("Valider et terminer")}</button></div></article>`;
  }
  function renderValidationHistory(validation){
    const card=getCard(validation.cardID),tone=validation.status==="declined"||validation.status==="interrupted"?"negative":"positive";
    return `<button class="validation-history-row" data-action="open-validation" data-validation="${esc(validation.id)}"><span class="history-status ${tone}">${validation.status==="declined"||validation.status==="interrupted"?icon("alert"):icon("check")}</span><span><strong>${esc(card?.title||"Carte supprimée")}</strong><small>${esc(validationStatusLabel(validation.status))} · ${esc(validationTime(validation.decidedAt||validation.requestedAt))}</small></span>${icon("chevron")}</button>`;
  }
  function renderValidationCenter(){
    const pending=[...pendingValidations()].sort((a,b)=>String(b.requestedAt).localeCompare(String(a.requestedAt))),history=validations().filter(validation=>validation.status!=="pending").sort((a,b)=>String(b.decidedAt||b.requestedAt).localeCompare(String(a.decidedAt||a.requestedAt))).slice(0,16);
    return `<div class="validation-shell approvals-only"><main class="validation-main"><section class="validation-section"><div class="validation-section-head"><div><span class="section-kicker">${t("Décisions en direct")}</span><h2>${t("Ce que les agents attendent de toi")}</h2><p>${t("Uniquement les autorisations et questions qui bloquent une tâche lancée. Les résultats terminés restent dans Suivi.")}</p></div><span class="validation-count ${pending.length?"live":""}">${pending.length}</span></div><div class="validation-request-list">${pending.length?pending.map(renderValidationRequest).join(""):`<div class="validation-empty"><span>${icon("shield")}</span><h3>${t("Aucune validation en attente")}</h3><p>${t("Une demande apparaîtra ici automatiquement si une commande, un fichier ou une question nécessite ton accord.")}</p></div>`}</div></section></main><aside class="validation-side"><section class="validation-side-section history-section"><div class="validation-side-head"><div><span class="section-kicker">${t("Traçabilité locale")}</span><h2>${t("Décisions récentes")}</h2></div></div><div class="validation-history-list">${history.length?history.map(renderValidationHistory).join(""):`<div class="side-empty">${t("Les autorisations, réponses et refus apparaîtront ici.")}</div>`}</div></section></aside></div>`;
  }
  const followUpDate = card => {const value=card.completedAt||card.lastRun?.finishedAt||card.updatedAt;if(!value)return "Date inconnue";const date=new Date(value);return Number.isNaN(date.getTime())?String(value):date.toLocaleString(locale(),{dateStyle:"medium",timeStyle:"short"})};
  function renderFollowUpCard(card){
    const space=getSpace(card.spaceID),conversation=activeConversation(card),summary=card.lastRun?.summary||conversation?.preview||"Le résultat est disponible dans la conversation associée.",preset=fixedBoardPresets().find(item=>item.id===cardBoardPresetID(card)),failed=cardExecutionFailed(card),review=card.status==="review"||failed;
    return `<article class="follow-result-card ${card.status} ${failed?"failed":""}"><div class="follow-result-top"><span class="follow-result-state">${review?icon("alert"):icon("check")}</span><div><span class="follow-result-meta">${esc(space?.name||t("Projet inconnu"))} · ${esc(cardReference(card))} · ${esc(preset?.name||"Classique")}</span><h3>${esc(card.title)}</h3><time>${esc(followUpDate(card))}</time></div><span class="follow-result-badge">${failed?t("Échec à vérifier"):card.status==="review"?t("À relire"):t("Terminée")}</span></div><div class="follow-result-answer"><span>${failed?t("Dernière erreur enregistrée"):t("Dernière réponse enregistrée")}</span><p>${esc(summary)}</p></div><div class="follow-result-actions"><button class="ui-button secondary" data-action="edit-card" data-id="${esc(card.id)}">${icon("eye")}<span>${t("Voir la carte")}</span></button>${conversation?`<button class="ui-button secondary" data-action="conversation-panel" data-id="${esc(card.id)}">${icon("terminal")}<span>Conversation</span></button>`:""}<span class="grow"></span>${review?`<button class="ui-button primary" data-action="review-decision" data-id="${esc(card.id)}">${t("Décider de la suite")}</button>`:`<button class="ui-button primary" data-action="create-follow-up" data-id="${esc(card.id)}">${icon("plus")}<span>${t("Tâche complémentaire")}</span></button>`}</div></article>`;
  }
  function renderFollowUp(){
    const cards=followUpCards(),reviews=cards.filter(card=>card.status==="review"||cardExecutionFailed(card)),completed=cards.filter(card=>card.status==="done");
    return `<div class="follow-shell"><section class="follow-section attention"><div class="follow-section-head"><div><span class="section-kicker">${t("À traiter")}</span><h2>${t("Résultats à relire")}</h2><p>${t("Vérifie les réponses de l’agent avant de terminer ou de prolonger le travail.")}</p></div><span>${reviews.length}</span></div><div class="follow-result-list">${reviews.length?reviews.map(renderFollowUpCard).join(""):`<div class="follow-empty"><span>${icon("check")}</span><strong>${t("Aucun résultat en attente")}</strong><p>${t("Les prochaines tâches terminées par un agent apparaîtront ici.")}</p></div>`}</div></section><section class="follow-section"><div class="follow-section-head"><div><span class="section-kicker">${t("Historique utile")}</span><h2>${t("Travaux terminés")}</h2><p>${t("Retrouve les dernières réponses et crée une suite sans repartir de zéro.")}</p></div><span>${completed.length}</span></div><div class="follow-result-list">${completed.length?completed.map(renderFollowUpCard).join(""):`<div class="follow-empty"><span>${icon("history")}</span><strong>${t("Aucun travail terminé avec résultat")}</strong><p>${t("Une tâche clôturée restera accessible ici avec sa dernière réponse.")}</p></div>`}</div></section></div>`;
  }

  const completedTime = card => card.completedAt||card.lastRun?.finishedAt||card.updatedAt||card.createdAt||"";
  const historyDateLabel = value => {const date=new Date(value);return Number.isNaN(date.getTime())?"Date inconnue":date.toLocaleString(locale(),{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});};
  function renderHistoryCard(card){
    const space=getSpace(card.spaceID)||{name:t("Projet retiré"),accentHex:"8C93A3"},conversation=activeConversation(card),summary=card.lastRun?.summary||conversation?.preview||"Aucun résumé enregistré.",priority=priorityByID(card.priorityLevelID);
    const state=card.archived?(card.archiveReason==="automatic"?t("Archivée automatiquement"):t("Archivée")):t("Dans Terminées");
    const archiveAction=`<button class="ui-button ${card.archived?"secondary":"archive-button"}" data-action="${card.archived?"unarchive-card":"archive-card"}" data-id="${esc(card.id)}">${icon(card.archived?"history":"archive")}<span>${card.archived?t("Restaurer"):t("Archiver")}</span></button>`;
    const deleteAction=card.archived?`<button class="ui-button history-delete-button" data-action="confirm-delete-card" data-origin="history" data-id="${esc(card.id)}" title="${t("Supprimer la tâche")}" aria-label="${t("Supprimer la tâche")}">${icon("trash")}<span>${t("Supprimer")}</span></button>`:"";
    return `<article class="history-card ${card.archived?"archived":"current"}"><header class="history-card-header"><div class="history-card-state">${icon(card.archived?"archive":"check")}</div><div class="history-card-identity"><div class="history-card-title"><span class="priority-ref" style="--priority-color:#${safeHex(priority.color,"9CA3AF")}">${esc(cardReference(card))}</span><h3>${esc(card.title)}</h3></div><div class="history-card-meta"><span><i style="background:#${safeHex(space.accentHex)}"></i>${esc(space.name)}</span><time>${esc(historyDateLabel(completedTime(card)))}</time>${card.archivedAt?`<span>${t("Archivée le {date}",{date:esc(historyDateLabel(card.archivedAt))})}</span>`:""}</div></div><span class="history-state-badge">${state}</span></header><section class="history-card-result"><span>${t("Dernier résultat")}</span><p>${esc(summary)}</p></section><footer class="history-card-actions"><button class="ui-button secondary" data-action="edit-card" data-id="${esc(card.id)}">${icon("eye")}<span>${t("Détails")}</span></button>${conversation?`<button class="ui-button secondary" data-action="conversation-panel" data-id="${esc(card.id)}">${t("Conversation")}</button>`:""}<button class="ui-button secondary" data-action="create-follow-up" data-id="${esc(card.id)}">${icon("plus")}<span>${t("Créer une suite")}</span></button><span class="grow"></span>${archiveAction}${deleteAction}</footer></article>`;
  }
  function renderHistoryTimeline(cards,kind="current"){
    if(!cards.length)return `<div class="history-empty"><span>${icon("history")}</span><strong>${kind==="archived"?t("Aucune carte archivée"):t("Aucune tâche terminée")}</strong><p>${kind==="archived"?t("Les cartes que tu archives se rangent ici, avec leur résultat et leur conversation."):t("Les tâches terminées apparaîtront ici avec leur résultat et leur conversation.")}</p></div>`;
    const groups=new Map();for(const card of cards){const date=new Date(completedTime(card)),key=Number.isNaN(date.getTime())?"Date inconnue":date.toLocaleDateString(locale(),{month:"long",year:"numeric"});if(!groups.has(key))groups.set(key,[]);groups.get(key).push(card)}
    return [...groups].map(([label,items])=>`<section class="history-month"><h3>${esc(label)}</h3><div>${items.map(renderHistoryCard).join("")}</div></section>`).join("");
  }
  function renderHistory(cards){
    const sorted=[...cards].sort((a,b)=>String(completedTime(b)).localeCompare(String(completedTime(a)))),current=sorted.filter(card=>!card.archived),archived=sorted.filter(card=>card.archived),currentVisible=current.slice(0,historyCurrentLimit),archivedVisible=archived.slice(0,historyArchiveLimit),days=Number(board.settings.autoArchiveCompletedDays||0);
    const more=(kind,total,visible)=>total>visible?`<button class="history-show-more" data-action="show-more-history" data-history-kind="${kind}">${t("Afficher {n} de plus",{n:Math.min(historyPageSize,total-visible)})} <small>· ${tn(total-visible,"{n} restante","{n} restantes")}</small></button>`:"";
    return `<div class="history-shell"><div class="history-explainer"><span>${icon("archive")}</span><div><strong>${t("L’archivage allège les tableaux, il ne supprime rien.")}</strong><p>${t("Les cartes archivées restent consultables ici, dans leurs conversations et dans l’Agenda à leur date de réalisation.")}</p></div><span class="history-rule">${days?tn(days,"Automatique après {n} jour","Automatique après {n} jours"):t("Archivage automatique désactivé")}</span></div><section class="history-block current"><div class="history-block-head"><div><span class="section-kicker">${t("Encore visibles dans les tableaux")}</span><h2>${t("Tâches terminées")}</h2><p>${t("Archive-les quand tu n’as plus besoin de les garder dans la colonne Terminées.")}</p></div><span>${current.length}</span></div>${renderHistoryTimeline(currentVisible)}${more("current",current.length,currentVisible.length)}</section><section class="history-block archived"><div class="history-block-head"><div><span class="section-kicker">${t("Mémoire du travail")}</span><h2>${t("Archives")}</h2><p>${t("Retrouve les résultats, restaure une carte ou crée une tâche complémentaire.")}</p></div><span>${archived.length}</span></div>${renderHistoryTimeline(archivedVisible,"archived")}${more("archived",archived.length,archivedVisible.length)}</section></div>`;
  }
  function renderHeader() {
    const allCards = baseVisibleCards(), space = getSpace(selection);
    const selectionParts=selection.split(":"), selectedObjective=selection.startsWith("taxonomy:")?taxonomyValue(selectionParts[1],selectionParts[2]):null;
    const title = specialViews[selection] || selectedObjective?.name || space?.name || t("Vue globale");
    const subtitle = space?.rootPath || (selection === "global" ? t("Toutes les tâches, tous les projets") : "Vue de pilotage dynamique");
    if(selection==="settingsView"){
      document.querySelector("#workspace-header").innerHTML=`<div class="header-card compact-header"><div class="header-topline"><div class="workspace-title"><span class="header-kicker">${t("Préférences")}</span><h1>${t("Réglages")}</h1><p>${t("Personnalise l’apparence, les tâches, les agents et le fonctionnement local.")}</p></div></div></div>`;
      return;
    }
    const filterDimensions=taxonomy().filter(d=>(d.values||[]).some(v=>!v.archived));
    if(selection==="agendaView"){
      const events=agendaEventsInRange(),range=agendaRange(),planned=events.filter(event=>event.kind!=="done").length,done=events.filter(event=>event.kind==="done").length;
      document.querySelector("#workspace-header").innerHTML=`<div class="header-card agenda-header"><div class="header-topline"><div class="workspace-title"><span class="header-kicker">${t("Temps et exécution")}</span><h1>${t("Agenda")}</h1><p>${t("Planifie les tâches et retrouve ce qui a réellement été accompli.")}</p><div class="stats"><span class="stat recap-stat"><strong>${events.length}</strong> ${t("événements")}</span><span class="stat"><strong>${planned}</strong> ${t("planifiés")}</span><span class="stat success-stat"><strong>${done}</strong> ${t("réalisés")}</span></div></div><div class="header-primary-actions"><button class="ui-button icon-only quiet-button" data-select="settingsView" title="${t("Réglages")}" aria-label="${t("Réglages")}">${icon("settings")}</button><button class="ui-button primary new-card-button" data-action="add-card">${icon("plus")}<span>${t("Nouvelle tâche")}</span></button></div></div><div class="header-controlbar agenda-controlbar"><div class="header-view-controls"><div class="segmented agenda-mode-switcher"><button data-action="agenda-mode" data-mode="day" class="${agendaMode==="day"?"active":""}">${t("Jour")}</button><button data-action="agenda-mode" data-mode="week" class="${agendaMode==="week"?"active":""}">${t("Semaine")}</button><button data-action="agenda-mode" data-mode="month" class="${agendaMode==="month"?"active":""}">${t("Mois")}</button></div><div class="agenda-navigation"><button class="ui-button icon-only secondary" data-action="agenda-prev" title="${t("Période précédente")}" aria-label="${t("Période précédente")}">${icon("previous")}</button><button class="ui-button secondary" data-action="agenda-today">${t("Aujourd’hui")}</button><button class="ui-button icon-only secondary" data-action="agenda-next" title="${t("Période suivante")}" aria-label="${t("Période suivante")}">${icon("next")}</button></div><strong class="agenda-range">${esc(range.label)}</strong></div><div class="header-tools"><details class="filter-popover"><summary class="ui-button icon-only secondary" title="${t("Filtres")}" aria-label="${t("Filtres")}">${icon("filter")}</summary><div class="filter-panel"><select id="priority-filter" aria-label="${t("Filtrer par priorité")}"><option value="">${t("Toutes les priorités")}</option>${priorities().map(p=>`<option value="${esc(p.id)}" ${p.id===priorityFilter?"selected":""}>${esc(p.code)} · ${esc(p.name)}</option>`).join("")}</select><select id="taxonomy-filter" aria-label="${t("Filtrer par objectif ou axe")}"><option value="">${t("Tous les objectifs et axes")}</option>${filterDimensions.flatMap(d=>(d.values||[]).filter(v=>!v.archived).map(v=>`<option value="${esc(d.id)}:${esc(v.id)}" ${`${d.id}:${v.id}`===taxonomyFilter?"selected":""}>${esc(d.name)} · ${esc(v.name)}</option>`)).join("")}</select><select id="label-filter" aria-label="${t("Filtrer par étiquette")}"><option value="">${t("Toutes les étiquettes")}</option>${allLabels().map(l=>`<option ${l===labelFilter?"selected":""}>${esc(l)}</option>`).join("")}</select></div></details></div></div></div>`;
      return;
    }
    if(selection==="reviewView"){
      const pending=pendingValidations(),questions=pending.filter(validation=>validation.kind==="input").length,permissions=pending.length-questions;
      document.querySelector("#workspace-header").innerHTML=`<div class="header-card validation-header"><div class="header-topline"><div class="workspace-title"><span class="header-kicker">${t("Contrôle humain")}</span><h1>${t("Centre de validations")}</h1><p>${t("Réponds uniquement aux demandes qui bloquent une tâche déjà lancée.")}</p><div class="stats"><span class="stat ${permissions?"attention-stat":""}"><strong>${permissions}</strong> ${tn(permissions,"autorisation","autorisations")}</span><span class="stat ${questions?"attention-stat":""}"><strong>${questions}</strong> ${tn(questions,"question","questions")}</span><span class="stat recap-stat"><strong>${pending.length}</strong> ${tn(pending.length,"attente","attentes")}</span></div></div><div class="header-primary-actions"><button class="ui-button icon-only quiet-button" data-select="settingsView" title="${t("Réglages")}" aria-label="${t("Réglages")}">${icon("settings")}</button><button class="ui-button primary new-card-button" data-action="add-card">${icon("plus")}<span>${t("Nouvelle tâche")}</span></button></div></div><div class="validation-header-note"><span>${icon("shield")}</span><p><strong>${t("Les droits restent ceux choisis au lancement.")}</strong> ${t("Les résultats et les erreurs d’exécution se traitent dans Suivi, jamais dans ce centre.")}</p><span class="validation-live-indicator"><i></i>${t("Écoute en direct")}</span></div></div>`;
      return;
    }
    if(selection==="followView"){
      const results=followUpCards(allCards),reviews=results.filter(card=>card.status==="review"||cardExecutionFailed(card)),completed=results.filter(card=>card.status==="done");
      document.querySelector("#workspace-header").innerHTML=`<div class="header-card follow-header"><div class="header-topline"><div class="workspace-title"><span class="header-kicker">${t("Résultats et continuité")}</span><h1>${t("Suivi")}</h1><p>${t("Retrouve les réponses des tâches exécutées et transforme immédiatement un résultat en prochaine action.")}</p><div class="stats"><span class="stat ${reviews.length?"attention-stat":""}"><strong>${reviews.length}</strong> ${t("à relire")}</span><span class="stat success-stat"><strong>${completed.length}</strong> ${t("terminées")}</span><span class="stat recap-stat"><strong>${results.length}</strong> ${t("résultats")}</span></div></div><div class="header-primary-actions"><button class="ui-button icon-only quiet-button" data-select="settingsView" title="${t("Réglages")}" aria-label="${t("Réglages")}">${icon("settings")}</button><button class="ui-button primary new-card-button" data-action="add-card">${icon("plus")}<span>${t("Nouvelle tâche")}</span></button></div></div></div>`;
      return;
    }
    if(selection==="doneView"){
      const current=allCards.filter(card=>!card.archived),archived=allCards.filter(card=>card.archived),days=Number(board.settings.autoArchiveCompletedDays||0);
      document.querySelector("#workspace-header").innerHTML=`<div class="header-card history-header"><div class="header-topline"><div class="workspace-title"><span class="header-kicker">${t("Mémoire locale")}</span><h1>${t("Historique")}</h1><p>${t("Consulte les tâches réalisées, leurs résultats et les archives sans alourdir les tableaux.")}</p><div class="stats"><span class="stat success-stat"><strong>${allCards.length}</strong> ${t("réalisées")}</span><span class="stat"><strong>${current.length}</strong> ${t("dans Terminées")}</span><span class="stat recap-stat"><strong>${archived.length}</strong> ${t("archivées")}</span><span class="stat"><strong>${days||"—"}</strong> ${days?`jour${days>1?"s":""} avant archivage`:t("automatique désactivé")}</span></div></div><div class="header-primary-actions"><details class="filter-popover"><summary class="ui-button icon-only secondary" title="${t("Filtres")}" aria-label="${t("Filtres")}">${icon("filter")}</summary><div class="filter-panel"><select id="priority-filter" aria-label="${t("Filtrer par priorité")}"><option value="">${t("Toutes les priorités")}</option>${priorities().map(p=>`<option value="${esc(p.id)}" ${p.id===priorityFilter?"selected":""}>${esc(p.code)} · ${esc(p.name)}</option>`).join("")}</select><select id="taxonomy-filter" aria-label="${t("Filtrer par objectif ou axe")}"><option value="">${t("Tous les objectifs et axes")}</option>${filterDimensions.flatMap(d=>(d.values||[]).filter(v=>!v.archived).map(v=>`<option value="${esc(d.id)}:${esc(v.id)}" ${`${d.id}:${v.id}`===taxonomyFilter?"selected":""}>${esc(d.name)} · ${esc(v.name)}</option>`)).join("")}</select><select id="label-filter" aria-label="${t("Filtrer par étiquette")}"><option value="">${t("Toutes les étiquettes")}</option>${allLabels().map(l=>`<option ${l===labelFilter?"selected":""}>${esc(l)}</option>`).join("")}</select></div></details><button class="ui-button secondary" data-select="settingsView" data-history-settings="true">${icon("settings")}<span>${t("Règle d’archivage")}</span></button>${current.length?`<button class="ui-button primary" data-action="archive-completed">${icon("archive")}<span>${t("Tout archiver")}</span></button>`:""}</div></div></div>`;
      return;
    }
    const cards=surfaceMode==="board"&&selection!=="doneView"?cardsForPreset(allCards,activePreset().id):allCards;
    const contextLabel=space?t("Projet"):selectedObjective?t("Objectif"):selection==="global"?t("Portefeuille"):"Vue intelligente";
    document.querySelector("#workspace-header").innerHTML = `
      <div class="header-card"><div class="header-topline"><div class="workspace-title"><span class="header-kicker">${esc(contextLabel)}</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p><div class="stats"><span class="stat recap-stat"><strong>${cards.length}</strong> ${t("cartes")}</span><span class="stat"><strong>${cards.filter(cardIsLaunchable).length}</strong> ${t("prêtes")}</span><span class="stat"><strong>${cards.filter(c=>["queued","running"].includes(c.status)).length}</strong> ${t("en cours")} / ${t("file")}</span><span class="stat"><strong>${cards.filter(c=>c.status==="review"||c.status==="needsInput").length}</strong> ${t("à suivre")}</span></div></div><div class="header-primary-actions"><button class="ui-button icon-only quiet-button header-sync-all ${syncing||claudeSyncing?"is-busy":""}" data-action="sync-all" title="${t(syncing||claudeSyncing?"Synchronisation de Codex et Claude Code en cours…":"Synchroniser Codex et Claude Code")}" aria-label="${t(syncing||claudeSyncing?"Synchronisation de Codex et Claude Code en cours…":"Synchroniser Codex et Claude Code")}" ${syncing||claudeSyncing?"disabled":""}>${icon("sync")}</button><button class="ui-button icon-only quiet-button" data-select="settingsView" title="${t("Réglages")}" aria-label="${t("Réglages")}">${icon("settings")}</button><button class="ui-button primary new-card-button" data-action="add-card">${icon("plus")}<span>${t("Nouvelle tâche")}</span></button></div></div>
      <div class="header-controlbar"><div class="header-view-controls"><div class="segmented surface-switcher"><button data-surface="board" class="${surfaceMode==="board"?"active":""}">${icon("board")}<span>${t("Tableau")}</span></button><button data-surface="flow" class="${surfaceMode==="flow"?"active":""}">${icon("flow")}<span>${t("Flux")}</span></button></div>${surfaceMode==="board"?`<label class="preset-switcher fixed-preset-switcher">${icon("columns")}<select id="active-preset" title="${t("Tableau affiché")}" aria-label="${t("Tableau affiché")}">${fixedBoardPresets().map(p=>`<option value="${esc(p.id)}" ${p.id===activePreset().id?"selected":""}>${esc(p.name)}</option>`).join("")}</select></label>`:`<div class="flow-combined-label">${icon("flow")}<span>${t("Cockpit opérationnel")}</span></div>`}</div><div class="header-tools"><details class="filter-popover"><summary class="ui-button icon-only secondary" title="${t("Filtres")}" aria-label="${t("Filtres")}">${icon("filter")}</summary><div class="filter-panel"><select id="priority-filter" aria-label="${t("Filtrer par priorité")}"><option value="">${t("Toutes les priorités")}</option>${priorities().map(p=>`<option value="${esc(p.id)}" ${p.id===priorityFilter?"selected":""}>${esc(p.code)} · ${esc(p.name)}</option>`).join("")}</select><select id="taxonomy-filter" aria-label="${t("Filtrer par objectif ou axe")}"><option value="">${t("Tous les objectifs et axes")}</option>${filterDimensions.flatMap(d=>(d.values||[]).filter(v=>!v.archived).map(v=>`<option value="${esc(d.id)}:${esc(v.id)}" ${`${d.id}:${v.id}`===taxonomyFilter?"selected":""}>${esc(d.name)} · ${esc(v.name)}</option>`)).join("")}</select><select id="label-filter" aria-label="${t("Filtrer par étiquette")}"><option value="">${t("Toutes les étiquettes")}</option>${allLabels().map(l=>`<option ${l===labelFilter?"selected":""}>${esc(l)}</option>`).join("")}</select></div></details></div></div></div>`;
  }

  function restoreAgendaScroll(root,key) {
    requestAnimationFrame(()=>{const scroller=root.querySelector("[data-agenda-scroll]");if(!scroller)return;const {start,end}=agendaRange(),currentKey=today(),currentHour=agendaZonedParts(new Date())?.hour??8,inRange=currentKey>=dateKey(start)&&currentKey<dateKey(end),fallback=(inRange?Math.max(0,currentHour-1):8)*agendaHourHeight;scroller.scrollTop=agendaScrollMemory.has(key)?agendaScrollMemory.get(key):fallback;scroller.addEventListener("scroll",()=>agendaScrollMemory.set(key,scroller.scrollTop),{passive:true})});
  }

  // Premier pas. Tant qu il n y a rien a montrer, autant expliquer ce qu une
  // tache produit plutot que de repeter « aucune carte » six fois.
  function renderFirstRun(){
    if(!board.spaces.length){
      const agentState=engineAvailability.checked
        ? `<div class="first-run-agents"><span class="${engineAvailability.codex?"ready":"missing"}">${engineAvailability.codex?icon("check"):icon("alert")} Codex · ${t(engineAvailability.codex?"détecté":"introuvable")}</span><span class="${engineAvailability.claude?"ready":"missing"}">${engineAvailability.claude?icon("check"):icon("alert")} Claude Code · ${t(engineAvailability.claude?"détecté":"introuvable")}</span></div>`
        : `<div class="first-run-agents checking">${icon("sync")} ${t("Détection de Codex et Claude Code…")}</div>`;
      const steps=[[t("Choisis un dossier"),t("CTRL KANB crée le projet sans déplacer ni modifier son contenu.")],[t("Confie une tâche"),t("Sélectionne Codex ou Claude Code, puis décide de son accès au dossier.")],[t("Relis le résultat"),t("La conversation, les validations et l’historique restent réunis dans la carte.")]];
      return `<div class="first-run welcome"><span class="eyebrow">${t("BIENVENUE")}</span><h2>${t("Ton espace de travail commence ici.")}</h2><p class="lead">${t("Ajoute le dossier d’un projet réel. Tu partiras d’un tableau vide, sans exemple ni donnée imposée.")}</p><ol class="first-run-steps">${steps.map(([title,detail],index)=>`<li><span>${index+1}</span><div><strong>${esc(title)}</strong><small>${esc(detail)}</small></div></li>`).join("")}</ol>${agentState}<div class="first-run-actions"><button class="ui-button primary" data-action="add-space">${icon("folder")}${t("Ajouter mon premier projet")}</button><button class="ui-button secondary" data-action="open-agent-settings">${t("Vérifier les agents")}</button></div></div>`;
    }
    const etapes=[
      [t("Décrire"), t("Un résultat à atteindre et un brief. C’est le brief que l’agent lit.")],
      [t("Lancer"), t("Tu choisis l’agent et son niveau d’accès au dossier. Rien ne part sans toi.")],
      [t("Vérifier"), t("Le résultat revient dans une colonne de vérification, avec sa conversation.")],
    ];
    return `<div class="first-run"><span class="eyebrow">${t("PREMIER PAS")}</span><h2>${t("Ton tableau est vide.")}</h2><p class="lead">${t("Une tâche confie un travail précis à Codex ou à Claude Code, dans le dossier d’un de tes projets.")}</p><ol class="first-run-steps">${etapes.map(([titre,detail],index)=>`<li><span>${index+1}</span><div><strong>${esc(titre)}</strong><small>${esc(detail)}</small></div></li>`).join("")}</ol><div class="first-run-actions"><button class="ui-button primary" data-action="add-card">${t("Créer ma première tâche")}</button><button class="ui-button secondary" data-action="quick-capture">${t("Capturer une idée")}</button></div></div>`;
  }

  function renderBoard() {
    let cards = baseVisibleCards();
    const root=document.querySelector("#board");
    if(selection==="settingsView"){root.className="settings-page";root.innerHTML=renderSettingsPage();return}
    if(selection==="agendaView"){const key=`${agendaMode}:${dateKey(agendaAnchor)}`,previous=root.querySelector("[data-agenda-scroll]");if(previous&&root.dataset.agendaScrollKey)agendaScrollMemory.set(root.dataset.agendaScrollKey,previous.scrollTop);root.className="agenda-view";root.dataset.agendaScrollKey=key;root.innerHTML=renderAgenda();restoreAgendaScroll(root,key);return}
    if(selection==="reviewView"){root.className="validation-page";root.innerHTML=renderValidationCenter();return}
    if(selection==="followView"){root.className="follow-page";root.innerHTML=renderFollowUp();return}
    if(selection==="doneView"){root.className="history-page";root.innerHTML=renderHistory(cards);return}
    if(!board.cards.length){root.className="first-run-view";root.innerHTML=renderFirstRun();return}
    if(surfaceMode==="flow"){root.className="flow-view";root.innerHTML=renderFlow(cards);return}
    if(board.settings.taskLayout==="list"){root.className="task-list-view";root.innerHTML=renderTaskList(cardsForPreset(cards,activePreset().id));return}
    root.className="board";
    const preset=activePreset(),columns=preset.columns;
    cards=cardsForPreset(cards,preset.id);
    root.style.setProperty("--column-count",columns.length);
    root.innerHTML = columns.map(column => {
      const items = cards.filter(card => columnForCard(card,preset)?.id===column.id).sort(compareCards);
      const displayKey=`${selection}:${preset.id}:${column.id}`,limit=expandedColumnLimits.get(displayKey)||cardsPerColumnPage,visible=items.slice(0,limit),remaining=Math.max(0,items.length-visible.length);
      const canAdd=["backlog","ready"].includes(column.status),canArchive=column.kind==="done"&&items.some(card=>!card.archived),help=columnHelp(preset.id,column.kind);
      return `<section class="column" data-column="${esc(column.id)}" style="--column-color:#${esc(column.color||"8C93A3")}"><div class="column-head"><span class="glyph"></span><span class="column-name">${esc(column.name)}</span><span class="column-help" tabindex="0" aria-label="${t("Aide : {help}",{help:esc(help)})}">i<span>${esc(help)}</span></span><span class="column-count">${items.length}</span>${canArchive?`<button class="column-archive-completed" data-action="archive-completed" data-preset="${esc(preset.id)}" title="${t("Archiver toutes les cartes terminées visibles")}" aria-label="${t("Archiver toutes les cartes terminées visibles")}">${icon("archive")}</button>`:""}${canAdd?`<button class="column-add-card" data-action="add-card-in-column" data-preset="${esc(preset.id)}" data-status="${esc(column.status)}" data-launch-mode="${column.kind==="planned"?"scheduled":"manual"}" title="${t("Ajouter une carte dans {column}",{column:esc(column.name)})}" aria-label="${t("Ajouter une carte dans {column}",{column:esc(column.name)})}">${icon("plus")}</button>`:""}</div><div class="card-list">${visible.map(renderCard).join("")||`<div class="empty">${t("Aucune carte dans cette colonne")}</div>`}${remaining?`<button class="column-show-more" data-action="show-more-column" data-column-key="${esc(displayKey)}" data-current-limit="${limit}">Afficher ${Math.min(cardsPerColumnPage,remaining)} de plus <small>· ${remaining} masquée${remaining>1?"s":""}</small></button>`:""}</div></section>`;
    }).join("");
  }

  function flowAction(card){
    const active=cardIsBusy(card),pausing=card.executionState==="pausing",paused=card.executionState==="paused";
    if(active||pausing)return `<button class="ui-button secondary pause-control" data-action="suspend-run" data-id="${esc(card.id)}" ${pausing?"disabled":""}>${pausing?t("Arrêt…"):t("Arrêter")}</button>`;
    if(paused||card.status==="running")return `<button class="ui-button primary" data-action="resume-run" data-id="${esc(card.id)}">Reprendre</button>`;
    if(hasPendingValidationForCard(card))return `<button class="ui-button attention-button" data-select="reviewView">${t("Répondre")}</button>`;
    if(card.status==="review"||cardExecutionFailed(card))return `<button class="ui-button attention-button" data-action="review-decision" data-id="${esc(card.id)}">${t("Décider")}</button>`;
    if(card.status==="ready"&&card.launchMode!=="scheduled")return `<button class="ui-button primary" data-action="run" data-id="${esc(card.id)}">${t("Lancer")}</button>`;
    return `<button class="ui-button secondary" data-action="edit-card" data-id="${esc(card.id)}">${t("Ouvrir")}</button>`;
  }
  function flowLateReason(card){
    if(card.scheduleState==="skipped")return "Créneau manqué";
    const day=today(),nowMs=Date.now(),scheduled=scheduleTime(card.scheduledAt);
    if(card.launchMode==="scheduled"&&Number.isFinite(scheduled)&&scheduled<nowMs-flowLateGraceMs&&["backlog","ready"].includes(card.status)){
      const days=Math.floor((nowMs-scheduled)/86400000);
      return days>=1?`Lancement en retard de ${days} j`:"Lancement dépassé";
    }
    if(card.dueDate&&String(card.dueDate).slice(0,10)<day&&card.status!=="done"){
      const days=Math.round((parseLocalDate(day)-parseLocalDate(card.dueDate))/86400000);
      return days>1?`Échéance dépassée de ${days} j`:"Échéance dépassée";
    }
    return "";
  }
  const flowIsLate = card => Boolean(flowLateReason(card));
  function renderFlowItem(card,note=""){
    const space=getSpace(card.spaceID)||{name:"Projet",accentHex:"8C93A3"},priority=priorityByID(card.priorityLevelID),scheduled=card.scheduledAt?formatSchedule(card.scheduledAt):"";
    const state=note||(card.executionState==="paused"?t("Arrêtée"):activeRuns.has(card.id)?t("En cours"):queuePositions.has(card.id)?queueLabel(card):hasPendingValidationForCard(card)?"Validation":card.status==="review"?"Résultat à relire":cardExecutionFailed(card)?t("Échec à vérifier"):card.status==="ready"?"Prête":columnForCard(card,fixedBoardPresets().find(p=>p.id===cardBoardPresetID(card)))?.name||card.status);
    return `<article class="flow-task"><span class="flow-task-accent" style="background:#${safeHex(space.accentHex)}"></span><div class="flow-task-main"><div><span class="priority-ref" style="--priority-color:#${safeHex(priority.color,"9CA3AF")}">${esc(cardReference(card))}</span><button data-action="edit-card" data-id="${esc(card.id)}">${esc(card.title)}</button></div><p>${esc(space.name)} · ${esc(cardBoardPresetID(card)==="routines"?"Routine":"Classique")}${scheduled?` · ${esc(scheduled)}`:card.dueDate?` · échéance ${esc(card.dueDate)}`:""}</p></div><span class="flow-task-state">${esc(state)}</span>${flowAction(card)}</article>`;
  }
  function renderFlowSection({id,tone="",kicker,title,description,cards,note}){
    if(!cards.length)return "";
    const limit=expandedFlowSections.get(id)||flowSectionPageSize,visible=cards.slice(0,limit),remaining=Math.max(0,cards.length-visible.length);
    return `<section class="flow-dashboard-section ${tone}"><div class="flow-dashboard-head"><div><span class="section-kicker">${esc(kicker)}</span><h2>${esc(title)}</h2><p>${esc(description)}</p></div><strong>${cards.length}</strong></div><div class="flow-task-list">${visible.map(card=>renderFlowItem(card,note?note(card):"")).join("")}${remaining?`<button class="flow-dashboard-more" data-action="show-more-flow" data-flow-key="${esc(id)}" data-current-limit="${limit}">Afficher ${remaining} tâche${remaining>1?"s":""} de plus</button>`:""}</div></section>`;
  }
  function renderFlowTier({id,title,description,clear,sections}){
    const body=sections.map(renderFlowSection).join("");
    return `<section class="flow-tier ${esc(id)}"><div class="flow-tier-head"><h2>${esc(title)}</h2><p>${esc(description)}</p></div>${body?`<div class="flow-dashboard-grid">${body}</div>`:`<div class="flow-tier-clear">${icon("check")}<span>${esc(clear)}</span></div>`}</section>`;
  }
  function renderFlow(cards){
    const day=today(),weekEnd=dateKey(addDays(parseLocalDate(day),8));
    const sortCards=list=>[...list].sort((a,b)=>priorityOrder(a)-priorityOrder(b)||Number(a.priorityNumber||9999)-Number(b.priorityNumber||9999)||String(a.scheduledAt||a.dueDate||"9999").localeCompare(String(b.scheduledAt||b.dueDate||"9999"))||String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));
    const pool=cards.filter(card=>card.status!=="done"&&!card.archived),claimed=new Set();
    const take=predicate=>{const picked=pool.filter(card=>!claimed.has(card.id)&&predicate(card));for(const card of picked)claimed.add(card.id);return sortCards(picked)};
    const awaiting=take(hasPendingValidationForCard);
    const decide=take(card=>card.status==="review"||cardExecutionFailed(card));
    const late=take(flowIsLate);
    const blocked=take(card=>dependencyOpen(card)&&["backlog","ready"].includes(card.status));
    const active=take(taskIsActivelyExecuting);
    const launchNow=take(card=>card.status==="ready"&&card.launchMode!=="scheduled");
    const laterToday=take(card=>agendaDateKeyFromValue(card.scheduledAt||card.dueDate)===day);
    const upcoming=take(card=>{const key=agendaDateKeyFromValue(card.scheduledAt||card.dueDate);return Boolean(key)&&key>day&&key<weekEnd});
    const topPriorityIDs=new Set([...priorities()].sort((a,b)=>a.weight-b.weight).slice(0,2).map(priority=>priority.id));
    const priorityPool=take(card=>topPriorityIDs.has(card.priorityLevelID)&&!agendaDateKeyFromValue(card.scheduledAt||card.dueDate));
    const blocking=awaiting.length+decide.length+late.length+blocked.length;
    return `<div class="flow-dashboard"><section class="flow-command-center"><div><span class="section-kicker">${t("Cockpit du jour")}</span><h2>${blocking?`${blocking} chose${blocking>1?"s":""} attend${blocking>1?"ent":""} après toi`:"Rien ne bloque"}</h2><p>${t("Les décisions, le travail en cours et les prochaines étapes, au même endroit.")}</p></div><div class="flow-command-stats"><span class="${blocking?"attention":""}"><strong>${blocking}</strong> à traiter</span><span><strong>${active.length}</strong> en cours</span><span><strong>${launchNow.length}</strong> ${t("prêtes")}</span><span><strong>${laterToday.length}</strong> plus tard</span>${launchNow.length?`<button class="ui-button primary" data-action="run-ready">${icon("play")}<span>${t("Lancer les prêtes")}</span></button>`:""}</div></section>${renderFlowTier({id:"blocking",title:"Ça bloque",description:"Ce qui attend une décision de ta part, a échoué, ou aurait déjà dû tourner.",clear:"Rien n’attend après toi.",sections:[{id:"flow-awaiting",tone:"attention",kicker:"Exécution gelée",title:"L’agent attend ta réponse",description:"Le travail reste suspendu tant que la demande n’a pas reçu de réponse.",cards:awaiting,note:()=>"Gelée"},{id:"flow-decide",tone:"attention",kicker:"Décision",title:"Résultats et échecs à trancher",description:"Un travail est revenu et attend que tu le termines ou le relances.",cards:decide},{id:"flow-late",tone:"late",kicker:"Retard",title:"Aurait déjà dû tourner",description:"Créneaux manqués et échéances dépassées.",cards:late,note:flowLateReason},{id:"flow-blocked",tone:"late",kicker:"Dépendance",title:"Bloquées par une autre tâche",description:"Le lancement échouera tant que les dépendances ne sont pas terminées.",cards:blocked,note:()=>"Dépendance ouverte"}]})}${renderFlowTier({id:"today",title:"Aujourd’hui",description:"Ce qui tourne, ce que tu peux lancer maintenant, et ce qui arrive d’ici ce soir.",clear:"Rien de prévu aujourd’hui.",sections:[{id:"flow-active",tone:"active",kicker:"En vol",title:"En cours et dans la file",description:"Travail actif, suspendu ou en attente d’un créneau d’exécution.",cards:active},{id:"flow-now",tone:"ready",kicker:"Action immédiate",title:"Prêtes à lancer",description:"Consigne suffisamment définie pour démarrer tout de suite.",cards:launchNow},{id:"flow-later",tone:"today",kicker:"Plus tard",title:"Prévu d’ici ce soir",description:"Lancements programmés et échéances qui tombent aujourd’hui.",cards:laterToday}]})}${renderFlowTier({id:"horizon",title:"Ce qui arrive",description:"De quoi anticiper la semaine et repérer les priorités jamais planifiées.",clear:"Aucune échéance dans les sept prochains jours.",sections:[{id:"flow-upcoming",tone:"upcoming",kicker:"Sept jours",title:"Les prochains jours",description:"Planifications et échéances datées après aujourd’hui.",cards:upcoming},{id:"flow-pool",tone:"priority",kicker:"Vivier",title:"Priorités sans date",description:"Cartes des deux niveaux les plus hauts qui n’ont ni créneau ni échéance.",cards:priorityPool}]})}</div>`;
  }

  const backgroundSchedulerPresentation = () => {
    if(!board.settings.backgroundSchedulerEnabled)return {label:t("Désactivé"),tone:"off",description:t("Aucun LaunchAgent n’est installé : les tâches ne démarrent que lorsque CTRL KANB est déjà ouvert.")};
    if(backgroundSchedulerState.error||backgroundSchedulerState.state==="error"||backgroundSchedulerState.state==="missing")return {label:"À vérifier",tone:"error",description:backgroundSchedulerState.message||"Le moteur n’a pas pu être activé."};
    if(backgroundSchedulerState.installed)return {label:"Actif",tone:"active",description:backgroundSchedulerState.message||"Le moteur surveille CTRL KANB en arrière-plan."};
    return {label:t("Activation…"),tone:"pending",description:t("macOS installe le moteur local.")};
  };
  const schedulerCheckLabel = () => {
    if(!backgroundSchedulerState.lastCheck)return t("Premier contrôle en attente");
    const date=new Date(backgroundSchedulerState.lastCheck);
    return Number.isNaN(date.getTime())?"Contrôle récent":`Dernier contrôle ${date.toLocaleString(locale(),{dateStyle:"short",timeStyle:"short"})}`;
  };

  function calendarSettingsMarkup(){
    const storedZone=normalizeAgendaTimeZone(board.settings?.agendaTimeZone),resolvedZone=agendaTimeZone(),zoneSummary=`${agendaTimeZoneName(resolvedZone)} · ${agendaOffsetLabel(resolvedZone)}`;
    return `<section id="settings-calendar" class="preference-section calendar-settings-section"><div class="preference-heading"><h2>${t("Agenda")}</h2><p>${t("Adapte les dates et les heures à la région et au rythme de travail de l’utilisateur.")}</p></div><div class="preference-grid"><div class="field"><label>${t("Fuseau horaire")}</label><small>${t("Fuseau utilisé pour afficher et créer les tâches programmées. Actuellement : {zone}.",{zone:esc(zoneSummary)})}</small><select name="agendaTimeZone"><option value="auto" ${storedZone==="auto"?"selected":""}>${t("Automatique · réglage du Mac")}</option>${agendaTimeZoneOptions()}</select></div><div class="field"><label>${t("Premier jour de la semaine")}</label><small>${t("Réorganise les vues Semaine et Mois sans modifier les dates des tâches.")}</small><select name="agendaWeekStart">${agendaWeekStarts.map(([value,label])=>`<option value="${value}" ${normalizeAgendaWeekStart(board.settings?.agendaWeekStart)===value?"selected":""}>${esc(t(label))}</option>`).join("")}</select></div><div class="field"><label>${t("Format de l’heure")}</label><small>${t("S’applique à la grille, aux cartes et aux heures programmées.")}</small><select name="agendaHourCycle">${agendaHourCycles.map(([value,label])=>`<option value="${value}" ${normalizeAgendaHourCycle(board.settings?.agendaHourCycle)===value?"selected":""}>${esc(t(label))}</option>`).join("")}</select></div><div class="field"><label>${t("Vue d’agenda par défaut")}</label><small>${t("La vue proposée à l’ouverture de l’Agenda.")}</small><select name="agendaMode">${agendaModes.map(([id,label])=>`<option value="${id}" ${normalizeAgendaMode(board.settings.agendaMode)===id?"selected":""}>${esc(t(label))}</option>`).join("")}</select></div></div><div class="settings-callout"><strong>${t("Des horaires fiables :")}</strong> ${t("une tâche programmée garde le même instant de lancement. Changer de fuseau adapte seulement la date et l’heure affichées.")}</div></section>`;
  }

  function panelWidthSettingsMarkup(){
    return `<div class="settings-subsection appearance-panels"><div class="settings-subsection-heading"><h3>${t("Panneaux latéraux")}</h3><p>${t("Ajuste l’espace réservé à la navigation et aux outils du projet.")}</p></div><div class="panel-width-settings"><div class="preference-row"><div><strong>${t("Panneau gauche")}</strong><small>${t("Largeur actuelle : {n} pixels. Tu peux aussi faire glisser sa bordure.", {n: Math.round(clampSidebarWidth(board.settings.sidebarWidth))})}</small></div><button type="button" class="ui-button secondary" data-action="reset-sidebar">${t("Rétablir")}</button></div><div class="preference-row"><div><strong>${t("Panneau droit")}</strong><small>${t("Largeur actuelle : {n} pixels. Tu peux aussi faire glisser sa bordure.", {n: Math.round(clampUtilityPanelWidth(board.settings.utilityPanelWidth))})}</small></div><button type="button" class="ui-button secondary" data-action="reset-utility-width">${t("Rétablir")}</button></div></div></div>`;
  }

  function appearanceSettingsMarkup(){
    const selectedMode=normalizeTheme(board.settings.theme),selectedPalette=normalizeThemePalette(board.settings.themePalette),selectedFontSize=normalizeFontSize(board.settings.fontSize);
    const modeOptions=themeModes.map(([id,label,description,glyph])=>`<label class="theme-mode-option ${selectedMode===id?"active":""}" title="${esc(t(description))}"><input type="radio" name="theme" value="${id}" ${selectedMode===id?"checked":""}><span>${icon(glyph)}${esc(t(label))}</span></label>`).join("");
    const fontSizeOptions=fontSizes.map(([id,label])=>`<label class="font-size-option ${selectedFontSize===id?"active":""}"><input type="radio" name="fontSize" value="${id}" ${selectedFontSize===id?"checked":""}><span>${esc(t(label))}</span></label>`).join("");
    const paletteOptions=themePalettes.map(palette=>`<label class="theme-palette-option ${selectedPalette===palette.id?"active":""}"><input type="radio" name="themePalette" value="${esc(palette.id)}" ${selectedPalette===palette.id?"checked":""}><span class="theme-palette-preview" style="${themePreviewStyle(palette)}" aria-hidden="true"><i class="theme-preview-sidebar"></i><i class="theme-preview-line one"></i><i class="theme-preview-line two"></i><i class="theme-preview-pill"></i></span><span class="theme-palette-copy"><strong>${esc(t(palette.name))}</strong><small>${esc(t(palette.description))}</small></span><span class="theme-palette-check" aria-hidden="true">${icon("check")}</span></label>`).join("");
    return `<section id="settings-appearance" class="preference-section appearance-settings-section"><div class="preference-heading"><h2>${t("Apparence")}</h2><p>${t("Adapte la lisibilité, la luminosité et les couleurs de toute l’interface.")}</p></div><div class="preference-grid appearance-language"><div class="field"><label>${t("Langue")}</label><small>${t("Le mode automatique suit la langue de macOS. La langue change immédiatement.")}</small><select name="language">${languages.map(([id,label])=>`<option value="${esc(id)}" ${normalizeLanguage(board.settings.language)===id?"selected":""}>${esc(t(label))}</option>`).join("")}</select></div></div><div class="font-size-row"><span><strong>${t("Taille du texte")}</strong><small>${t("Agrandit tous les textes de l’application. La taille normale conserve la densité actuelle.")}</small></span><div class="font-size-switch" role="radiogroup" aria-label="${t("Taille du texte")}">${fontSizeOptions}</div></div><div class="theme-mode-row"><span><strong>${t("Mode de couleur")}</strong><small>${t("Choisis une luminosité fixe ou suis le réglage de macOS.")}</small></span><div class="theme-mode-switch" role="radiogroup" aria-label="${t("Mode de couleur")}">${modeOptions}</div></div><div class="theme-palette-heading"><strong>${t("Palette")}</strong><small>${t("Chaque palette existe en clair et en sombre.")}</small></div><div class="theme-palette-grid">${paletteOptions}</div>${panelWidthSettingsMarkup()}</section>`;
  }

  function notificationSettingsMarkup(){
    const enabled=Boolean(board.settings.systemNotificationsEnabled),events=normalizeNotificationEvents(board.settings.notificationEvents);
    const permission={
      authorized:[t("Autorisées par macOS"),"allowed",""],
      provisional:[t("Autorisées discrètement"),"allowed",""],
      denied:[t("Bloquées par macOS"),"blocked","open-notification-settings"],
      notDetermined:[t("Autorisation requise"),"pending","request-notifications"],
      unknown:[t("État en cours de vérification"),"pending","refresh-notification-status"]
    }[notificationAuthorization.status]||[t("État indisponible"),"pending","refresh-notification-status"];
    const permissionAction=permission[2]==="open-notification-settings"?`<button type="button" class="ui-button secondary" data-action="open-notification-settings">${t("Ouvrir les réglages macOS")}</button>`:permission[2]==="request-notifications"?`<button type="button" class="ui-button secondary" data-action="request-notifications">${t("Autoriser")}</button>`:permission[2]?`<button type="button" class="ui-button secondary" data-action="refresh-notification-status">${t("Actualiser")}</button>`:"";
    const eventRows=notificationEventCatalog.map(([id,label,description,glyph])=>`<label class="notification-event-row ${enabled?"":"is-disabled"}"><span class="notification-event-icon">${icon(glyph)}</span><span><strong>${esc(t(label))}</strong><small>${esc(t(description))}</small></span><input type="checkbox" name="notificationEvent__${id}" ${events[id]?"checked":""} ${enabled?"":"disabled"}></label>`).join("");
    return `<section id="settings-interface" class="preference-section notification-settings-section"><div class="preference-heading"><h2>${t("Notifications")}</h2><p>${t("Choisis séparément les messages affichés dans CTRL KANB et les alertes envoyées par macOS.")}</p></div><div class="notification-group"><div class="notification-group-head"><span class="notification-group-mark">${icon("message")}</span><div><h3>${t("Dans CTRL KANB")}</h3><p>${t("Ces messages confirment une action ou signalent un problème dans la fenêtre.")}</p></div></div><div class="preference-grid"><div class="field"><label>${t("Messages dans l’application")}</label><small>${t("Le mode Essentiels conserve toujours les erreurs, les validations et les résultats d’agent.")}</small><select name="inAppNotifications">${inAppNotificationModes.map(([id,label])=>`<option value="${id}" ${normalizeInAppNotifications(board.settings.inAppNotifications)===id?"selected":""}>${esc(t(label))}</option>`).join("")}</select></div></div></div><div class="notification-group"><div class="notification-group-head"><span class="notification-group-mark">${icon("bell")}</span><div><h3>${t("Notifications macOS")}</h3><p>${t("Elles restent utiles quand la fenêtre est masquée, fermée ou derrière une autre app.")}</p></div><span class="notification-permission ${permission[1]}"><i></i>${esc(permission[0])}</span>${permissionAction}</div><div class="preference-grid notification-master-grid"><label class="preference-toggle"><span><strong>${t("Autoriser les notifications macOS")}</strong><small>${t("Coupe toutes les alertes système sans masquer les messages importants dans CTRL KANB.")}</small></span><input type="checkbox" name="systemNotificationsEnabled" ${enabled?"checked":""}></label><div class="field"><label>${t("Quand les afficher")}</label><small>${t("Évite les doublons lorsque tu regardes déjà la fenêtre.")}</small><select name="notificationWhen" ${enabled?"":"disabled"}>${notificationWhenModes.map(([id,label])=>`<option value="${id}" ${normalizeNotificationWhen(board.settings.notificationWhen)===id?"selected":""}>${esc(t(label))}</option>`).join("")}</select></div></div><div class="notification-events" aria-label="${t("Événements à signaler")}"><div class="notification-events-title"><strong>${t("Événements à signaler")}</strong><small>${t("Ces choix s’appliquent à Codex et Claude Code.")}</small></div>${eventRows}</div><p class="notification-note">${icon("shield")}<span>${t("Une tâche peut reprendre ces choix, forcer ses propres alertes ou rester silencieuse depuis son panneau de création.")}</span></p></div></section>`;
  }

  function syncSettingsMarkup(){
    const codex=codexSyncStatusCopy(),claude=claudeSyncStatusCopy(),busy=syncing||claudeSyncing;
    return `<section id="settings-sync" class="preference-section sync-settings-section"><div class="preference-heading"><h2>${t("Synchronisation")}</h2><p>${t("Maintient les tâches liées à jour avec leurs conversations Codex et leurs sessions Claude Code.")}</p></div><div id="conversation-refresh-settings" class="sync-settings"><div class="sync-settings-head"><div><h3>${t("Conversations des tâches")}</h3><p>${t("Codex et Claude Code sont relus ensemble, manuellement ou automatiquement.")}</p></div><button type="button" id="settings-sync-now" class="ui-button secondary ${busy?"is-busy":""}" data-action="sync-all" title="${t("Relire les conversations Codex et les sessions Claude Code liées")}" ${busy?"disabled":""}>${icon("sync")}<span>${t(busy?"Actualisation en cours…":"Actualiser maintenant")}</span></button></div><div class="sync-agent-list" aria-label="${t("État de l’actualisation par agent")}"><div class="sync-agent-row"><span class="sync-agent-logo">${engineLogo("codex")}</span><span><strong>Codex</strong><small>${t("Relit la conversation principale de chaque tâche liée.")}</small></span><em id="settings-codex-sync-state" class="settings-sync-state sync-${syncState.phase}" title="${esc(codex.detail)}" aria-live="polite">${esc(codex.label)}</em></div><div class="sync-agent-row"><span class="sync-agent-logo">${engineLogo("claude-code")}</span><span><strong>Claude Code</strong><small>${t("Relit sur ce Mac la session principale de chaque tâche liée.")}</small></span><em id="settings-claude-sync-state" class="settings-sync-state sync-${claudeSyncState.phase}" title="${esc(claude.detail)}" aria-live="polite">${esc(claude.label)}</em></div></div><div class="preference-grid sync-controls"><div class="field"><label>${t("Fréquence automatique")}</label><small>${t("La même cadence est utilisée pour Codex et Claude Code.")}</small><select name="syncIntervalSeconds">${syncIntervals.map(([value,label])=>`<option value="${value}" ${value===normalizeSyncInterval(board.settings.syncIntervalSeconds)?"selected":""}>${esc(t(label))}</option>`).join("")}</select></div><label class="preference-toggle"><span><strong>${t("Actualisation automatique")}</strong><small>${t("Relit les deux agents à la fréquence choisie.")}</small></span><input type="checkbox" name="autoSync" ${board.settings.autoSync?"checked":""}></label></div><p class="sync-settings-note">${icon("shield")}<span>${t("Cette lecture ne lance aucune tâche et n’envoie aucun message aux agents.")}</span></p></div></section>`;
  }

  function organisationSettingsMarkup(){
    const dimensions=taxonomy().filter(d=>!d.archived),values=dimensions.flatMap(d=>(d.values||[]).filter(v=>!v.archived).map(value=>({...value,dimension:d.name}))),activeDimensions=dimensions.filter(d=>(d.values||[]).some(v=>!v.archived));
    const priorityChips=priorities().map(priority=>`<span style="--organisation-color:#${safeHex(priority.color,"9CA3AF")}"><i></i>${esc(priority.name)}</span>`).join("");
    const valueChips=values.slice(0,6).map(value=>`<span style="--organisation-color:#${safeHex(value.color)}" title="${esc(value.dimension)}"><i></i>${esc(value.name)}</span>`).join("");
    const classificationStatus=values.length?t("{values} repères dans {axes} axes",{values:values.length,axes:activeDimensions.length}):t("Aucun classement actif");
    return `<div class="settings-subsection organisation-settings-section"><div class="settings-subsection-heading"><h3>${t("Classement des tâches")}</h3><p>${t("Les priorités restent disponibles ; les objectifs et catégories sont facultatifs.")}</p></div><div class="organisation-overview"><article><span class="organisation-feature-icon">${icon("filter")}</span><div><strong>${t("Priorités")}</strong><p>${t("Elles ordonnent le travail et donnent une référence courte à chaque tâche.")}</p><div class="organisation-chips">${priorityChips}</div></div></article><article class="${values.length?"":"inactive"}"><span class="organisation-feature-icon">${icon("sliders")}</span><div><strong>${t("Objectifs et catégories")}</strong><p>${values.length?t("Retrouve ces repères dans les filtres et dans le panneau latéral."):t("Crée seulement les repères qui t’aident réellement à retrouver ton travail.")}</p><div class="organisation-status">${esc(classificationStatus)}</div>${valueChips?`<div class="organisation-chips">${valueChips}${values.length>6?`<span>+${values.length-6}</span>`:""}</div>`:""}</div></article></div><div class="organisation-footer"><p><strong>${t("Simple par défaut.")}</strong> ${t("Dans une tâche, ces options restent repliées sous « Organisation avancée ».")}</p><button type="button" class="ui-button secondary" data-action="settings">${t("Configurer le classement")}</button></div></div>`;
  }

  function taskSettingsMarkup(){
    return `<section id="settings-tasks" class="preference-section task-settings-section"><div class="preference-heading"><h2>${t("Tâches et tableaux")}</h2><p>${t("Choisis le tableau proposé et les repères utilisés pour organiser les tâches.")}</p></div><div class="settings-subsection"><div class="settings-subsection-heading"><h3>${t("Tableau proposé")}</h3><p>${t("Classique suit les tâches ponctuelles ; Routines suit les passages récurrents.")}</p></div><div class="fixed-preset-grid">${fixedBoardPresets().map(preset=>`<article class="fixed-preset-card ${preset.id===board.settings.defaultBoardPreset?"default":""}"><div class="fixed-preset-head"><span>${icon(preset.id==="routines"?"clock":"board")}</span><div><strong>${esc(preset.name)}</strong><small>${esc(preset.description)}</small></div>${preset.id===board.settings.defaultBoardPreset?`<em>${t("Par défaut")}</em>`:""}</div><div class="fixed-column-list">${preset.columns.map(column=>`<span style="--fixed-column-color:#${esc(column.color)}"><i></i>${esc(column.name)}</span>`).join("")}</div></article>`).join("")}</div><div class="field board-default-field"><label>${t("Tableau des nouvelles tâches")}</label><select name="defaultBoardPreset">${fixedBoardPresets().map(preset=>`<option value="${esc(preset.id)}" ${preset.id===board.settings.defaultBoardPreset?"selected":""}>${esc(preset.name)}</option>`).join("")}</select><small>${t("Chaque tâche peut ensuite utiliser l’autre tableau.")}</small></div><div class="settings-callout"><strong>${t("Deux vues complémentaires :")}</strong> ${t("Tableau organise les étapes ; Flux rassemble ce qui attend une action ou une décision.")}</div></div>${organisationSettingsMarkup()}</section>`;
  }

  function renderSettingsPage(){
    const dataPath=windowsApp?"%LOCALAPPDATA%\\CTRL KANB Data\\board.json":"~/Library/Application Support/CTRL KANB/board.json";
    const scheduler=backgroundSchedulerPresentation();
    return `<div class="settings-shell"><main class="settings-content" id="settings-content"><form id="preferences-form" class="settings-page-form">
      ${appearanceSettingsMarkup()}
      ${notificationSettingsMarkup()}
      ${taskSettingsMarkup()}
      ${calendarSettingsMarkup()}
      <section id="settings-archives" class="preference-section archive-settings-section"><div class="preference-heading"><h2>${t("Archivage")}</h2><p>${t("Range automatiquement les tâches terminées sans les supprimer.")}</p></div><div class="archive-settings-grid"><div class="field"><label>${t("Archiver les tâches terminées")}</label><select name="autoArchiveCompletedDays">${[[0,t("Jamais · archivage manuel")],[1,t("Après 1 jour")],[7,t("Après 7 jours")],[14,t("Après 14 jours")],[30,t("Après 30 jours")],[60,t("Après 60 jours")],[90,t("Après 90 jours")]].map(([value,label])=>`<option value="${value}" ${Number(board.settings.autoArchiveCompletedDays||0)===value?"selected":""}>${label}</option>`).join("")}</select><small>${t("Le délai commence à la date réelle de fin.")}</small></div><div class="archive-preservation"><span>${icon("archive")}</span><div><strong>${t("Une archive reste complète")}</strong><p>${t("Elle reste dans Historique et Agenda, avec son résultat et ses conversations.")}</p></div></div></div><div class="settings-callout"><strong>${t("Aucune suppression automatique.")}</strong> ${t("L’archivage masque seulement la tâche dans les tableaux actifs.")}</div></section>
      ${agentsSettingsMarkup()}
      ${syncSettingsMarkup()}
      ${accountsSectionMarkup()}
      <section id="settings-engine" class="preference-section scheduler-section"><div class="scheduler-heading"><div class="preference-heading"><h2>${t("Moteur local")}</h2><p>${t("Garde les tâches programmées disponibles lorsque la fenêtre est fermée.")}</p></div><span class="scheduler-status ${scheduler.tone}"><i></i>${scheduler.label}</span></div><div class="scheduler-card"><label class="preference-toggle scheduler-switch"><span><strong>${t("Lancer le moteur à l’ouverture de session")}</strong><small>${t("Quand cette option est coupée, aucun service de fond n’est installé.")}</small></span><input type="checkbox" name="backgroundSchedulerEnabled" ${board.settings.backgroundSchedulerEnabled?"checked":""}></label><div class="scheduler-state"><div class="scheduler-state-icon">${icon("clock")}</div><div><strong>${esc(scheduler.description)}</strong><small>${esc(schedulerCheckLabel())}</small></div><button type="button" class="ui-button secondary" data-action="refresh-background-status">${t("Actualiser")}</button></div><div class="scheduler-facts"><div><strong>${t("Fenêtre fermée")}</strong><span>${t("Le moteur continue sans garder la fenêtre visible.")}</span></div><div><strong>${t("Mac en veille ou éteint")}</strong><span>${t("Les tâches configurées pour être rattrapées repartent au réveil.")}</span></div><div><strong>${t("Limite d’usage")}</strong><span>${t("La tâche reste en attente avec des essais espacés pendant quatre heures.")}</span></div></div><div class="settings-callout scheduler-note"><strong>${t("À savoir :")}</strong> ${t("Codex peut travailler sans fenêtre ouverte lorsque son moteur local est installé et authentifié.")}</div></div></section>
      ${securitySettingsMarkup()}
      <section id="settings-data" class="preference-section"><div class="preference-heading"><h2>${t("Données")}</h2><p>${t("Sauvegarde ou restaure l’organisation complète de CTRL KANB dans un fichier JSON.")}</p></div><div class="data-transfer-grid"><article><span class="data-transfer-icon">${icon("save")}</span><div><strong>${t("Exporter une sauvegarde")}</strong><p>${t("Enregistre les projets, tâches, réglages et historiques à l’emplacement de ton choix.")}</p></div><button type="button" class="ui-button secondary" data-action="export-data">${t("Exporter…")}</button></article><article><span class="data-transfer-icon">${icon("history")}</span><div><strong>${t("Restaurer une sauvegarde")}</strong><p>${t("Remplace l’organisation actuelle après confirmation. Une copie de sécurité est créée avant le remplacement.")}</p></div><button type="button" class="ui-button secondary" data-action="confirm-import-data">${t("Restaurer…")}</button></article></div><div class="data-location"><div><strong>${t("Fichier principal local")}</strong><code>${esc(dataPath)}</code></div><button type="button" class="secondary" data-action="data">${t("Afficher dans le Finder")}</button></div><p class="data-privacy-note">${icon("shield")}<span>${t("L’export peut contenir les chemins des projets et des comptes configurés. Il ne copie ni les fichiers des projets ni les secrets de connexion gérés par les agents.")}</span></p></section>
      <section id="settings-about" class="preference-section about-section"><img src="AppIcon.png" alt="Icône CTRL KANB"><div><h2>CTRL KANB</h2><p>${t("Version")} ${esc(appVersion||"—")}</p><small>${t("Application macOS locale pour piloter Codex et Claude Code.")}</small></div></section>
      <div class="settings-savebar"><span>${preferencesSavedAt?`${t("Enregistré à {heure}", {heure: esc(preferencesSavedAt)})} · ${t("Chaque réglage s’applique dès que tu le changes.")}`:t("Chaque réglage s’applique dès que tu le changes.")}</span></div></form></main></div>`;
  }

  function renderFocusCard(card){
    const priority=priorityByID(card.priorityLevelID),space=getSpace(card.spaceID)||{name:"Projet",accentHex:"6E75FF"};
    const active=cardIsBusy(card),pausing=card.executionState==="pausing",paused=card.executionState==="paused";
    const action=active||pausing?`<button class="secondary pause-control" data-action="suspend-run" data-id="${esc(card.id)}" ${pausing?"disabled":""}>${pausing?t("Arrêt…"):t("Arrêter")}</button>`:paused||card.status==="running"?`<button class="primary" data-action="resume-run" data-id="${esc(card.id)}">Reprendre</button>`:`<button class="primary" data-action="run" data-id="${esc(card.id)}">${t("Lancer avec Codex")}</button>`;
    return `<article class="focus-card ${paused?"paused":""}" style="--space-color:#${safeHex(space.accentHex)}"><div class="card-top"><span class="priority-ref" style="--priority-color:#${safeHex(priority.color,"9CA3AF")}">${esc(cardReference(card))}</span><h3><button class="card-title-button" data-action="edit-card" data-id="${esc(card.id)}">${esc(card.title)}</button></h3><button class="more pin-task ${card.pinned?'pinned':''}" data-action="pin-card" data-id="${esc(card.id)}" aria-label="${t("Épingler la tâche")}" aria-pressed="${Boolean(card.pinned)}">${icon("pin")}</button></div><div class="space-tag"><i></i>${esc(space.name)}</div><p class="prompt">${esc(card.prompt)}</p>${paused?`<div class="pause-note">${t("Ⅱ Exécution arrêtée · la conversation est conservée")}</div>`:""}<div class="focus-action"><span class="mode">${paused?t("Arrêtée"):esc(aiSummary(card))}</span>${action}</div></article>`;
  }
  const priorityOrder = card => priorityByID(card.priorityLevelID)?.weight ?? 999;
  const modelLabel = value => ({"gpt-5.6-sol":"Sol","gpt-5.6-terra":"Terra","gpt-5.6-luna":"Luna","sonnet":"Sonnet","opus":"Opus","haiku":"Haiku"}[value]||t("Modèle par défaut"));
  const effortLabel = value => t(effortCatalog.find(([id])=>id===value)?.[1]||"Moyen");
  const aiSummary = card => `${engineLabel(card.agentEngine)} · ${modelLabel(card.model||defaultModelFor(card.agentEngine))} · ${effortLabel(card.reasoningEffort||defaultEffortFor(card.agentEngine))}`;

  function renderCard(card) {
    const space = getSpace(card.spaceID) || {name:"Espace inconnu",accentHex:"6E75FF"};
    const conversation = activeConversation(card), blocked = dependencyOpen(card), position = queuePositions.get(card.id);
    const waitingValidation=hasPendingValidationForCard(card),failed=cardExecutionFailed(card),needsReview=card.status==="review"||failed,recurring=card.recurrence&&card.recurrence!=="none",pausing=card.executionState==="pausing",paused=card.executionState==="paused";
    const subtasks = card.subtasks || [], completed = subtasks.filter(s=>s.done).length, priority=priorityByID(card.priorityLevelID), categories=assignedValues(card);
    return `<article class="card ${blocked||waitingValidation?"blocked":""} ${failed?"failed":""} ${paused?"paused":""}" draggable="true" data-card="${esc(card.id)}" style="--space-color:#${safeHex(space.accentHex)}">
      <div class="card-top"><span class="priority-ref" style="--priority-color:#${safeHex(priority.color,"9CA3AF")}" title="${esc(priority.name)}">${esc(cardReference(card))}</span><h3><button class="card-title-button" data-action="edit-card" data-id="${esc(card.id)}">${esc(card.title)}</button></h3><button class="more pin-task ${card.pinned?'pinned':''}" data-action="pin-card" data-id="${esc(card.id)}" aria-label="${t("Épingler la tâche")}" aria-pressed="${Boolean(card.pinned)}">${icon("pin")}</button></div>
      ${selection==="global"||specialViews[selection]?`<div class="space-tag"><i></i>${esc(space.name)}</div>`:""}
      <p class="prompt">${esc(card.prompt)}</p>
      ${categories.length?`<div class="taxonomy-badges">${categories.map(({dimension,value})=>`<span style="--tag-color:#${safeHex(value.color)}" title="${esc(dimension.name)}">${esc(dimension.name)} · ${esc(value.name)}</span>`).join("")}</div>`:""}
      ${(card.labels||[]).length?`<div class="labels">${card.labels.map(l=>`<span>${esc(l)}</span>`).join("")}</div>`:""}
      ${card.dueDate?`<div class="due ${card.dueDate<today()&&card.status!=="done"?"late":""}">${t("Échéance")} · ${esc(card.dueDate)}${card.recurrence&&card.recurrence!=="none"?` · ↻ ${recurrenceLabel(card.recurrence)}`:""}</div>`:""}
      ${card.launchMode==="scheduled"?`<div class="schedule-badge ${esc(card.scheduleState||"pending")}"><span>◴ ${esc(formatSchedule(card.scheduledAt))} · ${esc(scheduleStateLabel(card.scheduleState))}${card.scheduleNextAttemptAt?` · nouvel essai ${esc(formatSchedule(card.scheduleNextAttemptAt))}`:""}${card.scheduleNote?`<small>${esc(t(card.scheduleNote,card.scheduleNoteVars))}</small>`:""}</span>${["paused","failed","skipped"].includes(card.scheduleState)?`<button data-action="resume-schedule" data-id="${esc(card.id)}">Reprendre</button>`:recurring&&!activeRuns.has(card.id)&&!position&&card.status!=="done"?`<button data-action="pause-routine" data-id="${esc(card.id)}">Suspendre</button>`:""}</div>`:""}${card.launchMode==="codex"?`<div class="routine-badge">⌁ Routine Codex Scheduled · ${esc(card.routineName||"référence à définir")}</div>`:""}
      ${blocked?`<div class="blocked-note">${t("! Dépend d’une autre carte non terminée")}</div>`:waitingValidation?`<div class="blocked-note">${t("! Codex attend ta validation")}</div>`:failed?`<div class="failure-note">${t("Échec d’exécution · résultat à vérifier")}</div>`:paused?`<div class="pause-note">${t("Ⅱ Exécution arrêtée · la conversation est conservée")}</div>`:""}
      ${subtasks.length?`<div class="subtasks"><div class="subtask-progress"><span style="width:${Math.round(completed/subtasks.length*100)}%"></span></div>${subtasks.slice(0,4).map(s=>`<label><input type="checkbox" data-action="toggle-subtask" data-card-id="${esc(card.id)}" data-subtask="${esc(s.id)}" ${s.done?"checked":""}>${esc(s.title)}</label>`).join("")}<small>${completed}/${subtasks.length}</small></div>`:""}
      ${conversation?`<div class="conversation-line"><button class="conversation-badge" data-action="conversation-panel" data-id="${esc(card.id)}"><span>${card.conversationState==="active"?"●":"◉"}</span>${esc(conversation.name||"Conversation Codex")} ${card.conversations.length>1?`+${card.conversations.length-1}`:""}</button><button class="external" data-action="open-conversation" data-thread="${esc(conversation.id)}">↗</button></div>`:`<span class="conversation-badge empty-link">○ ${t("Nouvelle conversation au lancement")}</span>`}
      ${card.lastRun?.summary?`<div class="run-summary">${esc(card.lastRun.summary)}</div>`:""}
      <div class="card-foot"><span class="mode">${card.archived?"Archivée":card.status==="done"?t("Terminée"):pausing?t("Arrêt…"):paused?t("Arrêtée"):activeRuns.has(card.id)?t("En cours"):position?queueLabel(card):esc(aiSummary(card))}</span>${card.archived?`<button data-action="unarchive-card" data-id="${esc(card.id)}">Restaurer</button>`:card.status==="done"?`<button class="archive-control" data-action="archive-card" data-id="${esc(card.id)}">${icon("archive")}<span>${t("Archiver")}</span></button>`:activeRuns.has(card.id)||position||pausing?`<button class="pause-control" data-action="suspend-run" data-id="${esc(card.id)}" ${pausing?"disabled":""}>${pausing?t("Arrêt…"):t("Arrêter")}</button>`:paused||card.status==="running"?`<button data-action="resume-run" data-id="${esc(card.id)}">Reprendre</button>`:waitingValidation?`<button data-select="reviewView">Valider</button>`:needsReview?`<button data-action="review-decision" data-id="${esc(card.id)}">${t("Décider")}</button>`:`<button data-action="run" data-id="${esc(card.id)}" ${blocked?"disabled":""}>${t("Lancer")}</button>`}</div>
    </article>`;
  }

  const recurrenceLabel = value => ({daily:"quotidienne",weekly:"hebdomadaire",monthly:"mensuelle"}[value]||value);
  const scheduleStateLabel = value => ({pending:"en attente",waitingDependency:"dépendances",queued:"en file",launched:"lancée",waitingQuota:"limite Codex",completed:"exécutée",paused:"suspendue",skipped:"créneau manqué",failed:"échec"}[value]||"en attente");
  function advanceRecurrenceDate(date,recurrence){
    const d=new Date(date);
    if (recurrence === "daily") d.setDate(d.getDate()+1);
    if (recurrence === "weekly") d.setDate(d.getDate()+7);
    if (recurrence === "monthly") {const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));}
    return d;
  }
  function nextDueDate(date, recurrence) {
    const d = advanceRecurrenceDate(new Date(`${date||today()}T12:00:00`),recurrence);
    return d.toLocaleDateString("en-CA");
  }
  function nextScheduledAt(value, recurrence) {
    if(!value)return "";
    const wall=agendaWallValue(value),d=advanceRecurrenceDate(parseLocalDate(wall.slice(0,10)),recurrence);
    return agendaWallToInstant(`${dateKey(d)}T${wall.slice(11,16)}`);
  }
  function createNextOccurrence(card) {
    if (!card.recurrence || card.recurrence === "none" || card.recurrenceSource === "codex" || card.nextOccurrenceCreated) return;
    card.recurrenceSeriesID ||= uid();
    card.nextOccurrenceCreated = true;
    const copy = structuredClone(card); copy.id=uid(); copy.status="ready"; copy.createdAt=now(); copy.updatedAt=now(); copy.dueDate=nextDueDate(card.dueDate,card.recurrence); copy.scheduledAt=nextScheduledAt(card.scheduledAt,card.recurrence); copy.scheduleState=copy.launchMode==="scheduled"?"pending":"";copy.scheduleNextAttemptAt="";copy.scheduleAttempts=0; copy.priorityNumber=nextPriorityNumber(card.spaceID,card.priorityLevelID); copy.nextOccurrenceCreated=false; copy.archived=false;
    copy.subtasks=(copy.subtasks||[]).map(s=>({...s,id:uid(),done:false})); copy.conversations=[];
    delete copy.activeConversationID; delete copy.conversationID; delete copy.conversationName; delete copy.conversationPreview; delete copy.conversationCwd; delete copy.lastRun; delete copy.conversationState; delete copy.completedAt;
    board.cards.push(copy); toast(`Occurrence suivante créée pour le ${copy.dueDate}`);
  }
  function changeStatus(card,status) { const previous=card.status; card.status=status; card.columnAssignments={}; card.updatedAt=now(); if(status==="done"&&previous!=="done"){card.completedAt=now();createNextOccurrence(card)}else if(status!=="done"&&previous==="done")delete card.completedAt; }

  function openSpaceModal(space=null) {
    modal(`<div class="project-editor-head"><span style="--project-color:#${safeHex(space?.accentHex)}">${icon("folder")}</span><div><h2>${space?t("Modifier le projet"):t("Nouveau projet")}</h2><p class="lead">${space?t("Le nom et la couleur changent seulement l’affichage. Le dossier pilote les futures exécutions de ce projet."):t("Relie un tableau à un dossier local.")}</p></div></div><form id="space-form" class="form-grid" data-id="${esc(space?.id||"")}"><div class="two-cols"><div class="field"><label>${t("Nom du projet")}</label><input name="name" value="${esc(space?.name||"")}" autofocus required placeholder="${t("Mon projet")}"></div><div class="field"><label>${t("Couleur")}</label><input name="accentHex" type="color" value="#${safeHex(space?.accentHex)}"></div></div><div class="field"><label>${t("Dossier de travail")}</label><div class="path-row"><input name="rootPath" value="${esc(space?.rootPath||"")}" required placeholder="${windowsApp?"C:\\chemin\\du\\projet":t("/chemin/du/projet")}"><button type="button" class="secondary" data-action="choose-folder">${t("Choisir…")}</button></div></div><label class="preference-toggle compact-project-toggle"><span><strong>${t("Épingler dans le panneau latéral")}</strong><small>${t("Le projet reste au-dessus des projets non épinglés.")}</small></span><input type="checkbox" name="pinned" ${space?.pinned?"checked":""}></label><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">${t("Annuler")}</button><button class="primary">${space?t("Enregistrer"):t("Créer le projet")}</button></div></form>`);
    folderCallback = path => document.querySelector('#space-form [name="rootPath"]').value=path;
  }

  function openDeleteSpaceModal(space){
    if(!space)return;projectMenuID=null;
    const cards=board.cards.filter(card=>card.spaceID===space.id),active=cards.filter(taskIsActivelyExecuting);
    modal(`<div class="delete-project-head"><span>${icon("trash")}</span><div><span class="section-kicker">${t("CTRL KANB uniquement")}</span><h2>${t("Supprimer « {name} » ?",{name:esc(space.name)})}</h2><p class="lead">${cards.length?tn(cards.length,"Cette action retirera le projet et sa carte du Kanban.","Cette action retirera le projet et ses {n} cartes du Kanban."):t("Cette action retirera le projet du Kanban.")}</p></div></div><div class="finder-safety"><strong>${icon("folder")} ${t("Le dossier Finder ne sera jamais supprimé")}</strong><code>${esc(space.rootPath)}</code><p>${t("CTRL KANB ne déplacera, ne modifiera et ne supprimera aucun fichier de ce dossier. Les conversations Codex associées ne sont pas supprimées non plus.")}</p></div>${active.length?`<div class="delete-project-warning">${tn(active.length,"{n} tâche est encore active. Suspends-la avant de retirer le projet.","{n} tâches sont encore actives. Suspends-les avant de retirer le projet.")}</div>`:""}<form id="delete-space-form" data-id="${esc(space.id)}"><label class="check-row"><input type="checkbox" name="confirm" required><span>${t("Je confirme retirer uniquement ce projet et ses cartes de CTRL KANB.")}</span></label><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">${t("Annuler")}</button><button class="danger" ${active.length?"disabled":""}>${t("Supprimer de CTRL KANB")}</button></div></form>`);
  }

  function conversationPanelEditor(card) {
    if (!card) return `<div class="conversation-panel"><div><strong>${t("Conversations")}</strong><p>${t("Enregistre d’abord la carte pour associer des conversations.")}</p></div></div>`;
    return `<div class="conversation-panel"><div><strong>${t("Conversations")}</strong><p>${card.conversations.length?`${card.conversations.length} conversation(s), dont « ${esc(activeConversation(card)?.name||"")} » active.`:t("Aucune conversation. Une nouvelle sera créée au premier lancement.")}</p></div><button type="button" class="secondary" data-action="pick-conversation" data-id="${esc(card.id)}">${t("Associer…")}</button>${card.conversations.length?`<button type="button" class="secondary" data-action="conversation-panel" data-id="${esc(card.id)}">${t("Gérer")}</button>`:""}</div>`;
  }

  function categoryFields(card,configuredOnly=false) {
    const assignments=card?.categoryAssignments||{};
    return taxonomy().filter(d=>!d.archived&&(!configuredOnly||(d.values||[]).some(v=>!v.archived))).map(d=>{
      const values=(d.values||[]).filter(v=>!v.archived), selected=assignments[d.id]||[];
      const optionLabel=value=>{if(d.kind!=="subproject")return value.name;const parent=taxonomyValue(d.parentDimensionID||"objective",value.parentValueID);return parent?`${parent.name} — ${value.name}`:value.name};
      return `<div class="field taxonomy-field"><label>${esc(d.name)}${d.multiple?" · "+t("choix multiples"):""}</label><select name="category__${esc(d.id)}" ${d.multiple?"multiple size=\"3\"":""}><option value="">${values.length?`${t("Aucun {axe}", {axe: esc(d.name.toLowerCase())})}`:`${t("Aucune valeur configurée")}`}</option>${values.map(v=>`<option value="${esc(v.id)}" ${selected.includes(v.id)?"selected":""}>${esc(optionLabel(v))}</option>`).join("")}</select></div>`;
    }).join("");
  }

  function openSettingsModal() {
    modal(`<div class="settings-head organisation-editor-head"><div><span class="eyebrow">${t("FACULTATIF")}</span><h2>${t("Organisation des tâches")}</h2><p class="lead">${t("Personnalise les repères utiles, puis retrouve-les dans les tâches et les filtres.")}</p></div><button class="icon-button" data-action="close-modal" aria-label="${t("Fermer")}">×</button></div><form id="settings-form" class="form-grid organisation-editor-form"><div class="organisation-editor-note">${icon("check")}<p><strong>${t("La création reste simple.")}</strong> ${t("Ces options apparaissent dans le volet replié « Organisation avancée » de chaque tâche.")}</p></div>
      <section class="settings-section organisation-editor-section"><div class="section-head"><div><span class="section-kicker">${t("ORDRE DU TRAVAIL")}</span><h3>${t("Priorités")}</h3><p>${t("La priorité pilote le tri et la référence courte affichée sur les cartes.")}</p></div><button type="button" class="ui-button secondary" data-action="add-priority">${icon("plus")}${t("Ajouter")}</button></div><div class="settings-list">${priorities().map((p,index)=>`<div class="settings-row priority-row"><input type="color" name="priority_color__${esc(p.id)}" value="#${esc(p.color)}" title="${t("Couleur")}"><input name="priority_code__${esc(p.id)}" value="${esc(p.code)}" maxlength="3" aria-label="${t("Code")}" title="${t("Code court")}"><input name="priority_name__${esc(p.id)}" value="${esc(p.name)}" required aria-label="${t("Nom de la priorité")}"><span class="row-actions"><button type="button" class="icon-button" data-action="move-priority-up" data-id="${esc(p.id)}" ${index===0?"disabled":""} title="${t("Monter")}">${icon("up")}</button><button type="button" class="icon-button" data-action="move-priority-down" data-id="${esc(p.id)}" ${index===priorities().length-1?"disabled":""} title="${t("Descendre")}">${icon("down")}</button><button type="button" class="icon-button danger-text" data-action="delete-priority" data-id="${esc(p.id)}" title="${t("Supprimer")}">${icon("trash")}</button></span></div>`).join("")}</div><details class="organisation-maintenance"><summary>${t("Références des cartes")}</summary><p>${t("Recalcule les numéros à partir de 1 dans chaque projet et chaque priorité.")}</p><button type="button" class="ui-button secondary renumber" data-action="renumber">${t("Renuméroter les cartes")}</button></details></section>
      <section class="settings-section organisation-editor-section"><div class="section-head"><div><span class="section-kicker">${t("CLASSEMENT FACULTATIF")}</span><h3>${t("Objectifs et catégories")}</h3><p>${t("Un axe n’apparaît dans les tâches qu’après l’ajout de sa première valeur.")}</p></div><button type="button" class="ui-button secondary" data-action="add-dimension">${icon("plus")}${t("Nouvel axe")}</button></div>${taxonomy().filter(d=>!d.archived).map(d=>{const values=(d.values||[]).filter(v=>!v.archived);return `<div class="dimension-card ${values.length?"":"empty"}"><div class="dimension-head"><input name="dimension_name__${esc(d.id)}" value="${esc(d.name)}" required aria-label="${t("Nom de l’axe")}"><span class="dimension-kind">${d.kind==="objective"?t("Objectifs"):d.kind==="subproject"?t("Sous-projets"):t("Personnalisé")}</span><label class="multiple-toggle"><input type="checkbox" name="dimension_multiple__${esc(d.id)}" ${d.multiple?"checked":""}> ${t("Plusieurs choix")}</label><button type="button" class="icon-button danger-text" data-action="delete-dimension" data-id="${esc(d.id)}" title="${t("Supprimer l’axe")}">${icon("trash")}</button></div><div class="value-list">${values.map(v=>`<div class="value-row"><input type="color" name="value_color__${esc(d.id)}__${esc(v.id)}" value="#${safeHex(v.color)}" title="${t("Couleur")}"><input name="value_name__${esc(d.id)}__${esc(v.id)}" value="${esc(v.name)}" required aria-label="${t("Nom de la valeur")}">${d.kind==="subproject"?`<select name="value_parent__${esc(d.id)}__${esc(v.id)}"><option value="">${t("Sans objectif parent")}</option>${(dimensionByID(d.parentDimensionID||"objective")?.values||[]).filter(x=>!x.archived).map(x=>`<option value="${esc(x.id)}" ${x.id===v.parentValueID?"selected":""}>${esc(x.name)}</option>`).join("")}</select>`:""}<button type="button" class="icon-button danger-text" data-action="delete-tax-value" data-dimension="${esc(d.id)}" data-id="${esc(v.id)}" title="${t("Supprimer la valeur")}">${icon("trash")}</button></div>`).join("")}</div>${values.length?"":`<p class="dimension-empty-copy">${t("Aucune valeur : cet axe reste invisible dans les tâches.")}</p>`}<button type="button" class="ui-button secondary add-value" data-action="add-tax-value" data-dimension="${esc(d.id)}">${icon("plus")}${t("Ajouter une valeur")}</button></div>`}).join("")}</section>
      <div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">${t("Annuler")}</button><button class="primary">${t("Enregistrer la configuration")}</button></div></form>`);
  }

  function openAddPriorityModal(){modal(`<h2>${t("Nouveau niveau de priorité")}</h2><form id="add-priority-form" class="form-grid"><div class="two-cols"><div class="field"><label>Nom</label><input name="name" required autofocus placeholder="Critique"></div><div class="field"><label>${t("Code (1 à 3 caractères)")}</label><input name="code" required maxlength="3" placeholder="C"></div></div><div class="field"><label>${t("Couleur")}</label><input name="color" type="color" value="#6e75ff"></div><div class="modal-actions"><button type="button" class="secondary" data-action="settings">Retour</button><button class="primary">${t("Ajouter")}</button></div></form>`)}
  function openAddDimensionModal(){modal(`<h2>${t("Nouvel axe de catégorisation")}</h2><form id="add-dimension-form" class="form-grid"><div class="field"><label>Nom</label><input name="name" required autofocus placeholder="${t("Type de livrable")}"></div><div class="field"><label>Type</label><select name="kind"><option value="generic">${t("Personnalisé")}</option><option value="objective">Objectifs</option><option value="subproject">${t("Sous-projets liés aux objectifs")}</option></select></div><label class="check-row"><input type="checkbox" name="multiple"><span>${t("Autoriser plusieurs valeurs sur une carte")}</span></label><div class="modal-actions"><button type="button" class="secondary" data-action="settings">Retour</button><button class="primary">${t("Ajouter")}</button></div></form>`)}
  function openAddValueModal(dimensionID){const d=dimensionByID(dimensionID);if(!d)return;modal(`<h2>Ajouter dans « ${esc(d.name)} »</h2><form id="add-value-form" data-dimension="${esc(d.id)}" class="form-grid"><div class="field"><label>Nom</label><input name="name" required autofocus></div>${d.kind==="subproject"?`<div class="field"><label>Objectif parent</label><select name="parentValueID"><option value="">${t("Sans objectif parent")}</option>${(dimensionByID(d.parentDimensionID||"objective")?.values||[]).filter(x=>!x.archived).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></div>`:""}<div class="field"><label>${t("Couleur")}</label><input name="color" type="color" value="#6e75ff"></div><div class="modal-actions"><button type="button" class="secondary" data-action="settings">Retour</button><button class="primary">${t("Ajouter")}</button></div></form>`)}

  function nextAgendaWallDateTime(){const value=new Date(Math.ceil((Date.now()+60000)/(30*60000))*30*60000),parts=agendaZonedParts(value);return `${parts.year}-${agendaPad(parts.month)}-${agendaPad(parts.day)}T${agendaPad(parts.hour)}:${agendaPad(parts.minute)}`}
  function nextHalfHour(){return nextAgendaWallDateTime().slice(11,16)}
  function schedulePickerMarkup(value,dueDate=""){
    const wall=agendaWallValue(value),date=wall.slice(0,10)||dueDate||today(),time=wall.slice(11,16)||"",periodLabels=agendaHour12()?["AM","PM"]:["00–11 h","12–23 h"];
    const hourButtons=Array.from({length:12},(_,index)=>{const hour=index||12,angle=(hour*30-90)*Math.PI/180,left=50+39*Math.cos(angle),top=50+39*Math.sin(angle);return `<button type="button" class="clock-number" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%" data-action="pick-clock-hour" data-hour="${hour}">${hour}</button>`}).join("");
    return `<div class="field schedule-date-time"><label>${t("Date et heure de lancement")}</label><small class="schedule-zone">${esc(agendaTimeZoneName(agendaTimeZone()))} · ${esc(agendaOffsetLabel())}</small><input type="hidden" name="scheduledAt" value="${esc(wall)}"><div class="datetime-composer"><input type="date" id="schedule-date" value="${esc(date)}" aria-label="${t("Date de lancement")}"><label class="manual-time"><span>${t("Heure libre")}</span><input id="schedule-time-manual" value="${esc(time)}" inputmode="numeric" maxlength="5" placeholder="HH:MM" aria-label="${t("Heure précise au format heures deux-points minutes")}"></label><button type="button" class="clock-trigger" data-action="open-clock-picker" aria-expanded="false">${icon("clock")}<span>${t("Cadran")}</span></button></div><div class="clock-picker" id="schedule-clock" hidden><div class="clock-picker-head"><div><small>${t("Heure de lancement")}</small><strong data-clock-display>${time?esc(agendaClockLabel(Number(time.slice(0,2)),Number(time.slice(3,5)))):"--:--"}</strong></div><div class="clock-period"><button type="button" data-action="pick-clock-period" data-period="am">${periodLabels[0]}</button><button type="button" data-action="pick-clock-period" data-period="pm">${periodLabels[1]}</button></div></div><div class="clock-face"><div class="clock-hand" data-clock-hand><i></i></div><span class="clock-center"></span>${hourButtons}</div><div class="clock-minutes"><span>${t("Minutes")}</span>${["00","15","30","45"].map(minute=>`<button type="button" data-action="pick-clock-minute" data-minute="${minute}">${minute}</button>`).join("")}</div><p class="clock-precision-help">${t("Besoin d’une minute précise ? Saisis-la directement dans le champ HH:MM.")}</p><button type="button" class="clock-done" data-action="close-clock-picker">${t("Valider l’heure")}</button></div></div>`;
  }
  function schedulePickerParts(form,initialize=false){
    const hidden=form?.elements?.scheduledAt,dateInput=form?.querySelector("#schedule-date");if(!hidden||!dateInput)return null;
    if(hidden.value&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(hidden.value))hidden.value=agendaWallValue(hidden.value);
    if(!hidden.value&&initialize){const next=nextAgendaWallDateTime(),date=dateInput.value||next.slice(0,10);hidden.value=`${date}T${next.slice(11,16)}`}
    const date=hidden.value.slice(0,10)||dateInput.value||today(),rawTime=hidden.value.slice(11,16)||nextHalfHour(),hour=Number(rawTime.slice(0,2)),minute=Number(rawTime.slice(3,5));
    return {hidden,dateInput,date,hour,minute,hour12:hour%12||12,period:hour>=12?"pm":"am"};
  }
  function refreshSchedulePicker(form,initialize=false){
    const parts=schedulePickerParts(form,initialize);if(!parts)return;
    const time=`${agendaPad(parts.hour)}:${agendaPad(parts.minute)}`;parts.dateInput.value=parts.date;
    const manual=form.querySelector("#schedule-time-manual"),display=form.querySelector("[data-clock-display]"),hand=form.querySelector("[data-clock-hand]");if(manual)manual.value=time;if(display)display.textContent=agendaClockLabel(parts.hour,parts.minute);if(hand)hand.style.transform=`rotate(${parts.hour12*30+parts.minute*.5}deg)`;
    form.querySelectorAll("[data-action='pick-clock-hour']").forEach(button=>button.classList.toggle("active",Number(button.dataset.hour)===parts.hour12));
    form.querySelectorAll("[data-action='pick-clock-minute']").forEach(button=>button.classList.toggle("active",Number(button.dataset.minute)===parts.minute));
    form.querySelectorAll("[data-action='pick-clock-period']").forEach(button=>button.classList.toggle("active",button.dataset.period===parts.period));
  }
  function setSchedulePickerValue(form,changes={}){
    const parts=schedulePickerParts(form,true);if(!parts)return;
    let hour=parts.hour,minute=parts.minute,date=changes.date||parts.date;
    if(changes.period){const base=hour%12;hour=base+(changes.period==="pm"?12:0)}
    if(changes.hour){const period=changes.period||parts.period;hour=(Number(changes.hour)%12)+(period==="pm"?12:0)}
    if(changes.minute!==undefined)minute=Number(changes.minute);
    parts.hidden.value=`${date}T${agendaPad(hour)}:${agendaPad(minute)}`;refreshSchedulePicker(form);
  }
  function setScheduleManualTime(form,value,showError=false){
    const match=String(value||"").trim().match(/^(\d{1,2}):(\d{2})$/),hour=Number(match?.[1]),minute=Number(match?.[2]);
    if(!match||hour>23||minute>59){if(showError){refreshSchedulePicker(form,true);toast("Saisis une heure valide au format HH:MM, par exemple 14:07.",true)}return false}
    const parts=schedulePickerParts(form,true);if(!parts)return false;parts.hidden.value=`${parts.date}T${agendaPad(hour)}:${agendaPad(minute)}`;refreshSchedulePicker(form);return true;
  }

  function simpleExecutionType(card,defaults={}){
    const recurrence=card?.recurrence||defaults.recurrence||"none",launchMode=card?.launchMode||defaults.launchMode||"manual";
    if(recurrence!=="none")return "recurring";
    return launchMode==="scheduled"||launchMode==="codex"?"scheduled":"manual";
  }
  function updateSimpleExecutionFields(form,initialize=false){
    if(!form)return;
    const type=form.elements?.executionType?.value||form.querySelector?.("[name='executionType']")?.value||"manual",scheduled=type!=="manual",recurring=type==="recurring";
    const schedule=form.querySelector("#simple-schedule-fields"),recurrence=form.querySelector("#simple-recurrence-field");
    if(schedule)schedule.hidden=!scheduled;
    if(recurrence)recurrence.hidden=!recurring;
    if(scheduled)refreshSchedulePicker(form,initialize);
  }
  function openSimpleCardModal(card=null,defaults={}){
    if(!board.spaces.length)return openSpaceModal();
    const preferred=card?.spaceID||defaults.spaceID||preferredWorkspaceID();
    const engine=normalizeEngine(card?.agentEngine||defaults.agentEngine||defaultEngine());
    const executionType=simpleExecutionType(card,defaults),scheduledAt=card?.scheduledAt||defaults.scheduledAt||"",dueDate=card?.dueDate||defaults.dueDate||"";
    const recurrence=card?.recurrence&&card.recurrence!=="none"?card.recurrence:(defaults.recurrence&&defaults.recurrence!=="none"?defaults.recurrence:"weekly");
    const notificationMode=normalizeTaskNotification(card?.notificationMode||defaults.notificationMode);
    const normalPriority=priorities().find(item=>item.id==="normal")?.id||priorities()[0].id,selectedPriority=card?.priorityLevelID||defaults.priorityLevelID||normalPriority;
    const configuredDimensions=taxonomy().filter(d=>!d.archived&&(d.values||[]).some(v=>!v.archived));
    const organisationUsed=Boolean(card&&(selectedPriority!==normalPriority||assignedValues(card).length||(card.labels||[]).length));
    modal(`<div class="editor-heading"><div><span class="eyebrow">${card?esc(cardReference(card))+" / "+t("TÂCHE"):t("NOUVELLE TÂCHE")}</span><h2>${card?t("Modifier la tâche"):t("Que doit faire l’agent ?")}</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="${t("Fermer le panneau")}">×</button></div>
    <form id="card-form" class="task-editor-form simple-task-form" data-id="${esc(card?.id||"")}" data-simple="true">
      <input type="hidden" name="dueDate" value="${esc(dueDate)}">
      <div class="simple-task-body">
        <section class="simple-task-main">
          <div class="draft-notice" id="draft-notice" hidden>${t("Un brouillon est disponible.")} <button type="button" data-action="restore-draft">${t("Le reprendre")}</button><button type="button" data-action="discard-draft">${t("L’écarter")}</button></div>
          <div class="field title-field"><label>${t("Titre")}</label><input name="title" value="${esc(card?.title||defaults.title||"")}" autofocus required maxlength="240" placeholder="${t("Exemple : vérifier le parcours de connexion")}"></div>
          <div class="field brief-field"><div class="label-row"><label for="task-prompt">${t("Consigne")}</label><span>${t("Décris clairement le résultat attendu et les contraintes importantes.")}</span></div><textarea id="task-prompt" name="prompt" placeholder="${t("Que doit faire l’agent ?")}">${esc(card?.prompt||defaults.prompt||"")}</textarea></div>
          ${card?.lastRun?.summary?`<div class="simple-last-result"><strong>${t("Dernier résultat")}</strong><p>${esc(card.lastRun.summary)}</p></div>`:""}
        </section>
        <aside class="simple-task-options">
          <span class="inspector-title">${t("ORGANISATION")}</span>
          <div class="field"><label>${t("Projet")}</label><select name="spaceID">${board.spaces.map(space=>`<option value="${esc(space.id)}" ${space.id===preferred?"selected":""}>${esc(space.name)}</option>`).join("")}<option value="__new-space__">${t("＋ Créer un projet…")}</option></select><small>${t("CTRL KANB ajoutera automatiquement le nom et le chemin du projet à la consigne.")}</small></div>
          <details class="simple-organisation" ${organisationUsed?"open":""}><summary><span>${t("Organisation avancée")}<small>${t("Priorité, objectifs et étiquettes")}</small></span>${icon("chevron")}</summary><div class="simple-organisation-fields"><div class="field"><label>${t("Priorité")}</label><select name="priorityLevelID">${priorities().map(priority=>`<option value="${esc(priority.id)}" ${priority.id===selectedPriority?"selected":""}>${esc(priority.name)}</option>`).join("")}</select></div>${configuredDimensions.length?`<div class="taxonomy-grid">${categoryFields(card,true)}</div>`:`<p class="simple-organisation-empty">${t("Ajoute des objectifs ou des catégories dans Réglages pour les retrouver ici.")}</p>`}<div class="field"><label>${t("Étiquettes libres")}</label><input name="labels" value="${esc((card?.labels||[]).join(", "))}" placeholder="${t("Exemple : client, documentation")}"></div></div></details>
          <div class="field"><label>${t("Agent")}</label><select name="agentEngine" id="task-engine">${engineCatalog().map(([id,label])=>`<option value="${esc(id)}" ${id===engine?"selected":""}>${esc(label)}</option>`).join("")}</select><small class="agent-config-note">${engine==="claude-code"?t("La session sera créée dans Claude sous le bon workspace."):t("La conversation sera créée dans Codex sous le bon projet.")}</small></div>
          <div class="field"><label>${t("Accès au projet")}</label><select name="runMode"><option value="readOnly" ${card?.runMode!=="workspaceWrite"?"selected":""}>${t("Sans modification")}</option><option value="workspaceWrite" ${card?.runMode==="workspaceWrite"?"selected":""}>${t("Autoriser les modifications")}</option></select></div>
          <div class="simple-execution-card">
            <span class="inspector-title">${t("EXÉCUTION")}</span>
            <div class="field"><label>${t("Mode de lancement")}</label><select name="executionType" id="execution-type"><option value="manual" ${executionType==="manual"?"selected":""}>${t("Lancement manuel")}</option><option value="scheduled" ${executionType==="scheduled"?"selected":""}>${t("Tâche programmée")}</option><option value="recurring" ${executionType==="recurring"?"selected":""}>${t("Tâche récurrente")}</option></select></div>
            <div id="simple-schedule-fields" ${executionType==="manual"?"hidden":""}>${schedulePickerMarkup(scheduledAt,dueDate)}</div>
            <div class="field" id="simple-recurrence-field" ${executionType!=="recurring"?"hidden":""}><label>${t("Récurrence")}</label><select name="recurrence"><option value="daily" ${recurrence==="daily"?"selected":""}>${t("Quotidienne")}</option><option value="weekly" ${recurrence==="weekly"?"selected":""}>${t("Hebdomadaire")}</option><option value="monthly" ${recurrence==="monthly"?"selected":""}>${t("Mensuelle")}</option></select></div>
            <p class="schedule-help">${t("Le Mac doit rester allumé au moment prévu. Une tâche récurrente recrée automatiquement sa prochaine occurrence après validation.")}</p>
            <div class="field task-notification-field"><label>${t("Notification de cette tâche")}</label><select name="notificationMode"><option value="inherit" ${notificationMode==="inherit"?"selected":""}>${t("Suivre les réglages généraux")}</option><option value="always" ${notificationMode==="always"?"selected":""}>${t("Toujours me prévenir")}</option><option value="mute" ${notificationMode==="mute"?"selected":""}>${t("Rester silencieuse")}</option></select><small>${t("S’applique aux résultats, échecs et demandes de l’agent pour cette tâche.")}</small></div>
          </div>
        </aside>
      </div>
      <div class="editor-footer">${card?`<button type="button" class="icon-button delete-task-button" data-action="confirm-delete-card" data-id="${esc(card.id)}" aria-label="${t("Supprimer la tâche")}" title="${t("Supprimer la tâche")}">${icon("trash")}</button>`:""}<span id="draft-state">${t("⌘ ↵ pour enregistrer")}</span><div><button type="button" class="ui-button secondary" data-action="close-modal">${t("Fermer")}</button><button class="ui-button primary">${card?t("Enregistrer les changements"):t("Créer la tâche")}</button></div></div>
    </form>`,"task-editor");
    const form=document.querySelector("#card-form");
    updateSimpleExecutionFields(form,Boolean(scheduledAt));
    if(readDraft(form)){const notice=document.querySelector("#draft-notice");if(notice)notice.hidden=false;}
  }

  function saveSimpleCardForm(form,data){
    const liveCard=getCard(form.dataset.id);
    if(liveCard&&(activeRuns.has(liveCard.id)||queuePositions.has(liveCard.id)||liveCard.executionState==="pausing"))return toast(t("Arrête l’exécution avant de modifier cette tâche."),true);
    const title=(data.title||"").trim(),prompt=(data.prompt||"").trim(),executionType=data.executionType||"manual";
    if(!title)return toast(t("Donne un titre à la tâche."),true);
    if(!prompt)return toast(t("Ajoute une consigne pour l’agent."),true);
    if(executionType!=="manual"&&!data.scheduledAt)return toast(t("Choisis la date et l’heure du lancement."),true);
    const existing=liveCard,engine=normalizeEngine(data.agentEngine||defaultEngine()),fallbackPriority=existing?.priorityLevelID||priorities().find(item=>item.id==="normal")?.id||priorities()[0].id;
    const priorityLevelID=priorities().some(item=>item.id===data.priorityLevelID)?data.priorityLevelID:fallbackPriority,fd=new FormData(form),categoryAssignments={...(existing?.categoryAssignments||{})};
    for(const dimension of taxonomy().filter(d=>!d.archived&&(d.values||[]).some(v=>!v.archived))){const valid=new Set((dimension.values||[]).filter(v=>!v.archived).map(v=>v.id));categoryAssignments[dimension.id]=fd.getAll(`category__${dimension.id}`).filter(id=>valid.has(id));if(!dimension.multiple)categoryAssignments[dimension.id]=categoryAssignments[dimension.id].slice(0,1)}
    for(const subDimension of taxonomy().filter(d=>d.kind==="subproject"&&!d.archived)){const sub=taxonomyValue(subDimension.id,categoryAssignments[subDimension.id]?.[0]);if(sub?.parentValueID){const parentDimensionID=subDimension.parentDimensionID||taxonomy().find(d=>d.kind==="objective")?.id;if(parentDimensionID)categoryAssignments[parentDimensionID]=[sub.parentValueID]}}
    const launchMode=executionType==="manual"?"manual":"scheduled",recurrence=executionType==="recurring"?(data.recurrence||"weekly"):"none",scheduledAt=launchMode==="scheduled"?agendaWallToInstant(data.scheduledAt):"";
    if(launchMode==="scheduled"&&!scheduledAt)return toast(t("Cette heure n’existe pas dans le fuseau choisi. Sélectionne une autre heure."),true);
    const scheduleChanged=!existing||existing.launchMode!==launchMode||existing.scheduledAt!==scheduledAt||existing.recurrence!==recurrence;
    const values={
      spaceID:data.spaceID,boardPresetID:executionType==="recurring"?"routines":normalizePresetID(existing?.boardPresetID||"classic"),title,prompt,
      status:existing?.executionState==="paused"?existing.status:(existing?.status||"ready"),priorityLevelID,priority:priorityLevelID,
      priorityNumber:existing&&existing.priorityLevelID===priorityLevelID?existing.priorityNumber:nextPriorityNumber(data.spaceID,priorityLevelID),categoryAssignments,
      agentEngine:engine,model:existing&&engineKey(existing.agentEngine)===engine?existing.model:defaultModelFor(engine),reasoningEffort:existing?.reasoningEffort||defaultEffortFor(engine),
      runMode:data.runMode||"readOnly",durationMinutes:existing?.durationMinutes||60,dueDate:data.dueDate||existing?.dueDate||"",recurrence,recurrenceSource:"board",recurrenceSeriesID:recurrence!=="none"?(existing?.recurrenceSeriesID||uid()):"",
      launchMode,scheduledAt,missedRunPolicy:existing?.missedRunPolicy||"catchUp",routineName:existing?.routineName||"",notificationMode:normalizeTaskNotification(data.notificationMode),labels:String(data.labels||"").split(",").map(label=>label.trim()).filter(Boolean),
      subtasks:existing?.subtasks||[],dependencies:existing?.dependencies||[],completedAt:existing?.completedAt||"",updatedAt:now()
    };
    if(scheduleChanged){values.scheduleState=launchMode==="scheduled"?"pending":"";values.scheduleNextAttemptAt="";values.scheduleAttempts=0;values.scheduleNote="";values.scheduleNoteVars=null;values.nextOccurrenceCreated=false;}
    let card;if(existing){Object.assign(existing,values);card=existing}else{card={id:uid(),...values,conversations:[],createdAt:now()};board.cards.push(card)}
    syncLegacyConversationFields(card);clearDraft(form);save();closeModal();render();schedulerTick();toast(existing?t("Tâche mise à jour"):t("Tâche créée"));
  }

  function openCardModal(card=null,defaults={}) {
    return openSimpleCardModal(card,defaults);
    if(!board.spaces.length) return openSpaceModal();
    const preferred=card?.spaceID||defaults.spaceID||(selection==="global"||specialViews[selection]?board.spaces[0].id:selection);
    const dependencies=board.cards.filter(c=>!c.archived&&c.id!==card?.id);
    const selectedEngine=card?.agentEngine||defaults.agentEngine||defaultEngine(),selectedModel=card?.model||defaults.model||defaultModelFor(selectedEngine),selectedEffort=card?.reasoningEffort||defaults.reasoningEffort||defaultEffortFor(selectedEngine);
    const defaultDueDate=card?.dueDate||defaults.dueDate||"",defaultLaunchMode=card?.launchMode||defaults.launchMode||"manual",defaultScheduledAt=card?.scheduledAt||defaults.scheduledAt||"",defaultDuration=Number(card?.durationMinutes||defaults.durationMinutes||60);
    const selectedBoardPreset=normalizePresetID(card?.boardPresetID||defaults.boardPresetID||(surfaceMode==="board"&&!specialViews[selection]?activePreset().id:board.settings.defaultBoardPreset));
    const defaultStatus=card?.status||defaults.status||"backlog",defaultTitle=card?.title||defaults.title||"",defaultPrompt=card?.prompt||defaults.prompt||"";
    const contentCard=card||defaults;
    const engine=card?.agentEngine||defaults.agentEngine||defaultEngine();
    modal(`<div class="editor-heading"><div><span class="eyebrow">${card?esc(cardReference(card))+" / "+t("TÂCHE"):t("UN NOUVEAU DÉPART")}</span><h2>${card?t("Les détails font la différence."):t("Qu’allons-nous accomplir ?")}</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="${t("Fermer le panneau")}">×</button></div>
    <form id="card-form" class="task-editor-form" data-id="${esc(card?.id||"")}">
      <div class="editor-body"><section class="editor-main">
      <div class="draft-notice" id="draft-notice" hidden>${t("Un brouillon est disponible.")} <button type="button" data-action="restore-draft">${t("Le reprendre")}</button><button type="button" data-action="discard-draft">${t("L’écarter")}</button></div>
      ${!card&&board.templates.length?`<div class="field"><label>${t("Utiliser un de mes modèles")}</label><select id="template-select"><option value="">${t("Partir de zéro")}</option>${board.templates.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select></div>`:""}
      <div class="field title-field"><label>${t("Le résultat à atteindre")}</label><input name="title" value="${esc(defaultTitle)}" autofocus required maxlength="240" placeholder="${t("Donne un titre à cette tâche…")}"></div>
      <div class="field brief-field"><div class="label-row"><label for="task-prompt">${t("Le brief pour l’agent")}</label><span>${t("Contexte · résultat · contraintes")}</span></div><textarea id="task-prompt" name="prompt" placeholder="${t("Ce que tu veux obtenir, les fichiers utiles, et ce qui permet de dire que le travail est terminé…")}">${esc(defaultPrompt)}</textarea></div>
      ${!defaultPrompt?`<div class="brief-starters"><span>${t("Un point de départ")}</span><button type="button" data-action="brief-starter" data-kind="audit">${t("Auditer")}</button><button type="button" data-action="brief-starter" data-kind="build">${t("Construire")}</button><button type="button" data-action="brief-starter" data-kind="fix">${t("Corriger")}</button></div>`:""}
      <details class="form-section" ${(contentCard?.subtasks?.length||contentCard?.dependencies?.length)?"open":""}><summary>${t("Décomposition")} <small>${t("Sous-tâches et dépendances")}</small></summary><div class="field"><label>${t("Sous-tâches, une par ligne")}</label><textarea class="short" name="subtasks">${esc((contentCard?.subtasks||[]).map(s=>s.title).join("\n"))}</textarea></div>${dependencies.length?`<details class="dependencies"><summary>${t("Dépendances")} (${contentCard?.dependencies?.length||0})</summary>${dependencies.map(c=>`<label><input type="checkbox" name="dependencies" value="${esc(c.id)}" ${contentCard?.dependencies?.includes(c.id)?"checked":""}>${esc(c.title)} · ${statusLabel(c.status)}</label>`).join("")}</details>`:""}</details>
<details class="form-section" ${assignedValues(contentCard).length?"open":""}><summary>${t("Classement")} <small>${t("Objectifs, sous-projets et étiquettes")}</small></summary><div class="taxonomy-grid">${categoryFields(contentCard)}</div><div class="field"><label>${t("Étiquettes libres")}</label><input name="labels" value="${esc((contentCard?.labels||[]).join(", "))}" placeholder="${t("Séparées par des virgules")}"></div><div class="field"><label>${t("Numéro dans la priorité")}</label><input type="number" min="1" name="priorityNumber" value="${esc(contentCard?.priorityNumber||"")}" placeholder="${t("Attribué automatiquement")}"></div></details>
      <details class="form-section" ${card?.conversations?.length?"open":""}><summary>${t("Accès et conversations")} <small>${t("Droits de modification et historique de l’agent")}</small></summary><div class="field"><label>${t("Accès au projet")}</label><select name="runMode"><option value="readOnly" ${contentCard?.runMode!=="workspaceWrite"?"selected":""}>${t("Sans modification")}</option><option value="workspaceWrite" ${contentCard?.runMode==="workspaceWrite"?"selected":""}>${t("Autoriser les modifications")}</option></select></div>${conversationPanelEditor(card)}</details>
      ${card?.lastRun?.summary?`<details class="form-section"><summary>${t("Dernier résultat")} <small>${t("Retrouver le contexte du travail")}</small></summary><div class="editor-result">${esc(card.lastRun.summary)}</div></details>`:""}
      <label class="check-row template-check"><input type="checkbox" name="saveTemplate"><span>${t("Garder ce brief comme modèle réutilisable")}</span></label>
      </section><aside class="editor-inspector"><span class="inspector-title">${t("ORGANISATION")}</span>
      <div class="field"><label>${t("Projet")}</label><select name="spaceID">${board.spaces.map(s=>`<option value="${esc(s.id)}" ${s.id===preferred?"selected":""}>${esc(s.name)}</option>`).join("")}<option value="__new-space__">${t("＋ Créer un projet…")}</option></select></div>
      <div class="two-cols"><div class="field"><label>${t("Priorité")}</label><select name="priorityLevelID">${priorities().map(p=>`<option value="${esc(p.id)}" ${p.id===(card?.priorityLevelID||defaults.priorityLevelID||"normal")?"selected":""}>${esc(p.name)}</option>`).join("")}</select></div><div class="field"><label>${t("Étape")}</label><select name="status">${statusOptionsForPreset(selectedBoardPreset,defaultStatus)}</select></div></div>
      <div class="field"><label>${t("Tableau")}</label><select name="boardPresetID" id="card-board-preset">${fixedBoardPresets().map(preset=>`<option value="${esc(preset.id)}" ${preset.id===selectedBoardPreset?"selected":""}>${esc(preset.name)}</option>`).join("")}</select></div>
      <div class="field"><label>${t("Échéance")}</label><input type="date" name="dueDate" value="${esc(defaultDueDate)}"></div>
      <div class="agent-config"><span class="inspector-title">${t("QUI S’EN OCCUPE ?")}</span><div class="field"><label>${t("Agent")}</label><select name="agentEngine" id="task-engine">${engineCatalog().map(([id,label])=>`<option value="${esc(id)}" ${engineKey(engine)===id?"selected":""}>${esc(label)}</option>`).join("")}</select></div><div class="field"><label>${t("Modèle")}</label><select name="model">${engineModelOptions(engine,selectedModel)}</select></div><div class="field"><label>${t("Effort de réflexion")}</label><select name="reasoningEffort">${effortOptions(selectedEffort)}</select></div><p class="agent-config-note">${isClaude({agentEngine:engine})?t("Session Claude dédiée. Tes autorisations restent visibles dans Validations."):t("Conversation Codex liée automatiquement au premier lancement.")}</p></div>
      <input type="hidden" name="durationMinutes" value="${defaultDuration}">
      <details class="form-section" ${defaultLaunchMode!=="manual"?"open":""}><summary>${t("Planification et récurrence")} <small>${t("Lancement automatique ou routine Codex")}</small></summary><div class="schedule-editor"><div class="two-cols"><div class="field"><label>${t("Mode de lancement")}</label><select name="launchMode" id="launch-mode"><option value="manual" ${defaultLaunchMode==="manual"?"selected":""}>${t("Lancement manuel")}</option><option value="scheduled" ${defaultLaunchMode==="scheduled"?"selected":""}>${t("Planifié par CTRL KANB")}</option><option value="codex" ${defaultLaunchMode==="codex"?"selected":""}>${t("Routine Codex Scheduled")}</option></select></div>${schedulePickerMarkup(defaultScheduledAt,defaultDueDate)}</div><div class="two-cols"><div class="field"><label>${t("Récurrence")}</label><select name="recurrence"><option value="none">${t("Aucune")}</option>${[["daily",t("Quotidienne")],["weekly",t("Hebdomadaire")],["monthly",t("Mensuelle")]].map(([v,l])=>`<option value="${v}" ${card?.recurrence===v?"selected":""}>${l}</option>`).join("")}</select></div><div class="field"><label>${t("Si le créneau est manqué")}</label><select name="missedRunPolicy"><option value="catchUp" ${card?.missedRunPolicy!=="skip"?"selected":""}>${t("Lancer au retour")}</option><option value="skip" ${card?.missedRunPolicy==="skip"?"selected":""}>${t("Ignorer après 15 min")}</option></select></div></div><div class="field"><label>${t("Référence de la routine Codex Scheduled")}</label><input name="routineName" value="${esc(card?.routineName||"")}" placeholder="${t("Uniquement pour le mode Routine Codex")}"></div><p class="schedule-help">${t("Le moteur macOS facultatif maintient les planifications locales quand la fenêtre est fermée. Le Mac doit rester allumé ; les tâches manquées peuvent être rattrapées au réveil. Les routines Codex officielles se gèrent dans Scheduled.")}</p></div></details>
      </aside></div><div class="editor-footer">${card?`<button type="button" class="icon-button delete-task-button" data-action="confirm-delete-card" data-id="${esc(card.id)}" aria-label="${t("Supprimer la tâche")}" title="${t("Supprimer la tâche")}">${icon("trash")}</button>`:""}<span id="draft-state">${t("⌘ ↵ pour enregistrer")}</span><div>${card?`<button type="button" class="ui-button secondary" data-action="duplicate-card" data-id="${esc(card.id)}">${t("Dupliquer")}</button>`:""}<button type="button" class="ui-button secondary" data-action="close-modal">${t("Fermer")}</button><button class="ui-button primary">${card?t("Enregistrer les changements"):t("Créer la tâche")}</button></div></div></form>`,"task-editor");
    refreshSchedulePicker(document.querySelector("#card-form"),Boolean(defaultScheduledAt)||defaultLaunchMode==="scheduled");
    const form=document.querySelector("#card-form");
    if(readDraft(form)) { const notice=document.querySelector("#draft-notice");if(notice)notice.hidden=false; }
  }

  function openRunModal(card) {
    if (dependencyOpen(card)) return toast("Cette tâche dépend encore d’une carte non terminée.",true);
    if (cardIsBusy(card)) return toast(t("Cette tâche est déjà en cours. Arrête-la avant de la relancer."),true);
    const space=getSpace(card.spaceID), conv=activeConversation(card);
    modal(`<h2>${t("Lancer avec {agent} ?", {agent: engineLabel(card.agentEngine)})}</h2><p class="lead">${esc(card.title)} · ${esc(aiSummary(card))}</p><div class="run-conversation ${conv?"":"new"}"><div><strong>${esc(conv?.name||t("Nouvelle conversation"))}</strong><small>${esc(conv?.id||t("Elle sera créée et liée automatiquement."))}</small></div></div><div class="field"><label>${t("Dossier de travail")}</label><div class="run-box">${esc(space?.rootPath||"")}</div></div><form id="run-form" class="form-grid" data-id="${esc(card.id)}"><div class="field"><label>${t("Niveau d’accès")}</label><select name="mode"><option value="readOnly" ${card.runMode==="readOnly"?"selected":""}>${t("Sans modification")}</option><option value="workspaceWrite" ${card.runMode!=="readOnly"?"selected":""}>${t("Autoriser les modifications")}</option></select></div>${conv?'<label class="check-row"><input type="checkbox" name="newConversation"><span>Créer une nouvelle conversation et conserver l’actuelle dans l’historique.</span></label>':""}${!isClaude(card)?`<label class="check-row"><input type="checkbox" name="autoApprove"><span>${t("Utiliser l’examen automatique des autorisations Codex.")}</span></label>`:`<p class="settings-callout" id="claude-access-help">${card.runMode==="readOnly"?t("Claude pourra seulement lire le dossier du projet avec Read, Glob et Grep."):t("Claude demandera ton autorisation avant chaque modification du projet.")}</p>`}<div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">${t("Annuler")}</button><button class="primary">${t("Ajouter à la file")}</button></div></form>`);
  }

  function batchReadyCards(){
    let cards=baseVisibleCards();
    if(surfaceMode==="board"&&!specialViews[selection])cards=cardsForPreset(cards,activePreset().id);
    return cards.filter(cardIsLaunchable);
  }

  // Ce que l utilisateur valide, c est la liste affichee. Entre l ouverture et
  // la confirmation, un tour peut se terminer ou une planification se declencher :
  // on retient donc les cartes montrees au lieu de recalculer a l envoi.
  let batchSelection=[];
  function openBatchModal() {
    const cards=batchReadyCards();
    batchSelection=cards.map(c=>c.id);
    if(!cards.length) return toast(t("Aucune carte prête et débloquée."));
    const codexLimit=concurrencyFor("codex"),claudeLimit=concurrencyFor("claude-code"),capacity=`${tn(codexLimit,"{n} conversation Codex","{n} conversations Codex")} · ${tn(claudeLimit,"{n} session Claude","{n} sessions Claude")}`;
    modal(`<h2>${tn(cards.length,"Ajouter {n} tâche à la file ?","Ajouter {n} tâches à la file ?")}</h2><p class="lead">${t("Capacité parallèle :")} ${capacity}<br><small>${t("Une conversation ou une session ne traite jamais deux instructions à la fois.")}</small></p><div class="batch-list">${cards.map(c=>`<div><strong>${esc(c.title)}</strong><small>${esc(getSpace(c.spaceID)?.name||"")} · ${c.runMode==="workspaceWrite"?t("modifications autorisées"):t("lecture seule")}</small></div>`).join("")}</div><form id="batch-form"><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">${t("Annuler")}</button><button class="primary">${t("▶ Ajouter à la file")}</button></div></form>`);
  }

  function openReviewDecision(card){
    if(!card)return;const routine=cardBoardPresetID(card)==="routines",failed=cardExecutionFailed(card),summary=card.lastRun?.summary||activeConversation(card)?.preview||t("Aucun résumé n’a été enregistré.");
    modal(`<div class="review-decision-head"><span class="${failed?"failed":""}">${icon(failed?"alert":"check")}</span><div><span class="section-kicker">${routine?t("Passage de routine"):t("Résultat de {agent}",{agent:engineLabel(card.agentEngine)})}</span><h2>${esc(card.title)}</h2><p class="lead">${failed?t("L’exécution a échoué. Tu peux préciser la consigne et reprendre la même conversation."):t("Le résultat attend ta décision avant de quitter la colonne de vérification.")}</p></div></div><div class="review-decision-summary"><span>${failed?t("Erreur ou dernier message"):t("Dernière réponse")}</span><p>${esc(summary)}</p></div><div class="review-decision-options"><button class="review-option primary-option" data-action="deepen-review" data-id="${esc(card.id)}"><span>${icon("flow")}</span><div><strong>${t("Approfondir")}</strong><small>${t("Ajouter une consigne et relancer dans la conversation principale.")}</small></div>${icon("chevron")}</button><button class="review-option" data-action="finish-review" data-id="${esc(card.id)}"><span>${icon("check")}</span><div><strong>${routine?t("Valider ce passage"):t("Terminer la tâche")}</strong><small>${routine&&card.recurrence&&card.recurrence!=="none"?t("Clôturer ce passage et créer automatiquement le prochain."):t("Conserver le résultat dans l’historique Suivi.")}</small></div>${icon("chevron")}</button>${routine?`<button class="review-option danger-option" data-action="stop-routine" data-id="${esc(card.id)}"><span>${icon("trash")}</span><div><strong>${t("Terminer définitivement la routine")}</strong><small>${t("Clôturer ce passage sans créer de prochaine occurrence.")}</small></div>${icon("chevron")}</button>`:""}</div><div class="modal-actions"><button class="secondary" data-action="close-modal">${t("Annuler")}</button></div>`);
  }

  function openDeepenModal(card){
    if(!card)return;const summary=card.lastRun?.summary||activeConversation(card)?.preview||"";
    modal(`<h2>${t("Approfondir le travail")}</h2><p class="lead">${t("La consigne repart dans la conversation principale de « {title} » afin de conserver tout le contexte.",{title:esc(card.title)})}</p><div class="review-context"><strong>${t("Résultat actuel")}</strong><p>${esc(summary)}</p></div><form id="deepen-form" class="form-grid" data-id="${esc(card.id)}"><div class="field"><label>${t("Consigne complémentaire")}</label><textarea name="prompt" required autofocus placeholder="${t("À partir de ce résultat, approfondis…")}"></textarea></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">${t("Annuler")}</button><button class="primary">${t("Relancer dans la même conversation")}</button></div></form>`);
  }

  function finishReviewedCard(card,{stopRoutine=false}={}){
    if(!card)return;const createsNext=cardBoardPresetID(card)==="routines"&&card.recurrence&&card.recurrence!=="none"&&card.recurrenceSource!=="codex";if(stopRoutine){card.recurrence="none";card.recurrenceSource="board";card.launchMode="manual";card.scheduledAt="";card.scheduleState="";card.scheduleNextAttemptAt="";card.scheduleNote="Routine terminée définitivement."}changeStatus(card,"done");save();closeModal();render();toast(stopRoutine?"Routine terminée définitivement":createsNext?"Passage validé — prochaine occurrence planifiée":"Tâche terminée");
  }

  function queueCard(card,{mode=card?.runMode,autoApprove=false,newConversation=false,prompt=null,scheduled=false,conversationID=null,requireConversation=false}={}) {
    if(!card)return false;
    if(cardIsBusy(card))return toast(t("Une réponse est déjà en cours. Arrête-la avant d’envoyer une nouvelle instruction."),true),false;
    if(dependencyOpen(card)) return false;
    if(!(prompt||card.prompt||"").trim())return toast("Ajoute un brief avant de lancer cette tâche.",true),false;
    if(!["codex","claude-code"].includes(engineKey(card.agentEngine)))return toast("Cet agent n’est pas connecté.",true),false;
    const space=getSpace(card.spaceID); if(!space) return false;
    const requestedConversation=newConversation?null:(conversationID?(card.conversations||[]).find(item=>item.id===conversationID):activeConversation(card));
    if(requireConversation&&!requestedConversation)return toast(t("Cette conversation n’est plus associée à la tâche. Associe-la de nouveau avant d’envoyer."),true),false;
    if(requestedConversation&&engineKey(requestedConversation.engine||"codex")!==engineKey(card.agentEngine))return toast(t("Cette conversation appartient à un autre agent."),true),false;
    syncLegacyConversationFields(card);
    card.executionState="";delete card.pausedAt;changeStatus(card,"queued");queuePositions.set(card.id,[...queuePositions.keys()].filter(id=>{const autre=getCard(id);return autre&&engineKey(autre.agentEngine)===engineKey(card.agentEngine)}).length+1);queueReasons.set(card.id,"capacity"); card.runMode=mode;if(card.launchMode==="scheduled"){card.scheduleState="launched";card.scheduleTriggeredAt=card.scheduleTriggeredAt||now();card.scheduleNote=scheduled?"Déclenchée automatiquement.":"Lancée manuellement avant ou après son créneau."} if(isClaude(card)&&requestedConversation){requestedConversation.messages||=[];requestedConversation.messages.push({role:"user",text:prompt||card.prompt,at:now()});}
    card.lastRun={startedAt:now(),trigger:scheduled?"scheduled":"manual",accessMode:mode,approvalMode:autoApprove?"autoReview":"manual",summary:"En attente dans la file…"}; save(); render();
    const instruction=(prompt||card.prompt).trim(),isFollowUp=Boolean(requestedConversation)&&instruction!==String(card.prompt||"").trim();
    const contextualPrompt=isFollowUp
      ? `Suite de la tâche CTRL KANB « ${card.title} ».\n\nInstruction complémentaire :\n${instruction}\n\nObjectif initial à conserver :\n${card.prompt||card.title}\n\nPoursuis dans la même conversation et dans le workspace « ${space.name} » (${space.rootPath}).`
      : `Tâche CTRL KANB : ${card.title}\nWorkspace : ${space.name} (${space.rootPath})\n\nObjectif et brief :\n${instruction}\n\nTravaille dans ce workspace, tiens compte de ses instructions locales et va jusqu’à un résultat vérifiable.`;
    bridge({action:"run",card:{...card,prompt:contextualPrompt,conversationID:newConversation?undefined:(requestedConversation?.id||card.conversationID),accountID:activeAccountID(card.agentEngine)},space,mode,autoApprove,newConversation,accountHome:accountHomeFor(card.agentEngine)});
    return true;
  }

  function suspendCard(card){
    if(!card||(!activeRuns.has(card.id)&&!queuePositions.has(card.id)))return;
    card.executionState="pausing";card.pausedAt=now();card.lastRun={...(card.lastRun||{}),summary:t("Arrêt demandé…")};save();render();bridge({action:"stop",cardID:card.id});
  }

  function resumeCard(card){
    if(!card||!(card.executionState==="paused"||card.status==="running"))return;
    const continuePrompt=activeConversation(card)?t("Reprends cette tâche là où elle a été arrêtée. Vérifie l’état actuel du projet, puis poursuis jusqu’au résultat attendu décrit dans la carte."):null;
    queueCard(card,{prompt:continuePrompt});
  }

  function openConversationPicker(cardID) {
    if(isClaude(getCard(cardID)))return openClaudeSessionLink(cardID);
    conversationPickerCardID=cardID; conversations=[]; conversationFilterAll=false;
    modal(`<h2>${t("Associer une conversation")}</h2><p class="lead">${t("Chargement des conversations Codex…")}</p><div class="loader"></div><div class="modal-actions"><button class="secondary" data-action="close-modal">${t("Annuler")}</button></div>`); bridge({action:"listConversations"});
  }
  function sourceLabel(source){return typeof source==="string"?source:source&&typeof source==="object"?(Object.keys(source)[0]||"Codex"):"Codex"}
  function renderConversationPicker() {
    const card=getCard(conversationPickerCardID),space=getSpace(card?.spaceID);
    modal(`<h2>${t("Associer une conversation")}</h2><p class="lead">${t("Elle sera ajoutée sans supprimer les conversations déjà reliées.")}</p><div class="picker-tools"><input id="conversation-search" placeholder="${t("Rechercher…")}"><select id="conversation-role"><option value="main">Principale</option><option value="attempt">${t("Essai précédent")}</option><option value="delegated">${t("Sous-tâche déléguée")}</option><option value="validation">Validation</option></select><label class="check-row compact"><input id="conversation-all" type="checkbox"><span>${t("Tous les projets")}</span></label></div><div id="conversation-list" class="conversation-list"></div><div class="modal-actions"><button class="secondary" data-action="close-modal">${t("Annuler")}</button></div>`); filterConversationList("",space?.rootPath);
  }
  function filterConversationList(term,rootPath){const q=term.toLowerCase(),items=conversations.filter(i=>(conversationFilterAll||!rootPath||i.cwd===rootPath)&&`${i.name||""} ${i.preview||""} ${i.cwd||""}`.toLowerCase().includes(q));const node=document.querySelector("#conversation-list");if(!node)return;node.innerHTML=items.length?items.map(i=>`<button class="conversation-row" data-action="link-conversation" data-thread="${esc(i.id)}"><span class="conversation-icon">◉</span><span class="conversation-copy"><strong>${esc(i.name||i.preview||"Sans titre")}</strong><small>${esc(i.preview||"Aucun aperçu")}</small><em>${esc(i.cwd||"")} · ${esc(sourceLabel(i.source))}</em></span><span class="chevron">›</span></button>`).join(""):'<div class="picker-empty">Aucune conversation correspondante.<br><button class="secondary" data-action="toggle-all-conversations">Afficher tous les projets</button></div>'}

  function addConversationToCard(card,item,role="main") {
    const existing=card.conversations.find(c=>c.id===item.id);
    if(existing) Object.assign(existing,item,{role}); else card.conversations.push({engine:item.engine||card.agentEngine||"codex",id:item.id,name:item.name||item.preview||"Conversation",preview:item.preview||"",cwd:item.cwd||"",role,addedAt:now()});
    if(role==="main"||!card.activeConversationID){for(const c of card.conversations)if(c.role==="main"&&c.id!==item.id)c.role="attempt";const chosen=card.conversations.find(c=>c.id===item.id);chosen.role="main";card.activeConversationID=item.id;}
    syncLegacyConversationFields(card); card.updatedAt=now();
  }

  function conversationComposer(card,conv){
    return `<form id="conversation-message-form" data-card="${esc(card.id)}" data-thread="${esc(conv.id)}"><div class="conversation-compose-heading"><label for="conversation-message">${t("Poursuivre la conversation")}</label><button type="button" class="secondary" data-action="conversation-bottom">${t("Derniers messages")}</button></div><textarea id="conversation-message" name="message" placeholder="${t("Ajouter une instruction à cette conversation…")}" required></textarea><div class="conversation-compose-actions"><span class="conversation-send-state" role="status" aria-live="polite"></span><button type="submit" class="primary">${t("Envoyer")} <kbd>${t("⌘ ↵")}</kbd></button></div></form>`;
  }

  function syncConversationPanel(){
    const form=document.querySelector("#conversation-message-form"),card=getCard(form?.dataset.card);
    if(!form||!card)return;
    const busy=cardIsBusy(card)||card.executionState==="pausing",wasBusy=form.dataset.busy==="true";
    form.dataset.busy=String(busy);
    const textarea=form.querySelector("textarea"),button=form.querySelector("button.primary"),state=form.querySelector(".conversation-send-state"),stop=document.querySelector(".conversation-stop");
    if(textarea)textarea.disabled=busy;
    if(button){button.disabled=busy;button.textContent=busy?(queuePositions.has(card.id)?t("En file…"):t("Réponse en cours…")):t("Envoyer · ⌘ ↵")}
    if(state)state.textContent=busy?(card.executionState==="pausing"?t("Arrêt demandé…"):queuePositions.has(card.id)?t("Instruction en file dans cette conversation."):t("L’agent travaille. La réponse apparaîtra ici à la fin.")):t("Même conversation · même projet · mêmes autorisations.");
    if(stop){stop.hidden=!busy;stop.disabled=card.executionState==="pausing";stop.textContent=stop.disabled?t("Arrêt…"):queuePositions.has(card.id)?t("Retirer de la file"):t("Arrêter")}
    if(wasBusy&&!busy){
      const conv=card.conversations.find(c=>c.id===form.dataset.thread);
      if(!conv)return;
      if(isClaude({agentEngine:conv.engine}))openClaudeConversation(card,conv);
      else bridge({action:"readConversation",cardID:card.id,threadID:conv.id});
    }
  }

  // Un seul défilement pour les messages ; une actualisation conserve la lecture et la saisie.
  function conversationViewport(cardID,threadID){
    const form=document.querySelector("#conversation-message-form"),scroller=document.querySelector(".timeline,.claude-transcript");
    const same=form?.dataset.card===cardID&&form?.dataset.thread===threadID;
    const draft=same?form.querySelector("textarea")?.value||"":"";
    const top=same?scroller?.scrollTop||0:0;
    const bottom=!same||!scroller||scroller.scrollHeight-scroller.clientHeight-top<48;
    const focused=same&&document.activeElement===form.querySelector("textarea");
    return ()=>{syncConversationPanel();requestAnimationFrame(()=>{
      const current=document.querySelector("#conversation-message-form"),area=document.querySelector(".timeline,.claude-transcript");
      if(current?.dataset.card!==cardID||current?.dataset.thread!==threadID)return;
      const input=current.querySelector("textarea");if(input){input.value=draft;if(focused&&!input.disabled)input.focus({preventScroll:true})}
      if(area)area.scrollTop=bottom?area.scrollHeight:top;
    })};
  }

  function openConversationPanel(cardID,threadID=null) {
    const card=getCard(cardID); if(!card)return; const conv=threadID?card.conversations.find(c=>c.id===threadID):activeConversation(card); if(!conv)return;
    detailCardID=cardID;detailThreadID=conv.id;
    if(isClaude({agentEngine:conv.engine}))return openClaudeConversation(card,conv);
    modal(`<div class="drawer-loading"><h2>${esc(conv.name||"Conversation Codex")}</h2><p class="lead">${t("Chargement de l’historique…")}</p><div class="loader"></div><button class="secondary" data-action="close-modal">${t("Fermer")}</button></div>`);bridge({action:"readConversation",cardID,threadID:conv.id});
  }
  function itemText(item){if(item.type==="agentMessage")return item.text||"";if(item.type==="userMessage")return(item.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n");if(item.type==="commandExecution")return`Commande : ${item.command}\n${item.aggregatedOutput||""}`;if(item.type==="fileChange")return`${item.changes?.length||0} modification(s) de fichier`;return""}
  function renderConversationDetail(card,thread){
    const restoreViewport=conversationViewport(card.id,thread.id);
    const turns=[...(thread.turns||[])].sort((a,b)=>(a.startedAt||0)-(b.startedAt||0)).slice(-8);
    const busy=cardIsBusy(card)||card.executionState==="pausing",linked=card.conversations.find(item=>item.id===thread.id),project=thread.projectName||linked?.projectName||"";
    modal(`<div class="conversation-drawer"><aside><h3>${t("Conversations")}</h3>${card.conversations.map(c=>`<button class="drawer-conversation ${c.id===thread.id?"active":""}" data-action="switch-conversation" data-card-id="${esc(card.id)}" data-thread="${esc(c.id)}"><strong>${esc(c.name||"Conversation")}</strong><small>${esc(c.role||"main")}</small></button>`).join("")}<button class="secondary full" data-action="pick-conversation" data-id="${esc(card.id)}">＋ Associer</button></aside><section><div class="drawer-head"><div><h2>${esc(thread.name||activeConversation(card)?.name||card.title)}</h2><p>${project?`${t("Projet Codex")} : ${esc(project)} · `:""}${esc(thread.cwd||"")} · ${esc(thread.status?.type||"inconnu")}</p></div>${card.activeConversationID!==thread.id?`<button class="secondary" data-action="set-main-conversation" data-card-id="${esc(card.id)}" data-thread="${esc(thread.id)}">${t("Définir principale")}</button>`:""}<button class="secondary pause-control conversation-stop" data-action="suspend-run" data-id="${esc(card.id)}" hidden>${t("Arrêter")}</button><button class="secondary" data-action="open-conversation" data-thread="${esc(thread.id)}">${t("Ouvrir dans Codex ↗")}</button><button class="icon-button" data-action="remove-conversation" data-card-id="${esc(card.id)}" data-thread="${esc(thread.id)}" title="${t("Dissocier")}">⌫</button><button class="icon-button" data-action="close-modal">×</button></div><div class="timeline">${turns.length?turns.map(turn=>`<div class="turn"><div class="turn-status">${esc(turn.status)}</div>${(turn.items||[]).filter(i=>itemText(i)).map(i=>`<div class="message ${i.type}"><strong>${i.type==="userMessage"?"Toi":i.type==="agentMessage"?"Codex":i.type}</strong><p>${esc(itemText(i))}</p></div>`).join("")}</div>`).join(""):'<div class="picker-empty">Aucun tour enregistré.</div>'}</div>${conversationComposer(card,thread)}</section></div>`);
    restoreViewport();
  }

  // Seule la conversation principale peut modifier l'état ou le dernier résultat.
  // Les anciens essais restent lisibles à la demande ; les relire à chaque passage
  // allongerait l actualisation sans bénéfice visible.
  function activeConversationOwners(){
    return [...board.cards.filter(card=>!card.archived),...(board.utilityChats||[])].map(item=>({item,conversation:activeConversation(item)})).filter(owner=>owner.conversation?.id);
  }
  function activeCodexConversationIDs(){
    return [...new Set(activeConversationOwners().filter(owner=>!isClaude({agentEngine:owner.conversation.engine})).map(owner=>owner.conversation.id))];
  }
  function activeClaudeSessionDescriptors(){
    const seen=new Set(),sessions=[];
    for(const {conversation} of activeConversationOwners().filter(owner=>isClaude({agentEngine:owner.conversation.engine}))){
      const accountID=accountByID(conversation.accountID)?.id||activeAccountID("claude-code"),account=accountByID(accountID)||activeAccount("claude-code"),key=`${accountID}:${conversation.id}`;
      if(seen.has(key))continue;seen.add(key);sessions.push({sessionID:conversation.id,accountID,accountHome:account?.home||""});
    }
    return sessions;
  }
  function syncDurationLabel(durationMs){
    return durationMs<1000?t("moins d’une seconde"):t("{n} s",{n:Math.max(1,Math.round(durationMs/1000))});
  }
  function syncCheckedDetail(state,detail){return state.lastAt?`${detail} · ${t("Vérifié {date}",{date:validationTime(state.lastAt)})}`:detail}
  function codexSyncStatusCopy(){
    const progress=syncState.total?`${syncState.completed}/${syncState.total}`:"";
    if(syncState.phase==="running")return {label:progress?t("Codex · {progress}",{progress}):t("Connexion à Codex…"),detail:t("CTRL KANB actualise uniquement les conversations principales Codex."),showDetail:true};
    if(syncState.phase==="slow")return {label:progress?t("Codex répond lentement · {progress}",{progress}):t("Codex répond lentement"),detail:t("L’application répond toujours. La synchronisation s’arrêtera automatiquement si Codex ne répond pas."),showDetail:true};
    if(syncState.phase==="partial")return {label:t("Codex partiellement à jour"),detail:syncCheckedDetail(syncState,syncState.message),showDetail:true};
    if(syncState.phase==="error")return {label:t("Actualisation Codex interrompue"),detail:syncState.message||t("Clique pour réessayer."),showDetail:true};
    if(syncState.phase==="empty")return {label:t("Aucune conversation Codex"),detail:t("Aucune conversation principale Codex n’est liée à une tâche active.")};
    if(syncState.phase==="success")return {label:t("Codex à jour"),detail:syncCheckedDetail(syncState,tn(syncState.total,"{n} conversation principale Codex actualisée.","{n} conversations principales Codex actualisées."))};
    return {label:board.settings.autoSync?t("Actualisation automatique Codex"):t("Actualiser Codex"),detail:board.settings.autoSync?t("CTRL KANB vérifie périodiquement les conversations principales Codex."):t("Clique pour actualiser les résultats depuis Codex.")};
  }
  function claudeSyncStatusCopy(){
    const progress=claudeSyncState.total?`${claudeSyncState.completed}/${claudeSyncState.total}`:"";
    if(claudeSyncState.phase==="running")return {label:progress?t("Claude · {progress}",{progress}):t("Lecture de Claude…"),detail:t("CTRL KANB relit les sessions Claude locales sans envoyer de message."),showDetail:true};
    if(claudeSyncState.phase==="partial")return {label:t("Claude partiellement à jour"),detail:syncCheckedDetail(claudeSyncState,claudeSyncState.message),showDetail:true};
    if(claudeSyncState.phase==="error")return {label:t("Claude à vérifier"),detail:claudeSyncState.message||t("Clique pour réessayer."),showDetail:true};
    if(claudeSyncState.phase==="empty")return {label:t("Aucune session Claude"),detail:t("Aucune session Claude principale n’est liée à une tâche active.")};
    if(claudeSyncState.phase==="success")return {label:t("Claude à jour"),detail:syncCheckedDetail(claudeSyncState,tn(claudeSyncState.total,"{n} session Claude locale relue.","{n} sessions Claude locales relues."))};
    return {label:board.settings.autoSync?t("Actualisation automatique Claude"):t("Actualiser Claude"),detail:t("Relit les sessions locales liées, sans envoyer de message à Claude Code.")};
  }
  function sidebarSyncStateLabel(engine,state){
    const progress=state.total?`${state.completed}/${state.total}`:"";
    if(state.phase==="running")return progress||t("En cours");
    if(state.phase==="slow")return t("Réponse lente");
    if(state.phase==="partial")return progress||t("Partiel");
    if(state.phase==="error")return t("À vérifier");
    if(state.phase==="empty")return engine==="codex"?t("Aucune conversation"):t("Aucune session");
    if(state.phase==="success")return t("À jour");
    return board.settings.autoSync?t("Automatique"):t("Actualiser");
  }
  function renderOneSyncStatus(selector,state,busy,copy,engine){
    const node=document.querySelector(selector);if(!node)return;
    const status=sidebarSyncStateLabel(engine,state),label=engine==="codex"?"Codex":"Claude Code",statusIcon=busy?"sync":["error","partial"].includes(state.phase)?"alert":state.phase==="success"?"check":"sync";
    node.className=`sidebar-sync sync-${state.phase}`;node.disabled=busy;node.title=copy.detail;node.setAttribute("aria-label",`${copy.label}. ${copy.detail}`);
    node.innerHTML=`<span class="sidebar-sync-engine">${engineLogo(engine)}<strong>${label}</strong></span><span class="sidebar-sync-state">${icon(statusIcon)}<small>${esc(status)}</small></span>`;
  }
  function renderSyncStatus(){
    renderOneSyncStatus("#sidebar-sync",syncState,syncing,codexSyncStatusCopy(),"codex");
    renderOneSyncStatus("#sidebar-claude-sync",claudeSyncState,claudeSyncing,claudeSyncStatusCopy(),"claude-code");
    const button=document.querySelector("#settings-sync-now"),busy=syncing||claudeSyncing;
    if(button){button.disabled=busy;button.classList.toggle("is-busy",busy);button.title=t("Relire les conversations Codex et les sessions Claude Code liées");const label=button.querySelector("span");if(label)label.textContent=t(busy?"Actualisation en cours…":"Actualiser maintenant");}
    for(const [selector,state,copy] of [["#settings-codex-sync-state",syncState,codexSyncStatusCopy()],["#settings-claude-sync-state",claudeSyncState,claudeSyncStatusCopy()]]){const node=document.querySelector(selector);if(!node)continue;node.className=`settings-sync-state sync-${state.phase}`;node.textContent=copy.label;node.title=copy.detail;}
  }
  function rememberConversationSync(engine,state){
    board.settings.conversationSyncChecks={...(board.settings.conversationSyncChecks||{}),[engine]:{phase:state.phase,completed:state.completed||0,total:state.total||0,failed:state.failed||0,durationMs:state.durationMs||0,lastAt:state.lastAt||now(),message:state.message||""}};
  }
  function syncNow(silent=false){
    if(syncing){if(!silent)toast(t("Synchronisation déjà en cours."));return}
    const ids=activeCodexConversationIDs();
    if(!ids.length){syncState={phase:"empty",completed:0,total:0,failed:0,durationMs:0,lastAt:now(),message:""};rememberConversationSync("codex",syncState);save();renderSyncStatus();if(!silent)toast(t("Aucune conversation Codex à synchroniser."));return}
    syncing=true;lastSyncAt=Date.now();syncState={phase:"running",completed:0,total:ids.length,durationMs:0,lastAt:"",message:"",silent};
    renderHeader();renderSyncStatus();bridge({action:"syncConversations",threadIDs:ids});
  }
  function syncClaudeNow(silent=false){
    if(claudeSyncing){if(!silent)toast(t("Actualisation Claude déjà en cours."));return}
    const sessions=activeClaudeSessionDescriptors();
    if(!sessions.length){claudeSyncState={phase:"empty",completed:0,total:0,failed:0,durationMs:0,lastAt:now(),message:""};rememberConversationSync("claude-code",claudeSyncState);save();renderSyncStatus();if(!silent)toast(t("Aucune session Claude à actualiser."));return}
    claudeSyncing=true;lastSyncAt=Date.now();claudeSyncState={phase:"running",completed:0,total:sessions.length,failed:0,durationMs:0,lastAt:"",message:"",silent};
    renderHeader();renderSyncStatus();bridge({action:"syncClaudeSessions",sessions});
  }
  function syncAllNow(silent=false){syncNow(true);syncClaudeNow(true);if(!silent)toast(t("Synchronisation de Codex et Claude Code en cours…"),false,"essential");}
  function lastTurn(thread){return[...(thread.turns||[])].sort((a,b)=>(a.startedAt||0)-(b.startedAt||0)).at(-1)}
  function applyConversationSync(thread){for(const {item:card,conversation:conv} of activeConversationOwners().filter(owner=>owner.conversation.id===thread.id)){Object.assign(conv,{name:thread.name||conv.name,preview:thread.preview||conv.preview,cwd:thread.cwd||conv.cwd,updatedAt:thread.updatedAt});if(card.activeConversationID===thread.id){card.conversationState=thread.status?.type||"unknown";const turn=lastTurn(thread);const message=[...(turn?.items||[])].reverse().find(i=>i.type==="agentMessage")?.text;if(message){card.lastRun={...(card.lastRun||{}),summary:message};conv.preview=message}if(!card.utilityChat&&card.executionState!=="paused"){if(thread.status?.type==="active"&&card.status!=="done")card.status="running";else if(!activeRuns.has(card.id)&&card.status==="running"&&turn?.status==="completed")card.status="review";else if(turn?.status==="failed")card.status="needsInput";}syncLegacyConversationFields(card)}}}
  function applyClaudeSessionSync(session){
    if(!session?.found)return;
    for(const {item,conversation} of activeConversationOwners().filter(owner=>owner.conversation.id===session.sessionID&&(!session.accountID||!owner.conversation.accountID||owner.conversation.accountID===session.accountID))){
      Object.assign(conversation,{preview:session.preview||conversation.preview,cwd:session.cwd||conversation.cwd,updatedAt:session.updatedAt||conversation.updatedAt,accountID:session.accountID||conversation.accountID||activeAccountID("claude-code")});
      if(session.preview){conversation.messages||=[];const last=[...conversation.messages].reverse().find(message=>message.role==="assistant");if(last?.text!==session.preview)conversation.messages.push({role:"assistant",text:session.preview,at:session.updatedAt||now()});conversation.messages=conversation.messages.slice(-120);item.lastRun={...(item.lastRun||{}),summary:session.preview,finishedAt:session.updatedAt||item.lastRun?.finishedAt};if(item.utilityChat)item.messages=structuredClone(conversation.messages);}
      syncLegacyConversationFields(item);
    }
  }

  function openValidationQuestion(validation){
    const card=getCard(validation.cardID),questions=validation.params?.questions||[];
    modal(`<div class="validation-modal-head"><span>${icon("question")}</span><div><h2>${(engineLabel(validation.agentEngine))} attend ta réponse</h2><p class="lead">${esc(card?.title||"Tâche en cours")}</p></div></div><form id="input-request-form" class="form-grid" data-validation="${esc(validation.id)}">${questions.map((question,index)=>`<div class="field validation-question"><label>${esc(question.header||`Question ${index+1}`)}</label><p class="question-copy">${esc(question.question||"")}</p>${question.options?.length?`<select name="${esc(question.id)}">${question.options.map(option=>`<option value="${esc(option.label)}">${esc(option.label)}${option.description?` — ${esc(option.description)}`:""}</option>`).join("")}</select>`:`<input name="${esc(question.id)}" required placeholder="${t("Ta réponse…")}">`}</div>`).join("")||'<p class="lead">Aucune question exploitable n’a été transmise par l’agent.</p>'}<div class="modal-actions"><button type="button" class="secondary danger-text" data-action="cancel-validation" data-validation="${esc(validation.id)}">${t("Arrêter la tâche")}</button><span class="grow"></span><button type="button" class="secondary" data-action="close-modal">${t("Fermer")}</button><button class="primary">${t("Envoyer la réponse")}</button></div></form>`);
  }
  function openValidationDetails(validation){
    const card=getCard(validation.cardID),space=getSpace(validation.spaceID||card?.spaceID),pending=validation.status==="pending";
    modal(`<div class="validation-modal-head"><span>${icon(validationKindIcon(validation.kind))}</span><div><h2>${esc(validationKindLabel(validation.kind))}</h2><p class="lead">${esc(card?.title||"Carte supprimée")} · ${(engineLabel(validation.agentEngine))}</p></div></div><div class="approval-detail">${esc(validationDetail(validation))}</div>${validation.params?.cwd?`<div class="approval-path">${esc(validation.params.cwd)}</div>`:""}<div class="validation-modal-facts"><span><small>${t("Projet")}</small><strong>${esc(space?.name||"Inconnu")}</strong></span><span><small>${t("Niveau d’accès")}</small><strong>${esc(accessLabel(validation.accessMode))}</strong></span><span><small>${t("État")}</small><strong>${esc(pending?"En attente":validationStatusLabel(validation.status))}</strong></span></div><div class="modal-actions"><button class="secondary" data-action="close-modal">${t("Fermer")}</button>${pending&&validation.kind==="input"?`<button class="primary" data-action="answer-validation" data-validation="${esc(validation.id)}">${t("Répondre")}</button>`:""}</div>`);
  }
  function decideValidation(validation,decision){
    if(!validation||validation.status!=="pending")return;
    validation.decision=decision;validation.status=decision==="decline"?"declined":decision==="acceptForSession"?"acceptedForSession":"accepted";validation.decidedAt=now();
    save();render();bridge({action:"respondRequest",cardID:validation.cardID,requestID:validation.requestID,result:{decision}});closeModal();toast(decision==="decline"?"Action refusée":decision==="acceptForSession"?"Action autorisée pour cette session":"Action autorisée une fois");
  }
  function cancelValidation(validation){
    if(!validation||validation.status!=="pending")return;
    validation.status="declined";validation.decision="cancel";validation.decidedAt=now();validation.note="Tâche arrêtée à la demande de l’utilisateur.";save();render();bridge({action:"respondRequest",cardID:validation.cardID,requestID:validation.requestID,result:{answers:{}}});bridge({action:"stop",cardID:validation.cardID});closeModal();toast("Tâche arrêtée");
  }

  // Creer un projet depuis l editeur remplace la fenetre courante : on met de
  // cote ce qui est saisi pour rouvrir l editeur ensuite, que le projet soit
  // cree ou que l utilisateur renonce.
  let pendingAfterSpace=null;
  function captureCardDefaults(form){
    const data=Object.fromEntries(new FormData(form));
    const garde=["title","prompt","status","priorityLevelID","boardPresetID","dueDate","agentEngine","model",
                 "reasoningEffort","launchMode","executionType","recurrence","scheduledAt","durationMinutes","runMode","notificationMode","spaceID"];
    return Object.fromEntries(garde.filter(cle=>data[cle]!==undefined).map(cle=>[cle,data[cle]]));
  }
  function resumeAfterSpace(){
    const suite=pendingAfterSpace; pendingAfterSpace=null;
    if(!suite||!board.spaces.length)return false;
    const defauts={...suite.defaults};
    if(!board.spaces.some(space=>space.id===defauts.spaceID))defauts.spaceID=board.spaces[board.spaces.length-1].id;
    suite.simple?openSimpleCardModal(null,defauts):openCardModal(null,defauts);
    // Les valeurs sont deja remises en place : proposer en plus « un brouillon
    // est disponible » ferait douter de ce qui est affiche.
    clearDraft(document.querySelector("#card-form"));
    const avis=document.querySelector("#draft-notice"); if(avis)avis.hidden=true;
    return true;
  }

  let modalReturnFocus=null;
  function modal(content,kind=""){
    captureDraft();modalReturnFocus=document.activeElement;
    // La fenetre couvre tout l ecran : sans cela le fond reste tabulable et
    // annonce par VoiceOver alors qu il n est plus visible.
    setBackgroundInert(true);
    document.querySelector("#modal-root").innerHTML=`<div class="modal-backdrop ${kind}"><div class="modal" role="dialog" aria-modal="true" aria-label="${kind==='task-editor'?t("Détails de la tâche"):'CTRL KANB'}">${content}</div></div>`;
    requestAnimationFrame(()=>{const root=document.querySelector("#modal-root");linkFieldLabels(root);(root.querySelector("[autofocus]")||root.querySelector("input,textarea,select,button"))?.focus({preventScroll:true});});
  }
  // Le fond redevient navigable avant de lui rendre le focus, sinon le focus est refuse.
  function setBackgroundInert(state){const app=document.querySelector("#app");if(app)app.inert=state;}
  function closeModal(){detailCardID=null;detailThreadID=null;captureDraft();document.querySelector("#modal-root").innerHTML="";setBackgroundInert(false);folderCallback=null;modalReturnFocus?.focus?.();if(pendingAfterSpace)resumeAfterSpace();}
  function toast(message,error=false,kind="routine"){
    if(!error&&kind==="routine"&&normalizeInAppNotifications(board.settings?.inAppNotifications)==="essential")return;
    const node=document.createElement("div");node.className=`toast ${error?"error":""}`;node.textContent=message;document.querySelector("#toast-root").append(node);setTimeout(()=>node.remove(),4000);
  }
  // Le menu de gauche doit dire ou l on est : au clic, puis au defilement.
  function markActiveSettingsSection(){
    for(const button of document.querySelectorAll?.(".settings-nav-item")||[])
      button.classList?.toggle("active", button.dataset?.target===activeSettingsSection);
  }
  function watchSettingsScroll(){
    const content=document.querySelector("#settings-content");
    if(!content||content.dataset?.watched)return;
    if(content.dataset)content.dataset.watched="1";
    content.addEventListener?.("scroll",()=>{
      let current=activeSettingsSection;
      for(const [id] of settingsSections()){
        const node=document.getElementById(id);
        if(!node?.getBoundingClientRect)continue;
        if(node.getBoundingClientRect().top-content.getBoundingClientRect().top<=24)current=id;
      }
      if(current!==activeSettingsSection){activeSettingsSection=current;markActiveSettingsSection();}
    });
  }

  // Les reglages s appliquent au changement, pas a la soumission : un panneau de
  // preferences qui exige un bouton laisse toujours douter de ce qui est pris en
  // compte. La barre du bas ne valide donc rien, elle confirme.
  let preferencesSavedAt = "";
  function applyPreferences(form){
    if(!form)return;
    const previousAgendaToday=today();
    const data={};
    for(const [key,value] of new FormData(form)) data[key]=value;
    const has=name=>form.elements?.namedItem?Boolean(form.elements.namedItem(name)):Object.prototype.hasOwnProperty.call(data,name);
    const backgroundEnabled=has("backgroundSchedulerEnabled")?data.backgroundSchedulerEnabled==="on":Boolean(board.settings.backgroundSchedulerEnabled);
    const backgroundChanged=has("backgroundSchedulerEnabled")&&backgroundEnabled!==Boolean(board.settings.backgroundSchedulerEnabled);
    const previousSystemNotifications=Boolean(board.settings.systemNotificationsEnabled);
    if(has("defaultAgentEngine"))board.settings.defaultAgentEngine=normalizeEngine(data.defaultAgentEngine);
    if(has("defaultModelCodex"))board.settings.defaultModelCodex=data.defaultModelCodex||"gpt-5.6-sol";
    if(has("defaultModelClaude"))board.settings.defaultModelClaude=data.defaultModelClaude||"sonnet";
    // Conserve pour les versions anterieures, qui ne lisent que cette cle.
    board.settings.defaultModel=board.settings.defaultModelCodex;
    if(has("defaultEffortCodex"))board.settings.defaultEffortCodex=normalizeEffort(data.defaultEffortCodex);
    if(has("defaultEffortClaude"))board.settings.defaultEffortClaude=normalizeEffort(data.defaultEffortClaude);
    if(has("maxConcurrencyCodex"))board.settings.maxConcurrencyCodex=normalizeConcurrency(data.maxConcurrencyCodex);
    if(has("maxConcurrencyClaude"))board.settings.maxConcurrencyClaude=normalizeConcurrency(data.maxConcurrencyClaude);
    // Conserve les anciennes cles pour une ouverture temporaire avec une version precedente.
    board.settings.defaultEffort=board.settings.defaultEffortCodex;
    board.settings.maxConcurrency=board.settings.maxConcurrencyCodex;
    if(has("autoSync"))board.settings.autoSync=data.autoSync==="on";
    if(has("syncIntervalSeconds"))board.settings.syncIntervalSeconds=normalizeSyncInterval(data.syncIntervalSeconds);
    if(has("inAppNotifications"))board.settings.inAppNotifications=normalizeInAppNotifications(data.inAppNotifications);
    if(has("systemNotificationsEnabled"))board.settings.systemNotificationsEnabled=data.systemNotificationsEnabled==="on";
    const notificationWhenControl=form.elements?.namedItem?.("notificationWhen");
    if(has("notificationWhen")&&!notificationWhenControl?.disabled)board.settings.notificationWhen=normalizeNotificationWhen(data.notificationWhen);
    const notificationEvents=normalizeNotificationEvents(board.settings.notificationEvents);
    for(const [id] of notificationEventCatalog){
      const name=`notificationEvent__${id}`,control=form.elements?.namedItem?.(name);
      if(has(name)&&!control?.disabled)notificationEvents[id]=data[name]==="on";
    }
    board.settings.notificationEvents=notificationEvents;
    board.settings.notifications=board.settings.systemNotificationsEnabled?board.settings.notificationWhen:"none";
    if(has("agendaMode"))board.settings.agendaMode=normalizeAgendaMode(data.agendaMode);
    if(has("agendaTimeZone"))board.settings.agendaTimeZone=normalizeAgendaTimeZone(data.agendaTimeZone);
    if(has("agendaWeekStart"))board.settings.agendaWeekStart=normalizeAgendaWeekStart(data.agendaWeekStart);
    if(has("agendaHourCycle"))board.settings.agendaHourCycle=normalizeAgendaHourCycle(data.agendaHourCycle);
    if(has("agendaMode"))agendaMode=board.settings.agendaMode;
    if(dateKey(agendaAnchor)===previousAgendaToday)agendaAnchor=parseLocalDate(today());
    if(has("backgroundSchedulerEnabled"))board.settings.backgroundSchedulerEnabled=backgroundEnabled;
    if(has("defaultBoardPreset"))board.settings.defaultBoardPreset=normalizePresetID(data.defaultBoardPreset);
    if(has("autoArchiveCompletedDays"))board.settings.autoArchiveCompletedDays=Number(data.autoArchiveCompletedDays)||0;
    const appearanceChanged=has("theme")||has("themePalette");
    if(has("theme"))board.settings.theme=normalizeTheme(data.theme);
    if(has("themePalette"))board.settings.themePalette=normalizeThemePalette(data.themePalette);
    if(appearanceChanged)applyTheme(board.settings.theme,board.settings.themePalette);
    if(has("fontSize")){board.settings.fontSize=normalizeFontSize(data.fontSize);applyFontSize(board.settings.fontSize)}
    if(has("language")){board.settings.language=normalizeLanguage(data.language);applyLanguage(board.settings.language)}
    const archived=applyAutoArchiveCompleted();
    preferencesSavedAt=new Date().toLocaleTimeString(locale(),{hour:"2-digit",minute:"2-digit"});
    save();
    bridge({action:"setConcurrency",codex:concurrencyFor("codex"),claude:concurrencyFor("claude-code")});
    if(board.settings.systemNotificationsEnabled&&!previousSystemNotifications)bridge({action:"requestNotifications"});
    if(backgroundChanged)bridge({action:"setBackgroundScheduler",enabled:backgroundEnabled});
    render();
    if(backgroundChanged)toast(backgroundEnabled?t("Activation du moteur local…"):t("Moteur local désactivé"));
    else if(archived)toast(tn(archived,"{n} ancienne carte archivée","{n} anciennes cartes archivées"));
  }

  function applySettingsForm(form){
    if(!form)return;
    for(const priority of priorities()){priority.name=form.elements[`priority_name__${priority.id}`]?.value.trim()||priority.name;priority.code=(form.elements[`priority_code__${priority.id}`]?.value.trim()||priority.code).toUpperCase().slice(0,3);priority.color=(form.elements[`priority_color__${priority.id}`]?.value||`#${priority.color}`).replace("#","");}
    priorities().forEach((p,index)=>p.weight=index);
    for(const dimension of taxonomy().filter(d=>!d.archived)){dimension.name=form.elements[`dimension_name__${dimension.id}`]?.value.trim()||dimension.name;dimension.multiple=Boolean(form.elements[`dimension_multiple__${dimension.id}`]?.checked);for(const value of (dimension.values||[]).filter(v=>!v.archived)){value.name=form.elements[`value_name__${dimension.id}__${value.id}`]?.value.trim()||value.name;value.color=(form.elements[`value_color__${dimension.id}__${value.id}`]?.value||`#${value.color||"6E75FF"}`).replace("#","");if(dimension.kind==="subproject")value.parentValueID=form.elements[`value_parent__${dimension.id}__${value.id}`]?.value||"";}}
  }
  function movePriority(id,direction){const list=priorities(),index=list.findIndex(p=>p.id===id),next=index+direction;if(index<0||next<0||next>=list.length)return;[list[index],list[next]]=[list[next],list[index]];list.forEach((p,i)=>p.weight=i);save();openSettingsModal();render()}
  function renumberCards(){const groups={};for(const card of board.cards){const key=`${card.spaceID}:${card.priorityLevelID}`;(groups[key]||=[]).push(card)}for(const cards of Object.values(groups)){cards.sort((a,b)=>Number(a.priorityNumber||9999)-Number(b.priorityNumber||9999)||String(a.createdAt).localeCompare(String(b.createdAt))).forEach((card,index)=>{card.priorityNumber=index+1;card.updatedAt=now()})}save();openSettingsModal();render();toast("Numérotation compactée")}
  function agendaDropTargetAt(x,y){
    const contains=element=>{const rect=element.getBoundingClientRect();return x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom};
    return [...document.querySelectorAll(".agenda-slot-target")].find(contains)||[...document.querySelectorAll("[data-agenda-drop-date]")].find(contains)||null;
  }
  function moveAgendaCard(card,date,hour="",minute=""){
    if(!card||card.status==="done")return toast("Une tâche réalisée reste verrouillée dans l’historique.",true);
    if(["queued","running"].includes(card.status))return toast("Une tâche active ne peut pas être déplacée.",true);
    if(card.launchMode==="scheduled"&&card.scheduledAt){const original=agendaZonedParts(card.scheduledAt),targetHour=hour===""?original?.hour:Number(hour),targetMinute=minute===""?original?.minute:Number(minute),instant=agendaWallToInstant(`${date}T${agendaPad(targetHour)}:${agendaPad(targetMinute)}`);if(!instant)return toast(t("Cette heure n’existe pas dans le fuseau choisi. Sélectionne une autre heure."),true);card.scheduledAt=instant;card.scheduleState="pending";card.scheduleNextAttemptAt="";card.scheduleAttempts=0;card.scheduleNote="Créneau déplacé depuis l’Agenda."}
    else if(card.dueDate)card.dueDate=date;
    else return toast("Ajoute d’abord une échéance ou une planification à cette tâche.",true);
    card.updatedAt=now();save();render();toast(card.launchMode==="scheduled"?"Créneau déplacé":"Échéance déplacée");
  }

  // Experience layer: shared by the native WebKit app and isolated DOM tests.
  const engineKey = value => ["claudeCode","claude-code"].includes(value)?"claude-code":value||"codex";
  const isClaude = card => engineKey(card?.agentEngine)==="claude-code";
  let engineAvailability={codex:false,claude:false,checked:false};
  let engineProbes={};
  const storedAccountCheck = accountID => board.settings?.accountChecks?.[accountID] || null;
  const accountCheck = accountID => engineProbes[accountID] || storedAccountCheck(accountID);
  const engineIsAvailable = engine => engineKey(engine)==="claude-code" ? engineAvailability.claude : engineAvailability.codex;
  function connectionState(engine,accountID=activeAccountID(engine)){
    const probe=accountCheck(accountID);
    if(!engineAvailability.checked)return {state:"checking",label:t("Vérification…"),detail:t("Détection du moteur en cours.")};
    if(!engineIsAvailable(engine))return {state:"missing",label:t("Non installé"),detail:t("Le moteur n’est pas disponible sur ce Mac.")};
    if(probe?.state==="running")return {state:"checking",label:t("Test en cours"),detail:t("Un aller-retour réel est envoyé au compte.")};
    if(probe?.state==="ready")return {state:"ready",label:t("Connexion testée"),detail:t("Dernier test réussi : {date}",{date:probeDate(probe.at)})};
    if(probe?.state==="blocked"||probe?.state==="missing")return {state:"blocked",label:t("À reconnecter"),detail:probe.detail||t("Le dernier test n’a pas abouti.")};
    if(probe?.state==="login")return {state:"untested",label:t("À tester"),detail:t("Termine la connexion dans Terminal, puis lance le test.")};
    return {state:"untested",label:t("À tester"),detail:t("Aucun test de connexion n’est enregistré pour ce compte.")};
  }
  function persistAccountCheck(accountID,payload){
    if(!accountID||!['ready','blocked','missing','login'].includes(payload?.state))return;
    const check={engine:engineKey(payload.engine),account:accountID,state:payload.state,at:String(payload.at||now()),detail:payload.state==="ready"?"":String(payload.detail||"").slice(0,500)};
    board.settings.accountChecks={...(board.settings.accountChecks||{}),[accountID]:check};
    save();
  }
  let securityState={lockEnabled:false,biometry:"",checked:false};
  function engineModelOptions(engine,selected){
    const models=engineEntry(engine)[2];
    if(selected&&!models.some(([id])=>id===selected))models.unshift([selected,selected]);
    return models.map(([id,label])=>`<option value="${esc(id)}" ${id===selected?"selected":""}>${esc(label)}</option>`).join("");
  }
  let clearedDraftForm=null;
  const draftKey=form=>`ctrl-kanb.draft.${form?.dataset?.id||"new"}`;
  function readDraft(form){try{return JSON.parse(localStorage.getItem(draftKey(form))||"null")}catch{return null}}
  function captureDraft(){const form=document.querySelector("#card-form");if(!form||form===clearedDraftForm||!form.elements)return;try{const entries=[...new FormData(form)];if(entries.some(([key,value])=>["title","prompt"].includes(key)&&String(value).trim())){localStorage.setItem(draftKey(form),JSON.stringify(entries));const status=document.querySelector("#draft-state");if(status)status.textContent=t("Brouillon conservé sur ce Mac");}}catch{}}
  function clearDraft(form){clearedDraftForm=form;try{localStorage.removeItem(draftKey(form))}catch{}}
  function restoreDraft(){const form=document.querySelector("#card-form"),entries=readDraft(form);if(!form||!entries)return;const values=Object.fromEntries(entries);if(values.agentEngine&&form.elements.model)form.elements.model.innerHTML=engineModelOptions(values.agentEngine,values.model);for(const control of form.elements){const selected=entries.filter(([key])=>key===control.name).map(([,value])=>value);if(control.type==="checkbox")control.checked=selected.includes(control.value);else if(control.multiple)for(const option of control.options)option.selected=selected.includes(option.value);else if(selected.length)control.value=selected[0];}if(form.dataset.simple==="true")updateSimpleExecutionFields(form,Boolean(values.scheduledAt));else if(form.elements.scheduledAt)refreshSchedulePicker(form,Boolean(values.scheduledAt));document.querySelector("#draft-notice").hidden=true;toast("Brouillon repris");}
  function preferredWorkspaceID(){
    if(getSpace(selection))return selection;
    if(getSpace(lastWorkspaceSelection))return lastWorkspaceSelection;
    return board.spaces[0]?.id||"";
  }
  function rememberWorkspaceSelection(value){if(value==="global"||getSpace(value))lastWorkspaceSelection=value;}
  function navigateTo(view,surface){closeModal();labelFilter="";priorityFilter="";taxonomyFilter="";selection=view;rememberWorkspaceSelection(view);if(surface){surfaceMode=surface;board.settings.surfaceMode=surface;save()}render();}
  const commandActions=()=>[
    {label:t("Créer une tâche"),detail:"Un brief complet",key:"N",icon:"plus",run:()=>openCardModal()},
    {label:t("Capturer une idée"),detail:"Le titre suffit pour commencer",key:"⇧ N",icon:"edit",run:()=>openQuickCapture()},
    {label:"Flux du jour",detail:"Décider et avancer",key:"1",icon:"flow",run:()=>navigateTo("global","flow")},
    {label:t("Tableau"),detail:"Organiser le workflow",key:"2",icon:"board",run:()=>navigateTo("global","board")},
    {label:t("Agenda"),detail:"Planifier la semaine",key:"3",icon:"calendar",run:()=>navigateTo("agendaView")},
    {label:t("Validations"),detail:"Répondre aux agents",key:"4",icon:"shield",run:()=>navigateTo("reviewView")},
    {label:"Suivi des résultats",detail:"Reprendre le travail",key:"5",icon:"eye",run:()=>navigateTo("followView")},
    {label:"Historique",detail:"Consulter les archives",icon:"history",run:()=>navigateTo("doneView")},
    {label:"Réglages",detail:"Personnaliser CTRL KANB",icon:"settings",run:()=>navigateTo("settingsView")},
    {label:t("Chat du projet"),detail:t("Échanger avec Codex ou Claude Code"),key:"⌥⌘C",icon:"chat",run:()=>openUtilityPanel("chat")},
    {label:t("Terminal du projet"),detail:t("Démarrer un shell complet dans le dossier choisi"),key:"⌥⌘T",icon:"terminal",run:()=>openUtilityPanel("terminal")},
    {label:t("Fichiers du projet"),detail:t("Parcourir et ouvrir les fichiers"),key:"⌥⌘F",icon:"file",run:()=>openUtilityPanel("files")},
    {label:"Raccourcis clavier",detail:"Tout à portée de main",key:"?",icon:"terminal",run:()=>openShortcuts()}
  ];
  let paletteItems=[],paletteIndex=0;
  const normalizeSearch=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  function openCommandPalette(){modal(`<div class="palette-search">${icon("search")}<input id="command-search" autofocus autocomplete="off" placeholder="${t("Une tâche, un projet, une action…")}" aria-label="${t("Rechercher une tâche, un projet ou une action")}"><kbd>esc</kbd></div><div id="command-results"></div><div class="palette-footer"><span>↑ ↓ naviguer</span><span>${t("↵ ouvrir")}</span><span>CTRL KANB</span></div>`,"command-palette");renderCommandResults("");}
  function renderCommandResults(query){const q=normalizeSearch(query);const actions=commandActions().map(c=>({...c,group:"Actions"}));const projects=orderedSpaces().map(space=>({label:space.name,detail:space.rootPath,group:"Projets",icon:"folder",run:()=>navigateTo(space.id,"board")}));const tasks=board.cards.filter(c=>!c.archived).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||String(b.updatedAt).localeCompare(String(a.updatedAt))).map(c=>({label:c.title,detail:`${getSpace(c.spaceID)?.name||"Projet"} · ${statusLabel(c.status)} · ${cardReference(c)}`,group:"Tâches",icon:"check",run:()=>openCardModal(c)}));paletteItems=[...actions,...projects,...tasks].filter(c=>!q||normalizeSearch(`${c.label} ${c.detail}`).includes(q)).slice(0,q?16:12);paletteIndex=0;document.querySelector("#command-results").innerHTML=paletteItems.length?paletteItems.map((c,index)=>`${index===0||paletteItems[index-1].group!==c.group?`<div class="command-group">${c.group}</div>`:""}<button class="command-result ${index===0?"selected":""}" data-action="command-pick" data-index="${index}"><span class="command-icon">${icon(c.icon)}</span><span><strong>${esc(c.label)}</strong><small>${esc(c.detail)}</small></span>${c.key?`<kbd>${t(c.key)}</kbd>`:""}</button>`).join(""):'<div class="command-empty">Aucun résultat. Essaie un titre ou un nom de projet.</div>';}
  function runPaletteItem(index){const item=paletteItems[index];if(item){closeModal();item.run();}}
  function openQuickCapture(){if(!board.spaces.length)return openSpaceModal();const preferred=preferredWorkspaceID();modal(`<span class="eyebrow">${t("VIDE TON ESPRIT")}</span><h2>${t("Une idée, avant qu’elle s’envole.")}</h2><p class="lead">${t("Note-la maintenant. Tu pourras préciser le brief ensuite.")}</p><form id="quick-capture-form" class="form-grid"><div class="field"><label>${t("Ton idée")}</label><input name="title" required maxlength="240" autofocus placeholder="${t("Qu’as-tu en tête ?")}"></div><div class="two-cols"><div class="field"><label>${t("Projet")}</label><select name="spaceID">${board.spaces.map(s=>`<option value="${esc(s.id)}" ${s.id===preferred?"selected":""}>${esc(s.name)}</option>`).join("")}</select></div><div class="field"><label>${t("Agent")}</label><select name="agentEngine"><option value="codex">Codex</option><option value="claude-code">Claude Code</option></select></div></div><div class="modal-actions"><span class="grow">${t("⌘ ↵ pour capturer")}</span><button type="button" class="secondary" data-action="close-modal">${t("Fermer")}</button><button class="primary">${t("Garder l’idée")}</button></div></form>`,"quick-capture");}
  function openShortcuts(){modal(`<span class="eyebrow">${t("MOINS DE CLICS, PLUS D’ÉLAN")}</span><h2>${t("À portée de clavier.")}</h2><div class="shortcut-list">${[["⌘ K",t("Rechercher et ouvrir une action")],["N / ⌘ N",t("Créer une tâche")],["⇧ N",t("Capturer une idée")],[t("⌥⌘ C"),t("Ouvrir le chat du projet")],[t("⌥⌘ T"),t("Ouvrir le terminal du projet")],[t("⌥⌘ F"),t("Parcourir les fichiers du projet")],["⌘ ↵",t("Envoyer ou enregistrer")],["1 / 2 / 3",`${t("Flux")} / ${t("Tableau")} / ${t("Agenda")}`],["4 / 5",`${t("Validations")} / ${t("Suivi")}`],["Esc",t("Fermer le panneau · conserver le brouillon")],["?",t("Afficher les raccourcis")]].map(([key,label])=>`<div><span>${label}</span><kbd>${t(key)}</kbd></div>`).join("")}</div><p class="lead">${t("Les raccourcis sans ⌘ restent inactifs pendant la saisie.")}</p><div class="modal-actions"><button class="secondary" data-action="command-palette">${t("Ouvrir la palette de commandes")}</button><button class="primary" data-action="close-modal">${t("C’est noté")}</button></div>`);}
  function duplicateCard(card){if(!card)return;openCardModal(null,{...card,id:undefined,priorityNumber:undefined,title:`${card.title} — copie`,status:"backlog",launchMode:"manual",scheduledAt:"",dueDate:""});toast("Copie préparée. Enregistre-la pour la créer.");}
  function openClaudeSessionLink(cardID){modal(`<h2>${t("Associer une session Claude")}</h2><p class="lead">${t("Colle l’identifiant de la session à reprendre dans ce projet.")}</p><form id="claude-link-form" data-id="${esc(cardID)}" class="form-grid"><div class="field"><label>${t("Identifiant de session")}</label><input name="sessionID" required autofocus placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" pattern="[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">${t("Annuler")}</button><button class="primary">Associer</button></div></form>`);}
  const shellQuote=value=>`'${String(value||"").replace(/'/g,"'\\''")}'`;
  function openClaudeConversation(card,conv){
    detailCardID=card.id;detailThreadID=conv.id;
    const restoreViewport=conversationViewport(card.id,conv.id);
    const messages=conv.messages||[],busy=cardIsBusy(card)||card.executionState==="pausing",space=getSpace(card.spaceID),workspace=conv.projectName||space?.name||"Projet";
    modal(`<div class="conversation-drawer"><aside><h3>${t("Conversations")}</h3>${card.conversations.map(c=>`<button class="drawer-conversation ${c.id===conv.id?"active":""}" data-action="switch-conversation" data-card-id="${esc(card.id)}" data-thread="${esc(c.id)}"><strong>${esc(c.name||"Session Claude")}</strong><small>${esc(c.role||"main")}</small></button>`).join("")}<button class="secondary full" data-action="pick-conversation" data-id="${esc(card.id)}">＋ Associer</button></aside><section><div class="drawer-head"><div><span class="eyebrow">CLAUDE CODE</span><h2>${esc(conv.name||card.title)}</h2><p>${t("Workspace Claude")} : ${esc(workspace)} · ${esc(conv.cwd||space?.rootPath||"")} · Session ${esc(conv.id)}</p></div>${card.activeConversationID!==conv.id?`<button class="secondary" data-action="set-main-conversation" data-card-id="${esc(card.id)}" data-thread="${esc(conv.id)}">${t("Définir principale")}</button>`:""}<button class="secondary pause-control conversation-stop" data-action="suspend-run" data-id="${esc(card.id)}" hidden>${t("Arrêter")}</button><button class="secondary" data-action="claude-command" data-id="${esc(card.id)}" data-thread="${esc(conv.id)}">${t("Copier la commande de reprise")}</button><button class="secondary" data-action="open-claude-conversation" data-thread="${esc(conv.id)}">${t("Ouvrir dans Claude ↗")}</button><button class="icon-button" data-action="remove-conversation" data-card-id="${esc(card.id)}" data-thread="${esc(conv.id)}" title="${t("Dissocier")}">⌫</button><button class="icon-button" data-action="close-modal" aria-label="${t("Fermer")}">×</button></div><div class="claude-transcript">${messages.length?messages.map(m=>`<div class="message ${m.role==='user'?'userMessage':'agentMessage'}"><strong>${m.role==='user'?'Toi':'Claude Code'}</strong><p>${esc(m.text)}</p></div>`).join(""):`<p class="lead">${esc(conv.preview||"Le prochain lancement reprendra cette session Claude. Les échanges lancés ici seront conservés dans la carte.")}</p>`}</div>${conversationComposer(card,conv)}</section></div>`,"claude-conversation");
    restoreViewport();
  }
  function probeDate(value){
    const date=new Date(value||"");
    return Number.isNaN(date.getTime())?t("date inconnue"):date.toLocaleString(locale(),{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
  }
  function probeLine(accountID,engine){
    const state=connectionState(engine,accountID);
    return `<div class="account-health ${state.state}"><i></i><span><strong>${esc(state.label)}</strong><small>${esc(state.detail)}</small></span></div>`;
  }
  function accountsSectionMarkup(){
    return `<section id="settings-accounts" class="preference-section accounts-settings-section"><div class="preference-heading"><h2>${t("Comptes utilisés")}</h2><p>${t("Choisis séparément le compte employé par Codex et par Claude Code.")}</p></div><div class="account-memory-note">${icon("shield")}<div><strong>${t("Ce que CTRL KANB mémorise")}</strong><p>${t("Le compte actif, son dossier de configuration et le résultat du dernier test. Les identifiants restent gérés par Codex ou Claude Code dans leurs propres dossiers.")}</p></div></div>${builtinEngines.map(([engine,label])=>{
      const list=allAccountsFor(engine), active=activeAccountID(engine), chosen=list.find(a=>a.id===active);
      const available=engineIsAvailable(engine),currentState=connectionState(engine,active),running=accountCheck(active)?.state==="running";
      return `<div class="account-group"><div class="account-group-head"><div class="account-engine-title">${engineLogo(engine)}<span><strong>${esc(label)}</strong><small>${t("Compte actif : {compte}",{compte:esc(chosen?.label||"—")})}</small></span></div><span class="account-group-state ${currentState.state}"><i></i>${esc(currentState.label)}</span></div><div class="account-list">${list.map(account=>{
        const selected=account.id===active,testRunning=accountCheck(account.id)?.state==="running";
        return `<article class="account-row ${selected?"active":""}"><div class="account-copy"><div class="account-name"><strong>${esc(account.label)}</strong>${selected?`<em class="account-badge">${t("actif")}</em>`:""}</div><small>${account.builtin?t("Dossier habituel · {folder}",{folder:esc(accountFolder(account))}):t("Dossier séparé · {folder}",{folder:esc(accountFolder(account))})}</small></div><div class="account-row-actions">${selected?"":`<button type="button" class="ui-button secondary account-use-button" data-action="pick-account" data-engine="${esc(engine)}" data-id="${esc(account.id)}">${t("Utiliser ce compte")}</button>`}<button type="button" class="ui-button secondary" data-action="probe-agent" data-engine="${esc(engine)}" data-account="${esc(account.id)}" ${available&&!testRunning?"":"disabled"}>${testRunning?t("Test en cours…"):t("Tester")}</button><button type="button" class="ui-button ghost" data-action="login-agent" data-engine="${esc(engine)}" data-account="${esc(account.id)}" ${available?"":"disabled"}>${t("Connecter…")}</button>${account.builtin?"":`<button type="button" class="icon-button" data-action="remove-account" data-id="${esc(account.id)}" aria-label="${t("Retirer ce compte")}" title="${t("Retirer ce compte")}">${icon("trash")}</button>`}</div>${probeLine(account.id,engine)}</article>`;
      }).join("")}</div><div class="account-group-footer"><p>${t("Les nouvelles tâches, le chat et les reprises {agent} utilisent « {compte} ».",{agent:esc(label),compte:esc(chosen?.label||"—")})}</p><button type="button" class="ui-button ghost" data-action="add-account" data-engine="${esc(engine)}">${icon("plus")}<span>${t("Ajouter un autre compte")}</span></button></div></div>`;
    }).join("")}<div class="settings-callout account-steps"><strong>${t("Pour changer de compte")}</strong><span>${t("1. Ajoute un compte. 2. Connecte-le dans Terminal. 3. Teste la connexion. 4. Clique sur « Utiliser ce compte ».")}</span><small>${t("Retirer un compte enlève seulement son raccourci dans CTRL KANB ; aucun dossier ni identifiant n’est effacé.")}</small></div></section>`;
  }

  // Un compte se resume a un nom et a un dossier. Le dossier est propose sous
  // CTRL KANB pour rester range, mais reste modifiable.
  function openAccountModal(engine){
    const key=engineKey(engine), label=engineEntry(key)[1];
    modal(`<span class="eyebrow">${t("COMPTE SÉPARÉ")}</span><h2>${t("Ajouter un compte {agent}", {agent: esc(label)})}</h2><p class="lead">${t("CTRL KANB va créer un dossier de connexion indépendant. Le nouveau compte sera sélectionné, puis il restera à le connecter et à le tester.")}</p><ol class="account-modal-steps"><li><strong>${t("Ajouter")}</strong><span>${t("Crée le raccourci et son dossier séparé.")}</span></li><li><strong>${t("Connecter")}</strong><span>${t("Ouvre la commande officielle dans Terminal.")}</span></li><li><strong>${t("Tester")}</strong><span>${t("Confirme que ce compte répond réellement.")}</span></li></ol><form id="account-form" data-engine="${esc(key)}"><div class="field"><label>${t("Nom du compte")}</label><input name="label" required placeholder="${t("Compte personnel, Compte client…")}" autofocus></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">${t("Annuler")}</button><button class="primary">${t("Créer le compte")}</button></div></form>`);
  }

  function securitySettingsMarkup(){
    const gesture=securityState.biometry||(windowsApp?"Windows Hello ou le code de session":"le mot de passe de la session");
    const intro=t(windowsApp?"Protège l’accès à la fenêtre CTRL KANB sur ce PC.":"Protège l’accès à CTRL KANB sur ce Mac.");
    const help=t(windowsApp?"Demande {geste} avant d’afficher la fenêtre. Les tâches programmées peuvent continuer pendant qu’elle est masquée.":"Demande {geste} avant d’afficher le plan de travail. Tant que l’écran de verrouillage est là, aucune donnée du Kanban n’est chargée.",{geste:esc(gesture)});
    const settingStorage=t(windowsApp?"L’accès à la fenêtre depuis une session Windows déjà ouverte. Le réglage est conservé dans les données locales de l’application.":"L’accès à la fenêtre depuis une session déjà ouverte. Le réglage vit dans le trousseau : il ne se désactive pas en modifiant un fichier.");
    const fileProtection=t(windowsApp?"reste en clair et est accessible aux programmes lancés avec ton compte Windows.":"est en lecture pour ton seul compte (0600) mais reste en clair : un programme lancé sous ton identité peut le lire.");
    return `<section id="settings-security" class="preference-section"><div class="preference-heading"><h2>${t("Sécurité")}</h2><p>${intro}</p></div><label class="preference-toggle"><span><strong>${t("Verrouiller CTRL KANB à l’ouverture")}</strong><small>${help}</small></span><input type="checkbox" data-action="toggle-app-lock" ${securityState.lockEnabled?"checked":""} ${securityState.checked?"":"disabled"}></label><div class="security-facts"><div><strong>${t("Ce que le verrou protège")}</strong><span>${settingStorage}</span></div><div><strong>${t("Ce qu’il ne protège pas")}</strong><span>${t("Le fichier lui-même.")} <code>board.json</code> ${fileProtection}</span></div><div><strong>${t("Tâches programmées")}</strong><span>${t("Elles continuent en arrière-plan, fenêtre fermée. Le verrou s’applique quand tu rouvres la fenêtre.")}</span></div></div>${securityState.lockEnabled?`<button type="button" class="secondary" data-action="lock-now">${t("Verrouiller maintenant")} <kbd>${t("⌘ L")}</kbd></button>`:""}</section>`;
  }
  function engineSettingsMarkup(){
    const engines=[
      ["codex","Codex",engineAvailability.codex,t("Conversations, validations et reprises")],
      ["claude-code","Claude Code",engineAvailability.claude,t("Sessions locales, permissions et reprises")],
    ];
    return engines.map(([id,label,ready,detail])=>{
      const models=engineEntry(id)[2],modelSetting=id==="codex"?"defaultModelCodex":"defaultModelClaude",effortSetting=id==="codex"?"defaultEffortCodex":"defaultEffortClaude",concurrencySetting=id==="codex"?"maxConcurrencyCodex":"maxConcurrencyClaude";
      const compte=activeAccountID(id), connection=connectionState(id,compte);
      const concurrencyLabel=id==="codex"?t("Conversations différentes en parallèle"):t("Sessions différentes en parallèle");
      const concurrencyHelp=id==="codex"?t("Une même conversation reste séquentielle ; ses instructions attendent dans la file."):t("Une même session reste séquentielle. Plusieurs sessions dans un même dossier peuvent modifier les mêmes fichiers.");
      const concurrencyOptions=[1,2,3,4].map(value=>`<option value="${value}" ${value===concurrencyFor(id)?"selected":""}>${id==="codex"?tn(value,"{n} conversation","{n} conversations"):tn(value,"{n} session","{n} sessions")}</option>`).join("");
      return `<article id="settings-${id==="codex"?"codex":"claude"}" class="engine-settings-section engine-settings-card"><div class="preference-heading engine-preference-heading"><div class="agent-mark">${engineLogo(id)}</div><div><h3>${label}</h3><p>${detail}</p></div><span class="agent-status ${ready?'available':'missing'}">${!engineAvailability.checked?t("Vérification…"):ready?t("Disponible sur ce Mac"):t("Non installé")}</span></div><div class="preference-grid"><div class="field"><label>${t("Modèle par défaut")}</label><small>${t("Utilisé par les nouvelles tâches {agent}.",{agent:label})}</small><select name="${modelSetting}">${models.map(([value,name])=>`<option value="${esc(value)}" ${value===defaultModelFor(id)?"selected":""}>${esc(name)}</option>`).join("")}</select></div><div class="field"><label>${t("Effort de réflexion")}</label><small>${t("Intensité de raisonnement transmise à {agent}.",{agent:label})}</small><select name="${effortSetting}">${effortOptions(defaultEffortFor(id))}</select></div><div class="field"><label>${concurrencyLabel}</label><small>${concurrencyHelp}</small><select name="${concurrencySetting}">${concurrencyOptions}</select></div></div><div class="engine-account-summary"><div><span>${t("Compte utilisé")}</span><strong>${esc(activeAccount(id)?.label||"—")}</strong><small class="${connection.state}">${esc(connection.label)}${connection.state==="ready"?` · ${esc(probeDate(accountCheck(compte)?.at))}`:""}</small></div><button type="button" class="ui-button secondary" data-action="scroll-setting" data-target="settings-accounts">${t("Gérer les comptes")}</button></div></article>`;
    }).join("");
  }

  function agentsSettingsMarkup(){
    return `<section id="settings-agents" class="preference-section agents-settings-section"><div class="agents-settings-heading"><div class="preference-heading"><h2>${t("Agents et modèles")}</h2><p>${t("Choisis l’agent proposé lors de la création, puis règle Codex et Claude Code séparément.")}</p></div><button type="button" class="ui-button ghost" data-action="check-agents">${icon("sync")}<span>${t("Actualiser la détection")}</span></button></div><div class="preference-grid agent-default-grid"><div class="field"><label>${t("Agent proposé à la création")}</label><small>${t("Préremplit les nouvelles tâches. Chaque tâche peut en choisir un autre.")}</small><select name="defaultAgentEngine">${engineCatalog().map(([id,label])=>`<option value="${esc(id)}" ${id===defaultEngine()?"selected":""}>${esc(label)}</option>`).join("")}</select></div></div><div class="engine-settings-list">${engineSettingsMarkup()}</div></section>`;
  }

  function renderTaskList(cards){const sorted=[...cards].sort(compareCards);return `<div class="list-table"><div class="task-list-header"><span>${t("Tâche")}</span><span>${t("Étape")}</span><span>${t("Agent")}</span><span>${t("Échéance")}</span><span></span></div>${sorted.length?sorted.map(c=>`<div class="task-list-row"><button class="task-list-title" data-action="edit-card" data-id="${esc(c.id)}"><span class="priority-ref" style="--priority-color:#${safeHex(priorityByID(c.priorityLevelID).color,"9CA3AF")}">${esc(cardReference(c))}</span><span><strong>${esc(c.title)}</strong><small>${esc(getSpace(c.spaceID)?.name)}</small></span></button><span class="list-stage">${esc(columnForCard(c).name)}</span><span class="list-agent ${isClaude(c)?'claude':''}">${engineLabel(c.agentEngine)}</span><span class="list-date ${c.dueDate&&c.dueDate<today()&&c.status!=='done'?'overdue':''}">${c.dueDate?esc(new Date(`${c.dueDate}T12:00:00`).toLocaleDateString(locale(),{day:'numeric',month:'short'})):'—'}</span><button class="icon-button" data-action="pin-card" data-id="${esc(c.id)}" aria-label="${c.pinned?'Désépingler':'Épingler'} la tâche" aria-pressed="${Boolean(c.pinned)}">${icon('pin')}</button></div>`).join(""):`<div class="list-empty">${icon('check')}<h3>${t("Place aux prochaines idées.")}</h3><p>${t("Crée une tâche pour commencer ce tableau.")}</p><button class="primary" data-action="add-card">${t("Nouvelle tâche")}</button></div>`}</div>`;}
  function compareCards(a,b){const pin=Number(Boolean(b.pinned))-Number(Boolean(a.pinned));if(pin)return pin;if(board.settings.taskSort==='due')return String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'));if(board.settings.taskSort==='recent')return String(b.updatedAt).localeCompare(String(a.updatedAt));return priorityOrder(a)-priorityOrder(b)||Number(a.priorityNumber||9999)-Number(b.priorityNumber||9999);}
  function toolbarMarkup(){return `<div class="view-toolbar"><div class="view-toolbar-label">${icon('columns')}<span>${activePreset().name}</span><span class="toolbar-separator">/</span><small>${cardsForPreset(baseVisibleCards(),activePreset().id).length} tâches</small></div><div class="view-toolbar-actions"><label>${t("Trier")} <select id="task-sort" aria-label="${t("Trier les tâches")}">${[['priority','Priorité'],['due','Échéance'],['recent','Récemment modifiées']].map(([v,l])=>`<option value="${v}" ${board.settings.taskSort===v?'selected':''}>${esc(t(l))}</option>`).join('')}</select></label><div class="segmented"><button data-action="task-layout" data-layout="board" class="${board.settings.taskLayout!=='list'?'active':''}" title="${t("Vue tableau")}" aria-label="${t("Vue tableau")}">${icon('board')}</button><button data-action="task-layout" data-layout="list" class="${board.settings.taskLayout==='list'?'active':''}" title="${t("Vue liste")}" aria-label="${t("Vue liste")}">${icon('menu')}</button></div><button class="ui-button secondary" data-action="quick-capture">${icon('plus')}<span>${t("Idée rapide")}</span><kbd>${t("⇧ N")}</kbd></button></div></div>`;}
  function utilityPanelButton(location="header"){
    const open=Boolean(board.settings.utilityPanelOpen),label=open?t("Masquer le panneau droit"):t("Afficher le panneau droit"),className=location==="panel"?"icon-button utility-toggle utility-toggle-panel active":"ui-button icon-only utility-toggle";
    return `<button class="${className}" data-action="toggle-utility" aria-pressed="${open}" title="${label}" aria-label="${label}">${icon("panelRight")}</button>`;
  }
  function enhanceWorkspace(){
    const root=document.querySelector('#workspace-header');if(!specialViews[selection]&&surfaceMode==='board'&&!root.querySelector(".view-toolbar"))root.insertAdjacentHTML?.('beforeend',toolbarMarkup());
    if(board.settings.utilityPanelOpen)return enhanceSidebarEngines();
    const toolsButton=utilityPanelButton();
    const actions=document.querySelector("#workspace-header .header-primary-actions"),top=document.querySelector("#workspace-header .header-topline");
    if(actions&&!actions.querySelector?.("[data-action='toggle-utility']"))actions.insertAdjacentHTML?.("beforeend",toolsButton);
    else if(top&&!top.querySelector?.("[data-action='toggle-utility']"))top.insertAdjacentHTML?.("beforeend",`<div class="header-primary-actions">${toolsButton}</div>`);
    enhanceSidebarEngines();
  }
  function enhanceSidebarEngines(){
    const engineNode=document.querySelector('#sidebar-engines');
    if(engineNode)engineNode.innerHTML=[["codex","Codex"],["claude-code","Claude Code"]].map(([engine,label])=>{
      const account=activeAccount(engine),state=connectionState(engine,account?.id);
      return `<button type="button" class="sidebar-engine ${state.state}" data-action="open-account-settings" title="${esc(`${label} · ${account?.label||"—"} · ${state.label}. ${state.detail}`)}"><i></i><span>${label}</span><small>${esc(state.label)}</small></button>`;
    }).join("");
  }

  // Le panneau peut viser un projet du Kanban ou un dossier choisi directement
  // sur le Mac. Chaque moteur conserve sa propre conversation pour cet espace.
  // Le chat direct reutilise le runner, les files et les validations des cartes.
  function utilitySpace(){
    const requested=getSpace(board.settings.utilitySpaceID),current=getSpace(selection),space=requested||current||orderedSpaces()[0]||null;
    if(space&&board.settings.utilitySpaceID!==space.id)board.settings.utilitySpaceID=space.id;
    return space;
  }
  function utilityChat(spaceID=utilitySpace()?.id,engine=board.settings.utilityAgent,create=false){
    const normalized=normalizeEngine(engine),existing=(board.utilityChats||[]).find(item=>item.spaceID===spaceID&&engineKey(item.agentEngine)===normalized);
    if(existing||!create||!spaceID)return existing||null;
    const space=getSpace(spaceID),chat={id:`utility-chat-${spaceID}-${normalized}`,utilityChat:true,spaceID,agentEngine:normalized,title:`Chat ${engineLabel(normalized)} · ${space?.name||t("Projet")}`,prompt:"",status:"ready",runMode:"workspaceWrite",model:defaultModelFor(normalized),reasoningEffort:defaultEffortFor(normalized),conversations:[],messages:[],createdAt:now(),updatedAt:now()};
    board.utilityChats.push(chat);return chat;
  }
  const currentUtilityConversation=chat=>!chat||chat.utilityNewConversation?null:activeConversation(chat);
  function storeUtilityTranscript(chat){const conversation=currentUtilityConversation(chat);if(conversation)conversation.messages=structuredClone(chat.messages||[])}
  function startNewUtilityConversation(){
    const space=utilitySpace(),engine=normalizeEngine(board.settings.utilityAgent),chat=space&&utilityChat(space.id,engine,true);if(!chat)return;
    if(cardIsBusy(chat))return toast(t("Une réponse est déjà en cours."),true);
    storeUtilityTranscript(chat);chat.messages=[];chat.utilityNewConversation=true;chat.status="ready";chat.prompt="";chat.title=t("Nouvelle conversation");
    delete chat.activeConversationID;delete chat.conversationID;delete chat.conversationName;delete chat.conversationPreview;delete chat.conversationCwd;utilityDraft="";utilityAttachments=[];chat.updatedAt=now();save();renderUtilityPanel();toast(t("Nouvelle conversation prête."));
  }
  function switchUtilityConversation(threadID){
    const space=utilitySpace(),engine=normalizeEngine(board.settings.utilityAgent),chat=space&&utilityChat(space.id,engine),chosen=chat?.conversations?.find(conversation=>conversation.id===threadID&&engineKey(conversation.engine||engine)===engine);if(!chat||!chosen)return;
    if(cardIsBusy(chat))return toast(t("Attends la fin de la réponse avant de changer de conversation."),true),renderUtilityPanel();
    storeUtilityTranscript(chat);for(const conversation of chat.conversations)if(conversation.role==="main")conversation.role="attempt";chosen.role="main";chat.utilityNewConversation=false;chat.activeConversationID=chosen.id;chat.messages=structuredClone(chosen.messages||[]);syncLegacyConversationFields(chat);utilityDraft="";utilityAttachments=[];chat.updatedAt=now();save();renderUtilityPanel();
  }
  function confirmRemoveUtilityConversation(){
    const space=utilitySpace(),engine=normalizeEngine(board.settings.utilityAgent),chat=space&&utilityChat(space.id,engine),conversation=currentUtilityConversation(chat);if(!chat||!conversation)return;
    modal(`<h2>${t("Supprimer cette conversation du chat ?")}</h2><p class="lead">${t("« {nom} » sera retirée de CTRL KANB. Elle restera disponible dans {agent}.",{nom:esc(conversation.name||t("Conversation")),agent:engineLabel(engine)})}</p><div class="modal-actions"><button class="secondary" data-action="close-modal">${t("Annuler")}</button><button class="danger" data-action="remove-utility-conversation" data-thread="${esc(conversation.id)}">${t("Supprimer de CTRL KANB")}</button></div>`);
  }
  function removeUtilityConversation(threadID){
    const space=utilitySpace(),engine=normalizeEngine(board.settings.utilityAgent),chat=space&&utilityChat(space.id,engine),removed=chat?.conversations?.find(conversation=>conversation.id===threadID);if(!chat||!removed)return;
    chat.conversations=chat.conversations.filter(conversation=>conversation.id!==threadID);const next=[...chat.conversations].reverse().find(conversation=>engineKey(conversation.engine||engine)===engine);
    if(next){for(const conversation of chat.conversations)if(conversation.role==="main")conversation.role="attempt";next.role="main";chat.utilityNewConversation=false;chat.activeConversationID=next.id;chat.messages=structuredClone(next.messages||[]);syncLegacyConversationFields(chat);}
    else{chat.messages=[];chat.utilityNewConversation=true;chat.title=t("Nouvelle conversation");delete chat.activeConversationID;delete chat.conversationID;delete chat.conversationName;delete chat.conversationPreview;delete chat.conversationCwd;}
    utilityDraft="";utilityAttachments=[];chat.updatedAt=now();save();closeModal();render();toast(t("Conversation supprimée de CTRL KANB."));
  }
  function utilityConversationLabel(conversation){
    const timestamp=new Date(conversation.addedAt||conversation.linkedAt||conversation.updatedAt||0),valid=Number.isFinite(timestamp.getTime()),sameDay=valid&&timestamp.toLocaleDateString(locale())===new Date().toLocaleDateString(locale());
    const when=!valid?"":timestamp.toLocaleString(locale(),sameDay?{hour:"2-digit",minute:"2-digit"}:{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
    return `${when?`${when} · `:""}${conversation.name||t("Conversation")}`;
  }
  function utilityTerminal(spaceID){
    if(!utilityTerminals.has(spaceID))utilityTerminals.set(spaceID,{id:`terminal-${spaceID}`,running:false,starting:false,output:"",path:getSpace(spaceID)?.rootPath||"",history:[],historyIndex:0,pendingEcho:false,echoBuffer:""});
    return utilityTerminals.get(spaceID);
  }
  function startUtilityTerminal(space,{clear=false}={}){
    if(!space)return;const terminal=utilityTerminal(space.id);if(terminal.running||terminal.starting)return;
    terminal.starting=true;if(clear)terminal.output="";renderUtilityPanel();
    bridge({action:"startTerminal",terminalID:terminal.id,spaceID:space.id,rootPath:space.rootPath});
  }
  function utilityFiles(spaceID){
    if(!utilityFileStates.has(spaceID))utilityFileStates.set(spaceID,{path:"",entries:[],loading:false,error:"",loaded:false});
    return utilityFileStates.get(spaceID);
  }
  function openUtilityPanel(tab=board.settings.utilityTab){
    board.settings.utilityPanelOpen=true;board.settings.utilityTab=["chat","terminal","files"].includes(tab)?tab:"chat";
    if(board.settings.utilityTab!=="files")utilityFileMenu=null;
    const space=utilitySpace();if(space)board.settings.utilitySpaceID=space.id;
    save();render();
    if(board.settings.utilityTab==="files"&&space&&!utilityFiles(space.id).loaded)loadUtilityFiles(space.id,"");
    if(board.settings.utilityTab==="terminal"&&space)startUtilityTerminal(space);
  }
  function closeUtilityPanel(){utilityFileMenu=null;board.settings.utilityPanelOpen=false;save();render();}
  function loadUtilityFiles(spaceID,path=""){
    const space=getSpace(spaceID);if(!space)return;
    utilityFileMenu=null;
    const state=utilityFiles(spaceID);state.path=path;state.loading=true;state.error="";renderUtilityPanel();
    bridge({action:"listProjectFiles",spaceID,rootPath:space.rootPath,relativePath:path});
  }
  const terminalText=value=>{
    const text=String(value||"").replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g,"").replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g,"");
    const lines=[""];let cursor=0;
    for(const char of text){
      if(char==="\n"){lines.push("");cursor=0;continue}
      if(char==="\r"){cursor=0;continue}
      if(char==="\b"){cursor=Math.max(0,cursor-1);continue}
      if(char!=="\t"&&char.charCodeAt(0)<32)continue;
      const line=lines.at(-1),width=char==="\t"?4-(cursor%4):1,insert=char==="\t"?" ".repeat(width):char,padded=line.padEnd(cursor," ");
      lines[lines.length-1]=padded.slice(0,cursor)+insert+padded.slice(cursor+insert.length);cursor+=insert.length;
    }
    return lines.map(line=>line.trimEnd()).join("\n");
  };
  const utilityAttachmentMarkup=(attachment,index,removable=false)=>`<span class="utility-attachment-chip" title="${esc(attachment.path)}">${icon("file")}<span>${esc(attachment.name)}</span>${removable?`<button type="button" data-action="remove-utility-attachment" data-index="${index}" aria-label="${t("Retirer {nom}",{nom:esc(attachment.name)})}" title="${t("Retirer")}">${icon("close")}</button>`:""}</span>`;
  function renderUtilityChat(space){
    const engine=normalizeEngine(board.settings.utilityAgent),chat=utilityChat(space.id,engine),busy=cardIsBusy(chat),messages=chat?.messages||[],conversation=currentUtilityConversation(chat),availability=engine==="claude-code"?engineAvailability.claude:engineAvailability.codex,selectedModel=chat?.model||defaultModelFor(engine),chatConversations=(chat?.conversations||[]).filter(item=>engineKey(item.engine||engine)===engine);
    const sessionList=chatConversations.length?`<div class="utility-session-list"><div class="utility-session-heading">${t("Conversations")}</div>${[...chatConversations].reverse().map(item=>`<button type="button" data-action="switch-utility-conversation" data-thread="${esc(item.id)}"><i></i><span><strong>${esc(utilityConversationLabel(item))}</strong><small>${esc(item.preview||engineLabel(engine))}</small></span>${icon("chevron")}</button>`).join("")}</div>`:`<div class="utility-chat-blank">${engineLogo(engine)}<h3>${t("Nouvelle conversation")}</h3><p>${t("Écris ta demande ci-dessous pour commencer.")}</p></div>`;
    const transcript=messages.length?messages.map(message=>{const files=(message.attachments||[]).map((attachment,index)=>utilityAttachmentMarkup(attachment,index)).join("");return `<article class="utility-message ${message.role==="user"?"user":"assistant"}"><span>${message.role==="user"?t("Vous"):engineLabel(engine)}</span><div class="utility-message-bubble">${message.text?`<p>${esc(message.text)}</p>`:""}${files?`<div class="utility-message-attachments">${files}</div>`:""}</div></article>`}).join(""):sessionList;
    const pending=busy?`<div class="utility-run-state"><span class="utility-pulse"></span><div><strong>${queuePositions.has(chat?.id)?queueLabel(chat):t("Réponse en cours")}</strong><small>${esc(chat?.lastRun?.summary||t("Le moteur prépare sa réponse…"))}</small></div><button class="ui-button secondary" data-action="stop-utility-chat" data-id="${esc(chat?.id||"")}">${t("Arrêter")}</button></div>`:"";
    const files=utilityAttachments.map((attachment,index)=>utilityAttachmentMarkup(attachment,index,true)).join(""),conversationOptions=chatConversations.map(item=>`<option value="${esc(item.id)}" ${item.id===conversation?.id?"selected":""}>${esc(utilityConversationLabel(item))}</option>`).join("");
    const conversationPicker=`<label class="utility-conversation-picker">${icon("chat")}<span><small>${t("Conversation")}</small><select id="utility-chat-conversation" aria-label="${t("Conversation du chat")}" ${!chatConversations.length||busy?"disabled":""}>${chat?.utilityNewConversation||!conversation?`<option value="" selected>${t("Nouvelle conversation")}</option>`:""}${conversationOptions}</select></span></label>`;
    return `<div class="utility-chat-toolbar"><div class="utility-engine-switch" aria-label="${t("Agent du chat")}"><button data-action="utility-agent" data-engine="codex" class="${engine==="codex"?"active":""}">${engineLogo("codex")}<span>Codex</span></button><button data-action="utility-agent" data-engine="claude-code" class="${engine==="claude-code"?"active":""}">${engineLogo("claude-code")}<span>Claude Code</span></button></div><div class="utility-chat-actions"><button type="button" class="icon-button" data-action="new-utility-conversation" aria-label="${t("Nouveau chat")}" title="${t("Nouveau chat")}" ${busy||(!conversation&&!messages.length)?"disabled":""}>${icon("plus")}</button><button type="button" class="icon-button utility-delete-conversation" data-action="confirm-remove-utility-conversation" aria-label="${t("Supprimer cette conversation")}" title="${t("Supprimer cette conversation")}" ${!conversation||busy?"disabled":""}>${icon("trash")}</button></div></div>${conversationPicker}${!availability&&engineAvailability.checked?`<div class="utility-notice error">${t("Ce moteur est introuvable sur ce Mac. Vérifie sa connexion dans Réglages.")}</div>`:""}<div id="utility-chat-transcript" class="utility-chat-transcript">${transcript}${pending}</div><form id="utility-chat-form" data-space="${esc(space.id)}" data-engine="${esc(engine)}"><textarea id="utility-chat-message" name="message" rows="3" maxlength="16000" placeholder="${t("Écris une instruction pour ce dossier…")}" ${busy?"disabled":""}>${esc(utilityDraft)}</textarea>${files?`<div class="utility-attachment-list" aria-label="${t("Fichiers joints")}">${files}</div>`:""}<div class="utility-compose-footer"><div class="utility-compose-tools"><button type="button" class="utility-attach-button" data-action="choose-utility-attachments" aria-label="${t("Joindre des fichiers")}" title="${t("Joindre des fichiers")}" ${busy?"disabled":""}>${icon("plus")}</button><label class="utility-model-picker"><span>${t("Modèle")}</span><select id="utility-chat-model" aria-label="${t("Modèle du chat")}" ${busy?"disabled":""}>${engineModelOptions(engine,selectedModel)}</select></label></div><button type="submit" class="utility-send-button" aria-label="${t("Envoyer")}" title="${t("Envoyer · ⌘ ↵")}" ${busy||(!availability&&engineAvailability.checked)?"disabled":""}>${icon("up")}</button></div></form>`;
  }
  function renderUtilityTerminal(space){
    const terminal=utilityTerminal(space.id),status=terminal.starting?t("Démarrage…"):terminal.running?t("Session active"):t("Session fermée"),output=terminal.output||(terminal.starting?t("Ouverture de zsh…"):t("Le terminal est prêt à démarrer dans ce dossier."));
    return `<div class="utility-terminal-head"><div class="utility-terminal-title"><span><strong>${esc(space.name)}</strong><small>${esc(space.rootPath)}</small></span><em class="utility-terminal-status ${terminal.running?"active":terminal.starting?"starting":""}"><i></i>${status}</em></div><div class="utility-terminal-actions"><button class="icon-button" data-action="open-system-terminal" title="${t("Ouvrir dans Terminal macOS")}" aria-label="${t("Ouvrir dans Terminal macOS")}">${icon("terminal")}</button>${terminal.running?`<button class="ui-button secondary" data-action="interrupt-terminal" title="${t("Interrompre la commande en cours")}">${t("⌃C")}</button><button class="ui-button secondary" data-action="clear-terminal">${t("Effacer")}</button><button class="icon-button danger-text" data-action="stop-terminal" title="${t("Fermer la session")}" aria-label="${t("Fermer la session")}">${icon("close")}</button>`:terminal.starting?"":`<button class="ui-button primary" data-action="start-terminal">${t("Relancer")}</button>`}</div></div><div class="utility-notice">${t("Ce terminal démarre dans ce dossier et reste un shell complet avec vos droits macOS.")}</div><pre id="utility-terminal-output" class="utility-terminal-output" aria-live="polite">${esc(output)}</pre><form id="utility-terminal-form" data-space="${esc(space.id)}"><span class="terminal-prompt">›</span><input id="utility-terminal-command" name="command" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${t("Commande du terminal")}" placeholder="${terminal.running?t("Saisir une commande…"):terminal.starting?t("Démarrage du terminal…"):t("Relance le terminal pour saisir une commande.")}" ${terminal.running?"":"disabled"}><button class="ui-button primary" ${terminal.running?"":"disabled"}>${t("Exécuter")}</button></form>`;
  }
  function renderUtilityFiles(space){
    const state=utilityFiles(space.id),parent=state.path.includes("/")?state.path.slice(0,state.path.lastIndexOf("/")):"",where=state.path||space.name;
    const content=state.loading?`<div class="utility-loading"><span class="utility-pulse"></span>${t("Lecture du dossier…")}</div>`:state.error?`<div class="utility-empty">${icon("alert")}<h3>${t("Dossier inaccessible")}</h3><p>${esc(state.error)}</p></div>`:state.entries.length?state.entries.map(entry=>`<div class="utility-file-row ${utilityFileMenu?.spaceID===space.id&&utilityFileMenu.path===entry.relativePath?"menu-open":""}" data-utility-file="true" data-path="${esc(entry.relativePath)}" data-name="${esc(entry.name)}" data-directory="${entry.directory?"true":"false"}"><button data-action="${entry.directory?"browse-project-folder":"open-project-file"}" data-path="${esc(entry.relativePath)}" title="${esc(entry.name)}"><span class="utility-file-icon ${entry.directory?"folder":"file"}">${icon(entry.directory?"folder":"file")}</span><span><strong>${esc(entry.name)}</strong><small>${entry.directory?t("Dossier"):esc(entry.sizeLabel||"")}</small></span></button><button class="icon-button" data-action="reveal-project-file" data-path="${esc(entry.relativePath)}" title="${t("Afficher dans Finder")}" aria-label="${t("Afficher dans Finder")}">${icon("finder")}</button></div>`).join(""):`<div class="utility-empty compact">${icon("folder")}<h3>${t("Dossier vide")}</h3></div>`;
    const menu=utilityFileMenu?.spaceID===space.id?`<div class="utility-file-context-menu" role="menu" aria-label="${t("Actions du fichier")}" style="left:${utilityFileMenu.x}px;top:${utilityFileMenu.y}px"><button type="button" role="menuitem" data-action="reveal-project-file" data-path="${esc(utilityFileMenu.path)}">${icon("finder")}<span>${t("Ouvrir dans le Finder")}</span></button>${utilityFileMenu.directory?"":`<button type="button" role="menuitem" data-action="open-project-file-with" data-path="${esc(utilityFileMenu.path)}">${icon("openWith")}<span>${t("Ouvrir avec…")}</span></button><button type="button" role="menuitem" data-action="save-project-file-as" data-path="${esc(utilityFileMenu.path)}">${icon("save")}<span>${t("Enregistrer sous…")}</span></button>`}<button type="button" role="menuitem" data-action="copy-project-file-path" data-path="${esc(utilityFileMenu.path)}">${icon("copy")}<span>${t("Copier le chemin d’accès")}</span></button>${utilityFileMenu.directory?"":`<button type="button" role="menuitem" class="utility-context-chat" data-action="add-project-file-to-chat" data-path="${esc(utilityFileMenu.path)}">${icon("paperclip")}<span>${t("Ajouter au chat")}</span></button>`}</div>`:"";
    return `<div class="utility-files-head"><div class="utility-breadcrumb"><button class="icon-button" data-action="browse-project-folder" data-path="${esc(parent)}" ${!state.path?"disabled":""} aria-label="${t("Dossier parent")}">${icon("previous")}</button><span title="${esc(state.path)}">${esc(where)}</span></div><button class="ui-button secondary" data-action="reveal-project-root">${icon("finder")}<span>${t("Finder")}</span></button></div><div class="utility-file-list">${content}</div>${menu}`;
  }
  function renderUtilityPanel(){
    const panel=document.querySelector("#utility-panel"),app=document.querySelector("#app");if(!panel||!app)return;
    const textarea=panel.querySelector?.("#utility-chat-message");if(textarea)utilityDraft=textarea.value;
    const open=Boolean(board.settings.utilityPanelOpen);panel.hidden=!open;app.classList.toggle("utility-panel-open",open);if(!open)return;
    const space=utilitySpace(),tab=board.settings.utilityTab;
    const custom=getSpace("utility-custom"),locations=[...orderedSpaces(),...(custom?[custom]:[])];
    const picker=space?`<label class="utility-project-picker"><span>${icon("folder")}</span><select id="utility-project" aria-label="${t("Dossier de travail")}">${locations.map(item=>`<option value="${esc(item.id)}" ${item.id===space.id?"selected":""}>${item.utilityCustom?`${t("Dossier choisi")} · `:""}${esc(item.name)}</option>`).join("")}<option value="__choose-folder__">${t("Choisir un autre dossier…")}</option></select></label>`:"";
    panel.innerHTML=`<div class="utility-resizer" data-utility-resize title="${t("Glisser pour ajuster · double-clic pour réinitialiser")}" aria-hidden="true"></div><header class="utility-panel-header ${space?"":"empty"}">${picker}${utilityPanelButton("panel")}</header>${space?`<nav class="utility-tabs" aria-label="${t("Outils du dossier")}">${[["chat","chat",t("Chat")],["terminal","terminal",t("Terminal")],["files","file",t("Fichiers")]].map(([id,glyph,label])=>`<button data-action="utility-tab" data-tab="${id}" class="${tab===id?"active":""}">${icon(glyph)}<span>${label}</span></button>`).join("")}</nav><section class="utility-panel-body ${tab}">${tab==="chat"?renderUtilityChat(space):tab==="terminal"?renderUtilityTerminal(space):renderUtilityFiles(space)}</section>`:`<div class="utility-empty utility-no-project">${icon("folder")}<h3>${t("Choisis un dossier pour utiliser ces outils")}</h3><button class="ui-button primary" data-action="choose-utility-folder">${t("Choisir un dossier…")}</button></div>`}`;
    const transcript=panel.querySelector?.("#utility-chat-transcript"),terminalOutput=panel.querySelector?.("#utility-terminal-output");if(transcript)transcript.scrollTop=transcript.scrollHeight;if(terminalOutput)terminalOutput.scrollTop=terminalOutput.scrollHeight;
  }
  function sendUtilityChat(form,message){
    const space=getSpace(form.dataset.space),engine=normalizeEngine(form.dataset.engine),text=String(message||"").trim(),attachments=utilityAttachments.map(normalizeUtilityAttachment).filter(Boolean).slice(0,utilityAttachmentLimit);if(!space||(!text&&!attachments.length))return false;
    const chat=utilityChat(space.id,engine,true);if(cardIsBusy(chat))return toast(t("Une réponse est déjà en cours."),true),false;
    const visibleText=text||t("Analyse les fichiers joints."),attachmentContext=attachments.length?`\n\n${t("Fichiers joints à cette demande :")}\n${attachments.map(attachment=>`- ${attachment.path}`).join("\n")}`:"",agentPrompt=`${visibleText}${attachmentContext}`;
    chat.runMode="workspaceWrite";chat.model=chat.model||defaultModelFor(engine);chat.reasoningEffort=chat.reasoningEffort||defaultEffortFor(engine);chat.prompt=agentPrompt;chat.status="queued";chat.updatedAt=now();chat.messages.push({role:"user",text:visibleText,attachments,at:now()});chat.messages=chat.messages.slice(-120);
    const conversation=currentUtilityConversation(chat),newConversation=Boolean(chat.utilityNewConversation||!conversation);if(newConversation)chat.title=utilityConversationTitle(text,attachments,engine);if(conversation)conversation.messages=structuredClone(chat.messages);chat.utilityNewConversation=newConversation;queuePositions.set(chat.id,[...queuePositions.keys()].filter(id=>engineKey(getCard(id)?.agentEngine)===engine).length+1);queueReasons.set(chat.id,"capacity");chat.lastRun={startedAt:now(),trigger:"direct-chat",accessMode:chat.runMode,approvalMode:"manual",summary:t("En attente dans la file…")};const composer=form.querySelector?.("#utility-chat-message")||form.querySelector?.("textarea");if(composer)composer.value="";utilityDraft="";utilityAttachments=[];save();render();
    const cardPayload={...chat,prompt:agentPrompt,conversationID:conversation?.id,accountID:activeAccountID(engine)};if(newConversation)delete cardPayload.conversationID;bridge({action:"run",utilityChat:true,card:cardPayload,space,mode:chat.runMode,autoApprove:false,newConversation,accountHome:accountHomeFor(engine)});return true;
  }
  function chooseUtilityFolder(){
    const terminal=utilityTerminals.get("utility-custom"),chatRunning=(board.utilityChats||[]).some(chat=>chat.spaceID==="utility-custom"&&taskIsActivelyExecuting(chat));
    if(terminal?.running||chatRunning){toast(t("Ferme le terminal et arrête le chat de ce dossier avant d’en choisir un autre."),true);return}
    bridge({action:"chooseUtilityFolder"});
  }
  function confirmImportData(){
    modal(`<div class="delete-project-head"><span>${icon("history")}</span><div><h2>${t("Restaurer une sauvegarde ?")}</h2><p class="lead">${t("Le fichier choisi remplacera les projets, tâches, réglages et historiques actuellement visibles dans CTRL KANB.")}</p></div></div><div class="restore-safety"><strong>${icon("shield")}${t("Une copie de sécurité sera créée automatiquement")}</strong><p>${t("Les dossiers Finder, leurs fichiers et les connexions Codex ou Claude Code ne seront ni déplacés ni supprimés.")}</p><p>${t("Par sécurité, le moteur local sera désactivé et les tâches programmées seront restaurées en pause. Tu pourras les reprendre après vérification.")}</p></div><form id="import-data-form"><label class="check-row"><input type="checkbox" name="confirm" required><span>${t("Je confirme remplacer l’organisation actuelle de CTRL KANB.")}</span></label><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">${t("Annuler")}</button><button class="danger">${t("Choisir la sauvegarde…")}</button></div></form>`);
  }

  document.addEventListener("contextmenu",event=>{
    const row=event.target.closest?.("[data-utility-file]");if(!row)return;
    event.preventDefault();
    const directory=row.dataset.directory==="true",menuWidth=224,menuHeight=directory?80:188,viewportWidth=Number(window.innerWidth)||1440,viewportHeight=Number(window.innerHeight)||900,space=utilitySpace();if(!space)return;
    utilityFileMenu={spaceID:space.id,path:row.dataset.path||"",name:row.dataset.name||"",directory,x:Math.max(8,Math.min(Number(event.clientX)||8,viewportWidth-menuWidth-8)),y:Math.max(8,Math.min(Number(event.clientY)||8,viewportHeight-menuHeight-8))};
    renderUtilityPanel();
  });

  document.addEventListener("click",event=>{
    if(suppressAgendaClick&&event.target.closest("[data-agenda-card]")){event.preventDefault();return}
    if(projectMenuID&&!event.target.closest(".project-nav-row")){projectMenuID=null;renderSidebar()}
    if(utilityFileMenu&&!event.target.closest?.(".utility-file-context-menu")){utilityFileMenu=null;document.querySelector(".utility-file-context-menu")?.remove?.()}
    const target=event.target.closest("[data-action],[data-select],[data-surface]");if(!target)return;
    if(target.dataset.surface){if(target.dataset.select&&selection!==target.dataset.select){labelFilter="";priorityFilter="";taxonomyFilter="";}surfaceMode=target.dataset.surface;board.settings.surfaceMode=surfaceMode;if(target.dataset.select){selection=target.dataset.select;rememberWorkspaceSelection(selection)}save();render();return}
    if(target.dataset.select){if(selection!==target.dataset.select){labelFilter="";priorityFilter="";taxonomyFilter="";}projectMenuID=null;const expandedNow=target.dataset.projectSelect?setProjectExpanded(target.dataset.projectSelect,true):false;if(target.dataset.select==="settingsView"){if(selection!=="settingsView")rememberWorkspaceSelection(selection);selection="settingsView"}else{selection=target.dataset.select;rememberWorkspaceSelection(selection)}if(expandedNow)save();render();return}const action=target.dataset.action;
    if(action==="command-palette"){openCommandPalette();return}
    if(action==="command-pick"){runPaletteItem(Number(target.dataset.index));return}
    if(action==="shortcuts"){openShortcuts();return}
    if(action==="toggle-utility"){board.settings.utilityPanelOpen?closeUtilityPanel():openUtilityPanel();return}
    if(action==="open-utility-chat"){closeModal();openUtilityPanel("chat");return}
    if(action==="choose-utility-folder"){chooseUtilityFolder();return}
    if(action==="choose-utility-attachments"){bridge({action:"chooseUtilityAttachments"});return}
    if(action==="remove-utility-attachment"){utilityAttachments.splice(Number(target.dataset.index),1);renderUtilityPanel();return}
    if(action==="new-utility-conversation"){startNewUtilityConversation();return}
    if(action==="switch-utility-conversation"){switchUtilityConversation(target.dataset.thread);return}
    if(action==="confirm-remove-utility-conversation"){confirmRemoveUtilityConversation();return}
    if(action==="remove-utility-conversation"){removeUtilityConversation(target.dataset.thread);return}
    if(action==="utility-tab"){utilityFileMenu=null;board.settings.utilityTab=target.dataset.tab||"chat";save();render();const space=utilitySpace();if(board.settings.utilityTab==="files"&&space&&!utilityFiles(space.id).loaded)loadUtilityFiles(space.id,"");if(board.settings.utilityTab==="terminal"&&space)startUtilityTerminal(space);return}
    if(action==="utility-agent"){board.settings.utilityAgent=normalizeEngine(target.dataset.engine);utilityDraft="";save();renderUtilityPanel();return}
    if(action==="stop-utility-chat"){const chat=getCard(target.dataset.id);if(chat&&cardIsBusy(chat)){chat.lastRun={...(chat.lastRun||{}),summary:t("Arrêt demandé…")};save();renderUtilityPanel();bridge({action:"stop",cardID:chat.id})}return}
    if(action==="start-terminal"){startUtilityTerminal(utilitySpace());return}
    if(action==="interrupt-terminal"){const space=utilitySpace(),terminal=space&&utilityTerminal(space.id);if(terminal?.running)bridge({action:"terminalInterrupt",terminalID:terminal.id});return}
    if(action==="stop-terminal"){const space=utilitySpace(),terminal=space&&utilityTerminal(space.id);if(terminal)bridge({action:"stopTerminal",terminalID:terminal.id});return}
    if(action==="clear-terminal"){const space=utilitySpace(),terminal=space&&utilityTerminal(space.id);if(terminal){terminal.output="";renderUtilityPanel()}return}
    if(action==="open-system-terminal"){const space=utilitySpace(),terminal=space&&utilityTerminal(space.id);if(space)bridge({action:"openSystemTerminal",terminalID:terminal?.id||"",spaceID:space.id,rootPath:space.rootPath});return}
    if(action==="browse-project-folder"){const space=utilitySpace();if(space)loadUtilityFiles(space.id,target.dataset.path||"");return}
    if(action==="open-project-file"||action==="reveal-project-file"){const space=utilitySpace();utilityFileMenu=null;if(space)bridge({action:action==="open-project-file"?"openProjectFile":"revealProjectFile",spaceID:space.id,rootPath:space.rootPath,relativePath:target.dataset.path||""});return}
    if(action==="open-project-file-with"||action==="save-project-file-as"||action==="copy-project-file-path"||action==="add-project-file-to-chat"){const space=utilitySpace(),nativeAction={"open-project-file-with":"openProjectFileWith","save-project-file-as":"saveProjectFileAs","copy-project-file-path":"copyProjectFilePath","add-project-file-to-chat":"resolveProjectFileForChat"}[action];utilityFileMenu=null;if(space)bridge({action:nativeAction,spaceID:space.id,rootPath:space.rootPath,relativePath:target.dataset.path||""});return}
    if(action==="reveal-project-root"){const space=utilitySpace();if(space)bridge({action:"revealProjectFile",spaceID:space.id,rootPath:space.rootPath,relativePath:""});return}
    if(action==="quick-capture"){openQuickCapture();return}
    if(action==="open-agent-settings"){if(selection!=="settingsView")rememberWorkspaceSelection(selection);selection="settingsView";activeSettingsSection="settings-agents";render();requestAnimationFrame(()=>document.getElementById("settings-agents")?.scrollIntoView({block:"start"}));return}
    if(action==="export-data"){bridge({action:"exportBoard"});return}
    if(action==="confirm-import-data"){
      confirmImportData();
      return;
    }
    if(action==="restore-draft"){restoreDraft();return}
    if(action==="discard-draft"){clearDraft(document.querySelector("#card-form"));document.querySelector("#draft-notice").hidden=true;return}
    if(action==="confirm-delete-card"){const card=getCard(target.dataset.id);if(card){if(activeRuns.has(card.id)||queuePositions.has(card.id))return toast("Arrête cette tâche avant de la supprimer.",true);const stayInView=["history","agenda"].includes(target.dataset.origin),keepAction=stayInView?`data-action="close-modal"`:`data-action="edit-card" data-id="${esc(card.id)}"`;modal(`<h2>${t("Supprimer cette tâche ?")}</h2><p class="lead">${t("« {titre} » et ses échanges enregistrés dans CTRL KANB seront retirés. Les fichiers du projet et les conversations conservées par les agents restent en place.", {titre: esc(card.title)})}</p><div class="modal-actions"><button class="secondary" ${keepAction}>${t("Conserver la tâche")}</button><button class="danger" data-action="delete-card" data-id="${esc(card.id)}">${t("Supprimer la tâche")}</button></div>`)}return}
    if(action==="duplicate-card"){duplicateCard(getCard(target.dataset.id));return}
    if(action==="pin-card"){const card=getCard(target.dataset.id);if(card){card.pinned=!card.pinned;save();render()}return}
    if(action==="task-layout"){board.settings.taskLayout=target.dataset.layout;save();render();return}
    if(action==="check-agents"){bridge({action:"agentStatus"});return}
    if(action==="pick-account"){setActiveAccount(target.dataset.engine,target.dataset.id);return}
    if(action==="add-account"){openAccountModal(target.dataset.engine);return}
    if(action==="remove-account"){
      const account=accountByID(target.dataset.id);
      if(!account||account.builtin)return;
      board.settings.accounts=(board.settings.accounts||[]).filter(a=>a.id!==account.id);
      if(board.settings.accountChecks)delete board.settings.accountChecks[account.id];
      delete engineProbes[account.id];
      for(const key of Object.keys(board.settings.activeAccount||{}))
        if(board.settings.activeAccount[key]===account.id)delete board.settings.activeAccount[key];
      save();render();toast(t("Compte retiré de CTRL KANB. Rien n’a été déconnecté ni effacé."));
      return;
    }
    if(action==="login-agent"){
      const engine=target.dataset.engine, compte=target.dataset.account||activeAccountID(engine);
      bridge({action:"agentLogin",engine,home:accountByID(compte)?.home||"",account:compte});
      return}
    if(action==="toggle-app-lock"){
      // L etat vient du trousseau, jamais de la case : tant que le systeme n a
      // pas authentifie, la case ne doit pas laisser croire que c est fait.
      event.preventDefault();
      if(target.checked!==undefined)target.checked=securityState.lockEnabled;
      bridge({action:"setAppLock",enabled:!securityState.lockEnabled});
      return;
    }
    if(action==="lock-now"){bridge({action:"lockNow"});return}
    if(action==="request-notifications"){bridge({action:"requestNotifications"});return}
    if(action==="refresh-notification-status"){bridge({action:"notificationStatus"});return}
    if(action==="open-notification-settings"){bridge({action:"openNotificationSettings"});return}
    if(action==="probe-agent"){
      const engine=target.dataset.engine, compte=target.dataset.account||activeAccountID(engine), foyer=accountByID(compte)?.home||"";
      engineProbes={...engineProbes,[compte]:{engine,account:compte,state:"running"}};
      if(selection==="settingsView")render();
      bridge({action:"agentProbe",engine,home:foyer,account:compte});
      return}
    if(action==="claude-command"){const card=getCard(target.dataset.id),id=target.dataset.thread||activeConversation(card)?.id,space=getSpace(card?.spaceID);if(id&&space)bridge({action:"copyText",text:`cd -- ${shellQuote(space.rootPath)} && claude --resume ${id}`});toast("Commande de reprise copiée");return}
    if(action==="open-claude-conversation"){bridge({action:"openClaudeConversation",threadID:target.dataset.thread});return}
    if(action==="brief-starter"){const form=document.querySelector("#card-form"),prompts={audit:"Objectif : auditer le projet et identifier les améliorations prioritaires.\n\nPérimètre :\n\nLivrable attendu : constats précis, preuves et propositions classées par priorité.\n\nContraintes : ne modifier aucun fichier sans demande explicite.",build:"Objectif : construire…\n\nContexte et fichiers utiles :\n\nRésultat attendu :\n\nCritères de réussite :\n- \n\nContraintes à respecter :",fix:"Problème observé :\n\nÉtapes pour le reproduire :\n\nComportement attendu :\n\nLivrable : correction ciblée et vérification du parcours concerné."};if(form){form.elements.prompt.value=prompts[target.dataset.kind]||"";form.elements.prompt.focus();captureDraft()}return}
    if(action==="toggle-sidebar"){board.settings.sidebarCollapsed=!board.settings.sidebarCollapsed;save();render();return}
    if(action==="open-clock-picker"){const form=target.closest("form"),picker=form?.querySelector("#schedule-clock");if(!form||!picker)return;refreshSchedulePicker(form,true);picker.hidden=!picker.hidden;target.setAttribute("aria-expanded",String(!picker.hidden));return}
    if(action==="close-clock-picker"){const form=target.closest("form"),picker=form?.querySelector("#schedule-clock"),trigger=form?.querySelector("[data-action='open-clock-picker']");if(picker)picker.hidden=true;if(trigger)trigger.setAttribute("aria-expanded","false");return}
    if(action==="pick-clock-hour"){const form=target.closest("form");setSchedulePickerValue(form,{hour:Number(target.dataset.hour)});return}
    if(action==="pick-clock-minute"){const form=target.closest("form");setSchedulePickerValue(form,{minute:Number(target.dataset.minute)});return}
    if(action==="pick-clock-period"){const form=target.closest("form");setSchedulePickerValue(form,{period:target.dataset.period});return}
    if(action==="agenda-mode"){agendaMode=target.dataset.mode||"week";render();return}
    if(action==="agenda-today"){agendaAnchor=parseLocalDate(today());render();return}
    if(action==="agenda-prev"||action==="agenda-next"){const direction=action.endsWith("next")?1:-1;if(agendaMode==="month"){const shifted=new Date(agendaAnchor);shifted.setDate(1);shifted.setMonth(shifted.getMonth()+direction);agendaAnchor=shifted}else agendaAnchor=addDays(agendaAnchor,direction*(agendaMode==="week"?7:1));render();return}
    if(action==="agenda-open-day"){agendaAnchor=parseLocalDate(target.dataset.date);agendaMode="day";render();return}
    if(action==="agenda-create"){const date=target.dataset.date||dateKey(agendaAnchor),hour=target.dataset.hour||"09",minute=target.dataset.minute||"00";openCardModal(null,{boardPresetID:"classic",status:"ready",dueDate:date,launchMode:"scheduled",scheduledAt:agendaWallToInstant(`${date}T${hour}:${minute}`),durationMinutes:60});return}
    if(action==="agenda-create-due"){const date=target.dataset.date||dateKey(agendaAnchor);openCardModal(null,{dueDate:date,launchMode:"manual"});return}
    if(action==="agenda-complete"){const card=getCard(target.dataset.id);if(card&&!['queued','running'].includes(card.status)){changeStatus(card,"done");save();render();toast("Tâche marquée comme terminée")}return}
    if(action==="refresh-background-status"){bridge({action:"backgroundSchedulerStatus"});return}
    if(action==="toggle-projects"){projectsExpanded=!projectsExpanded;projectMenuID=null;renderSidebar();return}
    if(action==="toggle-project"){const id=target.dataset.id;if(getSpace(id)){setProjectExpanded(id,!projectIsExpanded(id));projectMenuID=null;save();renderSidebar()}return}
    if(action==="show-more-project-tasks"){const id=target.dataset.id;if(projectTaskLimits.get(id)===Infinity)projectTaskLimits.delete(id);else projectTaskLimits.set(id,Infinity);renderSidebar();return}
    if(action==="open-sidebar-task"){const card=getCard(target.dataset.id);projectMenuID=null;if(card)openCardModal(card);return}
    if(action==="project-menu"){
      projectMenuID=projectMenuID===target.dataset.id?null:target.dataset.id;
      renderSidebar();
      if(projectMenuID)requestAnimationFrame(()=>document.querySelector(".project-nav-row.menu-open")?.scrollIntoView({block:"nearest"}));
      return;
    }
    if(action==="edit-space"){const space=getSpace(target.dataset.id);projectMenuID=null;if(space)openSpaceModal(space);return}
    if(action==="delete-space"){openDeleteSpaceModal(getSpace(target.dataset.id));return}
    if(action==="toggle-pin-space"){const space=getSpace(target.dataset.id);if(space){space.pinned=!space.pinned;space.updatedAt=now();projectMenuID=null;save();render();toast(space.pinned?"Projet épinglé":"Projet désépinglé")}return}
    if(action==="reveal-space"){const space=getSpace(target.dataset.id);projectMenuID=null;renderSidebar();if(space)bridge({action:"revealPath",path:space.rootPath});return}
    if(action==="move-space-up"||action==="move-space-down"){moveSpaceRelative(target.dataset.id,action.endsWith("up")?-1:1);return}
    if(action==="add-space")openSpaceModal();if(action==="add-card")openCardModal();if(action==="add-card-in-column"){openCardModal(null,{boardPresetID:target.dataset.preset,status:target.dataset.status||"backlog",launchMode:target.dataset.launchMode||"manual",spaceID:selection!=="global"&&!specialViews[selection]?selection:undefined});return}if(action==="show-more-column"){expandedColumnLimits.set(target.dataset.columnKey,Number(target.dataset.currentLimit||cardsPerColumnPage)+cardsPerColumnPage);renderBoard();return}if(action==="show-more-flow"){expandedFlowSections.set(target.dataset.flowKey,Number(target.dataset.currentLimit||flowSectionPageSize)+flowSectionPageSize);renderBoard();return}if(action==="show-more-history"){if(target.dataset.historyKind==="archived")historyArchiveLimit+=historyPageSize;else historyCurrentLimit+=historyPageSize;renderBoard();return}if(action==="edit-card")openCardModal(getCard(target.dataset.id));if(action==="archive-card"){const card=getCard(target.dataset.id);if(archiveCard(card)){save();render();toast("Carte archivée — elle reste dans Historique et Agenda")};return}if(action==="unarchive-card"){const card=getCard(target.dataset.id);if(restoreArchivedCard(card)){save();render();toast("Carte restaurée dans Terminées")};return}if(action==="archive-completed"){const presetID=target.dataset.preset,count=archiveCards(baseVisibleCards().filter(card=>card.status==="done"&&!card.archived&&(!presetID||cardBoardPresetID(card)===presetID)));if(count){save();render();toast(`${count} carte${count>1?"s archivées":" archivée"}`)}else toast("Aucune carte terminée à archiver");return}if(action==="close-modal")closeModal();if(action==="choose-folder")bridge({action:"chooseFolder"});if(action==="data")bridge({action:"revealData"});if(action==="settings")openSettingsModal();
    if(action==="open-account-settings"){if(selection!=="settingsView")lastWorkspaceSelection=selection;selection="settingsView";activeSettingsSection="settings-accounts";render();requestAnimationFrame(()=>document.getElementById("settings-accounts")?.scrollIntoView({block:"start"}));return}
    if(action==="scroll-setting"){
      activeSettingsSection=target.dataset.target;
      markActiveSettingsSection();
      document.getElementById(target.dataset.target)?.scrollIntoView({behavior:"smooth",block:"start"});
      return;
    }
    if(action==="reset-sidebar"){applySidebarWidth(sidebarWidthDefault);board.settings.sidebarWidth=sidebarWidthDefault;save();render();toast(t("Largeur du panneau gauche rétablie."));return}
    if(action==="reset-utility-width"){applyUtilityPanelWidth(utilityPanelWidthDefault);board.settings.utilityPanelWidth=utilityPanelWidthDefault;save();render();toast(t("Largeur du panneau droit rétablie."));return}
    if(action==="add-priority"||action==="add-dimension"||action==="add-tax-value"){applySettingsForm(document.querySelector("#settings-form"));save();if(action==="add-priority")openAddPriorityModal();if(action==="add-dimension")openAddDimensionModal();if(action==="add-tax-value")openAddValueModal(target.dataset.dimension)}
    if(action==="move-priority-up"||action==="move-priority-down"){applySettingsForm(document.querySelector("#settings-form"));movePriority(target.dataset.id,action.endsWith("up")?-1:1)}
    if(action==="renumber"){applySettingsForm(document.querySelector("#settings-form"));renumberCards()}
    if(action==="delete-priority"){if(board.cards.some(c=>c.priorityLevelID===target.dataset.id))toast("Ce niveau est utilisé par des cartes.",true);else if(priorities().length<=1)toast("Il faut conserver au moins un niveau.",true);else{board.settings.priorities=priorities().filter(p=>p.id!==target.dataset.id);save();openSettingsModal();render()}}
    if(action==="delete-dimension"){const d=dimensionByID(target.dataset.id),used=board.cards.some(c=>(c.categoryAssignments?.[d.id]||[]).length);if(used){d.archived=true;toast("Axe masqué ; les affectations existantes sont conservées.")}else board.settings.taxonomy=taxonomy().filter(x=>x.id!==d.id);save();openSettingsModal();render()}
    if(action==="delete-tax-value"){const d=dimensionByID(target.dataset.dimension),v=d?.values?.find(x=>x.id===target.dataset.id),used=board.cards.some(c=>(c.categoryAssignments?.[d.id]||[]).includes(v?.id));if(used){v.archived=true;toast("Valeur masquée ; les cartes existantes sont conservées.")}else d.values=d.values.filter(x=>x.id!==v.id);save();openSettingsModal();render()}
    if(action==="delete-card"){if(activeRuns.has(target.dataset.id)||queuePositions.has(target.dataset.id))return toast("Arrête cette tâche avant de la supprimer.",true);clearDraft({dataset:{id:target.dataset.id}});board.cards=board.cards.filter(c=>c.id!==target.dataset.id);save();closeModal();render()}
    if(action==="resume-schedule"){const c=getCard(target.dataset.id);if(c){c.scheduleState="pending";c.scheduleNextAttemptAt=now();c.scheduleNote="Reprise manuelle demandée.";c.status="ready";save();render();schedulerTick()}}
    if(action==="pause-routine"){const c=getCard(target.dataset.id);if(c){c.scheduleState="paused";c.scheduleNextAttemptAt="";c.scheduleNote="Routine suspendue manuellement.";c.status="ready";save();render();toast("Routine suspendue")};return}
    if(action==="conversation-bottom"){const area=document.querySelector(".timeline,.claude-transcript");if(area)area.scrollTop=area.scrollHeight;return}
    if(action==="review-decision"){openReviewDecision(getCard(target.dataset.id));return}
    if(action==="deepen-review"){openDeepenModal(getCard(target.dataset.id));return}
    if(action==="finish-review"){finishReviewedCard(getCard(target.dataset.id));return}
    if(action==="stop-routine"){finishReviewedCard(getCard(target.dataset.id),{stopRoutine:true});return}
    if(action==="run")openRunModal(getCard(target.dataset.id));if(action==="run-ready")openBatchModal();if(action==="suspend-run")suspendCard(getCard(target.dataset.id));if(action==="resume-run")resumeCard(getCard(target.dataset.id));if(action==="sync")syncNow();if(action==="sync-claude")syncClaudeNow();if(action==="sync-all")syncAllNow();
    if(action==="toggle-subtask"){const c=getCard(target.dataset.cardId),s=c?.subtasks.find(x=>x.id===target.dataset.subtask);if(s){s.done=target.checked;c.updatedAt=now();save();render()}}
    if(action==="pick-conversation")openConversationPicker(target.dataset.id);if(action==="conversation-panel")openConversationPanel(target.dataset.id);if(action==="open-conversation"){const owner=board.cards.find(c=>c.conversations?.some(v=>v.id===target.dataset.thread&&isClaude({agentEngine:v.engine})));if(owner)openConversationPanel(owner.id,target.dataset.thread);else bridge({action:"openConversation",threadID:target.dataset.thread});}if(action==="switch-conversation")openConversationPanel(target.dataset.cardId,target.dataset.thread);
    if(action==="set-main-conversation"){const c=getCard(target.dataset.cardId),chosen=c?.conversations.find(x=>x.id===target.dataset.thread);if(chosen){for(const item of c.conversations)if(item.role==="main")item.role="attempt";chosen.role="main";c.activeConversationID=chosen.id;syncLegacyConversationFields(c);save();openConversationPanel(c.id,chosen.id);render()}}
    if(action==="remove-conversation"){const c=getCard(target.dataset.cardId);if(c){c.conversations=c.conversations.filter(x=>x.id!==target.dataset.thread);if(c.activeConversationID===target.dataset.thread)c.activeConversationID=c.conversations[0]?.id;syncLegacyConversationFields(c);save();closeModal();render();toast("Conversation dissociée")}}
    if(action==="link-conversation"){const card=getCard(conversationPickerCardID),item=conversations.find(c=>c.id===target.dataset.thread),role=document.querySelector("#conversation-role")?.value||"main";if(card&&item){addConversationToCard(card,item,role);save();closeModal();render();toast("Conversation ajoutée")}}
    if(action==="toggle-all-conversations"){conversationFilterAll=true;const card=getCard(conversationPickerCardID);filterConversationList(document.querySelector("#conversation-search")?.value||"",getSpace(card?.spaceID)?.rootPath)}
    if(action==="validation-decision"){decideValidation(getValidation(target.dataset.validation),target.dataset.decision);return}
    if(action==="answer-validation"){const validation=getValidation(target.dataset.validation);if(validation)openValidationQuestion(validation);return}
    if(action==="cancel-validation"){cancelValidation(getValidation(target.dataset.validation));return}
    if(action==="open-validation"){const validation=getValidation(target.dataset.validation);if(validation)openValidationDetails(validation);return}
    if(action==="validation-complete-card"){finishReviewedCard(getCard(target.dataset.id));return}
    if(action==="create-follow-up"){const source=getCard(target.dataset.id);if(source){const summary=source.lastRun?.summary||activeConversation(source)?.preview||"Consulte la conversation liée pour reprendre le résultat.";openCardModal(null,{spaceID:source.spaceID,boardPresetID:cardBoardPresetID(source),status:"backlog",title:`Suite — ${source.title}`,prompt:`Résultat de la tâche précédente « ${source.title} » :\n${summary}\n\nÀ partir de ce résultat, réalise la suite suivante :\n`,model:source.model,reasoningEffort:source.reasoningEffort})}return}
  });

  document.addEventListener("input",event=>{if(event.target.id==="command-search"){renderCommandResults(event.target.value);return}if(event.target.id==="utility-chat-message"){utilityDraft=event.target.value;return}if(event.target.closest?.("#card-form")){clearedDraftForm=null;captureDraft()}if(event.target.id==="conversation-search"){const c=getCard(conversationPickerCardID);filterConversationList(event.target.value,getSpace(c?.spaceID)?.rootPath)}if(event.target.id==="schedule-time-manual")setScheduleManualTime(event.target.closest("form"),event.target.value)});
  document.addEventListener("change",event=>{
    if(event.target.id==="utility-project"){
      if(event.target.value==="__choose-folder__"){chooseUtilityFolder();renderUtilityPanel();return}
      utilityFileMenu=null;board.settings.utilitySpaceID=event.target.value;utilityDraft="";utilityAttachments=[];save();renderUtilityPanel();
      if(board.settings.utilityTab==="files"&&!utilityFiles(event.target.value).loaded)loadUtilityFiles(event.target.value,"");
      return;
    }
    if(event.target.id==="utility-chat-model"){
      const space=utilitySpace(),engine=normalizeEngine(board.settings.utilityAgent),models=engineEntry(engine)[2];if(!space||!models.some(([id])=>id===event.target.value))return;
      const chat=utilityChat(space.id,engine,true);chat.model=event.target.value;chat.updatedAt=now();save();renderUtilityPanel();return;
    }
    if(event.target.id==="utility-chat-conversation"){switchUtilityConversation(event.target.value);return}
    if(event.target?.name==="mode"&&event.target.closest?.("#run-form")){
      const help=document.querySelector("#claude-access-help");
      if(help)help.textContent=event.target.value==="readOnly"?t("Claude pourra seulement lire le dossier du projet avec Read, Glob et Grep."):t("Claude demandera ton autorisation avant chaque modification du projet.");
      return;
    }
    if(event.target?.name==="spaceID"&&event.target.value==="__new-space__"){
      const form=event.target.closest("form");
      pendingAfterSpace={simple:Boolean(form?.dataset?.simple),defaults:captureCardDefaults(form)};
      openSpaceModal();
      return;
    }
    const preferences=event.target?.closest?.("#preferences-form");
    if(preferences){applyPreferences(preferences);return}
    if(event.target.id==="task-engine"){const form=event.target.closest("form"),engine=event.target.value;if(form.elements.model)form.elements.model.innerHTML=engineModelOptions(engine,defaultModelFor(engine));const note=form.querySelector(".agent-config-note");if(note)note.textContent=form.dataset.simple==="true"?(engine==="claude-code"?t("La session sera créée dans Claude sous le bon workspace."):t("La conversation sera créée dans Codex sous le bon projet.")):(engine==="claude-code"?t("Session Claude dédiée. Tes autorisations restent visibles dans Validations."):t("Conversation Codex liée automatiquement au premier lancement."));captureDraft();return}
    if(event.target.id==="execution-type"){const form=event.target.closest("form");updateSimpleExecutionFields(form,event.target.value!=="manual");captureDraft();return}
    if(event.target.id==="task-sort"){board.settings.taskSort=event.target.value;save();renderBoard();return}
    if(event.target.id==="card-board-preset"){const form=event.target.closest("form");refreshCardStageSelect(form,event.target.value,form?.elements?.status?.value);return}
    if(event.target.id==="schedule-time-manual"){setScheduleManualTime(event.target.closest("form"),event.target.value,true);return}
    if(event.target.id==="schedule-date"){const form=event.target.closest("form");setSchedulePickerValue(form,{date:event.target.value});return}
    if(event.target.id==="launch-mode"&&event.target.value==="scheduled"){const form=event.target.closest("form");refreshSchedulePicker(form,true);return}
    if(event.target.id==="label-filter"){labelFilter=event.target.value;renderBoard();if(selection==="agendaView")renderHeader()}
    if(event.target.id==="priority-filter"){priorityFilter=event.target.value;renderBoard();if(selection==="agendaView")renderHeader()}
    if(event.target.id==="taxonomy-filter"){taxonomyFilter=event.target.value;renderBoard();if(selection==="agendaView")renderHeader()}
    if(event.target.id==="active-preset"){setActivePreset(event.target.value);save();render()}
    if(event.target.id==="conversation-all"){conversationFilterAll=event.target.checked;const c=getCard(conversationPickerCardID);filterConversationList(document.querySelector("#conversation-search")?.value||"",getSpace(c?.spaceID)?.rootPath)}
    if(event.target.id==="template-select"){const t=board.templates.find(x=>x.id===event.target.value),f=document.querySelector("#card-form");if(t&&f){for(const key of ["title","prompt","boardPresetID","priorityLevelID","agentEngine","model","reasoningEffort","runMode","recurrence","launchMode","scheduledAt","missedRunPolicy","routineName","labels","subtasks"]){const el=f.elements[key];if(el)el.value=Array.isArray(t[key])?t[key].map(x=>x.title||x).join(key==="subtasks"?"\n":", "):t[key]||""}for(const[d,ids]of Object.entries(t.categoryAssignments||{})){const select=f.elements[`category__${d}`];if(select)for(const option of select.options)option.selected=ids.includes(option.value)}refreshSchedulePicker(f,Boolean(t.scheduledAt))}}
  });

  document.addEventListener("submit",event=>{
    event.preventDefault();const form=event.target,data=Object.fromEntries(new FormData(form));
    if(form.id==="utility-chat-form"){if(sendUtilityChat(form,data.message)){const textarea=form.querySelector?.("textarea");if(textarea)textarea.value=""}return}
    if(form.id==="utility-terminal-form"){
      const space=getSpace(form.dataset.space),terminal=space&&utilityTerminal(space.id),command=String(data.command||"").trim();if(!terminal?.running||!command)return;
      const sensitive=/(?:password|mot de passe|passphrase|secret|token)\s*:?\s*$/i.test(terminal.output.slice(-180));
      if(!sensitive&&terminal.history.at(-1)!==command)terminal.history.push(command);terminal.history=terminal.history.slice(-100);terminal.historyIndex=terminal.history.length;terminal.pendingEcho=true;terminal.echoBuffer="";
      if(command==="clear")terminal.output="";else terminal.output=`${terminal.output}${terminal.output&&!terminal.output.endsWith("\n")?" ":""}${sensitive?"••••••••":command}\n`;
      renderUtilityPanel();bridge({action:"terminalCommand",terminalID:terminal.id,command});requestAnimationFrame(()=>document.querySelector("#utility-terminal-command")?.focus());return;
    }
    if(form.id==="quick-capture-form"){if(!data.title.trim())return;const card={id:uid(),title:data.title.trim(),prompt:"",spaceID:data.spaceID,agentEngine:data.agentEngine,model:defaultModelFor(data.agentEngine||defaultEngine()),reasoningEffort:defaultEffortFor(data.agentEngine||defaultEngine()),runMode:"readOnly",boardPresetID:"classic",status:"backlog",priorityLevelID:priorities().find(p=>p.id==="normal")?.id||priorities()[0].id,priorityNumber:nextPriorityNumber(data.spaceID,priorities().find(p=>p.id==="normal")?.id||priorities()[0].id),labels:[],subtasks:[],dependencies:[],categoryAssignments:{},conversations:[],recurrence:"none",launchMode:"manual",createdAt:now(),updatedAt:now()};board.cards.push(card);save();closeModal();navigateTo(data.spaceID,"board");setActivePreset("classic");save();render();toast("Idée capturée. Complète le brief quand tu seras prêt.");return}
    if(form.id==="import-data-form"){if(data.confirm!=="on")return;closeModal();bridge({action:"importBoard"});return}
    if(form.id==="claude-link-form"){const card=getCard(form.dataset.id);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.sessionID.trim()))return toast("Identifiant de session invalide.",true);addConversationToCard(card,{id:data.sessionID.trim(),engine:"claude-code",name:card.title,cwd:getSpace(card.spaceID)?.rootPath,accountID:activeAccountID("claude-code")});save();closeModal();render();toast("Session Claude associée");return}
    if(form.id==="space-form"){const existing=getSpace(form.dataset.id),values={name:data.name.trim(),rootPath:data.rootPath.trim(),accentHex:data.accentHex.replace("#",""),pinned:data.pinned==="on",updatedAt:now()};if(existing)Object.assign(existing,values);else board.spaces.push({id:uid(),...values,createdAt:now()});save();closeModal();render();toast(existing?"Projet mis à jour":"Projet créé")}
    if(form.id==="delete-space-form"){const space=getSpace(form.dataset.id);if(!space||data.confirm!=="on")return;const cards=board.cards.filter(card=>card.spaceID===space.id),chats=(board.utilityChats||[]).filter(chat=>chat.spaceID===space.id),terminal=utilityTerminals.get(space.id);if(cards.concat(chats).some(taskIsActivelyExecuting)||terminal?.running){toast(t("Arrête les tâches, chats et terminaux actifs avant de supprimer le projet."),true);return}const itemIDs=new Set(cards.concat(chats).map(item=>item.id));board.cards=board.cards.filter(card=>card.spaceID!==space.id);board.utilityChats=(board.utilityChats||[]).filter(chat=>chat.spaceID!==space.id);board.validations=validations().filter(validation=>!itemIDs.has(validation.cardID));board.spaces=board.spaces.filter(item=>item.id!==space.id);utilityTerminals.delete(space.id);utilityFileStates.delete(space.id);if(board.settings.utilitySpaceID===space.id)board.settings.utilitySpaceID="";if(selection===space.id){selection="global";lastWorkspaceSelection="global"}save();closeModal();render();toast(t("Projet « {name} » retiré de CTRL KANB — dossier Finder intact",{name:space.name}))}
    if(form.id==="card-form"&&form.dataset.simple==="true"){saveSimpleCardForm(form,data);return}
    if(form.id==="card-form"){const liveCard=getCard(form.dataset.id);if(liveCard&&(activeRuns.has(liveCard.id)||queuePositions.has(liveCard.id)||liveCard.executionState==="pausing"))return toast("Suspends l’exécution avant de modifier cette tâche.",true);if(!data.title.trim())return toast("Donne un titre à la tâche.",true);if((data.status!=="backlog"||data.launchMode==="scheduled")&&!data.prompt.trim())return toast("Ajoute un brief pour préparer ou planifier la tâche.",true);if(isClaude({agentEngine:data.agentEngine})&&data.launchMode==="codex")return toast("Choisis le lancement manuel ou la planification CTRL KANB pour Claude.",true);if(data.launchMode==="scheduled"&&!data.scheduledAt)return toast("Choisis la date et l’heure du lancement.",true);const existing=getCard(form.dataset.id),oldStatus=existing?.status,fd=new FormData(form);if(data.launchMode==="scheduled"&&!data.scheduledAt){toast("Choisis une date et une heure de lancement.",true);return}const lines=data.subtasks.split("\n").map(x=>x.trim()).filter(Boolean);const oldSubs=existing?.subtasks||[],categoryAssignments={};for(const dimension of taxonomy().filter(d=>!d.archived)){categoryAssignments[dimension.id]=fd.getAll(`category__${dimension.id}`).filter(Boolean);if(!dimension.multiple)categoryAssignments[dimension.id]=categoryAssignments[dimension.id].slice(0,1)}for(const subDimension of taxonomy().filter(d=>d.kind==="subproject"&&!d.archived)){const sub=taxonomyValue(subDimension.id,categoryAssignments[subDimension.id]?.[0]);if(sub?.parentValueID){const parentDimensionID=subDimension.parentDimensionID||taxonomy().find(d=>d.kind==="objective")?.id;if(parentDimensionID)categoryAssignments[parentDimensionID]=[sub.parentValueID]}}const requested=Number(data.priorityNumber),number=requested>0?requested:nextPriorityNumber(data.spaceID,data.priorityLevelID,existing?.id);if(board.cards.some(c=>c.id!==existing?.id&&c.spaceID===data.spaceID&&c.priorityLevelID===data.priorityLevelID&&Number(c.priorityNumber)===number))for(const other of board.cards.filter(c=>c.id!==existing?.id&&c.spaceID===data.spaceID&&c.priorityLevelID===data.priorityLevelID&&Number(c.priorityNumber)>=number))other.priorityNumber=Number(other.priorityNumber)+1;const scheduleChanged=!existing||existing.launchMode!==data.launchMode||existing.scheduledAt!==(data.scheduledAt||"");const values={spaceID:data.spaceID,boardPresetID:normalizePresetID(data.boardPresetID),title:data.title.trim(),prompt:data.prompt.trim(),status:existing&&existing.executionState==="paused"?existing.status:data.status,priorityLevelID:data.priorityLevelID,priority:data.priorityLevelID,priorityNumber:number,categoryAssignments,agentEngine:normalizeEngine(data.agentEngine||defaultEngine()),model:data.model||defaultModelFor(data.agentEngine||defaultEngine()),reasoningEffort:data.reasoningEffort||board.settings.defaultEffort,runMode:data.runMode,durationMinutes:Math.max(15,Math.min(480,Number(data.durationMinutes)||60)),dueDate:data.dueDate||"",recurrence:data.recurrence,recurrenceSource:data.launchMode==="codex"?"codex":"board",launchMode:data.launchMode,scheduledAt:data.scheduledAt||"",missedRunPolicy:data.missedRunPolicy||"catchUp",routineName:(data.routineName||"").trim(),labels:(data.labels||"").split(",").map(x=>x.trim()).filter(Boolean),subtasks:lines.map(title=>oldSubs.find(s=>s.title===title)||{id:uid(),title,done:false}),dependencies:fd.getAll("dependencies"),completedAt:data.status==="done"?(existing?.completedAt||now()):"",updatedAt:now()};if(scheduleChanged){values.scheduleState=values.launchMode==="scheduled"?"pending":"";values.scheduleNextAttemptAt="";values.scheduleAttempts=0;values.scheduleNote=""}let card;if(existing){Object.assign(existing,values);card=existing}else{card={id:uid(),...values,conversations:[],createdAt:now()};board.cards.push(card)}if(values.status==="done"&&oldStatus!=="done")createNextOccurrence(card);if(data.saveTemplate==="on")board.templates.push({id:uid(),name:values.title,title:values.title,prompt:values.prompt,boardPresetID:values.boardPresetID,priorityLevelID:values.priorityLevelID,categoryAssignments:structuredClone(values.categoryAssignments),agentEngine:values.agentEngine,model:values.model,reasoningEffort:values.reasoningEffort,runMode:values.runMode,recurrence:values.recurrence,launchMode:values.launchMode,scheduledAt:values.scheduledAt,missedRunPolicy:values.missedRunPolicy,routineName:values.routineName,labels:values.labels,subtasks:values.subtasks.map(s=>s.title)});syncLegacyConversationFields(card);clearDraft(form);save();closeModal();render();schedulerTick();toast(existing?"Carte mise à jour":"Carte créée")}
    if(form.id==="settings-form"){applySettingsForm(form);save();closeModal();render();toast("Configuration enregistrée")}
    if(form.id==="account-form"){
      const engine=engineKey(form.dataset.engine), label=(data.label||"").trim();
      if(!label)return;
      const id=`${engine}:${uid()}`;
      // Le dossier porte l identifiant, pas le nom : renommer un compte ne doit
      // pas deplacer son authentification.
      const home=accountHomePath(engine,id.split(":")[1]);
      board.settings.accounts=[...(board.settings.accounts||[]), {id, engine, label, home}];
      board.settings.activeAccount={...(board.settings.activeAccount||{}), [engine]:id};
      save();closeModal();render();
      toast(t("Compte ajouté et sélectionné. Clique maintenant sur « Connecter… »."));
      return;
    }
    if(form.id==="preferences-form"){applyPreferences(form);return}
    if(form.id==="add-priority-form"){board.settings.priorities.push({id:uid(),name:data.name.trim(),code:data.code.trim().toUpperCase().slice(0,3),color:data.color.replace("#",""),weight:priorities().length});save();openSettingsModal();render();toast("Niveau ajouté")}
    if(form.id==="add-dimension-form"){const objective=taxonomy().find(d=>d.kind==="objective"&&!d.archived);board.settings.taxonomy.push({id:uid(),name:data.name.trim(),kind:data.kind,multiple:data.multiple==="on",parentDimensionID:data.kind==="subproject"?objective?.id||"":"",values:[]});save();openSettingsModal();render();toast("Axe ajouté")}
    if(form.id==="add-value-form"){const d=dimensionByID(form.dataset.dimension);d.values||=[];d.values.push({id:uid(),name:data.name.trim(),color:data.color.replace("#",""),parentValueID:data.parentValueID||""});save();openSettingsModal();render();toast("Valeur ajoutée")}
    if(form.id==="run-form"){const c=getCard(form.dataset.id);if(queueCard(c,{mode:data.mode,autoApprove:data.autoApprove==="on",newConversation:data.newConversation==="on"}))closeModal()}
    if(form.id==="batch-form"){
      const montrees=new Set(batchSelection);
      const cards=batchReadyCards().filter(c=>montrees.has(c.id));
      closeModal();
      // queueCard refuse une carte sans brief, sans projet ou deja occupee :
      // on annonce ce qui est reellement parti, pas ce qui a ete tente.
      let enFile=0;
      for(const c of cards) if(queueCard(c)) enFile++;
      const ecartees=montrees.size-enFile;
      toast(tn(enFile,"{n} tâche ajoutée à la file","{n} tâches ajoutées à la file")+(ecartees?" · "+tn(ecartees,"{n} écartée","{n} écartées"):""),Boolean(ecartees));
    }
    if(form.id==="deepen-form"){const card=getCard(form.dataset.id);if(card&&queueCard(card,{prompt:data.prompt.trim(),requireConversation:true})){closeModal();toast("Tâche relancée dans la même conversation")}}
    if(form.id==="input-request-form"){const validation=getValidation(form.dataset.validation);if(!validation||validation.status!=="pending")return;const answers={};for(const[key,value]of new FormData(form))answers[key]={answers:[value]};validation.status="answered";validation.decidedAt=now();validation.answers=answers;save();render();bridge({action:"respondRequest",cardID:validation.cardID,requestID:validation.requestID,result:{answers}});closeModal();toast("Réponse envoyée à l’agent")}
    if(form.id==="conversation-message-form"){
      const card=getCard(form.dataset.card),message=String(data.message||"").trim();
      if(!message)return;
      if(queueCard(card,{prompt:message,conversationID:form.dataset.thread,requireConversation:true})){
        const textarea=form.querySelector("textarea");if(textarea)textarea.value="";
        if(isClaude(card)){const conv=(card.conversations||[]).find(item=>item.id===form.dataset.thread);if(conv)openClaudeConversation(card,conv);}
        else syncConversationPanel();
        toast(t("Instruction ajoutée à la file dans la même conversation."));
      }
    }
  });

  document.addEventListener("dragstart",event=>{const project=event.target.closest("[data-project-row]");if(project){projectDragID=project.dataset.projectRow;event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("application/x-ctrl-kanb-project",projectDragID);project.classList.add("dragging-project");projectMenuID=null;return}const c=event.target.closest("[data-card]");if(c)event.dataTransfer.setData("text/plain",c.dataset.card)});
  document.addEventListener("dragend",()=>{projectDragID=null;document.querySelectorAll(".dragging,.agenda-drop-active,.drag-over,.dragging-project,.project-drop-before,.project-drop-after").forEach(element=>element.classList.remove("dragging","agenda-drop-active","drag-over","dragging-project","project-drop-before","project-drop-after"))});
  document.addEventListener("dragover",event=>{const project=event.target.closest("[data-project-row]");if(project&&projectDragID){event.preventDefault();event.dataTransfer.dropEffect="move";const rect=project.getBoundingClientRect(),after=event.clientY>rect.top+rect.height/2;document.querySelectorAll(".project-drop-before,.project-drop-after").forEach(element=>element.classList.remove("project-drop-before","project-drop-after"));project.classList.add(after?"project-drop-after":"project-drop-before");return}const slot=event.target.closest(".agenda-slot-target"),agendaDrop=slot||event.target.closest("[data-agenda-drop-date]");if(agendaDrop){event.preventDefault();event.dataTransfer.dropEffect="move";agendaDrop.classList.add("agenda-drop-active");return}const col=event.target.closest(".column[data-column]");if(col){event.preventDefault();col.classList.add("drag-over")}});
  document.addEventListener("dragleave",event=>{const target=event.target.closest(".agenda-slot-target,[data-agenda-drop-date],.column,[data-project-row]");if(target&&!target.contains(event.relatedTarget))target.classList.remove("agenda-drop-active","drag-over","project-drop-before","project-drop-after")});
  document.addEventListener("drop",event=>{const project=event.target.closest("[data-project-row]");if(project&&projectDragID){event.preventDefault();const after=project.classList.contains("project-drop-after"),source=event.dataTransfer.getData("application/x-ctrl-kanb-project")||projectDragID;projectDragID=null;document.querySelectorAll(".project-drop-before,.project-drop-after,.dragging-project").forEach(element=>element.classList.remove("project-drop-before","project-drop-after","dragging-project"));reorderSpace(source,project.dataset.projectRow,after);return}const slot=event.target.closest(".agenda-slot-target"),agendaDrop=slot||event.target.closest("[data-agenda-drop-date]");if(agendaDrop){event.preventDefault();const id=event.dataTransfer.getData("application/x-ctrl-kanb-agenda")||event.dataTransfer.getData("text/plain"),card=getCard(id),date=slot?.dataset.date||agendaDrop.dataset.agendaDropDate,hour=slot?.dataset.hour||"",minute=slot?.dataset.minute||"";document.querySelectorAll(".agenda-drop-active").forEach(element=>element.classList.remove("agenda-drop-active"));moveAgendaCard(card,date,hour,minute);return}const col=event.target.closest(".column[data-column]");if(!col)return;event.preventDefault();const card=getCard(event.dataTransfer.getData("text/plain")),preset=activePreset();if(!card)return;if(["queued","running"].includes(card.status)){toast("Une tâche active ne peut pas être déplacée manuellement.",true);render();return}const targetColumn=preset.columns.find(column=>column.id===col.dataset.column);if(!targetColumn)return;if(targetColumn.kind==="planned"&&!(card.launchMode==="scheduled"&&card.scheduledAt)){toast("Pour planifier cette carte, ouvre-la et choisis une date et une heure.",true);openCardModal(card);return}if(["ideas","ready","setup"].includes(targetColumn.kind)&&card.launchMode==="scheduled"&&card.scheduledAt){toast("Retire d’abord sa planification dans la carte pour la replacer ici.",true);openCardModal(card);return}changeStatus(card,targetColumn.status);save();render()});
  document.addEventListener("pointerdown",event=>{
    const grip=event.target.closest("[data-sidebar-resize]");
    if(grip&&!board.settings.sidebarCollapsed){
      event.preventDefault();grip.setPointerCapture?.(event.pointerId);
      sidebarResize={pointerId:event.pointerId,width:clampSidebarWidth(board.settings.sidebarWidth),reportsButtons:false};
      document.body.classList.add("resizing-sidebar");return;
    }
    const utilityGrip=event.target.closest("[data-utility-resize]");
    if(utilityGrip&&board.settings.utilityPanelOpen){
      event.preventDefault();utilityGrip.setPointerCapture?.(event.pointerId);
      utilityResize={pointerId:event.pointerId,width:clampUtilityPanelWidth(board.settings.utilityPanelWidth),reportsButtons:false};
      document.body.classList.add("resizing-utility");return;
    }
    const handle=event.target.closest("[data-agenda-resize]");
    if(handle){const card=getCard(handle.dataset.agendaResize);if(!card||card.status==="done")return;event.preventDefault();event.stopPropagation();handle.setPointerCapture?.(event.pointerId);agendaResize={card,startY:event.clientY,startDuration:Number(card.durationMinutes)||60,duration:Number(card.durationMinutes)||60,eventElement:handle.closest(".agenda-event")};return}
    const eventElement=event.target.closest('[data-agenda-draggable="true"]');
    if(!eventElement)return;
    if(event.target.closest(".agenda-event-actions"))return;
    const card=getCard(eventElement.dataset.agendaCard);if(!card||["done","queued","running"].includes(card.status))return;
    eventElement.setPointerCapture?.(event.pointerId);agendaDrag={card,eventElement,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false,dropTarget:null};
  });
  document.addEventListener("pointermove",event=>{
    if(sidebarResize&&sidebarResize.pointerId===event.pointerId){
      if(event.buttons&1)sidebarResize.reportsButtons=true;
      else if(sidebarResize.reportsButtons){endSidebarResize(true);return;}
      sidebarResize.width=clampSidebarWidth(event.clientX);applySidebarWidth(sidebarResize.width);return;
    }
    if(utilityResize&&utilityResize.pointerId===event.pointerId){
      if(event.buttons&1)utilityResize.reportsButtons=true;
      else if(utilityResize.reportsButtons){endUtilityResize(true);return;}
      const viewportWidth=window.innerWidth||document.documentElement.clientWidth||1440;
      utilityResize.width=clampUtilityPanelWidth(viewportWidth-event.clientX);applyUtilityPanelWidth(utilityResize.width);return;
    }
    if(agendaResize){const delta=Math.round(((event.clientY-agendaResize.startY)/agendaHourHeight*60)/15)*15;agendaResize.duration=Math.max(15,Math.min(480,agendaResize.startDuration+delta));if(agendaResize.eventElement){agendaResize.eventElement.style.setProperty("--agenda-height",`${Math.max(28,agendaResize.duration/60*agendaHourHeight)}px`);const label=agendaResize.eventElement.querySelector(".agenda-duration");if(label)label.textContent=` · ${agendaResize.duration} min`}return}
    if(!agendaDrag||agendaDrag.pointerId!==event.pointerId)return;
    if(!agendaDrag.moved&&Math.hypot(event.clientX-agendaDrag.startX,event.clientY-agendaDrag.startY)<6)return;
    if(!agendaDrag.moved){agendaDrag.moved=true;agendaDrag.eventElement.classList.add("pointer-dragging")}
    agendaDrag.dropTarget?.classList.remove("agenda-drop-active");
    agendaDrag.dropTarget=agendaDropTargetAt(event.clientX,event.clientY);agendaDrag.dropTarget?.classList.add("agenda-drop-active");
  });
  document.addEventListener("pointerup",event=>{
    if(sidebarResize&&sidebarResize.pointerId===event.pointerId){endSidebarResize(true);return;}
    if(utilityResize&&utilityResize.pointerId===event.pointerId){endUtilityResize(true);return;}
    if(agendaResize){agendaResize.card.durationMinutes=agendaResize.duration;agendaResize.card.updatedAt=now();save();const duration=agendaResize.duration;agendaResize=null;render();toast(`Durée réglée sur ${duration} min`);return}
    if(!agendaDrag||agendaDrag.pointerId!==event.pointerId)return;
    const {card,eventElement,moved}=agendaDrag,dropTarget=agendaDropTargetAt(event.clientX,event.clientY)||agendaDrag.dropTarget;dropTarget?.classList.remove("agenda-drop-active");eventElement.classList.remove("pointer-dragging");agendaDrag=null;
    if(!moved)return;
    suppressAgendaClick=true;setTimeout(()=>{suppressAgendaClick=false},0);
    if(!dropTarget)return toast("Dépose la tâche sur un jour ou un créneau.",true);
    const slot=dropTarget.closest(".agenda-slot-target"),date=slot?.dataset.date||dropTarget.dataset.agendaDropDate,hour=slot?.dataset.hour||"",minute=slot?.dataset.minute||"";moveAgendaCard(card,date,hour,minute);
  });
  document.addEventListener("lostpointercapture",event=>{if(sidebarResize&&sidebarResize.pointerId===event.pointerId)endSidebarResize(true);if(utilityResize&&utilityResize.pointerId===event.pointerId)endUtilityResize(true)});
  document.addEventListener("pointercancel",()=>{endSidebarResize(false);endUtilityResize(false);if(agendaDrag){agendaDrag.dropTarget?.classList.remove("agenda-drop-active");agendaDrag.eventElement.classList.remove("pointer-dragging");agendaDrag=null}agendaResize=null});

  document.addEventListener("dblclick",event=>{
    if(event.target.closest("[data-sidebar-resize]")){board.settings.sidebarWidth=sidebarWidthDefault;applySidebarWidth(sidebarWidthDefault);save();toast(t("Largeur du panneau gauche rétablie."));return}
    if(event.target.closest("[data-utility-resize]")){board.settings.utilityPanelWidth=utilityPanelWidthDefault;applyUtilityPanelWidth(utilityPanelWidthDefault);save();toast(t("Largeur du panneau droit rétablie."));}
  });
  document.addEventListener("keydown",event=>{
    const key=event.key?.toLowerCase(),typing=event.target.matches?.("input,textarea,select,[contenteditable=true]"),dialog=document.querySelector("#modal-root .modal"),command=document.querySelector("#command-search");
    const agendaSlot=event.target.closest?.(".agenda-slot-target");
    if(agendaSlot&&focusAdjacentAgendaSlot(agendaSlot,key)){event.preventDefault();return}
    if(event.target.id==="utility-terminal-command"&&(key==="arrowup"||key==="arrowdown")){
      const space=utilitySpace(),terminal=space&&utilityTerminal(space.id);if(terminal?.history.length){event.preventDefault();terminal.historyIndex=Math.max(0,Math.min(terminal.history.length,terminal.historyIndex+(key==="arrowup"?-1:1)));event.target.value=terminal.history[terminal.historyIndex]||"";event.target.setSelectionRange?.(event.target.value.length,event.target.value.length)}return;
    }
    if(key==="escape"&&utilityFileMenu){event.preventDefault();utilityFileMenu=null;renderUtilityPanel();return}
    if((event.metaKey||event.ctrlKey)&&key==="k"){event.preventDefault();openCommandPalette();return}
    if((event.metaKey||event.ctrlKey)&&event.altKey&&["c","t","f"].includes(key)){event.preventDefault();openUtilityPanel({c:"chat",t:"terminal",f:"files"}[key]);return}
    if((event.metaKey||event.ctrlKey)&&key==="l"&&securityState.lockEnabled){event.preventDefault();bridge({action:"lockNow"});return}
    if((event.metaKey||event.ctrlKey)&&key==="enter"&&event.target.closest?.("#utility-chat-form,#utility-terminal-form")){event.preventDefault();event.target.closest("form")?.requestSubmit();return}
    if(key==="escape"&&dialog){event.preventDefault();closeModal();return}
    if(command&&["arrowdown","arrowup","enter"].includes(key)){event.preventDefault();if(key==="enter")runPaletteItem(paletteIndex);else{paletteIndex=(paletteIndex+(key==="arrowdown"?1:-1)+paletteItems.length)%Math.max(1,paletteItems.length);document.querySelectorAll(".command-result").forEach((node,index)=>{node.classList.toggle("selected",index===paletteIndex);if(index===paletteIndex)node.scrollIntoView({block:"nearest"})});}return}
    if((event.metaKey||event.ctrlKey)&&key==="enter"&&dialog){event.preventDefault();dialog.querySelector("form")?.requestSubmit();return}
    if(key==="tab"&&dialog){const focusable=[...dialog.querySelectorAll("button,input,textarea,select,a[href],[tabindex='0']")].filter(el=>!el.disabled&&el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}return}
    if(typing||dialog||event.altKey)return;
    if(key==="n"){event.preventDefault();event.shiftKey?openQuickCapture():openCardModal();return}
    if(key==="?"){event.preventDefault();openShortcuts();return}
    if(!event.metaKey&&!event.ctrlKey&&["1","2","3","4","5"].includes(key)){event.preventDefault();const index=Number(key);navigateTo(["","global","global","agendaView","reviewView","followView"][index],index===1?"flow":index===2?"board":null);}
  });
  function handleMenuAction(action){
    const space=getSpace(selection)||utilitySpace();
    if(action==="newTask")return openCardModal();
    if(action==="quickCapture")return openQuickCapture();
    if(action==="newProject")return openSpaceModal();
    if(action==="exportData")return bridge({action:"exportBoard"});
    if(action==="importData")return confirmImportData();
    if(action==="settings")return navigateTo("settingsView");
    if(action==="revealProject"){if(space)bridge({action:"revealPath",path:space.rootPath});else toast(t("Aucun projet sélectionné."),true);return}
    if(action==="revealData")return bridge({action:"revealData"});
    if(action==="flow")return navigateTo("global","flow");
    if(action==="board")return navigateTo("global","board");
    if(action==="agenda")return navigateTo("agendaView");
    if(action==="validations")return navigateTo("reviewView");
    if(action==="follow")return navigateTo("followView");
    if(action==="toggleSidebar"){board.settings.sidebarCollapsed=!board.settings.sidebarCollapsed;save();render();return}
    if(action==="toggleTools"){board.settings.utilityPanelOpen?closeUtilityPanel():openUtilityPanel();return}
    if(action==="toolsChat"||action==="toolsTerminal"||action==="toolsFiles")return openUtilityPanel(action.replace("tools","").toLowerCase());
    if(action==="shortcuts")return openShortcuts();
  }
  window.CodexBoard={
    menuAction({action}){handleMenuAction(action)},
    agentStatus(payload){engineAvailability={...payload,checked:true};if(selection==="settingsView"||!board.cards.length)render();else enhanceWorkspace();},
    securityStatus(payload){securityState={...payload,checked:true};if(document.querySelector("#settings-security"))render();},
    notificationAuthorizationStatus(payload){notificationAuthorization={status:String(payload?.status||"unknown")};if(document.querySelector("#settings-interface"))render();},
    agentProbeResult(payload){if(!payload?.engine)return;const cle=payload.account||activeAccountID(payload.engine),detail=payload.state==="ready"?payload.detail:friendlyAgentError(payload.detail,payload.engine),result={...payload,detail,account:cle};engineProbes={...engineProbes,[cle]:result};persistAccountCheck(cle,result);if(selection==="settingsView")render();else enhanceWorkspace();},
    appInfo(payload){
      appVersion=String(payload?.version||"");
      const mark=document.querySelector("[data-app-version]");
      if(mark)mark.textContent=t("Version {version}",{version:appVersion});
    },
    load(data){board=data;utilityAttachments=[];utilityFileMenu=null;applyLanguage(board.settings?.language);agendaMode=normalizeAgendaMode(board.settings?.agendaMode);const changed=migrate(board);const savedSyncs=board.settings.conversationSyncChecks||{};syncState={phase:"idle",completed:0,total:0,durationMs:0,lastAt:"",message:"",...(savedSyncs.codex||{})};claudeSyncState={phase:"idle",completed:0,total:0,durationMs:0,lastAt:"",message:"",...(savedSyncs["claude-code"]||{})};engineProbes={...(board.settings.accountChecks||{})};agendaAnchor=parseLocalDate(today());surfaceMode=board.settings.surfaceMode||"board";applySidebarWidth(board.settings.sidebarWidth);applyUtilityPanelWidth(board.settings.utilityPanelWidth);applyLanguage(board.settings.language);applyTheme(board.settings.theme,board.settings.themePalette);applyFontSize(board.settings.fontSize);const archived=applyAutoArchiveCompleted();if(selection!=="global"&&!specialViews[selection]&&!selection.startsWith("taxonomy:")&&!getSpace(selection))selection="global";bridge({action:"setConcurrency",codex:concurrencyFor("codex"),claude:concurrencyFor("claude-code")});bridge({action:"notificationStatus"});if(changed||archived)save();render();if(board.settings.utilityPanelOpen&&board.settings.utilityTab==="terminal")setTimeout(()=>startUtilityTerminal(utilitySpace()),0);if(archived)toast(`${archived} carte${archived>1?"s":""} archivée${archived>1?"s":""} automatiquement`);if(board.settings.autoSync)setTimeout(()=>syncAllNow(true),700);setTimeout(schedulerTick,1000)},
    folderChosen({path}){folderCallback?.(path)},
    utilityFolderChosen({path}){
      const chosen=String(path||"").trim();if(!chosen)return;
      const previous=board.settings.utilityCustomPath;
      if(previous&&previous!==chosen){
        const oldChatIDs=new Set((board.utilityChats||[]).filter(chat=>chat.spaceID==="utility-custom").map(chat=>chat.id));
        board.utilityChats=(board.utilityChats||[]).filter(chat=>chat.spaceID!=="utility-custom");
        board.validations=validations().filter(validation=>!oldChatIDs.has(validation.cardID));
        utilityTerminals.delete("utility-custom");utilityFileStates.delete("utility-custom");
      }
      board.settings.utilityCustomPath=chosen;board.settings.utilitySpaceID="utility-custom";utilityDraft="";utilityAttachments=[];utilityFileMenu=null;save();render();
      if(board.settings.utilityTab==="files")loadUtilityFiles("utility-custom","");
      toast(previous&&previous!==chosen?t("Nouveau dossier choisi. Une nouvelle conversation sera créée au premier envoi."):t("Dossier de travail choisi."));
    },
    utilityAttachmentsChosen({files=[]}){
      files=Array.isArray(files)?files:[];
      const existing=new Set(utilityAttachments.map(attachment=>attachment.path));
      for(const candidate of files){const attachment=normalizeUtilityAttachment(candidate);if(!attachment||existing.has(attachment.path)||utilityAttachments.length>=utilityAttachmentLimit)continue;utilityAttachments.push(attachment);existing.add(attachment.path)}
      if(files.length&&utilityAttachments.length>=utilityAttachmentLimit)toast(t("Tu peux joindre jusqu’à {n} fichiers.",{n:utilityAttachmentLimit}),true);
      renderUtilityPanel();
    },
    utilityProjectFileAdded({spaceID,path,name}){
      const space=utilitySpace();if(!space||spaceID&&space.id!==spaceID)return toast(t("Le dossier actif a changé. Réessaie depuis sa liste de fichiers."),true);
      const attachment=normalizeUtilityAttachment({path,name});if(!attachment)return toast(t("Impossible d’ajouter ce fichier au chat."),true);
      if(utilityAttachments.some(item=>item.path===attachment.path)){board.settings.utilityTab="chat";save();render();toast(t("Ce fichier est déjà joint au prochain message."));return}
      if(utilityAttachments.length>=utilityAttachmentLimit)return toast(t("Tu peux joindre jusqu’à {n} fichiers.",{n:utilityAttachmentLimit}),true);
      utilityAttachments.push(attachment);utilityFileMenu=null;board.settings.utilityTab="chat";save();render();toast(t("Fichier ajouté au prochain message."));
    },
    projectFilePathCopied(){toast(t("Chemin d’accès copié."))},
    projectFileSaved({path}){toast(t("Copie enregistrée dans « {nom} ».",{nom:String(path||"").split("/").filter(Boolean).at(-1)||t("Fichier")}))},
    boardExported({path}){toast(t("Sauvegarde exportée dans « {nom} ».",{nom:String(path||"").split("/").filter(Boolean).at(-1)||t("Fichier")}))},
    boardImported({board:restored,message}){if(restored?.spaces&&restored?.cards){const prepared=prepareImportedBoard(restored);selection="global";lastWorkspaceSelection="global";this.load(prepared.board);if(prepared.changed)save()}toast(message||t("Sauvegarde restaurée. Les programmations sont en pause jusqu’à leur reprise manuelle."))},
    nativeError({message}){toast(friendlyNativeError(message),true)},nativeWarning({message}){toast(friendlyNativeError(message),true)},
    boardMerged({board:latest,message}){if(latest?.spaces&&latest?.cards)this.load(latest);toast(message||t("Les changements faits en parallèle ont été réunis."))},
    boardSaveConflict({board:latest,message}){if(latest?.spaces&&latest?.cards)this.load(latest);toast(message||t("Le tableau a changé sur le disque et vient d’être rechargé."),true)},
    backgroundSchedulerStatus(payload){backgroundSchedulerState={...backgroundSchedulerState,...(payload||{})};if(typeof payload?.enabled==="boolean"&&board.settings.backgroundSchedulerEnabled!==payload.enabled){board.settings.backgroundSchedulerEnabled=payload.enabled;save()}render();if(payload?.error)toast(t("Moteur local : {message}",{message:friendlyNativeError(payload.error)}),true)},
    runnerStarted({cardID}){const c=getCard(cardID);if(!c)return;activeRuns.add(cardID);queuePositions.delete(cardID);queueReasons.delete(cardID);c.executionState="";delete c.pausedAt;if(c.utilityChat){c.status="running";c.updatedAt=now()}else changeStatus(c,"running");c.lastRun={...(c.lastRun||{}),summary:`${engineLabel(c.agentEngine)} travaille…`};save();render()},
    queueUpdated({items}){queuePositions.clear();queueReasons.clear();for(const item of items||[]){queuePositions.set(item.cardID,item.position);queueReasons.set(item.cardID,item.reason||"capacity");const c=getCard(item.cardID);if(c&&!activeRuns.has(c.id))c.status="queued"}render()},
    // Le registre des executions ne vit qu en memoire : apres un rechargement de
    // la vue, seul le natif sait ce qui tourne encore. Sans cela une tache active
    // reaffiche « Lancer » et un second lancement devient possible.
    // Le natif n a pas pu transmettre la reponse : le tour visé n existe plus.
    // Sans cela l interface confirmait une autorisation qui n est jamais partie.
    requestUnresolved({cardID,requestID}){
      const validation=validations().find(item=>item.cardID===cardID&&String(item.requestID)===String(requestID));
      // La demande est deja passee a « accepted » par la reponse optimiste ; on
      // la corrige. En revanche on ne touche pas a une demande que l agent a
      // bien confirmee entre-temps.
      if(!validation||validation.status==="resolved")return;
      validation.status="interrupted";validation.decision="";validation.decidedAt=now();
      validation.note="La réponse n’a pas pu être transmise : l’exécution concernée n’était plus active. Relance la tâche pour obtenir une nouvelle demande.";
      save();render();
      toast(t("Réponse non transmise : l’exécution concernée s’est arrêtée."),true);
    },
    runsRestored({running=[],queued=[]}){
      activeRuns.clear();queuePositions.clear();queueReasons.clear();let changed=false;
      for(const id of running){const c=getCard(id);if(!c)continue;activeRuns.add(id);
        if(c.status!=="running"){c.status="running";c.lastRun={...(c.lastRun||{}),summary:t("Exécution toujours en cours.")};changed=true}}
      queued.forEach((id,index)=>{const c=getCard(id);if(!c)return;queuePositions.set(id,index+1);queueReasons.set(id,"capacity");
        if(c.status!=="queued"){c.status="queued";c.lastRun={...(c.lastRun||{}),summary:t("Toujours dans la file.")};changed=true}});
      if(changed)save();
      render();
    },
    runnerCanceled({cardID}){const c=getCard(cardID);if(c){activeRuns.delete(cardID);queuePositions.delete(cardID);queueReasons.delete(cardID);for(const validation of validations().filter(item=>item.cardID===c.id&&item.status==="pending")){validation.status="interrupted";validation.decidedAt=now();validation.note="L’exécution a été arrêtée avant la réponse.";}if(c.utilityChat){c.status="ready";c.executionState="";c.lastRun={...(c.lastRun||{}),finishedAt:now(),summary:t("Réponse arrêtée. La conversation est conservée.")};save();render();toast(t("Réponse arrêtée"));return}const suspended=c.executionState==="pausing"||c.executionState==="paused";if(suspended){c.executionState="paused";c.pausedAt=c.pausedAt||now();changeStatus(c,"running");c.lastRun={...(c.lastRun||{}),finishedAt:now(),summary:t("Tâche arrêtée. La conversation est conservée et peut être reprise.")};toast(t("Tâche arrêtée"));}else{c.executionState="";delete c.pausedAt;changeStatus(c,"ready");if(c.launchMode==="scheduled"){c.scheduleState="paused";c.scheduleNote="Programmation suspendue après retrait manuel de la file."}c.lastRun={...(c.lastRun||{}),summary:"Retirée de la file."};}save();render()}},
    conversationAssociated({cardID,threadID,name,preview,cwd,engine,projectID,projectName,accountID,created=false,recovered=false}){
      const c=getCard(cardID);if(!c)return;
      const previous=c.utilityChat?currentUtilityConversation(c):null;
      if(c.utilityChat&&recovered&&previous){const pending=(c.messages||[]).slice(-1);previous.messages=structuredClone((c.messages||[]).slice(0,-1));c.messages=pending;}
      const latestUser=[...(c.messages||[])].reverse().find(message=>message.role==="user"),localName=c.utilityChat&&created?utilityConversationTitle(latestUser?.text,latestUser?.attachments,c.agentEngine):name||c.title;
      if(c.utilityChat&&created)c.title=localName;
      addConversationToCard(c,{id:threadID,engine:engine||c.agentEngine||"codex",name:localName,preview:preview||"",cwd:cwd||"",projectID:projectID||"",projectName:projectName||"",accountID:accountID||activeAccountID(engine||c.agentEngine||"codex"),linkedAt:now()},"main");
      if(c.utilityChat){c.utilityNewConversation=false;const conv=currentUtilityConversation(c);if(conv)conv.messages=structuredClone(c.messages||[])}
      else if(isClaude(c)){const conv=activeConversation(c);conv.messages||=[];if(!conv.messages.length)conv.messages.push({role:"user",text:c.prompt,at:now()});}
      if(c.lastRun)c.lastRun.threadID=threadID;save();render();if(recovered)toast(utilityActiveWriterRecoveredMessage());else if(created&&!isClaude(c))toast(t("Conversation créée dans Codex. Son apparition dans la liste peut prendre quelques secondes."));
    },
    conversationsLoaded({conversations:items}){conversations=items||[];renderConversationPicker()},conversationsFailed({message}){modal(`<h2>Conversations indisponibles</h2><p class="lead">${esc(friendlyAgentError(message,"codex"))}</p><div class="modal-actions"><button class="secondary" data-action="close-modal">${t("Fermer")}</button></div>`)},
    syncStarted({total=syncState.total}){if(!syncing)return;syncState.total=total;syncState.completed=0;syncState.phase="running";renderSyncStatus()},
    syncProgress({completed=0,total=syncState.total}){if(!syncing)return;syncState.completed=completed;syncState.total=total;renderSyncStatus()},
    syncSlow({completed=syncState.completed,total=syncState.total}){if(!syncing)return;syncState.completed=completed;syncState.total=total;syncState.phase="slow";renderSyncStatus()},
    conversationsSynced({conversations:items,total=syncState.total,failed=0,durationMs=0}){for(const thread of items||[])applyConversationSync(thread);const silent=syncState.silent;syncing=false;const completed=Math.max(0,total-failed),phase=failed?(completed?"partial":"error"):"success",message=failed?tn(failed,"{completed}/{total} conversations Codex relues. {n} conversation est inaccessible.","{completed}/{total} conversations Codex relues. {n} conversations sont inaccessibles.",{completed,total}):"";syncState={phase,completed,total,failed,durationMs,lastAt:now(),message};rememberConversationSync("codex",syncState);save();render();if(!silent)toast(failed?syncState.message:t("Actualisation Codex terminée en {duration}.",{duration:syncDurationLabel(durationMs)}),Boolean(failed))},
    syncFailed({message,completed=syncState.completed,total=syncState.total}){const silent=syncState.silent;syncing=false;syncState={phase:"error",completed,total,failed:Math.max(0,total-completed),durationMs:0,lastAt:now(),message:message?friendlyAgentError(message,"codex"):t("Codex n’a pas répondu dans le délai prévu. Clique pour réessayer.")};rememberConversationSync("codex",syncState);save();renderHeader();renderSyncStatus();if(!silent)toast(syncState.message,true)},
    claudeSyncStarted({total=claudeSyncState.total}){if(!claudeSyncing)return;claudeSyncState.total=total;claudeSyncState.completed=0;claudeSyncState.phase="running";renderSyncStatus()},
    claudeSessionsSynced({sessions=[],total=claudeSyncState.total,failed=0,durationMs=0}){for(const session of sessions)applyClaudeSessionSync(session);const silent=claudeSyncState.silent;claudeSyncing=false,completed=Math.max(0,total-failed),phase=!total?"empty":failed?(completed?"partial":"error"):"success",message=failed?tn(failed,"{completed}/{total} sessions Claude relues. {n} session Claude locale est introuvable.","{completed}/{total} sessions Claude relues. {n} sessions Claude locales sont introuvables.",{completed,total}):"";claudeSyncState={phase,completed,total,failed,durationMs,lastAt:now(),message};rememberConversationSync("claude-code",claudeSyncState);save();render();if(!silent)toast(failed?message:t("Actualisation Claude terminée en {duration}.",{duration:syncDurationLabel(durationMs)}),Boolean(failed))},
    claudeSyncFailed({message,total=claudeSyncState.total}){const silent=claudeSyncState.silent;claudeSyncing=false;claudeSyncState={phase:"error",completed:0,total,failed:total,durationMs:0,lastAt:now(),message:message?friendlyAgentError(message,"claude-code"):t("Les sessions Claude n’ont pas pu être relues.")};rememberConversationSync("claude-code",claudeSyncState);save();renderHeader();renderSyncStatus();if(!silent)toast(claudeSyncState.message,true)},
    conversationDetailLoaded({cardID,conversation}){const c=getCard(cardID);if(c&&cardID===detailCardID&&conversation?.id===detailThreadID&&document.querySelector(".conversation-drawer,.drawer-loading"))renderConversationDetail(c,conversation)},
    conversationDetailFailed({cardID,threadID,message}){if(cardID!==detailCardID||(threadID&&threadID!==detailThreadID)||!document.querySelector(".conversation-drawer,.drawer-loading"))return;const c=getCard(cardID),friendly=friendlyAgentError(message,c?.agentEngine||"codex");if(document.querySelector("#conversation-message-form")){toast(friendly,true);return}modal(`<h2>${t("Conversation indisponible")}</h2><p class="lead">${esc(friendly)}</p><div class="modal-actions"><button class="secondary" data-action="close-modal">${t("Fermer")}</button></div>`)},
    runnerEvent(event){const c=getCard(event.cardID);if(c&&event.message){c.lastRun={...(c.lastRun||{}),summary:event.message};c.utilityChat?renderUtilityPanel():render()}},approvalRequested(payload){registerValidation(payload)},requestResolved({cardID,requestID}){resolveValidation(cardID,requestID??null)},
    runnerFinished(result){const c=getCard(result.cardID);if(!c)return;if(c.executionState==="pausing"){window.CodexBoard.runnerCanceled({cardID:c.id});return}activeRuns.delete(c.id);queuePositions.delete(c.id);queueReasons.delete(c.id);c.executionState="";delete c.pausedAt;for(const validation of validations().filter(item=>item.cardID===c.id&&item.status==="pending")){validation.status="interrupted";validation.decidedAt=now();validation.note="L’exécution s’est terminée avant qu’une réponse soit enregistrée.";}const rawFailure=result.error||result.summary||"",answer=result.success?String(result.summary||t("Le moteur n’a pas renvoyé de texte.")):friendlyAgentError(rawFailure,c.agentEngine);if(c.utilityChat){c.status="ready";c.updatedAt=now();c.messages||=[];c.messages.push({role:"assistant",text:answer,at:now(),error:!result.success});c.messages=c.messages.slice(-120);const conv=currentUtilityConversation(c);if(conv){conv.preview=answer;conv.messages=structuredClone(c.messages)}c.lastRun={...(c.lastRun||{}),finishedAt:now(),threadID:result.threadID||c.lastRun?.threadID,exitCode:result.exitCode,summary:answer};save();render();toast(result.success?t("Réponse reçue dans le chat"):t("Le chat a rencontré une erreur"),!result.success,"essential");return}if(isClaude(c)&&activeConversation(c)){const conv=activeConversation(c);conv.messages||=[];conv.messages.push({role:"assistant",text:answer,at:now(),error:!result.success});conv.messages=conv.messages.slice(-80);conv.preview=answer;}if(!result.success&&c.launchMode==="scheduled"&&quotaError(rawFailure)){const attempts=Number(c.scheduleAttempts||0)+1,delayMinutes=Math.min(240,15*(2**Math.min(attempts-1,4)));c.status="ready";c.scheduleState="waitingQuota";c.scheduleAttempts=attempts;c.scheduleNextAttemptAt=new Date(Date.now()+delayMinutes*60000).toISOString();c.scheduleNote="Limite d’usage détectée. Nouvel essai dans {n} min.";c.scheduleNoteVars={n:delayMinutes};c.lastRun={...(c.lastRun||{}),finishedAt:now(),exitCode:result.exitCode,summary:t(c.scheduleNote,c.scheduleNoteVars)};save();render();toast("Limite Codex — tâche conservée pour un nouvel essai",true);return}changeStatus(c,result.success?"review":"needsInput");if(c.launchMode==="scheduled")c.scheduleState=result.success?"completed":"failed";c.lastRun={...(c.lastRun||{}),finishedAt:now(),threadID:result.threadID||c.lastRun?.threadID,exitCode:result.exitCode,summary:answer};save();render();toast(result.success?"Tâche terminée — résultat à relire":"Échec d’exécution — résultat à vérifier",!result.success,"essential")},
    terminalStarted({terminalID,path}){for(const terminal of utilityTerminals.values())if(terminal.id===terminalID){terminal.starting=false;terminal.running=true;terminal.path=path||terminal.path;renderUtilityPanel();requestAnimationFrame(()=>document.querySelector("#utility-terminal-command")?.focus());break}},
    terminalOutput({terminalID,text}){for(const terminal of utilityTerminals.values())if(terminal.id===terminalID){let raw=String(text||"");if(terminal.pendingEcho){terminal.echoBuffer+=raw;const end=terminal.echoBuffer.indexOf("\n");if(end<0)break;raw=terminal.echoBuffer.slice(end+1);terminal.pendingEcho=false;terminal.echoBuffer=""}if(/\x1b\[(?:2J|3J)/.test(raw))terminal.output="";terminal.output=terminalText(terminal.output+raw).slice(-120000);const output=document.querySelector("#utility-terminal-output");if(output){output.textContent=terminal.output;output.scrollTop=output.scrollHeight}break}},
    terminalStopped({terminalID,exitCode=0,message=""}){for(const terminal of utilityTerminals.values())if(terminal.id===terminalID){terminal.starting=false;terminal.running=false;if(message||exitCode)terminal.output+=`\n${message||t("Session terminée (code {n}).",{n:exitCode})}\n`;renderUtilityPanel();break}},
    terminalFailed({terminalID,message}){const friendly=friendlyNativeError(message);for(const terminal of utilityTerminals.values())if(terminal.id===terminalID){terminal.starting=false;terminal.running=false;terminal.output+=`\n${friendly}\n`;renderUtilityPanel();break}toast(friendly,true)},
    projectFilesLoaded({spaceID,relativePath="",entries=[]}){utilityFileMenu=null;const state=utilityFiles(spaceID);state.path=relativePath;state.entries=entries;state.loading=false;state.loaded=true;state.error="";renderUtilityPanel()},
    projectFilesFailed({spaceID,message}){utilityFileMenu=null;const state=utilityFiles(spaceID);state.loading=false;state.loaded=true;state.error=message?friendlyNativeError(message):t("Impossible de lire ce dossier.");renderUtilityPanel()},
    projectFileFailed({message}){toast(message?friendlyNativeError(message):t("Impossible d’ouvrir ce fichier."),true)}
  };
  // La cadence de synchronisation vient des reglages : le compteur bat toutes les
  // dix secondes et ne declenche que lorsque l intervalle choisi est atteint.
  let lastSyncAt=0;
  setInterval(()=>{
    if(!board.settings?.autoSync)return;
    const interval=normalizeSyncInterval(board.settings.syncIntervalSeconds)*1000;
    if(Date.now()-lastSyncAt<interval)return;
    lastSyncAt=Date.now();syncAllNow(true);
  },10000);setInterval(schedulerTick,30000);bridge({action:"ready"});bridge({action:"agentStatus"});bridge({action:"securityStatus"});
})();
