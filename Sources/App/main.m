#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <UserNotifications/UserNotifications.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import "AppServerClient.h"
#import <sys/file.h>
#import <sys/stat.h>
#import <fcntl.h>
#import <unistd.h>
#import <errno.h>

static NSString *ISODate(void) {
    return [[[NSISO8601DateFormatter alloc] init] stringFromDate:[NSDate date]];
}

static NSString *UUIDString(void) {
    return NSUUID.UUID.UUIDString.lowercaseString;
}

static void RemoveTemporaryFileLater(NSString *path) {
    if (!path.length) return;
    NSString *temporaryPath = [path copy];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_SEC), dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        [NSFileManager.defaultManager removeItemAtPath:temporaryPath error:nil];
    });
}

static NSString *EnvValue(NSString *name) {
    NSDictionary *env = NSProcessInfo.processInfo.environment;
    return env[[@"CTRL_KANB_" stringByAppendingString:name]];
}

static void AppendDirectory(NSMutableArray<NSString *> *directories, NSString *path) {
    if (![path isKindOfClass:NSString.class] || !path.length) return;
    NSString *absolute = [[path stringByExpandingTildeInPath] stringByStandardizingPath];
    if (absolute.isAbsolutePath && ![directories containsObject:absolute]) [directories addObject:absolute];
}

static NSArray<NSString *> *AgentCommandDirectories(void) {
    NSDictionary *env = NSProcessInfo.processInfo.environment;
    NSString *home = NSHomeDirectory();
    NSMutableArray<NSString *> *directories = [NSMutableArray array];
    for (NSString *path in @[@"/opt/homebrew/bin", @"/usr/local/bin", @"/usr/bin", @"/bin",
                             [home stringByAppendingPathComponent:@".local/bin"],
                             [home stringByAppendingPathComponent:@"bin"],
                             [home stringByAppendingPathComponent:@".npm-global/bin"],
                             [home stringByAppendingPathComponent:@".volta/bin"],
                             [home stringByAppendingPathComponent:@".bun/bin"],
                             [home stringByAppendingPathComponent:@"Library/pnpm"],
                             [home stringByAppendingPathComponent:@".local/share/mise/shims"],
                             [home stringByAppendingPathComponent:@".asdf/shims"]]) AppendDirectory(directories, path);
    for (NSString *variable in @[@"NVM_BIN", @"VOLTA_HOME", @"BUN_INSTALL", @"PNPM_HOME"]) {
        NSString *path = env[variable];
        if ([variable isEqualToString:@"VOLTA_HOME"] || [variable isEqualToString:@"BUN_INSTALL"]) path = [path stringByAppendingPathComponent:@"bin"];
        AppendDirectory(directories, path);
    }
    if ([env[@"ASDF_DATA_DIR"] length]) AppendDirectory(directories, [env[@"ASDF_DATA_DIR"] stringByAppendingPathComponent:@"shims"]);
    if ([env[@"MISE_DATA_DIR"] length]) AppendDirectory(directories, [env[@"MISE_DATA_DIR"] stringByAppendingPathComponent:@"shims"]);
    for (NSString *path in [env[@"PATH"] componentsSeparatedByString:@":"]) AppendDirectory(directories, path);

    NSString *nvmRoot = [home stringByAppendingPathComponent:@".nvm/versions/node"];
    for (NSString *version in [NSFileManager.defaultManager contentsOfDirectoryAtPath:nvmRoot error:nil] ?: @[])
        AppendDirectory(directories, [[nvmRoot stringByAppendingPathComponent:version] stringByAppendingPathComponent:@"bin"]);
    for (NSString *fnmRoot in @[[home stringByAppendingPathComponent:@".local/share/fnm/node-versions"],
                                [home stringByAppendingPathComponent:@"Library/Application Support/fnm/node-versions"]])
        for (NSString *version in [NSFileManager.defaultManager contentsOfDirectoryAtPath:fnmRoot error:nil] ?: @[])
            AppendDirectory(directories, [[fnmRoot stringByAppendingPathComponent:version] stringByAppendingPathComponent:@"installation/bin"]);
    return directories;
}

static NSString *FindAgentExecutable(NSString *name, NSArray<NSString *> *overrides, NSArray<NSString *> *bundledPaths) {
    NSMutableArray<NSString *> *candidates = [NSMutableArray array];
    for (NSString *path in overrides) if (path.length) [candidates addObject:path];
    [candidates addObjectsFromArray:bundledPaths ?: @[]];
    for (NSString *directory in AgentCommandDirectories()) [candidates addObject:[directory stringByAppendingPathComponent:name]];
    for (NSString *candidate in candidates) {
        NSString *absolute = [[candidate stringByExpandingTildeInPath] stringByStandardizingPath];
        BOOL directory = NO;
        if (absolute.isAbsolutePath && [NSFileManager.defaultManager fileExistsAtPath:absolute isDirectory:&directory] && !directory && [NSFileManager.defaultManager isExecutableFileAtPath:absolute]) return absolute;
    }
    return nil;
}

static NSString *BoardDataPath(void) {
    NSString *override = EnvValue(@"DATA_FILE");
    if (override.length) return override.stringByStandardizingPath;
    NSString *support = NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES).firstObject;
    return [support stringByAppendingPathComponent:@"CTRL KANB/board.json"];
}

static BOOL EnsurePrivateDirectoryAtPath(NSString *folder) {
    if (!folder.length) return NO;
    struct stat info;
    if (lstat(folder.fileSystemRepresentation, &info) != 0) {
        if (errno != ENOENT || ![NSFileManager.defaultManager createDirectoryAtPath:folder withIntermediateDirectories:YES attributes:@{ NSFilePosixPermissions:@(0700) } error:nil]) return NO;
        if (lstat(folder.fileSystemRepresentation, &info) != 0) return NO;
    }
    if (!S_ISDIR(info.st_mode) || S_ISLNK(info.st_mode)) return NO;
    return chmod(folder.fileSystemRepresentation, 0700) == 0;
}

static BOOL BoardDataDirectoryIsReal(void) {
    NSString *folder = BoardDataPath().stringByDeletingLastPathComponent;
    struct stat info;
    return lstat(folder.fileSystemRepresentation, &info) == 0 && S_ISDIR(info.st_mode) && !S_ISLNK(info.st_mode);
}

static BOOL PathIsInsideRoot(NSString *requestedPath, NSString *rootPath) {
    if (![requestedPath isKindOfClass:NSString.class] || !requestedPath.length || !rootPath.length) return NO;
    NSString *root = [[[rootPath stringByExpandingTildeInPath] stringByStandardizingPath] stringByResolvingSymlinksInPath];
    NSString *candidate = [requestedPath stringByExpandingTildeInPath];
    if (!candidate.isAbsolutePath) candidate = [root stringByAppendingPathComponent:candidate];
    candidate = [[candidate stringByStandardizingPath] stringByResolvingSymlinksInPath];
    return [candidate isEqualToString:root] || [candidate hasPrefix:[root stringByAppendingString:@"/"]];
}

static BOOL ClaudeReadInputStaysInProject(NSString *tool, NSDictionary *input, NSString *rootPath) {
    if ([tool isEqualToString:@"Glob"]) {
        NSString *pattern = [input[@"pattern"] isKindOfClass:NSString.class] ? input[@"pattern"] : @"";
        // Glob interprete son motif comme un chemin. Sans ce controle, un motif
        // absolu ou contenant ".." pourrait sortir du dossier sans champ path.
        if (!pattern.length || pattern.isAbsolutePath || [pattern hasPrefix:@"~"] ||
            [pattern.pathComponents containsObject:@".."]) return NO;
    }
    NSString *key = [tool isEqualToString:@"Read"] ? @"file_path" : @"path";
    id rawPath = input[key];
    // Glob et Grep sans chemin utilisent leur repertoire de travail, deja fixe
    // sur le projet. Read doit toujours designer explicitement un fichier.
    if (![rawPath isKindOfClass:NSString.class] || ![rawPath length]) return ![tool isEqualToString:@"Read"];
    return PathIsInsideRoot(rawPath, rootPath);
}

static NSString *BoardPreviousPath(void) {
    return [[BoardDataPath() stringByDeletingPathExtension] stringByAppendingString:@".previous.json"];
}

static NSString *BoardEventsPath(void) {
    return [[BoardDataPath() stringByDeletingLastPathComponent] stringByAppendingPathComponent:@"events.jsonl"];
}

static NSString *BoardConflictPath(void) {
    return [[BoardDataPath() stringByDeletingPathExtension] stringByAppendingString:@".conflict.json"];
}

static void SecureDataFile(NSString *path);

static NSData *ReadRegularDataFile(NSString *path) {
    struct stat info;
    if (lstat(path.fileSystemRepresentation, &info) != 0 || !S_ISREG(info.st_mode)) return nil;
    return [NSData dataWithContentsOfFile:path];
}

static BOOL RegularFileOrMissing(NSString *path) {
    struct stat info;
    if (lstat(path.fileSystemRepresentation, &info) != 0) return errno == ENOENT;
    return S_ISREG(info.st_mode) && !S_ISLNK(info.st_mode);
}

static BOOL WritePrivateDataFile(NSData *data, NSString *path, NSError **error) {
    if (!data || !RegularFileOrMissing(path)) {
        if (error) *error=[NSError errorWithDomain:@"CTRLKANBData" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Refus d’écrire dans un lien symbolique ou un fichier spécial."}];
        return NO;
    }
    if (![data writeToFile:path options:NSDataWritingAtomic error:error]) return NO;
    SecureDataFile(path);
    struct stat info;
    return lstat(path.fileSystemRepresentation,&info)==0 && S_ISREG(info.st_mode);
}

// Le journal d evenements sert au diagnostic : c est lui qui permet de dire, apres
// coup, si l application s est arretee normalement ou si elle a ete tuee. Un
// « app.launched » sans « app.terminating » correspondant signifie qu elle n a pas
// eu la main pour se fermer.
static void AppendBoardEvent(NSDictionary *fields) {
    if (!BoardDataDirectoryIsReal()) return;
    NSMutableDictionary *event = [fields mutableCopy];
    event[@"at"] = ISODate();
    NSData *data = [NSJSONSerialization dataWithJSONObject:event options:0 error:nil];
    if (!data) return;
    NSMutableData *line = [data mutableCopy];
    [line appendData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]];
    NSString *path = BoardEventsPath();
    // O_NOFOLLOW empeche un lien events.jsonl plante dans le dossier de donnees
    // de detourner le journal vers un fichier situe ailleurs sur le Mac.
    int descriptor = open(path.fileSystemRepresentation, O_WRONLY | O_APPEND | O_CREAT | O_NOFOLLOW, 0600);
    if (descriptor < 0) return;
    fchmod(descriptor, 0600);
    const uint8_t *bytes = line.bytes;
    NSUInteger remaining = line.length;
    while (remaining > 0) {
        ssize_t written = write(descriptor, bytes, remaining);
        if (written < 0 && errno == EINTR) continue;
        if (written <= 0) break;
        bytes += written;
        remaining -= (NSUInteger)written;
    }
    close(descriptor);
}

static NSString *SchedulerStatusPath(void) {
    return [[BoardDataPath() stringByDeletingLastPathComponent] stringByAppendingPathComponent:@"scheduler-status.json"];
}

// Le Kanban stocke des consignes, des chemins de projet et des echanges d agent.
// Ces fichiers restent lisibles par le seul compte de l utilisateur.
static void SecureDataFile(NSString *path) {
    if (!path.length) return;
    struct stat info;
    if (lstat(path.fileSystemRepresentation, &info) != 0 || !S_ISREG(info.st_mode)) return;
    chmod(path.fileSystemRepresentation, 0600);
}

// NSDataWritingAtomic ecrit dans un fichier temporaire puis renomme :
// les droits doivent etre reappliques apres chaque ecriture, pas une seule fois.
static void SecureFolderTree(NSString *folder) {
    if (!folder.length) return;
    NSFileManager *files = NSFileManager.defaultManager;
    struct stat folderInfo;
    if (lstat(folder.fileSystemRepresentation, &folderInfo) != 0 || !S_ISDIR(folderInfo.st_mode)) return;
    chmod(folder.fileSystemRepresentation, 0700);
    for (NSString *name in [files contentsOfDirectoryAtPath:folder error:nil]) {
        NSString *path = [folder stringByAppendingPathComponent:name];
        struct stat childInfo;
        if (lstat(path.fileSystemRepresentation, &childInfo) != 0 || S_ISLNK(childInfo.st_mode)) continue;
        if (S_ISDIR(childInfo.st_mode)) { SecureFolderTree(path); continue; }
        if (S_ISREG(childInfo.st_mode)) chmod(path.fileSystemRepresentation, 0600);
    }
}

static void SecureDataDirectory(void) {
    NSString *folder = BoardDataPath().stringByDeletingLastPathComponent;
    if (EnsurePrivateDirectoryAtPath(folder)) SecureFolderTree(folder);
}

static NSString *SchedulerLabel(void) {
    return @"app.ctrlkanb.macos.scheduler";
}

static NSString *SchedulerLaunchAgentsDirectory(void) {
    NSString *override = EnvValue(@"LAUNCH_AGENTS_DIR");
    if (override.length) return override.stringByStandardizingPath;
    return [NSHomeDirectory() stringByAppendingPathComponent:@"Library/LaunchAgents"];
}

static NSString *SchedulerPlistPath(void) {
    return [SchedulerLaunchAgentsDirectory() stringByAppendingPathComponent:[SchedulerLabel() stringByAppendingPathExtension:@"plist"]];
}

static int EngineProcessLockDescriptor = -1;

static BOOL AcquireEngineProcessLock(void) {
    NSString *folder = BoardDataPath().stringByDeletingLastPathComponent;
    if (!EnsurePrivateDirectoryAtPath(folder)) return NO;
    NSString *lockPath = [folder stringByAppendingPathComponent:@"engine.lock"];
    EngineProcessLockDescriptor = open(lockPath.fileSystemRepresentation, O_CREAT | O_RDWR | O_NOFOLLOW, 0600);
    if (EngineProcessLockDescriptor < 0) return NO;
    if (flock(EngineProcessLockDescriptor, LOCK_EX | LOCK_NB) != 0) {
        close(EngineProcessLockDescriptor);
        EngineProcessLockDescriptor = -1;
        return NO;
    }
    return YES;
}

static void ReleaseEngineProcessLock(void) {
    if (EngineProcessLockDescriptor >= 0) {
        flock(EngineProcessLockDescriptor, LOCK_UN);
        close(EngineProcessLockDescriptor);
        EngineProcessLockDescriptor = -1;
    }
}

// L interface native suit la langue choisie dans le plan de travail. Le reglage
// vit dans board.json : le natif le relit plutot que de tenir un second etat qui
// finirait par diverger. La valeur est mise en cache et rafraichie a chaque
// enregistrement du tableau.
static NSString *CachedLanguage = nil;

static void RefreshAppLanguage(void) {
    NSData *data = ReadRegularDataFile(BoardDataPath());
    id board = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    NSString *value = [board isKindOfClass:NSDictionary.class] ? board[@"settings"][@"language"] : nil;
    if ([value isEqualToString:@"fr"] || [value isEqualToString:@"en"]) { CachedLanguage = value; return; }
    NSString *system = NSLocale.preferredLanguages.firstObject ?: @"fr";
    CachedLanguage = [system.lowercaseString hasPrefix:@"en"] ? @"en" : @"fr";
}

// Les préférences vivent dans board.json et sont relues après chaque sauvegarde.
// Le moteur natif applique le canal, le moment et la catégorie avant de remettre
// une alerte à macOS. La carte peut ensuite hériter, forcer ou couper l alerte.
static NSDictionary *CachedNotificationSettings = nil;

static NSDictionary *NotificationConfiguration(void) {
    if (CachedNotificationSettings) return CachedNotificationSettings;
    NSData *data = ReadRegularDataFile(BoardDataPath());
    id board = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    NSDictionary *settings = [board isKindOfClass:NSDictionary.class] && [board[@"settings"] isKindOfClass:NSDictionary.class] ? board[@"settings"] : @{};
    NSString *legacy = [settings[@"notifications"] isKindOfClass:NSString.class] ? settings[@"notifications"] : @"all";
    NSNumber *storedEnabled = [settings[@"systemNotificationsEnabled"] isKindOfClass:NSNumber.class] ? settings[@"systemNotificationsEnabled"] : nil;
    BOOL enabled = storedEnabled ? storedEnabled.boolValue : ![legacy isEqualToString:@"none"];
    NSString *when = [settings[@"notificationWhen"] isKindOfClass:NSString.class] ? settings[@"notificationWhen"] : ([legacy isEqualToString:@"all"] ? @"all" : @"background");
    if (![@[@"all", @"background"] containsObject:when]) when = @"background";
    NSDictionary *storedEvents = [settings[@"notificationEvents"] isKindOfClass:NSDictionary.class] ? settings[@"notificationEvents"] : @{};
    NSMutableDictionary *events = [NSMutableDictionary dictionary];
    for (NSString *key in @[@"taskComplete", @"taskFailed", @"approval", @"chatReply", @"scheduleIssue"])
        events[key] = [storedEvents[key] isKindOfClass:NSNumber.class] ? storedEvents[key] : @YES;
    CachedNotificationSettings = @{ @"enabled":@(enabled), @"when":when, @"events":events };
    return CachedNotificationSettings;
}

static NSString *L(NSString *fr, NSString *en) {
    if (!CachedLanguage) RefreshAppLanguage();
    return [CachedLanguage isEqualToString:@"en"] ? en : fr;
}

static BOOL IsValidBoard(id object) {
    return [object isKindOfClass:NSDictionary.class] && [object[@"spaces"] isKindOfClass:NSArray.class] && [object[@"cards"] isKindOfClass:NSArray.class];
}

static BOOL SameJSONValue(id left, id right) {
    if (!left && !right) return YES;
    return left && right && [left isEqual:right];
}

static NSArray *MergeIdentifiedCollection(NSArray *base, NSArray *incoming, NSArray *current, BOOL *conflict) {
    NSMutableDictionary *baseByID=[NSMutableDictionary dictionary],*incomingByID=[NSMutableDictionary dictionary],*currentByID=[NSMutableDictionary dictionary];
    for (NSDictionary *item in base ?: @[]) if ([item[@"id"] isKindOfClass:NSString.class]) baseByID[item[@"id"]]=item;
    for (NSDictionary *item in incoming ?: @[]) if ([item[@"id"] isKindOfClass:NSString.class]) incomingByID[item[@"id"]]=item;
    for (NSDictionary *item in current ?: @[]) if ([item[@"id"] isKindOfClass:NSString.class]) currentByID[item[@"id"]]=item;
    NSMutableOrderedSet *identifiers=[NSMutableOrderedSet orderedSet];
    for (NSDictionary *item in incoming ?: @[]) if ([item[@"id"] isKindOfClass:NSString.class]) [identifiers addObject:item[@"id"]];
    for (NSDictionary *item in current ?: @[]) if ([item[@"id"] isKindOfClass:NSString.class]) [identifiers addObject:item[@"id"]];
    for (NSDictionary *item in base ?: @[]) if ([item[@"id"] isKindOfClass:NSString.class]) [identifiers addObject:item[@"id"]];
    NSMutableArray *merged=[NSMutableArray array];
    for (NSString *identifier in identifiers) {
        id ancestor=baseByID[identifier],local=incomingByID[identifier],remote=currentByID[identifier],chosen=nil;
        if (SameJSONValue(local, remote)) chosen=local;
        else if (SameJSONValue(local, ancestor)) chosen=remote;
        else if (SameJSONValue(remote, ancestor)) chosen=local;
        else { if (conflict) *conflict=YES; return nil; }
        if (chosen) [merged addObject:chosen];
    }
    return merged;
}

static NSDictionary *MergeBoardSnapshots(NSDictionary *base, NSDictionary *incoming, NSDictionary *current, BOOL *conflict) {
    if (!IsValidBoard(base) || !IsValidBoard(incoming) || !IsValidBoard(current)) { if (conflict) *conflict=YES; return nil; }
    NSMutableDictionary *merged=[incoming mutableCopy];
    NSArray *spaces=MergeIdentifiedCollection(base[@"spaces"],incoming[@"spaces"],current[@"spaces"],conflict);
    if (conflict && *conflict) return nil;
    NSArray *cards=MergeIdentifiedCollection(base[@"cards"],incoming[@"cards"],current[@"cards"],conflict);
    if (conflict && *conflict) return nil;
    merged[@"spaces"]=spaces;merged[@"cards"]=cards;
    return merged;
}

