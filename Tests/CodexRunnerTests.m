// Native Codex routing tests. No account, network inference or user board required.
#define main CtrlKanbApplicationMain
#import "../Sources/App/main.m"
#undef main

@interface CodexProbeDelegate : CodexBoardDelegate
@property(nonatomic) BOOL complete;
@property(nonatomic) BOOL completeOnSync;
@property(nonatomic,strong) NSDictionary *result;
@property(nonatomic,strong) NSMutableArray *events;
@end

@implementation CodexProbeDelegate
- (void)sendFunction:(NSString *)function object:(id)object {
    [self.events addObject:@{ @"event":function, @"data":object ?: @{} }];
    if ([function isEqual:@"runnerFinished"] || [function isEqual:@"runnerCanceled"] ||
        (self.completeOnSync && ([function isEqual:@"conversationsSynced"] || [function isEqual:@"syncFailed"]))) {
        self.result = object;
        self.complete = YES;
    }
}
- (void)notifyTitle:(NSString *)title message:(NSString *)message category:(NSString *)category card:(NSDictionary *)card {}
@end

@interface QueueProbeDelegate : CodexBoardDelegate
@property(nonatomic,strong) NSMutableArray<NSString *> *started;
@property(nonatomic,strong) NSDictionary *lastQueue;
@end

@implementation QueueProbeDelegate
- (void)sendFunction:(NSString *)function object:(id)object {
    if ([function isEqual:@"queueUpdated"]) self.lastQueue = object;
}
- (NSInteger)queuePositionFor:(NSString *)cardID {
    for (NSDictionary *item in self.lastQueue[@"items"])
        if ([item[@"cardID"] isEqualToString:cardID]) return [item[@"position"] integerValue];
    return 0;
}
- (void)startRunRequest:(NSDictionary *)request {
    NSString *cardID = request[@"card"][@"id"];
    [self.started addObject:cardID];
    NSMutableDictionary *context = [@{ @"card":request[@"card"] } mutableCopy];
    NSString *conversationID = request[@"card"][@"conversationID"];
    if ([conversationID isKindOfClass:NSString.class] && conversationID.length && ![request[@"newConversation"] boolValue]) {
        BOOL claude = [@[@"claude-code", @"claudeCode"] containsObject:request[@"card"][@"agentEngine"] ?: @"codex"];
        context[@"conversationKey"] = [NSString stringWithFormat:@"%@:%@", claude ? @"claude-code" : @"codex", conversationID];
    }
    self.runs[cardID] = context;
}
@end