static int AcquireBoardLock(void) {
    NSString *folder = BoardDataPath().stringByDeletingLastPathComponent;
    if (!EnsurePrivateDirectoryAtPath(folder)) return -1;
    NSString *lockPath = [BoardDataPath() stringByAppendingString:@".lock"];
    int descriptor = open(lockPath.fileSystemRepresentation, O_CREAT | O_RDWR | O_NOFOLLOW, 0600);
    if (descriptor >= 0 && flock(descriptor, LOCK_EX) != 0) { close(descriptor); return -1; }
    return descriptor;
}

static void ReleaseBoardLock(int descriptor) {
    if (descriptor >= 0) { flock(descriptor, LOCK_UN); close(descriptor); }
}

static NSMutableDictionary *StarterBoard(void) {
    NSString *home = NSHomeDirectory(), *now = ISODate();
    NSString *primaryID = UUIDString();
    NSArray *spaces = @[
        [@{ @"id":primaryID, @"name":L(@"Mon premier projet", @"My first project"), @"rootPath":[home stringByAppendingPathComponent:@"Documents"], @"accentHex":@"6E75FF", @"createdAt":now } mutableCopy]
    ];
    NSArray *cards = @[
        [@{ @"id":UUIDString(), @"spaceID":primaryID, @"boardPresetID":@"classic", @"title":L(@"Configurer mes espaces", @"Set up my projects"), @"prompt":L(@"Inspecte ce workspace et propose les trois premières tâches concrètes à ajouter au Kanban. Ne modifie aucun fichier.", @"Inspect this workspace and propose the first three concrete tasks to add to the board. Do not change any file."), @"status":@"ready", @"priority":@"normal", @"runMode":@"readOnly", @"createdAt":now, @"updatedAt":now } mutableCopy],
        [@{ @"id":UUIDString(), @"spaceID":primaryID, @"boardPresetID":@"classic", @"title":L(@"Tester une tâche Codex", @"Try a Codex task"), @"prompt":L(@"Inspecte le projet, lis ses instructions locales et résume son état actuel ainsi que le prochain petit chantier utile. Ne modifie rien.", @"Inspect the project, read its local instructions and summarise its current state plus the next small useful piece of work. Change nothing."), @"status":@"backlog", @"priority":@"normal", @"runMode":@"readOnly", @"createdAt":now, @"updatedAt":now } mutableCopy],
        [@{ @"id":UUIDString(), @"spaceID":primaryID, @"boardPresetID":@"classic", @"title":L(@"Préparer le pilotage par skill", @"Prepare skill-driven control"), @"prompt":L(@"Analyse les interfaces disponibles pour piloter ce Kanban depuis Codex et propose un contrat de commandes stable.", @"Review the available interfaces for driving this board from Codex and propose a stable command contract."), @"status":@"backlog", @"priority":@"normal", @"runMode":@"readOnly", @"createdAt":now, @"updatedAt":now } mutableCopy]
    ];
    return [@{ @"version":@22, @"spaces":spaces, @"cards":cards, @"utilityChats":@[], @"validations":@[], @"settings":@{ @"maxConcurrency":@2, @"maxConcurrencyCodex":@2, @"maxConcurrencyClaude":@1, @"autoSync":@YES, @"backgroundSchedulerEnabled":@NO, @"autoArchiveCompletedDays":@0, @"defaultModel":@"gpt-5.6-sol", @"defaultEffort":@"medium", @"defaultEffortCodex":@"medium", @"defaultEffortClaude":@"medium", @"sidebarCollapsed":@NO, @"defaultBoardPreset":@"classic", @"activePresetByScope":@{}, @"accounts":@[], @"activeAccount":@{}, @"accountChecks":@{}, @"conversationSyncChecks":@{}, @"agendaMode":@"week", @"agendaTimeZone":@"auto", @"agendaWeekStart":@"auto", @"agendaHourCycle":@"auto", @"theme":@"auto", @"themePalette":@"graphite", @"inAppNotifications":@"all", @"systemNotificationsEnabled":@YES, @"notificationWhen":@"background", @"notificationEvents":@{ @"taskComplete":@YES, @"taskFailed":@YES, @"approval":@YES, @"chatReply":@YES, @"scheduleIssue":@YES }, @"utilityPanelOpen":@NO, @"utilityPanelWidth":@390, @"utilityTab":@"chat", @"utilityAgent":@"codex", @"utilitySpaceID":@"", @"utilityCustomPath":@"" }, @"modifiedAt":now } mutableCopy];
}

// Verrou de l application. L etat « verrouille » vit dans le trousseau, pas dans
// board.json : basculer le reglage demande une authentification, et personne ne
// desactive le verrou en editant un fichier JSON.
static NSString *const LockKeychainService = @"app.ctrlkanb.macos.lock";

static NSDictionary *LockQuery(void) {
    return @{ (id)kSecClass:(id)kSecClassGenericPassword,
              (id)kSecAttrService:LockKeychainService,
              (id)kSecAttrAccount:@"app-lock" };
}

static BOOL AppLockEnabled(void) {
    NSMutableDictionary *query = [LockQuery() mutableCopy];
    query[(id)kSecReturnData] = @NO;
    return SecItemCopyMatching((__bridge CFDictionaryRef)query, NULL) == errSecSuccess;
}

static BOOL SetAppLockEnabled(BOOL enabled) {
    SecItemDelete((__bridge CFDictionaryRef)LockQuery());
    if (!enabled) return YES;
    NSMutableDictionary *item = [LockQuery() mutableCopy];
    item[(id)kSecValueData] = [UUIDString() dataUsingEncoding:NSUTF8StringEncoding];
    item[(id)kSecAttrAccessible] = (id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly;
    return SecItemAdd((__bridge CFDictionaryRef)item, NULL) == errSecSuccess;
}

@interface CodexBoardDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSMutableDictionary *> *runs;
@property(nonatomic, strong) NSMutableArray<NSDictionary *> *pendingRuns;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSMutableDictionary *> *terminals;
@property(nonatomic) NSInteger maxConcurrentCodexRuns;
@property(nonatomic) NSInteger maxConcurrentClaudeRuns;
@property(nonatomic, strong) AppServerClient *conversationClient;
@property(nonatomic, strong) AppServerClient *syncClient;
@property(nonatomic, strong) AppServerClient *detailClient;
@property(nonatomic, strong) NSMutableArray *syncResults;
@property(nonatomic) NSInteger syncOutstanding;
@property(nonatomic) NSInteger syncTotal;
@property(nonatomic) NSInteger syncFailedCount;
@property(nonatomic) BOOL backgroundLaunch;
@property(nonatomic, strong) NSView *lockView;
@property(nonatomic) BOOL locked;
@property(nonatomic) BOOL unlockPending;
@property(nonatomic, strong) NSDictionary *lastPresentedBoard;
- (void)sendNotificationAuthorizationStatus;
- (void)requestNotificationAuthorization;
- (void)openNotificationSettings;
- (BOOL)shouldDeliverNotificationCategory:(NSString *)category card:(NSDictionary *)card;
- (void)notifyTitle:(NSString *)title message:(NSString *)message category:(NSString *)category card:(NSDictionary *)card;
- (void)sendCurrentBoardToWeb;
@end

@implementation CodexBoardDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    if (!AcquireEngineProcessLock()) { [NSApp terminate:nil]; return; }
    SecureDataDirectory();
    AppendBoardEvent(@{ @"type":@"app.launched",
                        @"version":NSBundle.mainBundle.infoDictionary[@"CFBundleShortVersionString"] ?: @"?",
                        @"background":@(self.backgroundLaunch) });
    self.runs = [NSMutableDictionary dictionary];
    self.pendingRuns = [NSMutableArray array];
    self.terminals = [NSMutableDictionary dictionary];
    self.maxConcurrentCodexRuns = 2;
    self.maxConcurrentClaudeRuns = 1;
    if (!self.backgroundLaunch && [NotificationConfiguration()[@"enabled"] boolValue]) [UNUserNotificationCenter.currentNotificationCenter requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound) completionHandler:^(__unused BOOL granted, __unused NSError *error) {}];
    [self createMenu];
    NSRect frame = NSMakeRect(0, 0, 1440, 860);
    self.window = [[NSWindow alloc] initWithContentRect:frame
                                              styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable
                                                backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"CTRL KANB";
    self.window.minSize = NSMakeSize(1000, 680);
    self.window.backgroundColor=[NSColor colorWithCalibratedRed:0.96 green:0.96 blue:0.94 alpha:1];
    [self.window setFrameAutosaveName:@"CTRLKANBWorkspace"];
    [self.window center];
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    [configuration.userContentController addScriptMessageHandler:self name:@"bridge"];
    self.webView = [[WKWebView alloc] initWithFrame:frame configuration:configuration];
    self.webView.navigationDelegate = self;
    self.webView.allowsMagnification = YES;
    // Un conteneur plutot que la WebView elle-meme : l ecran de verrouillage a
    // besoin d une vue soeur au-dessus d elle.
    NSView *container = [[NSView alloc] initWithFrame:frame];
    self.webView.frame = container.bounds;
    self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [container addSubview:self.webView];
    self.window.contentView = container;
    // Le verrou protege la fenetre. Un lancement en arriere-plan sert le
    // planificateur et garde la fenetre fermee : il se verrouille a l ouverture.
    if (AppLockEnabled() && !self.backgroundLaunch) [self presentLockScreen];
    else [self loadWorkspace];
    if (self.backgroundLaunch) {
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        [self.window orderOut:nil];
    } else {
        [self.window makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
    }
}

- (void)applicationDidBecomeActive:(__unused NSNotification *)notification {
    if (!self.locked) [self sendNotificationAuthorizationStatus];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return NO; }

- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)flag {
    if (!flag) [self showBoard:nil];
    return YES;
}

- (void)showBoard:(id)sender {
    BOOL wasHidden = self.backgroundLaunch;
    self.backgroundLaunch = NO;
    if (wasHidden) [self lockNow:nil];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    AppendBoardEvent(@{ @"type":@"app.terminating", @"runs":@(self.runs.count), @"queued":@(self.pendingRuns.count) });
    for (NSMutableDictionary *context in self.runs.allValues) [(AppServerClient *)context[@"client"] stop];
    [self.conversationClient stop];
    [self.syncClient stop];
    [self.detailClient stop];
    for (NSMutableDictionary *terminal in self.terminals.allValues) {
        NSFileHandle *reader = terminal[@"reader"];
        reader.readabilityHandler = nil;
        NSTask *task = terminal[@"task"];
        if (task.running) [task terminate];
    }
    ReleaseEngineProcessLock();
}

- (NSMenuItem *)menuCommand:(NSString *)title command:(NSString *)command key:(NSString *)key modifiers:(NSEventModifierFlags)modifiers {
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:@selector(performMenuCommand:) keyEquivalent:key ?: @""];
    item.target = self;
    item.representedObject = command;
    if (key.length) item.keyEquivalentModifierMask = modifiers;
    return item;
}

- (void)performMenuCommand:(NSMenuItem *)sender {
    if (![sender.representedObject isKindOfClass:NSString.class]) return;
    [self showBoard:nil];
    [self sendFunction:@"menuAction" object:@{ @"action":sender.representedObject }];
}

- (void)createMenu {
    NSEventModifierFlags command = NSEventModifierFlagCommand;
    NSEventModifierFlags commandShift = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    NSEventModifierFlags commandOption = NSEventModifierFlagCommand | NSEventModifierFlagOption;
    NSMenu *menuBar = [[NSMenu alloc] init];

    NSMenuItem *appItem = [[NSMenuItem alloc] init];
    NSMenu *appMenu = [[NSMenu alloc] initWithTitle:@"CTRL KANB"];
    [appMenu addItemWithTitle:L(@"À propos de CTRL KANB", @"About CTRL KANB") action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    NSMenuItem *showItem = [appMenu addItemWithTitle:L(@"Afficher CTRL KANB", @"Show CTRL KANB") action:@selector(showBoard:) keyEquivalent:@""];
    showItem.target = self;
    NSMenuItem *lockItem = [appMenu addItemWithTitle:L(@"Verrouiller CTRL KANB", @"Lock CTRL KANB") action:@selector(lockNow:) keyEquivalent:@"l"];
    lockItem.target = self;
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:L(@"Masquer CTRL KANB", @"Hide CTRL KANB") action:@selector(hide:) keyEquivalent:@"h"];
    NSMenuItem *hideOthers = [appMenu addItemWithTitle:L(@"Masquer les autres", @"Hide Others") action:@selector(hideOtherApplications:) keyEquivalent:@"h"];
    hideOthers.keyEquivalentModifierMask = commandOption;
    [appMenu addItemWithTitle:L(@"Tout afficher", @"Show All") action:@selector(unhideAllApplications:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:L(@"Quitter CTRL KANB", @"Quit CTRL KANB") action:@selector(terminate:) keyEquivalent:@"q"];
    appItem.submenu = appMenu;
    [menuBar addItem:appItem];

    NSMenuItem *fileItem = [[NSMenuItem alloc] initWithTitle:L(@"Fichier", @"File") action:nil keyEquivalent:@""];
    NSMenu *fileMenu = [[NSMenu alloc] initWithTitle:fileItem.title];
    [fileMenu addItem:[self menuCommand:L(@"Nouvelle tâche", @"New Task") command:@"newTask" key:@"n" modifiers:command]];
    [fileMenu addItem:[self menuCommand:L(@"Nouveau projet…", @"New Project…") command:@"newProject" key:@"n" modifiers:commandShift]];
    [fileMenu addItem:[NSMenuItem separatorItem]];
    [fileMenu addItem:[self menuCommand:L(@"Afficher le projet dans Finder", @"Show Project in Finder") command:@"revealProject" key:@"o" modifiers:command]];
    [fileMenu addItem:[self menuCommand:L(@"Afficher les données CTRL KANB", @"Show CTRL KANB Data") command:@"revealData" key:@"" modifiers:0]];
    [fileMenu addItem:[NSMenuItem separatorItem]];
    [fileMenu addItemWithTitle:L(@"Fermer la fenêtre", @"Close Window") action:@selector(performClose:) keyEquivalent:@"w"];
    fileItem.submenu = fileMenu;
    [menuBar addItem:fileItem];

    NSMenuItem *editItem = [[NSMenuItem alloc] initWithTitle:L(@"Édition", @"Edit") action:nil keyEquivalent:@""];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:editItem.title];
    [editMenu addItemWithTitle:L(@"Annuler", @"Undo") action:@selector(undo:) keyEquivalent:@"z"];
    [editMenu addItemWithTitle:L(@"Rétablir", @"Redo") action:@selector(redo:) keyEquivalent:@"Z"];
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItemWithTitle:L(@"Couper", @"Cut") action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:L(@"Copier", @"Copy") action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:L(@"Coller", @"Paste") action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:L(@"Tout sélectionner", @"Select All") action:@selector(selectAll:) keyEquivalent:@"a"];
    editItem.submenu = editMenu;
    [menuBar addItem:editItem];

    NSMenuItem *viewItem = [[NSMenuItem alloc] initWithTitle:L(@"Affichage", @"View") action:nil keyEquivalent:@""];
    NSMenu *viewMenu = [[NSMenu alloc] initWithTitle:viewItem.title];
    [viewMenu addItem:[self menuCommand:L(@"Flux", @"Flow") command:@"flow" key:@"1" modifiers:command]];
    [viewMenu addItem:[self menuCommand:L(@"Tableau", @"Board") command:@"board" key:@"2" modifiers:command]];
    [viewMenu addItem:[self menuCommand:L(@"Agenda", @"Calendar") command:@"agenda" key:@"3" modifiers:command]];
    [viewMenu addItem:[self menuCommand:L(@"Validations", @"Approvals") command:@"validations" key:@"4" modifiers:command]];
    [viewMenu addItem:[self menuCommand:L(@"Suivi", @"Follow-up") command:@"follow" key:@"5" modifiers:command]];
    [viewMenu addItem:[NSMenuItem separatorItem]];
    [viewMenu addItem:[self menuCommand:L(@"Afficher ou masquer le panneau gauche", @"Toggle Left Sidebar") command:@"toggleSidebar" key:@"s" modifiers:commandOption]];
    [viewMenu addItem:[self menuCommand:L(@"Afficher ou masquer les outils", @"Toggle Project Tools") command:@"toggleTools" key:@"i" modifiers:commandOption]];
    [viewMenu addItem:[NSMenuItem separatorItem]];
    [viewMenu addItem:[self menuCommand:L(@"Chat du projet", @"Project Chat") command:@"toolsChat" key:@"c" modifiers:commandOption]];
    [viewMenu addItem:[self menuCommand:L(@"Terminal du projet", @"Project Terminal") command:@"toolsTerminal" key:@"t" modifiers:commandOption]];
    [viewMenu addItem:[self menuCommand:L(@"Fichiers du projet", @"Project Files") command:@"toolsFiles" key:@"f" modifiers:commandOption]];
    [viewMenu addItem:[NSMenuItem separatorItem]];
    [viewMenu addItemWithTitle:L(@"Plein écran", @"Enter Full Screen") action:@selector(toggleFullScreen:) keyEquivalent:@"f"];
    viewMenu.itemArray.lastObject.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagControl;
    viewItem.submenu = viewMenu;
    [menuBar addItem:viewItem];

    NSMenuItem *windowItem = [[NSMenuItem alloc] initWithTitle:L(@"Fenêtre", @"Window") action:nil keyEquivalent:@""];
    NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:windowItem.title];
    [windowMenu addItemWithTitle:L(@"Réduire", @"Minimize") action:@selector(performMiniaturize:) keyEquivalent:@"m"];
    [windowMenu addItemWithTitle:L(@"Zoom", @"Zoom") action:@selector(performZoom:) keyEquivalent:@""];
    [windowMenu addItem:[NSMenuItem separatorItem]];
    [windowMenu addItemWithTitle:L(@"Tout ramener au premier plan", @"Bring All to Front") action:@selector(arrangeInFront:) keyEquivalent:@""];
    windowItem.submenu = windowMenu;
    [menuBar addItem:windowItem];
    NSApp.windowsMenu = windowMenu;

    NSMenuItem *helpItem = [[NSMenuItem alloc] initWithTitle:L(@"Aide", @"Help") action:nil keyEquivalent:@""];
    NSMenu *helpMenu = [[NSMenu alloc] initWithTitle:helpItem.title];
    [helpMenu addItem:[self menuCommand:L(@"Raccourcis clavier", @"Keyboard Shortcuts") command:@"shortcuts" key:@"?" modifiers:commandShift]];
    helpItem.submenu = helpMenu;
    [menuBar addItem:helpItem];
    NSApp.helpMenu = helpMenu;
    NSApp.mainMenu = menuBar;
}

// La page livree dans le bundle est la seule autorisee dans cette fenetre. Elle
// dispose du pont JS->natif, qui peut lancer un agent en ecriture : un fichier
// depose sur la fenetre ou un lien qui prendrait sa place obtiendrait le meme
// pouvoir. Tout le reste est refuse ; un lien web part dans le navigateur.
- (NSString *)workspacePagePath {
    return [NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"index.html"].path.stringByResolvingSymlinksInPath;
}

- (BOOL)isWorkspaceURL:(NSURL *)url {
    if (!url.isFileURL) return NO;
    return [url.path.stringByResolvingSymlinksInPath isEqualToString:[self workspacePagePath]];
}

- (void)webView:(__unused WKWebView *)webView
        decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
                        decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    if (!url || [url.scheme isEqualToString:@"about"]) { decisionHandler(WKNavigationActionPolicyAllow); return; }
    if ([self isWorkspaceURL:url]) { decisionHandler(WKNavigationActionPolicyAllow); return; }
    if (navigationAction.navigationType == WKNavigationTypeLinkActivated &&
        ([url.scheme isEqualToString:@"https"] || [url.scheme isEqualToString:@"http"]))
        [NSWorkspace.sharedWorkspace openURL:url];
    decisionHandler(WKNavigationActionPolicyCancel);
}

// Meme regle a l entree du pont : un message ne compte que s il vient du cadre
// principal de cette page. Deuxieme barriere, au cas ou la premiere cede.
- (BOOL)messageComesFromWorkspace:(WKScriptMessage *)message {
    if (!message.frameInfo.isMainFrame) return NO;
    NSURL *url = message.frameInfo.request.URL ?: message.webView.URL;
    return [self isWorkspaceURL:url];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(__unused WKNavigation *)navigation {
    // Une page blanche (verrouillage) ou toute autre page ne recoit rien.
    if (self.locked || ![self isWorkspaceURL:webView.URL]) return;
    NSDictionary *info = NSBundle.mainBundle.infoDictionary;
    [self sendFunction:@"appInfo" object:@{ @"version":info[@"CFBundleShortVersionString"] ?: @"",
                                            @"build":info[@"CFBundleVersion"] ?: @"" }];
    [self sendCurrentBoardToWeb];
    [self sendNotificationAuthorizationStatus];
}

- (void)setInterfaceAppearance:(NSString *)mode {
    NSAppearance *appearance = nil;
    if ([mode isEqualToString:@"dark"]) appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    else if ([mode isEqualToString:@"light"]) appearance = [NSAppearance appearanceNamed:NSAppearanceNameAqua];
    NSApp.appearance = appearance;
    self.window.appearance = appearance;
    self.window.backgroundColor = NSColor.windowBackgroundColor;
}

- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![self messageComesFromWorkspace:message]) return;
    if (![message.body isKindOfClass:NSDictionary.class]) return;
    NSDictionary *body = (NSDictionary *)message.body;
    NSString *action = body[@"action"];
    if ([action isEqualToString:@"ready"]) { if (self.locked) return; [self sendCurrentBoardToWeb]; [self sendBackgroundSchedulerStatusWithError:nil]; [self sendNotificationAuthorizationStatus]; [self sendActiveRuns]; }
    else if ([action isEqualToString:@"save"] && [body[@"data"] isKindOfClass:NSDictionary.class]) [self saveBoard:body[@"data"]];
    else if ([action isEqualToString:@"agentStatus"]) [self sendFunction:@"agentStatus" object:@{@"codex":@([self codexExecutable]!=nil),@"claude":@([self claudeExecutable]!=nil)}];
    else if ([action isEqualToString:@"agentProbe"])
        [self probeAgent:[body[@"engine"] isKindOfClass:NSString.class] ? body[@"engine"] : @"codex" home:[body[@"home"] isKindOfClass:NSString.class] ? body[@"home"] : @"" account:[body[@"account"] isKindOfClass:NSString.class] ? body[@"account"] : @""];
    else if ([action isEqualToString:@"agentLogin"]) [self openEngineLogin:[body[@"engine"] isKindOfClass:NSString.class] ? body[@"engine"] : @"codex" home:[body[@"home"] isKindOfClass:NSString.class] ? body[@"home"] : @"" account:[body[@"account"] isKindOfClass:NSString.class] ? body[@"account"] : @""];
    else if ([action isEqualToString:@"securityStatus"]) [self sendSecurityStatus];
    else if ([action isEqualToString:@"notificationStatus"]) [self sendNotificationAuthorizationStatus];
    else if ([action isEqualToString:@"requestNotifications"]) [self requestNotificationAuthorization];
    else if ([action isEqualToString:@"openNotificationSettings"]) [self openNotificationSettings];
    else if ([action isEqualToString:@"setAppLock"]) [self setAppLock:[body[@"enabled"] boolValue]];
    else if ([action isEqualToString:@"lockNow"]) [self lockNow:nil];
    else if ([action isEqualToString:@"setAppearance"]) [self setInterfaceAppearance:[body[@"mode"] isKindOfClass:NSString.class] ? body[@"mode"] : @"light"];
    else if ([action isEqualToString:@"copyText"] && [body[@"text"] isKindOfClass:NSString.class]) { [NSPasteboard.generalPasteboard clearContents]; [NSPasteboard.generalPasteboard setString:body[@"text"] forType:NSPasteboardTypeString]; }
    else if ([action isEqualToString:@"chooseFolder"]) [self chooseFolder];
    else if ([action isEqualToString:@"chooseUtilityFolder"]) [self chooseUtilityFolder];
    else if ([action isEqualToString:@"chooseUtilityAttachments"]) [self chooseUtilityAttachments];
    else if ([action isEqualToString:@"setConcurrency"]) {
        NSNumber *legacy = [body[@"value"] isKindOfClass:NSNumber.class] ? body[@"value"] : nil;
        NSNumber *codex = [body[@"codex"] isKindOfClass:NSNumber.class] ? body[@"codex"] : legacy;
        NSNumber *claude = [body[@"claude"] isKindOfClass:NSNumber.class] ? body[@"claude"] : legacy;
        self.maxConcurrentCodexRuns = MAX(1, MIN(4, [codex ?: @2 integerValue]));
        self.maxConcurrentClaudeRuns = MAX(1, MIN(4, [claude ?: @1 integerValue]));
        [self startNextQueued];
    }
    else if ([action isEqualToString:@"run"]) [self runCard:body];
    else if ([action isEqualToString:@"stop"]) [self stopCard:body[@"cardID"]];
    else if ([action isEqualToString:@"respondRequest"]) [self respondToServerRequest:body];
    else if ([action isEqualToString:@"listConversations"]) [self listConversations];
    else if ([action isEqualToString:@"syncConversations"]) [self syncConversations:body[@"threadIDs"]];
    else if ([action isEqualToString:@"syncClaudeSessions"]) [self syncClaudeSessions:body[@"sessions"]];
    else if ([action isEqualToString:@"readConversation"]) [self readConversation:body[@"threadID"] cardID:body[@"cardID"]];
    else if ([action isEqualToString:@"openConversation"]) [self openConversation:body[@"threadID"]];
    else if ([action isEqualToString:@"openClaudeConversation"]) [self openClaudeConversation:body[@"threadID"]];
    else if ([action isEqualToString:@"setBackgroundScheduler"]) [self setBackgroundSchedulerEnabled:[body[@"enabled"] boolValue]];
    else if ([action isEqualToString:@"backgroundSchedulerStatus"]) [self sendBackgroundSchedulerStatusWithError:nil];
    else if ([action isEqualToString:@"startTerminal"]) [self startTerminal:body];
    else if ([action isEqualToString:@"terminalCommand"]) [self sendTerminalCommand:body];
    else if ([action isEqualToString:@"terminalInterrupt"]) [self interruptTerminal:body[@"terminalID"]];
    else if ([action isEqualToString:@"stopTerminal"]) [self stopTerminal:body[@"terminalID"]];
    else if ([action isEqualToString:@"openSystemTerminal"]) [self openSystemTerminal:body];
    else if ([action isEqualToString:@"listProjectFiles"]) [self listProjectFiles:body];
    else if ([action isEqualToString:@"openProjectFile"]) [self openProjectFile:body reveal:NO];
    else if ([action isEqualToString:@"revealProjectFile"]) [self openProjectFile:body reveal:YES];
    else if ([action isEqualToString:@"openProjectFileWith"]) [self openProjectFileWith:body];
    else if ([action isEqualToString:@"saveProjectFileAs"]) [self saveProjectFileAs:body];
    else if ([action isEqualToString:@"copyProjectFilePath"]) [self copyProjectFilePath:body];
    else if ([action isEqualToString:@"resolveProjectFileForChat"]) [self resolveProjectFileForChat:body];
    else if ([action isEqualToString:@"revealData"]) [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[[NSURL fileURLWithPath:BoardDataPath()]]];
    else if ([action isEqualToString:@"revealPath"] && [body[@"path"] isKindOfClass:NSString.class]) {
        NSString *path = [body[@"path"] stringByExpandingTildeInPath];
        if ([[NSFileManager defaultManager] fileExistsAtPath:path]) [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[[NSURL fileURLWithPath:path]]];
        else [self sendFunction:@"nativeWarning" object:@{ @"message":L(@"Le dossier de ce projet est introuvable.", @"This project's folder was not found.") }];
    }
}

- (NSString *)projectRootForSpaceID:(NSString *)spaceID requestedPath:(NSString *)requestedPath error:(NSString **)errorMessage {
    if (![spaceID isKindOfClass:NSString.class] || !spaceID.length) {
        if (errorMessage) *errorMessage = L(@"Projet invalide.", @"Invalid project.");
        return nil;
    }
    NSDictionary *board = [self loadBoard], *matched = nil;
    for (NSDictionary *space in [board[@"spaces"] isKindOfClass:NSArray.class] ? board[@"spaces"] : @[]) {
        if ([space[@"id"] isEqualToString:spaceID]) { matched = space; break; }
    }
    NSDictionary *settings = [board[@"settings"] isKindOfClass:NSDictionary.class] ? board[@"settings"] : @{};
    NSString *stored = [spaceID isEqualToString:@"utility-custom"]
        ? ([settings[@"utilityCustomPath"] isKindOfClass:NSString.class] ? settings[@"utilityCustomPath"] : @"")
        : ([matched[@"rootPath"] isKindOfClass:NSString.class] ? matched[@"rootPath"] : @"");
    NSString *root = [[[stored stringByExpandingTildeInPath] stringByStandardizingPath] stringByResolvingSymlinksInPath];
    NSString *requested = [[[(requestedPath ?: @"") stringByExpandingTildeInPath] stringByStandardizingPath] stringByResolvingSymlinksInPath];
    BOOL directory = NO;
    if (!root.length || ![NSFileManager.defaultManager fileExistsAtPath:root isDirectory:&directory] || !directory) {
        if (errorMessage) *errorMessage = L(@"Le dossier de travail est introuvable.", @"The workspace folder was not found.");
        return nil;
    }
    if (requestedPath.length && ![requested isEqualToString:root]) {
        if (errorMessage) *errorMessage = L(@"Le dossier demandé ne correspond pas à l’espace enregistré.", @"The requested folder does not match the saved workspace.");
        return nil;
    }
    return root;
}

- (NSString *)projectPathForSpaceID:(NSString *)spaceID requestedRoot:(NSString *)requestedRoot relativePath:(NSString *)relativePath error:(NSString **)errorMessage {
    NSString *root = [self projectRootForSpaceID:spaceID requestedPath:requestedRoot error:errorMessage];
    if (!root) return nil;
    NSString *relative = [relativePath isKindOfClass:NSString.class] ? relativePath : @"";
    if (relative.isAbsolutePath) {
        if (errorMessage) *errorMessage = L(@"Ce chemin sort du projet.", @"That path is outside the project.");
        return nil;
    }
    NSString *candidate = relative.length ? [root stringByAppendingPathComponent:relative] : root;
    candidate = [[candidate stringByStandardizingPath] stringByResolvingSymlinksInPath];
    BOOL inside = [candidate isEqualToString:root] || [candidate hasPrefix:[root stringByAppendingString:@"/"]];
    if (!inside) {
        if (errorMessage) *errorMessage = L(@"Ce chemin sort du projet.", @"That path is outside the project.");
        return nil;
    }
    return candidate;
}

- (void)startTerminal:(NSDictionary *)body {
    NSString *terminalID = [body[@"terminalID"] isKindOfClass:NSString.class] ? body[@"terminalID"] : @"";
    NSString *spaceID = [body[@"spaceID"] isKindOfClass:NSString.class] ? body[@"spaceID"] : @"";
    NSString *requestedRoot = [body[@"rootPath"] isKindOfClass:NSString.class] ? body[@"rootPath"] : @"";
    if (!terminalID.length) return;
    NSString *pathError = nil, *root = [self projectRootForSpaceID:spaceID requestedPath:requestedRoot error:&pathError];
    if (!root) { [self sendFunction:@"terminalFailed" object:@{ @"terminalID":terminalID, @"message":pathError ?: L(@"Terminal indisponible.", @"Terminal unavailable.") }]; return; }
    NSMutableDictionary *existing = self.terminals[terminalID];
    NSTask *existingTask = existing[@"task"];
    if (existingTask.running) return;

    NSTask *task = [[NSTask alloc] init];
    // `script` fournit un vrai pseudo-terminal à zsh. Sans lui, les commandes
    // voyaient un simple tuyau (`tty` répondait « not a tty »), ce qui cassait
    // les invites interactives, les signaux clavier et de nombreux outils CLI.
    task.executableURL = [NSURL fileURLWithPath:@"/usr/bin/script"];
    task.arguments = @[@"-q", @"/dev/null", @"/bin/zsh", @"-f"];
    task.currentDirectoryURL = [NSURL fileURLWithPath:root isDirectory:YES];
    NSMutableDictionary *environment = [NSProcessInfo.processInfo.environment mutableCopy];
    NSString *home = NSHomeDirectory();
    environment[@"PATH"] = [NSString stringWithFormat:@"/opt/homebrew/bin:/usr/local/bin:%@/.local/bin:%@/.cargo/bin:%@/.npm-global/bin:%@/Library/pnpm:%@/.bun/bin:/usr/bin:/bin:/usr/sbin:/sbin", home, home, home, home, home];
    environment[@"TERM"] = @"xterm-256color";
    environment[@"COLORTERM"] = @"truecolor";
    environment[@"CLICOLOR"] = @"1";
    environment[@"TERM_PROGRAM"] = @"CTRL KANB";
    environment[@"PS1"] = @"%1~ %# ";
    environment[@"PROMPT"] = @"%1~ %# ";
    environment[@"RPROMPT"] = @"";
    environment[@"PROMPT_EOL_MARK"] = @"";
    // Une app rouverte par un terminal de développement peut hériter de son
    // virtualenv. La session intégrée doit rester neutre et reproductible sur
    // toutes les machines ; le bouton Terminal macOS charge, lui, le profil de
    // l'utilisateur quand celui-ci le souhaite.
    for (NSString *key in @[@"VIRTUAL_ENV", @"VIRTUAL_ENV_PROMPT", @"_OLD_VIRTUAL_PATH", @"_OLD_VIRTUAL_PS1",
                              @"CONDA_PREFIX", @"CONDA_DEFAULT_ENV", @"CONDA_PROMPT_MODIFIER", @"PIPENV_ACTIVE",
                              @"POETRY_ACTIVE", @"PYENV_VERSION"])
        [environment removeObjectForKey:key];
    task.environment = environment;
    NSPipe *input = [NSPipe pipe], *output = [NSPipe pipe];
    task.standardInput = input;
    task.standardOutput = output;
    task.standardError = output;
    NSFileHandle *reader = output.fileHandleForReading;
    NSMutableDictionary *context = [@{ @"task":task, @"input":input.fileHandleForWriting, @"reader":reader, @"spaceID":spaceID, @"root":root } mutableCopy];
    self.terminals[terminalID] = context;
    __weak typeof(self) weakSelf = self;
    reader.readabilityHandler = ^(NSFileHandle *handle) {
        NSData *data = handle.availableData;
        if (!data.length) { handle.readabilityHandler = nil; return; }
        NSString *text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";
        dispatch_async(dispatch_get_main_queue(), ^{ if (text.length) [weakSelf sendFunction:@"terminalOutput" object:@{ @"terminalID":terminalID, @"text":text }]; });
    };
    task.terminationHandler = ^(NSTask *finishedTask) {
        dispatch_async(dispatch_get_main_queue(), ^{
            NSMutableDictionary *current = weakSelf.terminals[terminalID];
            if (current[@"task"] != finishedTask) return;
            [(NSFileHandle *)current[@"reader"] setReadabilityHandler:nil];
            [weakSelf.terminals removeObjectForKey:terminalID];
            [weakSelf sendFunction:@"terminalStopped" object:@{ @"terminalID":terminalID, @"exitCode":@(finishedTask.terminationStatus) }];
        });
    };
    NSError *launchError = nil;
    if (![task launchAndReturnError:&launchError]) {
        reader.readabilityHandler = nil;
        [self.terminals removeObjectForKey:terminalID];
        [self sendFunction:@"terminalFailed" object:@{ @"terminalID":terminalID, @"message":launchError.localizedDescription ?: L(@"Impossible d’ouvrir zsh.", @"Could not open zsh.") }];
        return;
    }
    // Le processus `script` est lancé avant que zsh ait fini d'installer sa
    // discipline de terminal. On n'active la saisie qu'une fois cette courte
    // initialisation passée, sinon une commande envoyée immédiatement se perd.
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 250 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        NSMutableDictionary *current = weakSelf.terminals[terminalID];
        NSTask *currentTask = current[@"task"];
        if (currentTask == task && currentTask.running)
            [weakSelf sendFunction:@"terminalStarted" object:@{ @"terminalID":terminalID, @"path":root }];
    });
}

- (void)sendTerminalCommand:(NSDictionary *)body {
    NSString *terminalID = [body[@"terminalID"] isKindOfClass:NSString.class] ? body[@"terminalID"] : @"";
    NSString *command = [body[@"command"] isKindOfClass:NSString.class] ? body[@"command"] : @"";
    NSMutableDictionary *context = self.terminals[terminalID];
    NSTask *task = context[@"task"];
    NSFileHandle *input = context[@"input"];
    if (!task.running || !input || !command.length || command.length > 20000) {
        [self sendFunction:@"terminalFailed" object:@{ @"terminalID":terminalID, @"message":L(@"La session du terminal n’est plus active.", @"The terminal session is no longer active.") }];
        return;
    }
    @try { [input writeData:[[command stringByAppendingString:@"\n"] dataUsingEncoding:NSUTF8StringEncoding]]; }
    @catch (__unused NSException *exception) { [self sendFunction:@"terminalFailed" object:@{ @"terminalID":terminalID, @"message":L(@"La commande n’a pas pu être transmise.", @"The command could not be sent.") }]; }
}

- (void)interruptTerminal:(NSString *)terminalID {
    NSMutableDictionary *context = self.terminals[terminalID];
    NSTask *task = context[@"task"];
    NSFileHandle *input = context[@"input"];
    if (!task.running || !input) return;
    const unsigned char controlC = 3;
    @try { [input writeData:[NSData dataWithBytes:&controlC length:1]]; }
    @catch (__unused NSException *exception) {}
}

- (void)stopTerminal:(NSString *)terminalID {
    NSMutableDictionary *context = self.terminals[terminalID];
    NSTask *task = context[@"task"];
    if (task.running) [task terminate];
}

- (void)openSystemTerminal:(NSDictionary *)body {
    NSString *spaceID = [body[@"spaceID"] isKindOfClass:NSString.class] ? body[@"spaceID"] : @"";
    NSString *requestedRoot = [body[@"rootPath"] isKindOfClass:NSString.class] ? body[@"rootPath"] : @"";
    NSString *pathError = nil, *root = [self projectRootForSpaceID:spaceID requestedPath:requestedRoot error:&pathError];
    if (!root) {
        [self sendFunction:@"terminalFailed" object:@{ @"terminalID":body[@"terminalID"] ?: @"", @"message":pathError ?: L(@"Terminal indisponible.", @"Terminal unavailable.") }];
        return;
    }
    NSString *quoted = [root stringByReplacingOccurrencesOfString:@"'" withString:@"'\\''"];
    NSString *script = [NSString stringWithFormat:@"#!/bin/zsh\ncd -- '%@'\nexec /bin/zsh -l\n", quoted];
    NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"ctrl-kanb-terminal-%@.command", UUIDString()]];
    NSError *error = nil;
    if (![script writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:&error]) {
        [self sendFunction:@"terminalFailed" object:@{ @"terminalID":body[@"terminalID"] ?: @"", @"message":error.localizedDescription ?: L(@"Impossible d’ouvrir Terminal.", @"Could not open Terminal.") }];
        return;
    }
    [NSFileManager.defaultManager setAttributes:@{ NSFilePosixPermissions:@(0700) } ofItemAtPath:path error:nil];
    if (![NSWorkspace.sharedWorkspace openURL:[NSURL fileURLWithPath:path]]) {
        [NSFileManager.defaultManager removeItemAtPath:path error:nil];
        [self sendFunction:@"terminalFailed" object:@{ @"terminalID":body[@"terminalID"] ?: @"", @"message":L(@"Impossible d’ouvrir Terminal.", @"Could not open Terminal.") }];
        return;
    }
    RemoveTemporaryFileLater(path);
}