int main(int argc, const char *argv[]) { @autoreleasepool {
    NSDictionary *environment = NSProcessInfo.processInfo.environment;
    NSArray<NSString *> *searchDirectories = AgentCommandDirectories();
    NSArray<NSString *> *expectedDirectories = @[
        [NSHomeDirectory() stringByAppendingPathComponent:@".local/bin"],
        [NSHomeDirectory() stringByAppendingPathComponent:@".volta/bin"],
        [NSHomeDirectory() stringByAppendingPathComponent:@".local/share/mise/shims"],
        @"/opt/homebrew/bin", @"/usr/local/bin"
    ];
    for (NSString *directory in expectedDirectories) if (![searchDirectories containsObject:directory]) {
        fprintf(stderr, "Agent executable search path missing: %s\n", directory.UTF8String);
        return 3;
    }
    NSString *codexOverride = environment[@"CTRL_KANB_CODEX_PATH"];
    if (codexOverride.length && ![[FindAgentExecutable(@"codex", @[codexOverride], @[]) stringByStandardizingPath] isEqualToString:codexOverride.stringByStandardizingPath]) {
        fputs("Codex executable override was not selected\n", stderr);
        return 3;
    }
    QueueProbeDelegate *queueProbe = [QueueProbeDelegate new];
    queueProbe.runs = [NSMutableDictionary dictionaryWithDictionary:@{
        @"codex-active":[@{ @"card":@{ @"id":@"codex-active", @"agentEngine":@"codex" } } mutableCopy]
    }];
    queueProbe.pendingRuns = [NSMutableArray array];
    queueProbe.maxConcurrentCodexRuns = 1;
    queueProbe.maxConcurrentClaudeRuns = 1;
    queueProbe.started = [NSMutableArray array];
    NSDictionary *claudeRequest = @{ @"card":@{ @"id":@"claude-free", @"agentEngine":@"claude-code" } };
    NSDictionary *codexRequest = @{ @"card":@{ @"id":@"codex-queued", @"agentEngine":@"codex" } };
    [queueProbe runCard:claudeRequest];
    [queueProbe runCard:codexRequest];
    BOOL separateStart = [queueProbe.started isEqualToArray:@[@"claude-free"]] && queueProbe.pendingRuns.count == 1;
    [queueProbe.runs removeObjectForKey:@"codex-active"];
    [queueProbe startNextQueued];
    BOOL independentDrain = [queueProbe.started isEqualToArray:@[@"claude-free", @"codex-queued"]];
    if (!separateStart || !independentDrain) {
        fputs("Independent Codex and Claude queues failed\n", stderr);
        return 3;
    }

    // Lancement groupe : la file affichee doit correspondre a l ordre de
    // demarrage reel. Comme chaque moteur a sa propre limite, une carte Claude
    // ne doit pas etre annoncee derriere des cartes Codex qu elle va doubler.
    QueueProbeDelegate *batch = [QueueProbeDelegate new];
    batch.runs = [NSMutableDictionary dictionary];
    batch.pendingRuns = [NSMutableArray array];
    batch.maxConcurrentCodexRuns = 2;
    batch.maxConcurrentClaudeRuns = 1;
    batch.started = [NSMutableArray array];
    for (NSString *identifier in @[@"codex-1", @"codex-2", @"codex-3", @"claude-1", @"claude-2"]) {
        BOOL usesClaude = [identifier hasPrefix:@"claude"];
        [batch runCard:@{ @"card":@{
            @"id":identifier,
            @"agentEngine":usesClaude ? @"claude-code" : @"codex"
        } }];
    }
    BOOL batchStarted = [batch.started isEqualToArray:@[@"codex-1", @"codex-2", @"claude-1"]];
    BOOL batchWaiting = batch.pendingRuns.count == 2;
    // codex-3 et claude-2 attendent chacune en tete de la file de leur moteur.
    NSInteger waitingCodex = [batch queuePositionFor:@"codex-3"];
    NSInteger waitingClaude = [batch queuePositionFor:@"claude-2"];
    BOOL positionsPerEngine = waitingCodex == 1 && waitingClaude == 1;
    // Le prochain Claude libere demarre claude-2, sans toucher a codex-3 :
    // c est bien une file par moteur, donc la position annoncee doit l etre aussi.
    [batch.runs removeObjectForKey:@"claude-1"];
    [batch startNextQueued];
    BOOL claudeDrainedAlone = [batch.started isEqualToArray:@[@"codex-1", @"codex-2", @"claude-1", @"claude-2"]] &&
                              [batch queuePositionFor:@"codex-3"] == 1;
    if (!batchStarted || !batchWaiting || !positionsPerEngine || !claudeDrainedAlone) {
        fprintf(stderr, "Batch launch queue positions failed (started=%d waiting=%d perEngine=%d drain=%d codex-3=%ld claude-2=%ld ordre=%s)\n",
                batchStarted, batchWaiting, positionsPerEngine, claudeDrainedAlone,
                (long)waitingCodex, (long)waitingClaude,
                [[batch.started componentsJoinedByString:@","] UTF8String]);
        return 3;
    }

    // Les places paralleles sont reservees a des conversations distinctes.
    // Deux cartes liees au meme fil restent sequentielles, avec les deux agents.
    QueueProbeDelegate *sessions = [QueueProbeDelegate new];
    sessions.runs = [NSMutableDictionary dictionary];
    sessions.pendingRuns = [NSMutableArray array];
    sessions.maxConcurrentCodexRuns = 3;
    sessions.maxConcurrentClaudeRuns = 3;
    sessions.started = [NSMutableArray array];
    NSString *claudeSession = @"11111111-1111-4111-8111-111111111111";
    NSString *otherClaudeSession = @"22222222-2222-4222-8222-222222222222";
    NSString *codexThread = @"thread-shared";
    NSString *otherCodexThread = @"thread-other";
    [sessions runCard:@{ @"card":@{ @"id":@"claude-a", @"agentEngine":@"claude-code", @"conversationID":claudeSession } }];
    [sessions runCard:@{ @"card":@{ @"id":@"claude-same", @"agentEngine":@"claude-code", @"conversationID":claudeSession } }];
    [sessions runCard:@{ @"card":@{ @"id":@"claude-b", @"agentEngine":@"claude-code", @"conversationID":otherClaudeSession } }];
    [sessions runCard:@{ @"card":@{ @"id":@"codex-a", @"agentEngine":@"codex", @"conversationID":codexThread } }];
    [sessions runCard:@{ @"card":@{ @"id":@"codex-same", @"agentEngine":@"codex", @"conversationID":codexThread } }];
    [sessions runCard:@{ @"card":@{ @"id":@"codex-b", @"agentEngine":@"codex", @"conversationID":otherCodexThread } }];
    BOOL distinctSessionsStarted = [sessions.started isEqualToArray:@[@"claude-a", @"claude-b", @"codex-a", @"codex-b"]];
    NSPredicate *conversationWait = [NSPredicate predicateWithBlock:^BOOL(NSDictionary *item, NSDictionary *bindings) {
        return [item[@"reason"] isEqualToString:@"conversation"];
    }];
    BOOL sharedSessionsQueued = sessions.pendingRuns.count == 2 &&
        [sessions.lastQueue[@"items"] filteredArrayUsingPredicate:conversationWait].count == 2;
    [sessions.runs removeObjectForKey:@"claude-a"];
    [sessions.runs removeObjectForKey:@"codex-a"];
    [sessions startNextQueued];
    BOOL sharedSessionsDrained = [sessions.started isEqualToArray:@[@"claude-a", @"claude-b", @"codex-a", @"codex-b", @"claude-same", @"codex-same"]];
    if (!distinctSessionsStarted || !sharedSessionsQueued || !sharedSessionsDrained) {
        fprintf(stderr, "Conversation serialization failed (distinct=%d queued=%d drain=%d ordre=%s)\n",
                distinctSessionsStarted, sharedSessionsQueued, sharedSessionsDrained,
                [[sessions.started componentsJoinedByString:@","] UTF8String]);
        return 3;
    }
    CodexProbeDelegate *probe = [CodexProbeDelegate new];
    probe.runs = [NSMutableDictionary dictionary];
    probe.pendingRuns = [NSMutableArray array];
    probe.maxConcurrentCodexRuns = 1;
    probe.maxConcurrentClaudeRuns = 1;
    probe.terminals = [NSMutableDictionary dictionary];
    probe.events = [NSMutableArray array];
    if ([environment[@"TEST_TOOLS"] boolValue]) {
        NSString *root = environment[@"TEST_CWD"] ?: @"/private/tmp";
        [probe listProjectFiles:@{ @"spaceID":@"test-space", @"rootPath":root, @"relativePath":@"" }];
        [probe listProjectFiles:@{ @"spaceID":@"utility-custom", @"rootPath":root, @"relativePath":@"" }];
        [probe listProjectFiles:@{ @"spaceID":@"test-space", @"rootPath":root, @"relativePath":@"../" }];
        [probe resolveProjectFileForChat:@{ @"spaceID":@"test-space", @"rootPath":root, @"relativePath":@"README.md" }];
        NSString *terminalID = @"terminal-test-space";
        [probe startTerminal:@{ @"terminalID":terminalID, @"spaceID":@"test-space", @"rootPath":root }];
        NSDate *readyDeadline = [NSDate dateWithTimeIntervalSinceNow:.5];
        while (readyDeadline.timeIntervalSinceNow > 0)
            [NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.02]];
        [probe sendTerminalCommand:@{ @"terminalID":terminalID, @"command":@"tty; pwd; printf '__CTRL_KANB_TERMINAL_OK__\\n'" }];
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:5];
        BOOL sawOutput = NO;
        while (!sawOutput && deadline.timeIntervalSinceNow > 0) {
            [NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.02]];
            for (NSDictionary *event in probe.events)
                if ([event[@"event"] isEqual:@"terminalOutput"] && [event[@"data"][@"text"] containsString:@"__CTRL_KANB_TERMINAL_OK__"]) sawOutput = YES;
        }
        [probe sendTerminalCommand:@{ @"terminalID":terminalID, @"command":@"sleep 5" }];
        NSDate *interruptReady = [NSDate dateWithTimeIntervalSinceNow:.2];
        while (interruptReady.timeIntervalSinceNow > 0)
            [NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.02]];
        [probe interruptTerminal:terminalID];
        [probe sendTerminalCommand:@{ @"terminalID":terminalID, @"command":@"printf '__CTRL_KANB_INTERRUPT_OK__\\n'" }];
        NSDate *interruptDeadline = [NSDate dateWithTimeIntervalSinceNow:2];
        BOOL interrupted = NO;
        while (!interrupted && interruptDeadline.timeIntervalSinceNow > 0) {
            [NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.02]];
            for (NSDictionary *event in probe.events)
                if ([event[@"event"] isEqual:@"terminalOutput"] && [event[@"data"][@"text"] containsString:@"__CTRL_KANB_INTERRUPT_OK__"]) interrupted = YES;
        }
        [probe stopTerminal:terminalID];
        NSDate *stopDeadline = [NSDate dateWithTimeIntervalSinceNow:2];
        while (probe.terminals.count && stopDeadline.timeIntervalSinceNow > 0)
            [NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.02]];
        BOOL listed = NO, customListed = NO, escaped = NO, fileResolved = NO, started = NO, stopped = NO, terminalPTY = NO;
        NSMutableString *terminalText = [NSMutableString string];
        for (NSDictionary *event in probe.events) {
            NSString *name = event[@"event"];
            if ([name isEqual:@"projectFilesLoaded"] && [event[@"data"][@"spaceID"] isEqual:@"test-space"]) listed = YES;
            if ([name isEqual:@"projectFilesLoaded"] && [event[@"data"][@"spaceID"] isEqual:@"utility-custom"]) customListed = YES;
            if ([name isEqual:@"projectFilesFailed"]) escaped = YES;
            if ([name isEqual:@"utilityProjectFileAdded"] && [event[@"data"][@"spaceID"] isEqual:@"test-space"] && [event[@"data"][@"path"] isEqual:[root stringByAppendingPathComponent:@"README.md"]]) fileResolved = YES;
            if ([name isEqual:@"terminalStarted"]) started = YES;
            if ([name isEqual:@"terminalOutput"] && [event[@"data"][@"text"] isKindOfClass:NSString.class])
                [terminalText appendString:event[@"data"][@"text"]];
            if ([name isEqual:@"terminalStopped"]) stopped = YES;
        }
        terminalPTY = [terminalText containsString:@"/dev/tty"];
        NSData *toolsOutput = [NSJSONSerialization dataWithJSONObject:@{
            @"listed":@(listed), @"customListed":@(customListed), @"escapeRejected":@(escaped), @"fileResolved":@(fileResolved), @"terminalStarted":@(started),
            @"terminalOutput":@(sawOutput), @"terminalPTY":@(terminalPTY), @"terminalInterrupted":@(interrupted), @"terminalStopped":@(stopped), @"events":probe.events
        } options:0 error:nil];
        puts([[[NSString alloc] initWithData:toolsOutput encoding:NSUTF8StringEncoding] UTF8String]);
        return listed && customListed && escaped && fileResolved && started && sawOutput && terminalPTY && interrupted && stopped ? 0 : 4;
    }
    if ([environment[@"TEST_SYNC"] boolValue]) {
        probe.completeOnSync = YES;
        [probe syncConversations:@[@"sync-thread-1", @"sync-thread-2"]];
        NSDate *syncDeadline = [NSDate dateWithTimeIntervalSinceNow:5];
        while (!probe.complete && syncDeadline.timeIntervalSinceNow > 0)
            [NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.02]];
        NSData *syncOutput = [NSJSONSerialization dataWithJSONObject:@{
            @"complete":@(probe.complete), @"result":probe.result ?: @{}, @"events":probe.events
        } options:0 error:nil];
        puts([[[NSString alloc] initWithData:syncOutput encoding:NSUTF8StringEncoding] UTF8String]);
        return probe.complete ? 0 : 2;
    }
    NSMutableDictionary *card = [@{
        @"id":@"test-card",
        @"title":@"Tâche Codex test",
        @"prompt":environment[@"TEST_PROMPT"] ?: @"Conserver le contexte de cette tâche.",
        @"agentEngine":@"codex",
        @"model":@"gpt-5.6-luna",
        @"reasoningEffort":@"low"
    } mutableCopy];
    if ([environment[@"TEST_UTILITY_CHAT"] boolValue]) card[@"utilityChat"] = @YES;
    NSString *session = environment[@"TEST_SESSION"];
    if (session.length) card[@"conversationID"] = session;
    [probe runCard:@{
        @"card":card,
        @"space":@{ @"id":@"test-space", @"rootPath":environment[@"TEST_CWD"] ?: @"/private/tmp" },
        @"mode":@"readOnly"
    }];
    // Suspension demandee une fois le tour engage : c est le seul moment ou
    // stopCard dispose du fil et du tour a interrompre.
    double stopAfter = [environment[@"TEST_STOP_AFTER_SECONDS"] doubleValue];
    if (stopAfter > 0)
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(stopAfter * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{ [probe stopCard:@"test-card"]; });

    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:stopAfter > 0 ? 25 : 15];
    while (!probe.complete && deadline.timeIntervalSinceNow > 0)
        [NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.02]];
    NSData *output = [NSJSONSerialization dataWithJSONObject:@{
        @"complete":@(probe.complete), @"result":probe.result ?: @{}, @"events":probe.events
    } options:0 error:nil];
    puts([[[NSString alloc] initWithData:output encoding:NSUTF8StringEncoding] UTF8String]);
    return probe.complete ? 0 : 2;
} }