- (void)listProjectFiles:(NSDictionary *)body {
    NSString *spaceID = [body[@"spaceID"] isKindOfClass:NSString.class] ? body[@"spaceID"] : @"";
    NSString *relative = [body[@"relativePath"] isKindOfClass:NSString.class] ? body[@"relativePath"] : @"";
    NSString *requestedRoot = [body[@"rootPath"] isKindOfClass:NSString.class] ? body[@"rootPath"] : @"";
    NSString *pathError = nil, *path = [self projectPathForSpaceID:spaceID requestedRoot:requestedRoot relativePath:relative error:&pathError];
    BOOL directory = NO;
    if (!path || ![NSFileManager.defaultManager fileExistsAtPath:path isDirectory:&directory] || !directory) {
        [self sendFunction:@"projectFilesFailed" object:@{ @"spaceID":spaceID, @"message":pathError ?: L(@"Ce dossier est introuvable.", @"This folder was not found.") }];
        return;
    }
    NSError *listError = nil;
    NSArray<NSString *> *names = [NSFileManager.defaultManager contentsOfDirectoryAtPath:path error:&listError];
    if (listError) { [self sendFunction:@"projectFilesFailed" object:@{ @"spaceID":spaceID, @"message":listError.localizedDescription }]; return; }
    NSSet *ignored = [NSSet setWithArray:@[@".git", @"node_modules", @"DerivedData", @".DS_Store"]];
    NSMutableArray *entries = [NSMutableArray array];
    NSString *root = [self projectRootForSpaceID:spaceID requestedPath:requestedRoot error:nil];
    for (NSString *name in names) {
        if ([ignored containsObject:name]) continue;
        NSString *childRelative = relative.length ? [relative stringByAppendingPathComponent:name] : name;
        NSString *child = [self projectPathForSpaceID:spaceID requestedRoot:requestedRoot relativePath:childRelative error:nil];
        BOOL isDirectory = NO;
        if (!child || ![NSFileManager.defaultManager fileExistsAtPath:child isDirectory:&isDirectory]) continue;
        NSDictionary *attributes = [NSFileManager.defaultManager attributesOfItemAtPath:child error:nil];
        unsigned long long size = isDirectory ? 0 : [attributes fileSize];
        NSString *sizeLabel = isDirectory ? @"" : [NSByteCountFormatter stringFromByteCount:(long long)size countStyle:NSByteCountFormatterCountStyleFile];
        NSString *safeRelative = [child isEqualToString:root] ? @"" : [child substringFromIndex:MIN(child.length, root.length + 1)];
        [entries addObject:@{ @"name":name, @"relativePath":safeRelative, @"directory":@(isDirectory), @"size":@(size), @"sizeLabel":sizeLabel ?: @"" }];
        if (entries.count >= 400) break;
    }
    [entries sortUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) {
        BOOL leftDirectory = [left[@"directory"] boolValue], rightDirectory = [right[@"directory"] boolValue];
        if (leftDirectory != rightDirectory) return leftDirectory ? NSOrderedAscending : NSOrderedDescending;
        return [left[@"name"] localizedStandardCompare:right[@"name"]];
    }];
    [self sendFunction:@"projectFilesLoaded" object:@{ @"spaceID":spaceID, @"relativePath":relative, @"entries":entries }];
}

- (NSString *)projectItemForBody:(NSDictionary *)body requireFile:(BOOL)requireFile error:(NSString **)errorMessage {
    NSString *spaceID = [body[@"spaceID"] isKindOfClass:NSString.class] ? body[@"spaceID"] : @"";
    NSString *relative = [body[@"relativePath"] isKindOfClass:NSString.class] ? body[@"relativePath"] : @"";
    NSString *requestedRoot = [body[@"rootPath"] isKindOfClass:NSString.class] ? body[@"rootPath"] : @"";
    NSString *pathError = nil, *path = [self projectPathForSpaceID:spaceID requestedRoot:requestedRoot relativePath:relative error:&pathError];
    BOOL directory = NO;
    if (!path || ![NSFileManager.defaultManager fileExistsAtPath:path isDirectory:&directory]) {
        if (errorMessage) *errorMessage = pathError ?: L(@"Ce fichier est introuvable.", @"This file was not found.");
        return nil;
    }
    if (requireFile && directory) {
        if (errorMessage) *errorMessage = L(@"Cette action nécessite un fichier.", @"This action requires a file.");
        return nil;
    }
    return path;
}

- (void)openProjectFile:(NSDictionary *)body reveal:(BOOL)reveal {
    NSString *pathError = nil, *path = [self projectItemForBody:body requireFile:NO error:&pathError];
    if (!path) { [self sendFunction:@"projectFileFailed" object:@{ @"message":pathError }]; return; }
    NSURL *url = [NSURL fileURLWithPath:path];
    if (reveal) [NSWorkspace.sharedWorkspace activateFileViewerSelectingURLs:@[url]];
    else if (![NSWorkspace.sharedWorkspace openURL:url]) [self sendFunction:@"projectFileFailed" object:@{ @"message":L(@"macOS n’a trouvé aucune application pour ouvrir ce fichier.", @"macOS could not find an app to open this file.") }];
}

- (void)openProjectFileWith:(NSDictionary *)body {
    NSString *pathError = nil, *path = [self projectItemForBody:body requireFile:YES error:&pathError];
    if (!path) { [self sendFunction:@"projectFileFailed" object:@{ @"message":pathError }]; return; }
    NSURL *fileURL = [NSURL fileURLWithPath:path];
    NSOpenPanel *panel = NSOpenPanel.openPanel;
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.canCreateDirectories = NO;
    panel.allowsMultipleSelection = NO;
    panel.resolvesAliases = YES;
    panel.allowedContentTypes = @[UTTypeApplicationBundle];
    panel.directoryURL = [NSURL fileURLWithPath:@"/Applications" isDirectory:YES];
    panel.title = L(@"Ouvrir avec", @"Open With");
    panel.message = [NSString stringWithFormat:L(@"Choisis l’application qui ouvrira « %@ ».", @"Choose the application that will open “%@”."), path.lastPathComponent];
    panel.prompt = L(@"Ouvrir", @"Open");
    __weak typeof(self) weakSelf = self;
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        if (result != NSModalResponseOK || !panel.URL) return;
        NSWorkspaceOpenConfiguration *configuration = NSWorkspaceOpenConfiguration.configuration;
        [NSWorkspace.sharedWorkspace openURLs:@[fileURL] withApplicationAtURL:panel.URL configuration:configuration completionHandler:^(__unused NSRunningApplication *application, NSError *error) {
            if (error) dispatch_async(dispatch_get_main_queue(), ^{ [weakSelf sendFunction:@"projectFileFailed" object:@{ @"message":error.localizedDescription ?: L(@"Impossible d’ouvrir ce fichier.", @"Could not open this file.") }]; });
        }];
    }];
}

- (void)saveProjectFileAs:(NSDictionary *)body {
    NSString *pathError = nil, *path = [self projectItemForBody:body requireFile:YES error:&pathError];
    if (!path) { [self sendFunction:@"projectFileFailed" object:@{ @"message":pathError }]; return; }
    NSURL *sourceURL = [NSURL fileURLWithPath:path];
    NSSavePanel *panel = NSSavePanel.savePanel;
    panel.canCreateDirectories = YES;
    panel.nameFieldStringValue = path.lastPathComponent;
    panel.directoryURL = sourceURL.URLByDeletingLastPathComponent;
    panel.title = L(@"Enregistrer une copie", @"Save a Copy");
    panel.prompt = L(@"Enregistrer sous", @"Save As");
    __weak typeof(self) weakSelf = self;
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        if (result != NSModalResponseOK || !panel.URL) return;
        NSString *destinationPath = panel.URL.path.stringByStandardizingPath;
        if ([destinationPath isEqualToString:path.stringByStandardizingPath]) {
            [weakSelf sendFunction:@"projectFileFailed" object:@{ @"message":L(@"Choisis un autre emplacement pour enregistrer la copie.", @"Choose another location for the copy.") }];
            return;
        }
        NSFileManager *manager = NSFileManager.defaultManager;
        NSURL *temporaryURL = [panel.URL.URLByDeletingLastPathComponent URLByAppendingPathComponent:[NSString stringWithFormat:@".ctrl-kanb-%@", NSUUID.UUID.UUIDString]];
        NSError *copyError = nil;
        if (![manager copyItemAtURL:sourceURL toURL:temporaryURL error:&copyError]) {
            [weakSelf sendFunction:@"projectFileFailed" object:@{ @"message":copyError.localizedDescription ?: L(@"Impossible de copier ce fichier.", @"Could not copy this file.") }];
            return;
        }
        NSError *replaceError = nil;
        BOOL destinationExists = [manager fileExistsAtPath:destinationPath];
        BOOL saved = destinationExists
            ? [manager replaceItemAtURL:panel.URL withItemAtURL:temporaryURL backupItemName:nil options:0 resultingItemURL:nil error:&replaceError]
            : [manager moveItemAtURL:temporaryURL toURL:panel.URL error:&replaceError];
        if (!saved) {
            [manager removeItemAtURL:temporaryURL error:nil];
            [weakSelf sendFunction:@"projectFileFailed" object:@{ @"message":replaceError.localizedDescription ?: L(@"Impossible d’enregistrer cette copie.", @"Could not save this copy.") }];
            return;
        }
        [weakSelf sendFunction:@"projectFileSaved" object:@{ @"path":destinationPath }];
    }];
}

- (void)copyProjectFilePath:(NSDictionary *)body {
    NSString *pathError = nil, *path = [self projectItemForBody:body requireFile:NO error:&pathError];
    if (!path) { [self sendFunction:@"projectFileFailed" object:@{ @"message":pathError }]; return; }
    [NSPasteboard.generalPasteboard clearContents];
    if ([NSPasteboard.generalPasteboard setString:path forType:NSPasteboardTypeString]) [self sendFunction:@"projectFilePathCopied" object:@{}];
    else [self sendFunction:@"projectFileFailed" object:@{ @"message":L(@"Impossible de copier ce chemin.", @"Could not copy this path.") }];
}

- (void)resolveProjectFileForChat:(NSDictionary *)body {
    NSString *pathError = nil, *path = [self projectItemForBody:body requireFile:YES error:&pathError];
    if (!path) { [self sendFunction:@"projectFileFailed" object:@{ @"message":pathError }]; return; }
    NSString *spaceID = [body[@"spaceID"] isKindOfClass:NSString.class] ? body[@"spaceID"] : @"";
    [self sendFunction:@"utilityProjectFileAdded" object:@{ @"spaceID":spaceID, @"path":path, @"name":path.lastPathComponent ?: @"" }];
}

- (NSMutableDictionary *)loadBoard {
    int lock = AcquireBoardLock();
    if (lock < 0) return StarterBoard();
    NSData *data = ReadRegularDataFile(BoardDataPath());
    id object = data ? [NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingMutableContainers error:nil] : nil;
    if (IsValidBoard(object)) { ReleaseBoardLock(lock); return object; }
    NSData *previousData = ReadRegularDataFile(BoardPreviousPath());
    id previous = previousData ? [NSJSONSerialization JSONObjectWithData:previousData options:NSJSONReadingMutableContainers error:nil] : nil;
    ReleaseBoardLock(lock);
    if (IsValidBoard(previous)) {
        [self sendFunction:@"nativeWarning" object:@{ @"message":L(@"Le fichier principal était illisible. La sauvegarde précédente a été restaurée à l’écran.", @"The main file could not be read. The previous backup was restored on screen.") }];
        return previous;
    }
    NSMutableDictionary *starter = StarterBoard();
    [self saveBoard:starter];
    return starter;
}

- (void)sendCurrentBoardToWeb {
    NSDictionary *board=[self loadBoard];
    self.lastPresentedBoard=board;
    [self sendFunction:@"load" object:board];
}

- (void)saveBoard:(NSDictionary *)board {
    if (!IsValidBoard(board)) {
        [self sendFunction:@"nativeError" object:@{ @"message":L(@"Le tableau reçu est incomplet et n’a pas été enregistré.", @"The received board is incomplete and was not saved.") }];
        return;
    }
    NSString *path = BoardDataPath();
    int lock = AcquireBoardLock();
    if (lock < 0) { [self sendFunction:@"nativeError" object:@{ @"message":L(@"Impossible de verrouiller les données du Kanban.", @"The board data could not be locked.") }]; return; }
    NSData *current = ReadRegularDataFile(path);
    id currentObject = current ? [NSJSONSerialization JSONObjectWithData:current options:NSJSONReadingMutableContainers error:nil] : nil;
    BOOL conflict=NO,didMerge=NO;
    NSDictionary *candidate=board;
    BOOL basedOnCurrent=IsValidBoard(currentObject)&&SameJSONValue(board[@"modifiedAt"],currentObject[@"modifiedAt"]);
    if (IsValidBoard(currentObject) && !basedOnCurrent && !SameJSONValue(currentObject, self.lastPresentedBoard)) {
        if (IsValidBoard(self.lastPresentedBoard)) { candidate=MergeBoardSnapshots(self.lastPresentedBoard,board,currentObject,&conflict);didMerge=!conflict; }
        else conflict=YES;
    }
    if (conflict || !candidate) {
        NSData *recovery=[NSJSONSerialization dataWithJSONObject:board options:NSJSONWritingPrettyPrinted|NSJSONWritingSortedKeys error:nil];
        WritePrivateDataFile(recovery,BoardConflictPath(),nil);
        ReleaseBoardLock(lock);
        self.lastPresentedBoard=currentObject;
        [self sendFunction:@"boardSaveConflict" object:@{
            @"board":currentObject ?: @{},
            @"message":L(@"Le tableau a été modifié en même temps. La version la plus récente a été rechargée et ta modification a été conservée dans board.conflict.json.", @"The board was changed at the same time. The latest version was reloaded and your change was preserved in board.conflict.json.")
        }];
        return;
    }
    NSMutableDictionary *snapshot = [candidate mutableCopy];
    snapshot[@"version"] = @22;
    if (![snapshot[@"settings"] isKindOfClass:NSDictionary.class]) snapshot[@"settings"] = @{ @"maxConcurrency":@2, @"maxConcurrencyCodex":@2, @"maxConcurrencyClaude":@1, @"autoSync":@YES };
    snapshot[@"modifiedAt"] = ISODate();
    CachedLanguage = nil; CachedNotificationSettings = nil;   // les reglages peuvent venir de changer
    NSError *error = nil;
    NSData *json = [NSJSONSerialization dataWithJSONObject:snapshot options:NSJSONWritingPrettyPrinted | NSJSONWritingSortedKeys error:&error];
    if (!error && IsValidBoard(currentObject)) WritePrivateDataFile(current,BoardPreviousPath(),&error);
    if (!error) WritePrivateDataFile(json,path,&error);
    if (!error) {
        AppendBoardEvent(@{ @"type":@"board.saved", @"spaces":@([snapshot[@"spaces"] count]), @"cards":@([snapshot[@"cards"] count]) });
    }
    ReleaseBoardLock(lock);
    if (error) [self sendFunction:@"nativeError" object:@{ @"message":error.localizedDescription }];
    else {
        self.lastPresentedBoard=snapshot;
        if (didMerge) [self sendFunction:@"boardMerged" object:@{
            @"board":snapshot,
            @"message":L(@"Les changements faits en parallèle ont été réunis.", @"Concurrent changes were merged.")
        }];
    }
}

- (BOOL)runLaunchctlArguments:(NSArray<NSString *> *)arguments error:(NSString **)errorMessage {
    if ([EnvValue(@"SKIP_LAUNCHCTL") boolValue]) return YES;
    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:@"/bin/launchctl"];
    task.arguments = arguments;
    NSPipe *pipe = [NSPipe pipe];
    task.standardOutput = pipe;
    task.standardError = pipe;
    NSError *launchError = nil;
    if (![task launchAndReturnError:&launchError]) {
        if (errorMessage) *errorMessage = launchError.localizedDescription;
        return NO;
    }
    [task waitUntilExit];
    NSData *outputData = [pipe.fileHandleForReading readDataToEndOfFile];
    NSString *output = [[NSString alloc] initWithData:outputData encoding:NSUTF8StringEncoding];
    if (task.terminationStatus != 0) {
        if (errorMessage) *errorMessage = output.length ? [output stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] : L(@"launchctl a refusé l’opération.", @"launchctl refused the operation.");
        return NO;
    }
    return YES;
}

- (void)setBoardBackgroundSchedulerEnabled:(BOOL)enabled {
    NSMutableDictionary *board = [self loadBoard];
    NSMutableDictionary *settings = [board[@"settings"] isKindOfClass:NSDictionary.class] ? [board[@"settings"] mutableCopy] : [NSMutableDictionary dictionary];
    settings[@"backgroundSchedulerEnabled"] = @(enabled);
    board[@"settings"] = settings;
    [self saveBoard:board];
}

- (void)setBackgroundSchedulerEnabled:(BOOL)enabled {
    NSString *plistPath = SchedulerPlistPath();
    NSString *domain = [NSString stringWithFormat:@"gui/%u", getuid()];
    NSString *service = [domain stringByAppendingFormat:@"/%@", SchedulerLabel()];
    NSString *launchError = nil;

    if (!enabled) {
        [self runLaunchctlArguments:@[@"bootout", service] error:nil];
        NSError *removeError = nil;
        if ([NSFileManager.defaultManager fileExistsAtPath:plistPath] && ![NSFileManager.defaultManager removeItemAtPath:plistPath error:&removeError]) launchError = removeError.localizedDescription;
        [self setBoardBackgroundSchedulerEnabled:NO];
        [self sendBackgroundSchedulerStatusWithError:launchError];
        return;
    }

    NSString *helperPath = [NSBundle.mainBundle.resourcePath stringByAppendingPathComponent:@"ctrl-kanb-wake"];
    if (![NSFileManager.defaultManager isExecutableFileAtPath:helperPath]) {
        [self setBoardBackgroundSchedulerEnabled:NO];
        [self sendBackgroundSchedulerStatusWithError:L(@"Le moteur embarqué est absent de l’application.", @"The bundled engine is missing from the application.")];
        return;
    }

    NSString *dataFolder = BoardDataPath().stringByDeletingLastPathComponent;
    NSString *logsFolder = [dataFolder stringByAppendingPathComponent:@"Logs"];
    NSError *directoryError = nil;
    [NSFileManager.defaultManager createDirectoryAtPath:SchedulerLaunchAgentsDirectory() withIntermediateDirectories:YES attributes:nil error:&directoryError];
    [NSFileManager.defaultManager createDirectoryAtPath:logsFolder withIntermediateDirectories:YES attributes:@{ NSFilePosixPermissions:@(0700) } error:nil];
    if (directoryError) {
        [self setBoardBackgroundSchedulerEnabled:NO];
        [self sendBackgroundSchedulerStatusWithError:directoryError.localizedDescription];
        return;
    }

    NSMutableDictionary *plist = [@{
        @"Label": SchedulerLabel(),
        @"ProgramArguments": @[helperPath],
        @"RunAtLoad": @YES,
        @"StartInterval": @60,
        @"ProcessType": @"Background",
        @"LowPriorityIO": @YES,
        @"StandardOutPath": [logsFolder stringByAppendingPathComponent:@"scheduler.log"],
        @"StandardErrorPath": [logsFolder stringByAppendingPathComponent:@"scheduler-error.log"]
    } mutableCopy];
    NSString *dataOverride = EnvValue(@"DATA_FILE");
    if (dataOverride.length) plist[@"EnvironmentVariables"] = @{ @"CTRL_KANB_DATA_FILE": dataOverride };
    NSData *plistData = [NSPropertyListSerialization dataWithPropertyList:plist format:NSPropertyListXMLFormat_v1_0 options:0 error:&directoryError];
    if (!plistData || ![plistData writeToFile:plistPath options:NSDataWritingAtomic error:&directoryError]) {
        [self setBoardBackgroundSchedulerEnabled:NO];
        [self sendBackgroundSchedulerStatusWithError:directoryError.localizedDescription];
        return;
    }

    [self setBoardBackgroundSchedulerEnabled:YES];
    [self runLaunchctlArguments:@[@"bootout", service] error:nil];
    if (![self runLaunchctlArguments:@[@"bootstrap", domain, plistPath] error:&launchError]) {
        [NSFileManager.defaultManager removeItemAtPath:plistPath error:nil];
        [self setBoardBackgroundSchedulerEnabled:NO];
    }
    [self sendBackgroundSchedulerStatusWithError:launchError];
}

- (void)sendBackgroundSchedulerStatusWithError:(NSString *)errorMessage {
    NSDictionary *board = [self loadBoard];
    BOOL enabled = [board[@"settings"][@"backgroundSchedulerEnabled"] boolValue];
    BOOL installed = [NSFileManager.defaultManager fileExistsAtPath:SchedulerPlistPath()];
    NSData *statusData = [NSData dataWithContentsOfFile:SchedulerStatusPath()];
    NSDictionary *heartbeat = statusData ? [NSJSONSerialization JSONObjectWithData:statusData options:0 error:nil] : nil;
    NSString *state = !enabled ? @"disabled" : (errorMessage.length ? @"error" : (installed ? (heartbeat[@"state"] ?: @"installed") : @"missing"));
    NSString *message = errorMessage.length ? errorMessage : (heartbeat[@"message"] ?: (enabled ? L(@"Le moteur est installé et attend son premier contrôle.", @"The engine is installed and waiting for its first check.") : @"Aucun service ne tourne sans ton accord."));
    [self sendFunction:@"backgroundSchedulerStatus" object:@{
        @"enabled": @(enabled),
        @"installed": @(installed),
        @"state": state,
        @"message": message,
        @"lastCheck": heartbeat[@"checkedAt"] ?: @"",
        @"error": errorMessage ?: @""
    }];
}

- (void)chooseFolder {
    NSOpenPanel *panel = NSOpenPanel.openPanel;
    panel.canChooseFiles = NO;
    panel.canChooseDirectories = YES;
    panel.allowsMultipleSelection = NO;
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        if (result == NSModalResponseOK && panel.URL.path) [self sendFunction:@"folderChosen" object:@{ @"path":panel.URL.path }];
    }];
}

- (void)chooseUtilityFolder {
    NSOpenPanel *panel = NSOpenPanel.openPanel;
    panel.canChooseFiles = NO;
    panel.canChooseDirectories = YES;
    panel.canCreateDirectories = NO;
    panel.allowsMultipleSelection = NO;
    panel.title = L(@"Choisir le dossier du panneau droit", @"Choose the right sidebar folder");
    panel.prompt = L(@"Utiliser ce dossier", @"Use this folder");
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        if (result == NSModalResponseOK && panel.URL.path)
            [self sendFunction:@"utilityFolderChosen" object:@{ @"path":panel.URL.path, @"name":panel.URL.lastPathComponent ?: @"" }];
    }];
}

- (void)chooseUtilityAttachments {
    NSOpenPanel *panel = NSOpenPanel.openPanel;
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.canCreateDirectories = NO;
    panel.allowsMultipleSelection = YES;
    panel.resolvesAliases = YES;
    panel.title = L(@"Joindre des fichiers au message", @"Attach files to the message");
    panel.prompt = L(@"Joindre", @"Attach");
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        if (result != NSModalResponseOK) return;
        NSMutableArray *files = [NSMutableArray array];
        for (NSURL *url in panel.URLs) {
            NSString *path = url.path;
            if (!path.length) continue;
            [files addObject:@{ @"path":path, @"name":url.lastPathComponent ?: path.lastPathComponent ?: @"" }];
        }
        if (files.count) [self sendFunction:@"utilityAttachmentsChosen" object:@{ @"files":files }];
    }];
}

- (NSString *)codexExecutable {
    return FindAgentExecutable(@"codex", @[EnvValue(@"CODEX_PATH") ?: @""],
        @[@"/Applications/ChatGPT.app/Contents/Resources/codex", @"/Applications/Codex.app/Contents/Resources/codex"]);
}

- (NSDictionary *)initializeMessage {
    // Codex enregistre clientInfo.name comme « originator » de la session, et
    // l application Codex ne liste que les conversations dont l originator est le
    // sien. Avec « ctrl-kanb », les conversations lancees ici existaient bien dans
    // ~/.codex/sessions mais restaient introuvables et donc impossibles a reprendre
    // dans Codex. Le titre reste CTRL KANB : c est lui qui s affiche.
    return @{ @"id":@1, @"method":@"initialize", @"params":@{
        @"clientInfo":@{ @"name":@"Codex Desktop", @"title":@"CTRL KANB", @"version":(NSBundle.mainBundle.infoDictionary[@"CFBundleShortVersionString"] ?: @"0") },
        // project/list et l affectation projectId font partie de l API
        // experimentale negociee. Sans cette capacite, le serveur refuse la
        // liste et la tache retombe silencieusement hors de son workspace Codex.
        @"capabilities":@{ @"experimentalApi":@YES }
    } };
}

- (BOOL)requestUsesClaude:(NSDictionary *)request {
    NSString *engine = request[@"card"][@"agentEngine"] ?: @"codex";
    return [@[@"claude-code", @"claudeCode"] containsObject:engine];
}

- (NSString *)conversationKeyForRequest:(NSDictionary *)request {
    if ([request[@"newConversation"] boolValue]) return nil;
    NSString *conversationID = request[@"card"][@"conversationID"];
    if (![conversationID isKindOfClass:NSString.class] || !conversationID.length) return nil;
    return [NSString stringWithFormat:@"%@:%@", [self requestUsesClaude:request] ? @"claude-code" : @"codex", conversationID];
}

- (BOOL)activeConversationBlocksRequest:(NSDictionary *)request {
    NSString *key = [self conversationKeyForRequest:request];
    if (!key.length) return NO;
    for (NSDictionary *context in self.runs.allValues)
        if ([context[@"conversationKey"] isEqualToString:key]) return YES;
    return NO;
}

- (NSInteger)activeRunCountForClaude:(BOOL)claude {
    NSInteger count = 0;
    for (NSDictionary *context in self.runs.allValues) {
        NSString *engine = context[@"card"][@"agentEngine"] ?: @"codex";
        BOOL contextIsClaude = [@[@"claude-code", @"claudeCode"] containsObject:engine];
        if (contextIsClaude == claude) count++;
    }
    return count;
}

- (BOOL)canStartRunRequest:(NSDictionary *)request {
    // La capacite parallele vaut pour des conversations distinctes. Une meme
    // conversation reste sequentielle, meme si deux cartes lui sont associees.
    if ([self activeConversationBlocksRequest:request]) return NO;
    BOOL claude = [self requestUsesClaude:request];
    NSInteger limit = claude ? self.maxConcurrentClaudeRuns : self.maxConcurrentCodexRuns;
    return [self activeRunCountForClaude:claude] < limit;
}

- (void)runCard:(NSDictionary *)request {
    NSString *cardID = request[@"card"][@"id"];
    if (!cardID.length || self.runs[cardID]) return;
    for (NSDictionary *pending in self.pendingRuns) if ([pending[@"card"][@"id"] isEqualToString:cardID]) return;
    if (![self canStartRunRequest:request]) {
        [self.pendingRuns addObject:request];
        [self notifyQueuePositions];
        return;
    }
    [self startRunRequest:request];
}

- (void)startRunRequest:(NSDictionary *)request {
    NSString *engine = request[@"card"][@"agentEngine"] ?: @"";
    if ([@[@"claude-code",@"claudeCode"] containsObject:engine]) { [self startClaudeRequest:request];return; }
    NSDictionary *card = request[@"card"], *space = request[@"space"];
    NSString *cardID = card[@"id"], *executable = [self codexExecutable];
    NSString *pathError=nil;
    NSString *rootPath=[self projectRootForSpaceID:space[@"id"] requestedPath:space[@"rootPath"] error:&pathError];
    if (!cardID.length || self.runs[cardID]) return;
    if (!executable) { [self failCard:cardID message:L(@"Commande codex introuvable.", @"The codex command was not found.") card:card]; [self startNextQueued]; return; }
    BOOL isDirectory = NO;
    if (!rootPath.length || ![NSFileManager.defaultManager fileExistsAtPath:rootPath isDirectory:&isDirectory] || !isDirectory) {
        [self failCard:cardID message:pathError?:[NSString stringWithFormat:L(@"Dossier introuvable : %@", @"Folder not found: %@"), rootPath ?: @""] card:card]; [self startNextQueued]; return;
    }
    NSMutableDictionary *storedSpace=[space mutableCopy];storedSpace[@"rootPath"]=rootPath;space=storedSpace;

    AppServerClient *client = [[AppServerClient alloc] initWithExecutable:executable];
    client.extraEnvironment = AccountEnvironment(@"codex", [request[@"accountHome"] isKindOfClass:NSString.class] ? request[@"accountHome"] : @"");
    NSMutableDictionary *context = [@{ @"client":client, @"cardID":cardID, @"card":card, @"space":space,
        @"mode":request[@"mode"] ?: @"readOnly", @"autoApprove":@([request[@"autoApprove"] boolValue]),
        @"forceNew":@([request[@"newConversation"] boolValue]), @"finished":@NO, @"latestSummary":@"",
        @"permissions":[NSMutableDictionary dictionary] } mutableCopy];
    NSString *conversationKey = [self conversationKeyForRequest:request];
    if (conversationKey.length) context[@"conversationKey"] = conversationKey;
    self.runs[cardID] = context;
    __weak typeof(self) weakSelf = self;
    NSError *error = nil;
    BOOL launched = [client startWithMessageHandler:^(NSDictionary *message) {
        [weakSelf handleRunMessage:message context:context];
    } terminationHandler:^(int status, NSString *stderrText) {
        if (![context[@"finished"] boolValue]) {
            NSString *detail = stderrText.length ? stderrText : [NSString stringWithFormat:L(@"App Server arrêté (code %d).", @"App Server stopped (code %d)."), status];
            [weakSelf finishRun:context success:NO error:detail];
        }
    } error:&error];
    if (!launched) { self.runs[cardID] = nil; [self failCard:cardID message:error.localizedDescription ?: L(@"Impossible de lancer Codex App Server.", @"Codex App Server could not be started.") card:card]; [self startNextQueued]; return; }
    [self sendFunction:@"runnerStarted" object:@{ @"cardID":cardID }];
    [client sendMessage:[self initializeMessage]];
}

- (NSString *)claudeExecutable {
    return FindAgentExecutable(@"claude", @[EnvValue(@"CLAUDE_PATH") ?: @"", EnvValue(@"CLAUDE_EXECUTABLE") ?: @""], @[]);
}

// Sonde de connexion. Un aller-retour reel est la seule preuve qu un moteur peut
// travailler : « claude auth status » peut annoncer un compte connecte pendant que
// l API repond 401 sur un jeton revoque, et « codex login status » ne dit rien du
// quota. La detection de l executable ne prouve donc rien a elle seule.
// Comptes multiples. Les deux CLI rangent leur authentification dans un dossier
// designe par une variable d environnement : CODEX_HOME pour Codex,
// CLAUDE_CONFIG_DIR pour Claude Code. Un compte n est donc rien d autre qu un
// dossier, et changer de compte revient a changer cette variable. Verifie : un
// dossier vierge repond « Not logged in » la ou le dossier par defaut repond
// « Logged in ».
static NSDictionary<NSString *, NSString *> *AccountEnvironment(NSString *engine, NSString *home) {
    NSString *path = [home stringByStandardizingPath];
    if (!path.length) return @{};   // dossier par defaut du CLI
    BOOL directory = NO;
    NSFileManager *files = NSFileManager.defaultManager;
    if (![files fileExistsAtPath:path isDirectory:&directory] || !directory)
        [files createDirectoryAtPath:path withIntermediateDirectories:YES
                          attributes:@{ NSFilePosixPermissions:@(0700) } error:nil];
    return [engine hasPrefix:@"claude"] ? @{ @"CLAUDE_CONFIG_DIR":path } : @{ @"CODEX_HOME":path };
}

// Claude Code ne propose pas l equivalent de thread/read. Ses conversations
// locales sont toutefois ecrites dans CLAUDE_CONFIG_DIR/projects sous forme de
// JSONL. Les relire n envoie aucun prompt et ne modifie pas la session.
static NSURL *ClaudeSessionURL(NSString *sessionID, NSString *home) {
    if (![[NSUUID alloc] initWithUUIDString:sessionID ?: @""]) return nil;
    NSString *config = home.length ? home.stringByStandardizingPath : [NSHomeDirectory() stringByAppendingPathComponent:@".claude"];
    NSString *projects = [config stringByAppendingPathComponent:@"projects"];
    BOOL directory = NO;
    if (![NSFileManager.defaultManager fileExistsAtPath:projects isDirectory:&directory] || !directory) return nil;
    NSString *target = [sessionID stringByAppendingPathExtension:@"jsonl"];
    NSDirectoryEnumerator<NSURL *> *files = [NSFileManager.defaultManager enumeratorAtURL:[NSURL fileURLWithPath:projects isDirectory:YES]
        includingPropertiesForKeys:nil options:NSDirectoryEnumerationSkipsHiddenFiles errorHandler:^BOOL(__unused NSURL *url, __unused NSError *error) { return YES; }];
    for (NSURL *url in files) if ([url.lastPathComponent isEqualToString:target]) return url;
    return nil;
}

static NSString *ClaudeAssistantText(NSDictionary *record) {
    if (![record[@"type"] isEqual:@"assistant"]) return @"";
    NSDictionary *message = [record[@"message"] isKindOfClass:NSDictionary.class] ? record[@"message"] : nil;
    id content = message[@"content"];
    if ([content isKindOfClass:NSString.class]) return content;
    if (![content isKindOfClass:NSArray.class]) return @"";
    NSMutableArray<NSString *> *parts = [NSMutableArray array];
    for (id item in content) if ([item isKindOfClass:NSDictionary.class] && [item[@"type"] isEqual:@"text"] && [item[@"text"] isKindOfClass:NSString.class]) [parts addObject:item[@"text"]];
    return [parts componentsJoinedByString:@"\n"];
}

static NSDictionary *ClaudeSessionSnapshot(NSDictionary *descriptor) {
    NSString *sessionID = [descriptor[@"sessionID"] isKindOfClass:NSString.class] ? descriptor[@"sessionID"] : @"";
    NSString *accountID = [descriptor[@"accountID"] isKindOfClass:NSString.class] ? descriptor[@"accountID"] : @"";
    NSString *home = [descriptor[@"accountHome"] isKindOfClass:NSString.class] ? descriptor[@"accountHome"] : @"";
    NSURL *url = ClaudeSessionURL(sessionID, home);
    if (!url) return @{ @"sessionID":sessionID, @"accountID":accountID, @"found":@NO,
                        @"error":L(@"Session locale Claude introuvable.", @"Local Claude session not found.") };
    NSDictionary *attributes = [NSFileManager.defaultManager attributesOfItemAtPath:url.path error:nil];
    unsigned long long size = [attributes[NSFileSize] unsignedLongLongValue], limit = 4 * 1024 * 1024;
    NSFileHandle *handle = [NSFileHandle fileHandleForReadingFromURL:url error:nil];
    if (!handle) return @{ @"sessionID":sessionID, @"accountID":accountID, @"found":@NO,
                           @"error":L(@"Session locale Claude illisible.", @"Local Claude session is unreadable.") };
    unsigned long long offset = size > limit ? size - limit : 0;
    if (offset) [handle seekToFileOffset:offset];
    NSData *tail = [handle readDataToEndOfFile];
    [handle closeFile];
    NSString *text = [[NSString alloc] initWithData:tail encoding:NSUTF8StringEncoding] ?: @"";
    NSArray<NSString *> *lines = [text componentsSeparatedByCharactersInSet:NSCharacterSet.newlineCharacterSet];
    NSString *preview = @"", *cwd = @"", *updatedAt = @"";
    NSInteger firstCompleteLine = offset ? 1 : 0;
    for (NSInteger index = (NSInteger)lines.count - 1; index >= firstCompleteLine; index--) {
        NSData *line = [lines[index] dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary *record = line.length ? [NSJSONSerialization JSONObjectWithData:line options:0 error:nil] : nil;
        if (![record isKindOfClass:NSDictionary.class]) continue;
        if (!cwd.length && [record[@"cwd"] isKindOfClass:NSString.class]) cwd = record[@"cwd"];
        if (!updatedAt.length && [record[@"timestamp"] isKindOfClass:NSString.class]) updatedAt = record[@"timestamp"];
        if (!preview.length) preview = ClaudeAssistantText(record);
        if (preview.length && cwd.length && updatedAt.length) break;
    }
    if (!updatedAt.length && [attributes[NSFileModificationDate] isKindOfClass:NSDate.class])
        updatedAt = [[[NSISO8601DateFormatter alloc] init] stringFromDate:attributes[NSFileModificationDate]];
    if (preview.length > 12000) preview = [[preview substringToIndex:12000] stringByAppendingString:@"…"];
    return @{ @"sessionID":sessionID, @"accountID":accountID, @"found":@YES, @"preview":preview ?: @"",
              @"cwd":cwd ?: @"", @"updatedAt":updatedAt ?: @"" };
}

- (NSString *)readableEngineFailure:(NSString *)raw claude:(BOOL)claude {
    // Les moteurs melangent avertissements et erreur reelle sur la meme sortie :
    // on retient la ligne qui porte le motif, pas le bruit d installation.
    NSMutableArray<NSString *> *lines = [NSMutableArray array];
    for (NSString *line in [(raw ?: @"") componentsSeparatedByCharactersInSet:NSCharacterSet.newlineCharacterSet]) {
        NSString *trimmed = [line stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
        if (!trimmed.length || [trimmed hasPrefix:@"warning:"] || [trimmed hasPrefix:@"Warning:"]) continue;
        [lines addObject:trimmed];
    }
    NSString *text = lines.lastObject ?: @"";
    for (NSString *line in lines) if ([line hasPrefix:@"ERROR:"]) text = [[line substringFromIndex:6] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
    if ([text localizedCaseInsensitiveContainsString:@"revoked"] || [text localizedCaseInsensitiveContainsString:@"authenticate"] || [text localizedCaseInsensitiveContainsString:@"401"])
        return claude ? L(@"La connexion Claude a expiré ou a été révoquée. Dans Terminal, lance « claude auth login », puis relance ce test.", @"The Claude connection expired or was revoked. Run \"claude auth login\" in Terminal, then run this test again.")
                      : L(@"La connexion Codex a expiré. Dans Terminal, lance « codex login », puis relance ce test.", @"The Codex connection expired. Run \"codex login\" in Terminal, then run this test again.");
    if (!text.length) return L(@"Le moteur s’est arrêté sans rien répondre.", @"The engine stopped without answering.");
    return text.length > 400 ? [[text substringToIndex:400] stringByAppendingString:@"…"] : text;
}

// Connexion d un moteur. Les deux CLI ouvrent un flux navigateur et parlent a un
// terminal : on ouvre donc Terminal sur la commande plutot que de la capturer,
// pour que l utilisateur voie exactement ce qui se passe et puisse repondre.
- (NSString *)biometryName {
    LAContext *context = [[LAContext alloc] init];
    if (![context canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:nil]) return @"";
    if (context.biometryType == LABiometryTypeTouchID) return @"Touch ID";
    if (context.biometryType == LABiometryTypeOpticID) return @"Optic ID";
    return L(@"la biométrie", @"biometrics");
}

- (void)authenticate:(NSString *)reason completion:(void (^)(BOOL, NSString *))completion {
    LAContext *context = [[LAContext alloc] init];
    context.localizedCancelTitle = L(@"Annuler", @"Undo");
    NSError *error = nil;
    // LAPolicyDeviceOwnerAuthentication accepte aussi le mot de passe de session :
    // un Mac sans Touch ID reste utilisable.
    if (![context canEvaluatePolicy:LAPolicyDeviceOwnerAuthentication error:&error]) {
        completion(NO, error.localizedDescription ?: L(@"Cette machine ne propose ni biométrie ni mot de passe de session.", @"This machine offers neither biometrics nor a login password."));
        return;
    }
    [context evaluatePolicy:LAPolicyDeviceOwnerAuthentication localizedReason:reason reply:^(BOOL success, NSError *failure) {
        dispatch_async(dispatch_get_main_queue(), ^{
            completion(success, success ? nil : (failure.code == LAErrorUserCancel ? @"" : failure.localizedDescription));
        });
    }];
}

- (void)sendSecurityStatus {
    [self sendFunction:@"securityStatus" object:@{ @"lockEnabled":@(AppLockEnabled()), @"biometry":[self biometryName] }];
}

- (void)setAppLock:(BOOL)enabled {
    __weak typeof(self) weakSelf = self;
    [self authenticate:enabled ? L(@"activer le verrouillage de CTRL KANB", @"turn on the CTRL KANB lock") : L(@"désactiver le verrouillage de CTRL KANB", @"turn off the CTRL KANB lock")
            completion:^(BOOL success, NSString *message) {
        if (success && !SetAppLockEnabled(enabled)) message = L(@"Le trousseau a refusé d’enregistrer le réglage.", @"The keychain refused to store the setting.");
        if (message.length) [weakSelf sendFunction:@"nativeError" object:@{ @"message":message }];
        [weakSelf sendSecurityStatus];
    }];
}

// L ecran de verrouillage est natif et index.html n est pas charge tant qu il est
// affiche : aucune donnee du Kanban n atteint la WebView avant l accord.
- (void)presentLockScreen {
    self.locked = YES;
    if (self.lockView) { [self promptUnlock]; return; }
    NSView *container = self.window.contentView;
    NSView *cover = [[NSView alloc] initWithFrame:container.bounds];
    cover.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    cover.wantsLayer = YES;
    cover.layer.backgroundColor = [NSColor colorWithCalibratedRed:0.96 green:0.96 blue:0.94 alpha:1].CGColor;

    NSTextField *title = [NSTextField labelWithString:L(@"CTRL KANB est verrouillé", @"CTRL KANB is locked")];
    title.font = [NSFont systemFontOfSize:22 weight:NSFontWeightSemibold];
    title.alignment = NSTextAlignmentCenter;
    NSString *biometry = [self biometryName];
    NSTextField *subtitle = [NSTextField labelWithString:biometry.length
        ? [NSString stringWithFormat:L(@"Déverrouille avec %@ ou le mot de passe de ta session.", @"Unlock with %@ or your login password."), biometry]
        : L(@"Déverrouille avec le mot de passe de ta session.", @"Unlock with your login password.")];
    subtitle.font = [NSFont systemFontOfSize:12];
    subtitle.textColor = NSColor.secondaryLabelColor;
    subtitle.alignment = NSTextAlignmentCenter;
    NSButton *button = [NSButton buttonWithTitle:L(@"Déverrouiller", @"Unlock") target:self action:@selector(promptUnlock)];
    button.keyEquivalent = @"\r";
    button.bezelStyle = NSBezelStyleRounded;

    NSStackView *stack = [NSStackView stackViewWithViews:@[title, subtitle, button]];
    stack.orientation = NSUserInterfaceLayoutOrientationVertical;
    stack.alignment = NSLayoutAttributeCenterX;
    stack.spacing = 14;
    stack.translatesAutoresizingMaskIntoConstraints = NO;
    [cover addSubview:stack];
    [NSLayoutConstraint activateConstraints:@[
        [stack.centerXAnchor constraintEqualToAnchor:cover.centerXAnchor],
        [stack.centerYAnchor constraintEqualToAnchor:cover.centerYAnchor],
    ]];
    [container addSubview:cover positioned:NSWindowAbove relativeTo:nil];
    self.lockView = cover;
    self.webView.hidden = YES;
    [self promptUnlock];
}

- (void)promptUnlock {
    if (self.unlockPending) return;
    self.unlockPending = YES;
    __weak typeof(self) weakSelf = self;
    [self authenticate:L(@"ouvrir CTRL KANB", @"open CTRL KANB") completion:^(BOOL success, __unused NSString *message) {
        weakSelf.unlockPending = NO;
        if (success) [weakSelf dismissLockScreen];
    }];
}

- (void)dismissLockScreen {
    [self.lockView removeFromSuperview];
    self.lockView = nil;
    self.locked = NO;
    self.webView.hidden = NO;
    [self loadWorkspace];
}

- (void)loadWorkspace {
    NSURL *resourceURL = NSBundle.mainBundle.resourceURL;
    [self.webView loadFileURL:[resourceURL URLByAppendingPathComponent:@"index.html"] allowingReadAccessToURL:resourceURL];
}

- (void)lockNow:(__unused id)sender {
    if (!AppLockEnabled() || self.lockView) return;
    [self.webView loadHTMLString:@"" baseURL:nil];
    [self presentLockScreen];
}

- (void)openEngineLogin:(NSString *)engine home:(NSString *)home account:(NSString *)account {
    BOOL claude = [engine hasPrefix:@"claude"];
    NSString *label = claude ? @"claude-code" : @"codex";
    NSString *executable = claude ? [self claudeExecutable] : [self codexExecutable];
    if (!executable) {
        [self sendFunction:@"agentProbeResult" object:@{ @"engine":label, @"account":account ?: @"", @"state":@"missing", @"at":ISODate(),
            @"detail":claude ? L(@"Commande claude introuvable. Installe la CLI officielle.", @"The claude command was not found. Install the official CLI.") : L(@"Commande codex introuvable. Installe la CLI officielle.", @"The codex command was not found. Install the official CLI.") }];
        return;
    }
    NSString *command = claude ? @"auth login" : @"login";
    NSDictionary *accountEnv = AccountEnvironment(engine, home);
    NSMutableString *exports = [NSMutableString string];
    for (NSString *key in accountEnv)
        [exports appendFormat:@"export %@='%@'\n", key,
            [accountEnv[key] stringByReplacingOccurrencesOfString:@"'" withString:@"'\\''"]];
    NSString *script = [NSString stringWithFormat:
        @"#!/bin/zsh\n"
        "%@"
        "echo \"CTRL KANB — connexion %@\"\n"
        "echo\n"
        "%@ %@\n"
        "status=$?\n"
        "echo\n"
        "if [ $status -eq 0 ]; then echo \"Connexion terminée. Retourne dans CTRL KANB et relance « Tester la connexion ».\"; else echo \"La connexion a échoué (code $status).\"; fi\n",
        exports,
        claude ? @"Claude Code" : @"Codex",
        [NSString stringWithFormat:@"'%@'", [executable stringByReplacingOccurrencesOfString:@"'" withString:@"'\\''"]],
        command];
    NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"ctrl-kanb-login-%@.command", UUIDString()]];
    NSError *error = nil;
    if (![script writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:&error]) {
        [self sendFunction:@"agentProbeResult" object:@{ @"engine":label, @"account":account ?: @"", @"state":@"blocked", @"at":ISODate(),
            @"detail":error.localizedDescription ?: L(@"Impossible de préparer la connexion.", @"The sign-in could not be prepared.") }];
        return;
    }
    [NSFileManager.defaultManager setAttributes:@{ NSFilePosixPermissions:@(0700) } ofItemAtPath:path error:nil];
    if (![NSWorkspace.sharedWorkspace openURL:[NSURL fileURLWithPath:path]]) {
        [NSFileManager.defaultManager removeItemAtPath:path error:nil];
        [self sendFunction:@"agentProbeResult" object:@{ @"engine":label, @"account":account ?: @"", @"state":@"blocked", @"at":ISODate(),
            @"detail":L(@"Impossible d’ouvrir Terminal.", @"Could not open Terminal.") }];
        return;
    }
    RemoveTemporaryFileLater(path);
    [self sendFunction:@"agentProbeResult" object:@{ @"engine":label, @"account":account ?: @"", @"state":@"login", @"at":ISODate(),
        @"detail":[NSString stringWithFormat:L(@"Terminal est ouvert sur « %@ ». Termine la connexion, puis relance le test.", @"Terminal is open on \"%@\". Finish signing in, then run the test again."), claude ? @"claude auth login" : @"codex login"] }];
}

- (void)probeAgent:(NSString *)engine home:(NSString *)home account:(NSString *)account {
    BOOL claude = [engine hasPrefix:@"claude"];
    NSString *label = claude ? @"claude-code" : @"codex";
    NSString *executable = claude ? [self claudeExecutable] : [self codexExecutable];
    if (!executable) {
        [self sendFunction:@"agentProbeResult" object:@{ @"engine":label, @"account":account ?: @"", @"state":@"missing", @"at":ISODate(),
            @"detail":claude ? L(@"Commande claude introuvable. Installe la CLI officielle.", @"The claude command was not found. Install the official CLI.") : L(@"Commande codex introuvable. Installe la CLI officielle.", @"The codex command was not found. Install the official CLI.") }];
        return;
    }
    [self sendFunction:@"agentProbeResult" object:@{ @"engine":label, @"account":account ?: @"", @"state":@"running", @"at":ISODate(), @"detail":L(@"Envoi d’un aller-retour de test…", @"Sending a test round trip…") }];

    NSString *prompt = @"Reponds uniquement par le mot pong.";
    NSString *lastMessage = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"ctrl-kanb-probe-%@.txt", UUIDString()]];
    // Cote Claude la consigne passe par stdin : « --mcp-config » et « --tools »
    // acceptent plusieurs valeurs et avalent un prompt place en argument.
    NSArray *arguments = claude
        ? @[@"--print", @"--output-format", @"json", @"--model", @"haiku", @"--disable-slash-commands",
            @"--strict-mcp-config", @"--mcp-config", @"{\"mcpServers\":{}}", @"--tools", @""]
        : @[@"exec", @"--skip-git-repo-check", @"--sandbox", @"read-only", @"--color", @"never",
            @"--output-last-message", lastMessage, prompt];

    __weak typeof(self) weakSelf = self;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSTask *task = [[NSTask alloc] init];
        task.executableURL = [NSURL fileURLWithPath:executable];
        task.arguments = arguments;
        task.currentDirectoryURL = [NSURL fileURLWithPath:NSTemporaryDirectory()];
        NSMutableDictionary *environment = [NSProcessInfo.processInfo.environment mutableCopy];
        environment[@"PATH"] = [NSString stringWithFormat:@"/opt/homebrew/bin:/usr/local/bin:%@", environment[@"PATH"] ?: @"/usr/bin:/bin"];
        [environment removeObjectForKey:@"CLAUDECODE"];
        [environment addEntriesFromDictionary:AccountEnvironment(engine, home)];
        task.environment = environment;
        NSPipe *outPipe = [NSPipe pipe], *errPipe = [NSPipe pipe];
        NSPipe *inPipe = claude ? [NSPipe pipe] : nil;
        task.standardOutput = outPipe; task.standardError = errPipe;
        task.standardInput = inPipe ?: (id)[NSFileHandle fileHandleWithNullDevice];

        NSError *launchError = nil;
        if (![task launchAndReturnError:&launchError]) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [weakSelf sendFunction:@"agentProbeResult" object:@{ @"engine":label, @"account":account ?: @"", @"state":@"blocked", @"at":ISODate(),
                    @"detail":launchError.localizedDescription ?: L(@"Impossible de lancer le moteur.", @"The engine could not be started.") }];
            });
            return;
        }
        if (inPipe) {
            [inPipe.fileHandleForWriting writeData:[prompt dataUsingEncoding:NSUTF8StringEncoding]];
            [inPipe.fileHandleForWriting closeFile];
        }
        // Un moteur bloque sur une invite ne doit pas figer la sonde.
        __block BOOL timedOut = NO;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 90 * NSEC_PER_SEC), dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
            if (task.running) { timedOut = YES; [task terminate]; }
        });
        NSData *outData = [outPipe.fileHandleForReading readDataToEndOfFile];
        NSData *errData = [errPipe.fileHandleForReading readDataToEndOfFile];
        [task waitUntilExit];

        NSString *out = [[NSString alloc] initWithData:outData encoding:NSUTF8StringEncoding] ?: @"";
        NSString *err = [[NSString alloc] initWithData:errData encoding:NSUTF8StringEncoding] ?: @"";
        NSString *answer = nil, *failure = nil;
        if (timedOut) {
            NSString *trace = [self readableEngineFailure:(err.length ? err : out) claude:claude];
            failure = [trace hasPrefix:L(@"Le moteur s’est arrêté", @"The engine stopped")]
                ? L(@"Aucune réponse au bout de 90 secondes.", @"No answer after 90 seconds.")
                : [NSString stringWithFormat:L(@"Aucune réponse au bout de 90 secondes. Dernier message du moteur : %@", @"No answer after 90 seconds. The engine's last message: %@"), trace];
        } else if (claude) {
            id parsed = [NSJSONSerialization JSONObjectWithData:outData options:0 error:nil];
            NSString *result = [parsed isKindOfClass:NSDictionary.class] ? parsed[@"result"] : nil;
            BOOL failed = [parsed isKindOfClass:NSDictionary.class] ? [parsed[@"is_error"] boolValue] : YES;
            if (!failed && [result isKindOfClass:NSString.class] && result.length) answer = result;
            else failure = [self readableEngineFailure:([result isKindOfClass:NSString.class] && result.length ? result : (err.length ? err : out)) claude:YES];
        } else {
            NSString *written = [NSString stringWithContentsOfFile:lastMessage encoding:NSUTF8StringEncoding error:nil];
            written = [written stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
            if (task.terminationStatus == 0 && written.length) answer = written;
            else failure = [self readableEngineFailure:(err.length ? err : out) claude:NO];
        }
        [NSFileManager.defaultManager removeItemAtPath:lastMessage error:nil];

        NSString *detail = answer.length
            ? (answer.length > 120 ? [[answer substringToIndex:120] stringByAppendingString:@"…"] : answer)
            : (failure ?: L(@"Le moteur n’a pas répondu.", @"The engine did not answer."));
        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf sendFunction:@"agentProbeResult" object:@{ @"engine":label, @"account":account ?: @"", @"at":ISODate(),
                @"state":answer.length ? @"ready" : @"blocked", @"detail":detail }];
        });
    });
}

- (void)startClaudeRequest:(NSDictionary *)request {
    NSDictionary *card=request[@"card"],*space=request[@"space"];
    NSString *cardID=card[@"id"],*executable=[self claudeExecutable];
    NSString *pathError=nil;
    NSString *cwd=[self projectRootForSpaceID:space[@"id"] requestedPath:space[@"rootPath"] error:&pathError];
    BOOL directory=NO;
    if(!executable){[self failCard:cardID message:L(@"Claude Code est introuvable. Installe la CLI officielle et connecte ton compte dans le terminal.", @"Claude Code was not found. Install the official CLI and sign in from the terminal.") card:card];[self startNextQueued];return;}
    if(!cwd.length||![NSFileManager.defaultManager fileExistsAtPath:cwd isDirectory:&directory]||!directory){[self failCard:cardID message:pathError?:L(@"Le dossier du projet est introuvable.", @"The project folder was not found.") card:card];[self startNextQueued];return;}
    NSMutableDictionary *storedSpace=[space mutableCopy];
    storedSpace[@"rootPath"]=cwd;
    space=storedSpace;
    BOOL readOnly=![request[@"mode"] isEqual:@"workspaceWrite"];
    NSString *model=[card[@"model"] isKindOfClass:NSString.class]?card[@"model"]:@"sonnet";
    if([model hasPrefix:@"gpt-"]||!model.length)model=@"sonnet";
    NSString *effort=card[@"reasoningEffort"]?:@"medium";
    if(![@[@"low",@"medium",@"high",@"xhigh",@"max"] containsObject:effort])effort=@"medium";
    NSString *sessionName=[card[@"title"] isKindOfClass:NSString.class]&&[card[@"title"] length]?card[@"title"]:L(@"Tâche CTRL KANB", @"CTRL KANB task");
    NSMutableArray *args=[@[@"--print",@"--verbose",@"--input-format",@"stream-json",@"--output-format",@"stream-json",@"--permission-prompt-tool",@"stdio",@"--permission-mode",@"default",@"--model",model,@"--effort",effort,@"--name",sessionName,@"--strict-mcp-config",@"--mcp-config",@"{\"mcpServers\":{}}"] mutableCopy];
    // Analysis exposes only built-in reading tools. Permissions are not an OS sandbox.
    if(readOnly)[args addObjectsFromArray:@[@"--setting-sources",@"",@"--tools",@"Read,Glob,Grep",@"--disable-slash-commands"]];
    NSString *session=card[@"conversationID"];
    if(session.length&&![request[@"newConversation"] boolValue]){
        if(![[NSUUID alloc]initWithUUIDString:session]){[self failCard:cardID message:L(@"L’identifiant de session Claude est invalide.", @"That Claude session id is not valid.") card:card];[self startNextQueued];return;}
        [args addObjectsFromArray:@[@"--resume",session]];
    } else {
        // A stable id makes the same session addressable from CTRL KANB, the
        // terminal and Claude Desktop as soon as Claude creates its transcript.
        session=UUIDString();
        [args addObjectsFromArray:@[@"--session-id",session]];
    }
    AppServerClient *client=[[AppServerClient alloc]initWithExecutable:executable arguments:args cwd:cwd];
    client.extraEnvironment=AccountEnvironment(@"claude-code", [request[@"accountHome"] isKindOfClass:NSString.class]?request[@"accountHome"]:@"");
    NSMutableDictionary *context=[@{@"client":client,@"cardID":cardID,@"card":card,@"space":space,@"mode":readOnly?@"readOnly":@"workspaceWrite",@"engine":@"claude-code",@"conversationKey":[NSString stringWithFormat:@"claude-code:%@",session],@"finished":@NO,@"latestSummary":@"",@"permissions":[NSMutableDictionary dictionary]}mutableCopy];
    self.runs[cardID]=context;
    __weak typeof(self) weakSelf=self;
    NSError *error=nil;
    BOOL launched=[client startWithMessageHandler:^(NSDictionary *message){[weakSelf handleClaudeMessage:message context:context];} terminationHandler:^(int status,NSString *stderrText){if(![context[@"finished"]boolValue])[weakSelf finishRun:context success:NO error:stderrText.length?stderrText:L(@"Claude Code s’est arrêté avant de produire un résultat.", @"Claude Code stopped before producing a result.")];} error:&error];
    if(!launched){self.runs[cardID]=nil;[self failCard:cardID message:error.localizedDescription?:L(@"Impossible de lancer Claude Code.", @"Claude Code could not be started.") card:card];[self startNextQueued];return;}
    [self sendFunction:@"runnerStarted" object:@{@"cardID":cardID}];
    [client sendMessage:@{@"type":@"control_request",@"request_id":@"ctrl-init",@"request":@{@"subtype":@"initialize"}}];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,60*NSEC_PER_SEC),dispatch_get_main_queue(),^{if(![context[@"finished"]boolValue]&&![context[@"initialized"]boolValue])[weakSelf finishRun:context success:NO error:L(@"Claude Code n’a pas répondu à l’initialisation. Vérifie sa connexion dans le terminal.", @"Claude Code did not answer the handshake. Check its connection from the terminal.")];});
}

- (void)handleClaudeMessage:(NSDictionary *)message context:(NSMutableDictionary *)context {
    if([context[@"finished"]boolValue])return;
    AppServerClient *client=context[@"client"];
    NSString *type=message[@"type"],*cardID=context[@"cardID"];
    if([type isEqual:@"control_response"]&&[message[@"response"][@"request_id"] isEqual:@"ctrl-init"]){
        if([message[@"response"][@"subtype"]isEqual:@"error"]){[self finishRun:context success:NO error:message[@"response"][@"error"]?:L(@"Initialisation Claude refusée.", @"Claude refused the handshake.")];return;}
        context[@"initialized"]=@YES;
        [client sendMessage:@{@"type":@"user",@"message":@{@"role":@"user",@"content":context[@"card"][@"prompt"]?:@""},@"parent_tool_use_id":NSNull.null,@"session_id":@""}];
    }
    NSString *session=message[@"session_id"];
    if([session isKindOfClass:NSString.class]&&session.length&&![session isEqual:context[@"threadID"]]){
        context[@"threadID"]=session;
        [self sendFunction:@"conversationAssociated" object:@{@"cardID":cardID,@"threadID":session,@"engine":@"claude-code",@"name":context[@"card"][@"title"]?:L(@"Session Claude", @"Claude session"),@"cwd":context[@"space"][@"rootPath"],@"projectName":context[@"space"][@"name"]?:@"",@"accountID":context[@"card"][@"accountID"]?:@""}];
    }
    if([type isEqual:@"assistant"]){
        NSArray *content=message[@"message"][@"content"];
        if([content isKindOfClass:NSArray.class])for(NSDictionary *block in content){
            if([block[@"type"]isEqual:@"text"]&&[block[@"text"]isKindOfClass:NSString.class]){context[@"latestSummary"]=block[@"text"];[self sendFunction:@"runnerEvent" object:@{@"cardID":cardID,@"message":block[@"text"]}];}
            else if([block[@"type"]isEqual:@"tool_use"]){[self sendFunction:@"runnerEvent" object:@{@"cardID":cardID,@"message":[NSString stringWithFormat:L(@"Claude utilise %@…", @"Claude is using %@…"),block[@"name"]?:L(@"un outil", @"a tool")]}];}
        }
    }else if([type isEqual:@"result"]){
        BOOL success=![message[@"is_error"]boolValue]&&[message[@"subtype"]isEqual:@"success"];
        if([message[@"result"]isKindOfClass:NSString.class]&&[message[@"result"]length])context[@"latestSummary"]=message[@"result"];
        NSString *error=nil;
        if(!success){NSArray *errors=message[@"errors"];error=[errors isKindOfClass:NSArray.class]&&errors.count?[errors componentsJoinedByString:@"\n"]:([context[@"latestSummary"]length]?context[@"latestSummary"]:L(@"Claude Code n’a pas terminé cette exécution.", @"Claude Code did not finish this run."));}
        if(!success&&([error localizedCaseInsensitiveContainsString:@"authenticate"]||[error localizedCaseInsensitiveContainsString:@"token has been revoked"])){error=L(@"La connexion Claude a expiré ou a été révoquée. Dans Terminal, lance « claude auth login », puis relance cette tâche.", @"The Claude connection expired or was revoked. Run \"claude auth login\" in Terminal, then run this task again.");context[@"latestSummary"]=error;}
        [self finishRun:context success:success error:error];
    }else if([type isEqual:@"control_request"]){
        NSDictionary *request=message[@"request"];
        NSString *requestID=message[@"request_id"];
        if(![requestID isKindOfClass:NSString.class])return;
        if(![request[@"subtype"]isEqual:@"can_use_tool"]){[client sendMessage:@{@"type":@"control_response",@"response":@{@"subtype":@"error",@"request_id":requestID,@"error":L(@"Cette demande n’est pas prise en charge par CTRL KANB.", @"CTRL KANB does not support this request.")}}];return;}
        context[@"permissions"][requestID]=request;
        NSString *tool=request[@"tool_name"]?:@"Outil";NSDictionary *input=[request[@"input"]isKindOfClass:NSDictionary.class]?request[@"input"]:@{};
        if([context[@"mode"]isEqual:@"readOnly"]){
            if(![@[@"Read",@"Glob",@"Grep"]containsObject:tool] ||
               !ClaudeReadInputStaysInProject(tool, input, context[@"space"][@"rootPath"])){
                [self sendFunction:@"runnerEvent" object:@{
                    @"cardID":cardID,
                    @"message":L(@"Lecture refusée : le chemin demandé sort du dossier du projet.", @"Read denied: the requested path is outside the project folder.")
                }];
                [self respondToClaudeRequest:@{@"requestID":requestID,@"result":@{@"decision":@"decline"},@"cardID":cardID} context:context];
                return;
            }
        }
        BOOL question=[tool isEqual:@"AskUserQuestion"];
        NSMutableDictionary *params=[@{@"cwd":context[@"space"][@"rootPath"],@"tool":tool,@"input":input}mutableCopy];
        if(question){NSMutableArray *questions=[NSMutableArray array];for(NSDictionary *q in input[@"questions"]?:@[]){[questions addObject:@{@"id":q[@"question"]?:q[@"header"]?:UUIDString(),@"header":q[@"header"]?:@"Question",@"question":q[@"question"]?:@"",@"options":q[@"options"]?:@[],@"multiSelect":q[@"multiSelect"]?:@NO}];}params[@"questions"]=questions;}
        else{NSData *json=[NSJSONSerialization dataWithJSONObject:input options:NSJSONWritingPrettyPrinted error:nil];params[@"command"]=[NSString stringWithFormat:@"%@\n%@",tool,[[NSString alloc]initWithData:json encoding:NSUTF8StringEncoding]?:@""];}
        [self sendFunction:@"approvalRequested" object:@{@"cardID":cardID,@"requestID":requestID,@"kind":question?@"input":([@[@"Edit",@"Write",@"NotebookEdit"]containsObject:tool]?@"file":@"command"),@"params":params,@"agentEngine":@"claude-code",@"mode":context[@"mode"],@"threadID":context[@"threadID"]?:@""}];
        [self notifyTitle:question?L(@"Claude attend une réponse", @"Claude is waiting for an answer"):L(@"Autorisation Claude requise", @"Claude needs approval") message:context[@"card"][@"title"]?:L(@"Une tâche attend ton retour.", @"A task is waiting on you.") category:@"approval" card:context[@"card"]];
    }else if([type isEqual:@"control_cancel_request"]){
        NSString *rid=message[@"request_id"];if(rid){[context[@"permissions"]removeObjectForKey:rid];[self sendFunction:@"requestResolved" object:@{@"cardID":cardID,@"requestID":rid}];}
    }
}

- (void)respondToClaudeRequest:(NSDictionary *)body context:(NSMutableDictionary *)context {
    NSString *rid=body[@"requestID"];NSDictionary *request=rid?context[@"permissions"][rid]:nil;
    if(!request)return;
    NSDictionary *result=body[@"result"]?:@{};
    BOOL question=[request[@"tool_name"]isEqual:@"AskUserQuestion"];
    BOOL allow=[@[@"accept",@"acceptForSession"]containsObject:result[@"decision"]?:@""]||(question&&[result[@"answers"]count]>0);
    NSMutableDictionary *response=[@{@"behavior":allow?@"allow":@"deny"}mutableCopy];
    if(allow){
        NSMutableDictionary *input=[request[@"input"]mutableCopy]?:[NSMutableDictionary dictionary];
        if(question){NSMutableDictionary *answers=[NSMutableDictionary dictionary];for(NSString *key in result[@"answers"]){id value=result[@"answers"][key][@"answers"];answers[key]=[value isKindOfClass:NSArray.class]?[value componentsJoinedByString:@", "]:@"";}input[@"answers"]=answers;}
        response[@"updatedInput"]=input;
    }else response[@"message"]=L(@"Action refusée dans CTRL KANB. Respecte les droits et la décision de l’utilisateur.", @"Refused in CTRL KANB. Respect the granted access and the user's decision.");
    [context[@"client"]sendMessage:@{@"type":@"control_response",@"response":@{@"subtype":@"success",@"request_id":rid,@"response":response}}];
    [context[@"permissions"]removeObjectForKey:rid];
    [self sendFunction:@"requestResolved" object:@{@"cardID":context[@"cardID"],@"requestID":rid}];
}

- (void)notifyQueuePositions {
    NSMutableArray *items = [NSMutableArray array];
    // Chaque moteur a sa propre limite et se vide independamment : la position
    // annoncee se compte donc par moteur, sinon une carte Claude affichee en
    // n°3 demarre avant les cartes Codex annoncees devant elle.
    NSInteger codexPosition = 1, claudePosition = 1;
    for (NSDictionary *request in self.pendingRuns) {
        NSString *cardID = request[@"card"][@"id"];
        if (!cardID.length) continue;
        BOOL claude = [self requestUsesClaude:request];
        NSString *reason = [self activeConversationBlocksRequest:request] ? @"conversation" : @"capacity";
        [items addObject:@{ @"cardID":cardID, @"position":@(claude ? claudePosition++ : codexPosition++), @"reason":reason }];
    }
    [self sendFunction:@"queueUpdated" object:@{
        @"items":items,
        @"activeCodex":@([self activeRunCountForClaude:NO]),
        @"activeClaude":@([self activeRunCountForClaude:YES]),
        @"limitCodex":@(self.maxConcurrentCodexRuns),
        @"limitClaude":@(self.maxConcurrentClaudeRuns)
    }];
}

- (void)startNextQueued {
    while (self.pendingRuns.count > 0) {
        NSUInteger index = [self.pendingRuns indexOfObjectPassingTest:^BOOL(NSDictionary *request, NSUInteger idx, BOOL *stop) {
            return [self canStartRunRequest:request];
        }];
        if (index == NSNotFound) break;
        NSDictionary *next = self.pendingRuns[index];
        [self.pendingRuns removeObjectAtIndex:index];
        [self startRunRequest:next];
    }
    [self notifyQueuePositions];
}

- (NSDictionary *)codexProjectForPath:(NSString *)path projects:(NSArray *)projects {
    NSString *target = [[(path ?: @"") stringByStandardizingPath] stringByResolvingSymlinksInPath];
    NSDictionary *best = nil;
    NSUInteger bestLength = 0;
    for (NSDictionary *project in [projects isKindOfClass:NSArray.class] ? projects : @[]) {
        for (NSDictionary *root in [project[@"roots"] isKindOfClass:NSArray.class] ? project[@"roots"] : @[]) {
            NSString *raw = [root[@"path"] isKindOfClass:NSString.class] ? root[@"path"] : @"";
            NSString *candidate = [[raw stringByStandardizingPath] stringByResolvingSymlinksInPath];
            if (!candidate.length) continue;
            BOOL exact = [target isEqualToString:candidate];
            BOOL descendant = [target hasPrefix:[candidate stringByAppendingString:@"/"]];
            if ((exact || descendant) && candidate.length > bestLength) { best = project; bestLength = candidate.length; }
        }
    }
    return best;
}

- (void)startOrResumeCodexThread:(NSMutableDictionary *)context client:(AppServerClient *)client project:(NSDictionary *)project {
    NSDictionary *card = context[@"card"];
    NSString *threadID = card[@"conversationID"];
    BOOL resume = threadID.length && ![context[@"forceNew"] boolValue];
    if ([project[@"id"] isKindOfClass:NSString.class]) context[@"projectID"] = project[@"id"];
    if ([project[@"name"] isKindOfClass:NSString.class]) context[@"projectName"] = project[@"name"];
    NSMutableDictionary *params = [@{ @"cwd":context[@"space"][@"rootPath"], @"approvalPolicy":@"on-request",
        @"approvalsReviewer":[context[@"autoApprove"] boolValue] ? @"auto_review" : @"user",
        @"sandbox":[context[@"mode"] isEqualToString:@"workspaceWrite"] ? @"workspace-write" : @"read-only" } mutableCopy];
    if (resume) {
        params[@"threadId"] = threadID;
        params[@"excludeTurns"] = @YES;
    } else {
        params[@"serviceName"] = @"CTRL KANB";
        // Sans threadSource, le fil est bien rattache au projet Codex mais reste
        // hors de la liste des conversations : l app Codex n affiche que les fils
        // marques « user ». Verifie en base : nos fils avaient thread_source vide
        // la ou une conversation Codex normale porte « user ».
        params[@"threadSource"] = @"user";
        params[@"ephemeral"] = @([EnvValue(@"EPHEMERAL_THREADS") boolValue]);
        if ([context[@"projectID"] length]) params[@"projectId"] = context[@"projectID"];
    }
    context[@"createdThread"] = @(!resume);
    [client sendMessage:@{ @"id":@2, @"method":resume ? @"thread/resume" : @"thread/start", @"params":params }];
}

- (void)handleRunMessage:(NSDictionary *)message context:(NSMutableDictionary *)context {
    AppServerClient *client = context[@"client"];
    NSNumber *responseID = [message[@"id"] isKindOfClass:NSNumber.class] ? message[@"id"] : nil;
    NSDictionary *result = [message[@"result"] isKindOfClass:NSDictionary.class] ? message[@"result"] : nil;
    NSDictionary *rpcError = [message[@"error"] isKindOfClass:NSDictionary.class] ? message[@"error"] : nil;
    if (rpcError && [responseID isEqual:@20]) {
        // project/list est recent. Une ancienne CLI doit continuer a lancer la
        // tache, simplement sans classement automatique dans un projet Codex.
        [self startOrResumeCodexThread:context client:client project:nil];
        return;
    }
    NSString *rpcMessage = [rpcError[@"message"] isKindOfClass:NSString.class] ? rpcError[@"message"] : @"";
    if (rpcError && [responseID isEqual:@2] && ![context[@"forceNew"] boolValue] &&
        [rpcMessage localizedCaseInsensitiveContainsString:@"active writer"]) {
        // Une conversation ouverte dans Codex ne peut pas avoir deux auteurs en
        // meme temps. Le message de l utilisateur ne doit pas etre perdu : on
        // cree un nouveau fil dans le meme projet et on y envoie ce tour.
        context[@"forceNew"] = @YES;
        context[@"recoveredFromActiveWriter"] = @YES;
        [context removeObjectForKey:@"conversationKey"];
        NSDictionary *currentCard = context[@"card"];
        if ([currentCard[@"utilityChat"] boolValue]) {
            NSString *prompt = [currentCard[@"prompt"] isKindOfClass:NSString.class] ? currentCard[@"prompt"] : @"";
            NSString *firstLine = [[prompt componentsSeparatedByCharactersInSet:NSCharacterSet.newlineCharacterSet].firstObject
                stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
            if (firstLine.length) {
                if (firstLine.length > 58) firstLine = [[[firstLine substringToIndex:57]
                    stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet] stringByAppendingString:@"…"];
                NSMutableDictionary *renamedCard = [currentCard mutableCopy];
                renamedCard[@"title"] = firstLine;
                context[@"card"] = renamedCard;
            }
        }
        NSMutableDictionary *project = [NSMutableDictionary dictionary];
        if ([context[@"projectID"] length]) project[@"id"] = context[@"projectID"];
        if ([context[@"projectName"] length]) project[@"name"] = context[@"projectName"];
        [self startOrResumeCodexThread:context client:client project:project.count ? project : nil];
        return;
    }
    if (rpcError && ([responseID isEqual:@1] || [responseID isEqual:@2] || [responseID isEqual:@4])) {
        [self finishRun:context success:NO error:rpcError[@"message"] ?: L(@"Erreur App Server.", @"App Server error.")];
        return;
    }
    if ([responseID isEqual:@1]) {
        [client sendMessage:@{ @"method":@"initialized", @"params":@{} }];
        [client sendMessage:@{ @"id":@20, @"method":@"project/list", @"params":@{ @"limit":@200 } }];
    } else if ([responseID isEqual:@20]) {
        NSDictionary *project = [self codexProjectForPath:context[@"space"][@"rootPath"] projects:result[@"data"]];
        [self startOrResumeCodexThread:context client:client project:project];
    } else if ([responseID isEqual:@2]) {
        NSDictionary *thread = [result[@"thread"] isKindOfClass:NSDictionary.class] ? result[@"thread"] : nil;
        NSString *threadID = thread[@"id"];
        if (!threadID.length) { [self finishRun:context success:NO error:L(@"Codex n'a pas retourné d'identifiant de conversation.", @"Codex returned no conversation id.")]; return; }
        context[@"threadID"] = threadID;
        context[@"conversationKey"] = [NSString stringWithFormat:@"codex:%@",threadID];
        NSDictionary *card = context[@"card"];
        NSString *name = ([thread[@"name"] isKindOfClass:NSString.class] && [thread[@"name"] length]) ? thread[@"name"] : card[@"title"];
        NSMutableDictionary *association = [@{ @"cardID":context[@"cardID"], @"threadID":threadID, @"name":name ?: L(@"Conversation Codex", @"Codex conversation"), @"preview":thread[@"preview"] ?: @"", @"cwd":thread[@"cwd"] ?: context[@"space"][@"rootPath"], @"created":context[@"createdThread"] ?: @NO } mutableCopy];
        if ([context[@"card"][@"accountID"] length]) association[@"accountID"] = context[@"card"][@"accountID"];
        if ([context[@"recoveredFromActiveWriter"] boolValue]) association[@"recovered"] = @YES;
        if ([context[@"projectID"] length]) association[@"projectID"] = context[@"projectID"];
        if ([context[@"projectName"] length]) association[@"projectName"] = context[@"projectName"];
        [self sendFunction:@"conversationAssociated" object:association];
        if (![context[@"createdThread"] boolValue] && [context[@"projectID"] length])
            [client sendMessage:@{ @"id":@21, @"method":@"thread/metadata/update", @"params":@{ @"threadId":threadID, @"projectId":context[@"projectID"] } }];
        if ([context[@"createdThread"] boolValue]) [client sendMessage:@{ @"id":@3, @"method":@"thread/name/set", @"params":@{ @"threadId":threadID, @"name":card[@"title"] ?: L(@"Tâche CTRL KANB", @"CTRL KANB task") } }];
        NSDictionary *sandbox = [context[@"mode"] isEqualToString:@"workspaceWrite"]
            ? @{ @"type":@"workspaceWrite", @"writableRoots":@[context[@"space"][@"rootPath"]], @"networkAccess":@NO, @"excludeTmpdirEnvVar":@NO, @"excludeSlashTmp":@NO }
            : @{ @"type":@"readOnly", @"networkAccess":@NO };
        NSMutableDictionary *params = [@{ @"threadId":threadID, @"input":@[@{ @"type":@"text", @"text":card[@"prompt"] ?: @"", @"text_elements":@[] }],
                                          @"cwd":context[@"space"][@"rootPath"], @"approvalPolicy":@"on-request",
                                          @"approvalsReviewer":[context[@"autoApprove"] boolValue] ? @"auto_review" : @"user", @"sandboxPolicy":sandbox } mutableCopy];
        if ([card[@"model"] isKindOfClass:NSString.class] && [card[@"model"] length]) params[@"model"] = card[@"model"];
        if ([card[@"reasoningEffort"] isKindOfClass:NSString.class] && [card[@"reasoningEffort"] length]) params[@"effort"] = card[@"reasoningEffort"];
        [client sendMessage:@{ @"id":@4, @"method":@"turn/start", @"params":params }];
    } else if ([responseID isEqual:@4]) {
        NSDictionary *turn = [result[@"turn"] isKindOfClass:NSDictionary.class] ? result[@"turn"] : nil;
        if ([turn[@"id"] isKindOfClass:NSString.class]) context[@"turnID"] = turn[@"id"];
    }

    NSString *method = message[@"method"];
    NSDictionary *params = [message[@"params"] isKindOfClass:NSDictionary.class] ? message[@"params"] : @{};
    if ([method isEqualToString:@"turn/started"]) {
        NSDictionary *turn = [params[@"turn"] isKindOfClass:NSDictionary.class] ? params[@"turn"] : nil;
        if ([turn[@"id"] isKindOfClass:NSString.class]) context[@"turnID"] = turn[@"id"];
    } else if ([method isEqualToString:@"item/completed"]) {
        NSDictionary *item = [params[@"item"] isKindOfClass:NSDictionary.class] ? params[@"item"] : nil;
        if ([item[@"type"] isEqualToString:@"agentMessage"] && [item[@"text"] isKindOfClass:NSString.class]) {
            context[@"latestSummary"] = item[@"text"];
            [self sendFunction:@"runnerEvent" object:@{ @"cardID":context[@"cardID"], @"message":item[@"text"] }];
        }
    } else if ([method isEqualToString:@"turn/completed"]) {
        NSDictionary *turn = [params[@"turn"] isKindOfClass:NSDictionary.class] ? params[@"turn"] : @{};
        NSString *status = turn[@"status"] ?: @"failed";
        NSDictionary *turnError = [turn[@"error"] isKindOfClass:NSDictionary.class] ? turn[@"error"] : nil;
        BOOL success = [status isEqualToString:@"completed"];
        [self finishRun:context success:success error:success ? nil : (turnError[@"message"] ?: [NSString stringWithFormat:@"Tour Codex : %@", status])];
    } else if (message[@"id"] && [method hasSuffix:@"requestApproval"]) {
        context[@"permissions"][message[@"id"]] = message;
        [self sendFunction:@"approvalRequested" object:@{ @"cardID":context[@"cardID"], @"requestID":message[@"id"], @"kind":[method containsString:@"fileChange"] ? @"file" : @"command", @"params":params, @"agentEngine":context[@"card"][@"agentEngine"] ?: @"codex", @"mode":context[@"mode"] ?: @"readOnly", @"autoApprove":context[@"autoApprove"] ?: @NO, @"threadID":context[@"threadID"] ?: @"" }];
        [self notifyTitle:L(@"Autorisation Codex requise", @"Codex needs approval") message:context[@"card"][@"title"] ?: L(@"Une tâche attend votre validation.", @"A task is waiting for your approval.") category:@"approval" card:context[@"card"]];
    } else if (message[@"id"] && [method isEqualToString:@"item/tool/requestUserInput"]) {
        context[@"permissions"][message[@"id"]] = message;
        [self sendFunction:@"approvalRequested" object:@{ @"cardID":context[@"cardID"], @"requestID":message[@"id"], @"kind":@"input", @"params":params, @"agentEngine":context[@"card"][@"agentEngine"] ?: @"codex", @"mode":context[@"mode"] ?: @"readOnly", @"autoApprove":context[@"autoApprove"] ?: @NO, @"threadID":context[@"threadID"] ?: @"" }];
        [self notifyTitle:L(@"Codex attend une réponse", @"Codex is waiting for an answer") message:context[@"card"][@"title"] ?: L(@"Une tâche a besoin de votre réponse.", @"A task needs your answer.") category:@"approval" card:context[@"card"]];
    } else if ([method isEqualToString:@"serverRequest/resolved"]) {
        NSMutableDictionary *resolved = [@{ @"cardID":context[@"cardID"] } mutableCopy];
        if (params[@"requestId"]) {
            resolved[@"requestID"] = params[@"requestId"];
            [context[@"permissions"] removeObjectForKey:params[@"requestId"]];
        }
        [self sendFunction:@"requestResolved" object:resolved];
    }
}

- (void)respondToServerRequest:(NSDictionary *)body {
    NSMutableDictionary *context = self.runs[body[@"cardID"]];
    if([context[@"engine"] isEqual:@"claude-code"]){[self respondToClaudeRequest:body context:context];return;}
    AppServerClient *client = context[@"client"];
    id requestID = body[@"requestID"];
    NSDictionary *pendingRequest = requestID ? context[@"permissions"][requestID] : nil;
    // Le tour peut avoir disparu sans prevenir : sans retour, l interface
    // affichait « Action autorisee » alors que la reponse n allait nulle part.
    if (!client || !pendingRequest || ![body[@"result"] isKindOfClass:NSDictionary.class]) {
        [self sendFunction:@"requestUnresolved" object:@{
            @"cardID":body[@"cardID"] ?: @"",
            @"requestID":body[@"requestID"] ?: @""
        }];
        return;
    }
    [client sendMessage:@{ @"id":requestID, @"result":body[@"result"] }];
    [context[@"permissions"] removeObjectForKey:requestID];
    [self sendFunction:@"requestResolved" object:@{ @"cardID":body[@"cardID"] ?: @"", @"requestID":requestID }];
}

- (void)sendActiveRuns {
    NSMutableArray *running = [NSMutableArray array];
    for (NSString *cardID in self.runs.allKeys)
        if ([cardID isKindOfClass:NSString.class]) [running addObject:cardID];
    NSMutableArray *queued = [NSMutableArray array];
    for (NSDictionary *request in self.pendingRuns) {
        NSString *cardID = request[@"card"][@"id"];
        if ([cardID isKindOfClass:NSString.class]) [queued addObject:cardID];
    }
    [self sendFunction:@"runsRestored" object:@{ @"running":running, @"queued":queued }];
}

static const NSTimeInterval StopGraceSeconds = 5;

- (void)stopCard:(NSString *)cardID {
    NSMutableDictionary *context = self.runs[cardID];
    if (!context) {
        NSUInteger index = [self.pendingRuns indexOfObjectPassingTest:^BOOL(NSDictionary *request, NSUInteger idx, BOOL *stop) {
            return [request[@"card"][@"id"] isEqualToString:cardID];
        }];
        if (index != NSNotFound) {
            [self.pendingRuns removeObjectAtIndex:index];
            [self sendFunction:@"runnerCanceled" object:@{ @"cardID":cardID ?: @"" }];
            [self notifyQueuePositions];
        }
        return;
    }
    AppServerClient *client = context[@"client"];
    context[@"canceling"] = @YES;
    if (![context[@"threadID"] length] || ![context[@"turnID"] length]) { [client stop]; return; }

    // On demande d abord l interruption propre, qui laisse l agent refermer son
    // tour. Un agent qui ne l honore pas laissait la carte figee sur
    // « Suspension… » et le processus vivant : au-dela du delai, on coupe.
    [client sendMessage:@{ @"id":@90, @"method":@"turn/interrupt", @"params":@{ @"threadId":context[@"threadID"], @"turnId":context[@"turnID"] } }];
    __weak typeof(self) weakSelf = self;
    NSString *pendingCardID = [cardID copy];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(StopGraceSeconds * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        NSMutableDictionary *pending = weakSelf.runs[pendingCardID];
        if (pending != context || [context[@"finished"] boolValue]) return;
        [(AppServerClient *)context[@"client"] stop];
    });
}

- (void)finishRun:(NSMutableDictionary *)context success:(BOOL)success error:(NSString *)error {
    if ([context[@"finished"] boolValue]) return;
    if ([context[@"canceling"] boolValue]) {
        context[@"finished"] = @YES;
        [self sendFunction:@"runnerCanceled" object:@{ @"cardID":context[@"cardID"] ?: @"" }];
        AppServerClient *client = context[@"client"];
        self.runs[context[@"cardID"]] = nil;
        [client stop];
        [self startNextQueued];
        return;
    }
    context[@"finished"] = @YES;
    NSMutableDictionary *payload = [@{ @"cardID":context[@"cardID"], @"success":@(success), @"exitCode":success ? @0 : @1,
        @"threadID":context[@"threadID"] ?: @"", @"summary":context[@"latestSummary"] ?: @"" } mutableCopy];
    if (error.length) payload[@"error"] = error;
    [self sendFunction:@"runnerFinished" object:payload];
    BOOL utilityChat = [context[@"card"][@"utilityChat"] boolValue];
    NSString *notificationCategory = utilityChat ? @"chatReply" : (success ? @"taskComplete" : ([context[@"card"][@"launchMode"] isEqualToString:@"scheduled"] ? @"scheduleIssue" : @"taskFailed"));
    [self notifyTitle:success ? (utilityChat ? L(@"Réponse reçue", @"Reply received") : L(@"Tâche terminée", @"Task finished"))
                              : (utilityChat ? L(@"Échec du chat IA", @"AI chat failed") : L(@"Échec d’une tâche IA", @"An AI task failed"))
                 message:success ? (context[@"card"][@"title"] ?: (utilityChat ? L(@"La réponse est disponible dans le panneau droit.", @"The reply is available in the right panel.") : L(@"La tâche est prête à être validée.", @"The task is ready for review."))) : (error ?: L(@"Une intervention est nécessaire.", @"Something needs your attention."))
                category:notificationCategory card:context[@"card"]];
    AppServerClient *client = context[@"client"];
    self.runs[context[@"cardID"]] = nil;
    [client stop];
    [self startNextQueued];
}

- (void)failCard:(NSString *)cardID message:(NSString *)message card:(NSDictionary *)card {
    [self sendFunction:@"runnerFinished" object:@{ @"cardID":cardID ?: @"", @"success":@NO, @"exitCode":@1, @"error":message ?: L(@"Erreur inconnue.", @"Unknown error.") }];
    NSString *category = [card[@"launchMode"] isEqualToString:@"scheduled"] ? @"scheduleIssue" : @"taskFailed";
    [self notifyTitle:L(@"Échec d’une tâche IA", @"An AI task failed") message:message ?: L(@"Une intervention est nécessaire.", @"Something needs your attention.") category:category card:card];
}

- (void)listConversations {
    if (self.conversationClient.running) return;
    NSString *executable = [self codexExecutable];
    if (!executable) { [self sendFunction:@"conversationsFailed" object:@{ @"message":L(@"Commande codex introuvable.", @"The codex command was not found.") }]; return; }
    AppServerClient *client = [[AppServerClient alloc] initWithExecutable:executable];
    self.conversationClient = client;
    __weak typeof(self) weakSelf = self;
    NSError *error = nil;
    BOOL launched = [client startWithMessageHandler:^(NSDictionary *message) {
        NSNumber *identifier = [message[@"id"] isKindOfClass:NSNumber.class] ? message[@"id"] : nil;
        if ([identifier isEqual:@1]) {
            [client sendMessage:@{ @"method":@"initialized", @"params":@{} }];
            [client sendMessage:@{ @"id":@2, @"method":@"thread/list", @"params":@{ @"limit":@80, @"sortKey":@"updated_at", @"sortDirection":@"desc", @"archived":@NO, @"useStateDbOnly":@YES } }];
        } else if ([identifier isEqual:@2]) {
            NSDictionary *result = [message[@"result"] isKindOfClass:NSDictionary.class] ? message[@"result"] : @{};
            [weakSelf sendFunction:@"conversationsLoaded" object:@{ @"conversations":result[@"data"] ?: @[] }];
            [client stop];
            weakSelf.conversationClient = nil;
        } else if (message[@"error"]) {
            [weakSelf sendFunction:@"conversationsFailed" object:@{ @"message":message[@"error"][@"message"] ?: L(@"Impossible de charger les conversations.", @"Conversations could not be loaded.") }];
            [client stop];
            weakSelf.conversationClient = nil;
        }
    } terminationHandler:^(int status, NSString *stderrText) {
        if (weakSelf.conversationClient == client) {
            [weakSelf sendFunction:@"conversationsFailed" object:@{ @"message":stderrText.length ? stderrText : L(@"Codex App Server s'est arrêté.", @"Codex App Server stopped.") }];
            weakSelf.conversationClient = nil;
        }
    } error:&error];
    if (!launched) { self.conversationClient = nil; [self sendFunction:@"conversationsFailed" object:@{ @"message":error.localizedDescription ?: L(@"Impossible de lancer Codex App Server.", @"Codex App Server could not be started.") }]; return; }
    [client sendMessage:[self initializeMessage]];
}

- (void)syncConversations:(NSArray *)threadIDs {
    if (self.syncClient.running || ![threadIDs isKindOfClass:NSArray.class]) return;
    NSOrderedSet *unique = [NSOrderedSet orderedSetWithArray:threadIDs];
    if (unique.count == 0) { [self sendFunction:@"conversationsSynced" object:@{ @"conversations":@[], @"total":@0, @"failed":@0, @"durationMs":@0 }]; return; }
    NSString *executable = [self codexExecutable];
    if (!executable) { [self sendFunction:@"syncFailed" object:@{ @"message":L(@"Commande codex introuvable.", @"The codex command was not found.") }]; return; }
    AppServerClient *client = [[AppServerClient alloc] initWithExecutable:executable];
    self.syncClient = client;
    self.syncResults = [NSMutableArray array];
    self.syncOutstanding = unique.count;
    self.syncTotal = unique.count;
    self.syncFailedCount = 0;
    NSDate *startedAt = NSDate.date;
    __weak typeof(self) weakSelf = self;
    NSError *error = nil;
    BOOL launched = [client startWithMessageHandler:^(NSDictionary *message) {
        NSNumber *identifier = [message[@"id"] isKindOfClass:NSNumber.class] ? message[@"id"] : nil;
        if ([identifier isEqual:@1]) {
            [client sendMessage:@{ @"method":@"initialized", @"params":@{} }];
            NSInteger index = 0;
            for (NSString *threadID in unique) {
                [client sendMessage:@{ @"id":@(100 + index++), @"method":@"thread/read", @"params":@{ @"threadId":threadID, @"includeTurns":@YES } }];
            }
        } else if (identifier.integerValue >= 100) {
            NSDictionary *result = [message[@"result"] isKindOfClass:NSDictionary.class] ? message[@"result"] : nil;
            NSDictionary *thread = [result[@"thread"] isKindOfClass:NSDictionary.class] ? result[@"thread"] : nil;
            if (thread) [weakSelf.syncResults addObject:thread];
            else weakSelf.syncFailedCount += 1;
            weakSelf.syncOutstanding -= 1;
            NSInteger completed = weakSelf.syncTotal - weakSelf.syncOutstanding;
            [weakSelf sendFunction:@"syncProgress" object:@{ @"completed":@(completed), @"total":@(weakSelf.syncTotal) }];
            if (weakSelf.syncOutstanding <= 0) {
                NSInteger durationMs = (NSInteger)(-[startedAt timeIntervalSinceNow] * 1000.0);
                [weakSelf sendFunction:@"conversationsSynced" object:@{ @"conversations":weakSelf.syncResults ?: @[], @"total":@(weakSelf.syncTotal), @"failed":@(weakSelf.syncFailedCount), @"durationMs":@(MAX(0, durationMs)) }];
                weakSelf.syncClient = nil;
                [client stop];
            }
        }
    } terminationHandler:^(int status, NSString *stderrText) {
        if (weakSelf.syncClient == client) {
            NSInteger completed = weakSelf.syncTotal - weakSelf.syncOutstanding;
            [weakSelf sendFunction:@"syncFailed" object:@{ @"message":stderrText.length ? stderrText : L(@"Synchronisation interrompue.", @"Sync was interrupted."), @"completed":@(MAX(0, completed)), @"total":@(weakSelf.syncTotal) }];
            weakSelf.syncClient = nil;
        }
    } error:&error];
    if (!launched) { self.syncClient = nil; [self sendFunction:@"syncFailed" object:@{ @"message":error.localizedDescription ?: L(@"Impossible de synchroniser.", @"Sync failed."), @"completed":@0, @"total":@(unique.count) }]; return; }
    [self sendFunction:@"syncStarted" object:@{ @"total":@(unique.count) }];
    [client sendMessage:[self initializeMessage]];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(3 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (weakSelf.syncClient != client) return;
        NSInteger completed = weakSelf.syncTotal - weakSelf.syncOutstanding;
        [weakSelf sendFunction:@"syncSlow" object:@{ @"completed":@(MAX(0, completed)), @"total":@(weakSelf.syncTotal) }];
    });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(20 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (weakSelf.syncClient != client) return;
        NSInteger completed = weakSelf.syncTotal - weakSelf.syncOutstanding;
        weakSelf.syncClient = nil;
        [weakSelf sendFunction:@"syncFailed" object:@{ @"message":L(@"Codex n’a pas répondu dans les 20 secondes. La synchronisation a été arrêtée ; clique pour réessayer.", @"Codex did not respond within 20 seconds. Sync was stopped; click to try again."), @"completed":@(MAX(0, completed)), @"total":@(weakSelf.syncTotal) }];
        [client stop];
    });
}

- (void)syncClaudeSessions:(NSArray *)descriptors {
    NSArray *sessions = [descriptors isKindOfClass:NSArray.class] ? descriptors : @[];
    if (sessions.count > 200) sessions = [sessions subarrayWithRange:NSMakeRange(0, 200)];
    [self sendFunction:@"claudeSyncStarted" object:@{ @"total":@(sessions.count) }];
    if (!sessions.count) {
        [self sendFunction:@"claudeSessionsSynced" object:@{ @"sessions":@[], @"total":@0, @"failed":@0, @"durationMs":@0 }];
        return;
    }
    NSDate *startedAt = NSDate.date;
    __weak typeof(self) weakSelf = self;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        NSMutableArray *results = [NSMutableArray arrayWithCapacity:sessions.count];
        NSInteger failed = 0;
        for (id item in sessions) {
            NSDictionary *descriptor = [item isKindOfClass:NSDictionary.class] ? item : @{};
            NSDictionary *snapshot = ClaudeSessionSnapshot(descriptor);
            [results addObject:snapshot];
            if (![snapshot[@"found"] boolValue]) failed++;
        }
        NSInteger durationMs = (NSInteger)(-[startedAt timeIntervalSinceNow] * 1000.0);
        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf sendFunction:@"claudeSessionsSynced" object:@{ @"sessions":results, @"total":@(sessions.count),
                @"failed":@(failed), @"durationMs":@(MAX(0, durationMs)) }];
        });
    });
}

- (void)readConversation:(NSString *)threadID cardID:(NSString *)cardID {
    if (!threadID.length) return;
    // Changer de conversation remplace la lecture précédente, sans bloquer le panneau.
    AppServerClient *previous = self.detailClient;
    self.detailClient = nil;
    [previous stop];
    NSString *executable = [self codexExecutable];
    if (!executable) { [self sendFunction:@"conversationDetailFailed" object:@{ @"cardID":cardID ?: @"", @"threadID":threadID, @"message":L(@"Commande codex introuvable.", @"The codex command was not found.") }]; return; }
    AppServerClient *client = [[AppServerClient alloc] initWithExecutable:executable];
    self.detailClient = client;
    __weak typeof(self) weakSelf = self;
    NSError *error = nil;
    BOOL launched = [client startWithMessageHandler:^(NSDictionary *message) {
        if (weakSelf.detailClient != client) return;
        NSNumber *identifier = [message[@"id"] isKindOfClass:NSNumber.class] ? message[@"id"] : nil;
        if ([identifier isEqual:@1]) {
            [client sendMessage:@{ @"method":@"initialized", @"params":@{} }];
            [client sendMessage:@{ @"id":@2, @"method":@"thread/read", @"params":@{ @"threadId":threadID, @"includeTurns":@YES } }];
        } else if ([identifier isEqual:@2]) {
            NSDictionary *result = [message[@"result"] isKindOfClass:NSDictionary.class] ? message[@"result"] : nil;
            NSDictionary *thread = [result[@"thread"] isKindOfClass:NSDictionary.class] ? result[@"thread"] : nil;
            if (thread) [weakSelf sendFunction:@"conversationDetailLoaded" object:@{ @"cardID":cardID ?: @"", @"conversation":thread }];
            else [weakSelf sendFunction:@"conversationDetailFailed" object:@{ @"cardID":cardID ?: @"", @"threadID":threadID, @"message":message[@"error"][@"message"] ?: L(@"Conversation illisible.", @"Unreadable conversation.") }];
            weakSelf.detailClient = nil;
            [client stop];
        }
    } terminationHandler:^(int status, NSString *stderrText) {
        if (weakSelf.detailClient == client) {
            [weakSelf sendFunction:@"conversationDetailFailed" object:@{ @"cardID":cardID ?: @"", @"threadID":threadID, @"message":stderrText.length ? stderrText : L(@"Lecture interrompue.", @"Reading was interrupted.") }];
            weakSelf.detailClient = nil;
        }
    } error:&error];
    if (!launched) { self.detailClient = nil; [self sendFunction:@"conversationDetailFailed" object:@{ @"cardID":cardID ?: @"", @"threadID":threadID, @"message":error.localizedDescription ?: L(@"Impossible de lire la conversation.", @"The conversation could not be read.") }]; return; }
    [client sendMessage:[self initializeMessage]];
}

- (void)openConversation:(NSString *)threadID {
    // L identifiant part vers le gestionnaire d URL d une autre application :
    // il doit etre un UUID, pas une chaine libre venue du tableau.
    if (![[NSUUID alloc] initWithUUIDString:threadID ?: @""]) return;
    NSURL *url = [NSURL URLWithString:[NSString stringWithFormat:@"codex://threads/%@", threadID]];
    if (url) [NSWorkspace.sharedWorkspace openURL:url];
}

- (void)openClaudeConversation:(NSString *)threadID {
    if (![[NSUUID alloc] initWithUUIDString:threadID ?: @""]) return;
    NSURLComponents *components = [NSURLComponents componentsWithString:@"claude://resume"];
    components.queryItems = @[[NSURLQueryItem queryItemWithName:@"session" value:threadID]];
    if (components.URL) [NSWorkspace.sharedWorkspace openURL:components.URL];
}

- (NSString *)notificationAuthorizationName:(UNAuthorizationStatus)status {
    switch (status) {
        case UNAuthorizationStatusAuthorized: return @"authorized";
        case UNAuthorizationStatusDenied: return @"denied";
        case UNAuthorizationStatusNotDetermined: return @"notDetermined";
        case UNAuthorizationStatusProvisional: return @"provisional";
    }
    return @"unknown";
}

- (void)sendNotificationAuthorizationStatus {
    __weak typeof(self) weakSelf = self;
    [UNUserNotificationCenter.currentNotificationCenter getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf sendFunction:@"notificationAuthorizationStatus" object:@{ @"status":[weakSelf notificationAuthorizationName:settings.authorizationStatus] ?: @"unknown" }];
        });
    }];
}

- (void)requestNotificationAuthorization {
    __weak typeof(self) weakSelf = self;
    [UNUserNotificationCenter.currentNotificationCenter requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound) completionHandler:^(__unused BOOL granted, __unused NSError *error) {
        [weakSelf sendNotificationAuthorizationStatus];
    }];
}

- (void)openNotificationSettings {
    NSString *bundleID = NSBundle.mainBundle.bundleIdentifier ?: @"app.ctrlkanb.macos";
    NSString *address = [NSString stringWithFormat:@"x-apple.systempreferences:com.apple.Notifications-Settings.extension?bundleId=%@", bundleID];
    NSURL *url = [NSURL URLWithString:address];
    if (url) [NSWorkspace.sharedWorkspace openURL:url];
}

- (BOOL)shouldDeliverNotificationCategory:(NSString *)category card:(NSDictionary *)card {
    NSString *cardMode = [card[@"notificationMode"] isKindOfClass:NSString.class] ? card[@"notificationMode"] : @"inherit";
    if ([cardMode isEqualToString:@"mute"]) return NO;
    BOOL forced = [cardMode isEqualToString:@"always"];
    NSDictionary *configuration = NotificationConfiguration();
    if (!forced && ![configuration[@"enabled"] boolValue]) return NO;
    if (!forced && ![configuration[@"events"][category ?: @"taskFailed"] boolValue]) return NO;
    // Le mode arrière-plan évite de doubler l information déjà visible dans la
    // fenêtre. Le choix « Toujours » d une tâche prend volontairement le dessus.
    if (!forced && [configuration[@"when"] isEqualToString:@"background"] && NSApp.isActive && self.window.isVisible && !self.lockView) return NO;
    return YES;
}

- (void)notifyTitle:(NSString *)title message:(NSString *)message category:(NSString *)category card:(NSDictionary *)card {
    if (![self shouldDeliverNotificationCategory:category card:card]) return;
    UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
    content.title = title;
    // Le Centre de notifications affiche aussi sur l ecran verrouille du Mac.
    // Verrouiller la fenetre puis annoncer le titre des taches y serait
    // contradictoire : quand le verrou est actif, seul le motif est dit.
    content.body = AppLockEnabled() ? L(@"Ouvre CTRL KANB pour voir de quelle tâche il s’agit.", @"Open CTRL KANB to see which task this is.") : message;
    content.sound = UNNotificationSound.defaultSound;
    content.threadIdentifier = category ?: @"ctrl-kanb";
    UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:UUIDString() content:content trigger:nil];
    [UNUserNotificationCenter.currentNotificationCenter addNotificationRequest:request withCompletionHandler:nil];
}

- (void)sendFunction:(NSString *)function object:(id)object {
    NSData *data = [NSJSONSerialization dataWithJSONObject:object ?: @{} options:0 error:nil];
    if (!data) return;
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    NSString *script = [NSString stringWithFormat:@"window.CodexBoard.%@(%@)", function, json];
    dispatch_async(dispatch_get_main_queue(), ^{ [self.webView evaluateJavaScript:script completionHandler:nil]; });
}

@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        BOOL backgroundLaunch = NO;
        for (int index = 1; index < argc; index++) if (strcmp(argv[index], "--background") == 0) backgroundLaunch = YES;
        NSApplication *application = NSApplication.sharedApplication;
        CodexBoardDelegate *delegate = [[CodexBoardDelegate alloc] init];
        delegate.backgroundLaunch = backgroundLaunch;
        application.delegate = delegate;
        application.activationPolicy = backgroundLaunch ? NSApplicationActivationPolicyAccessory : NSApplicationActivationPolicyRegular;
        [application run];
    }
    return 0;
}
