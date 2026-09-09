// Notification routing tests. No user board, account, or system notification is used.
#define main CtrlKanbApplicationMain
#import "../Sources/App/main.m"
#undef main

@interface NotificationProbeDelegate : CodexBoardDelegate
@property(nonatomic, strong) NSMutableArray<NSDictionary *> *notifications;
@end

@implementation NotificationProbeDelegate
- (void)sendFunction:(NSString *)function object:(id)object {}
- (void)notifyTitle:(NSString *)title message:(NSString *)message category:(NSString *)category card:(NSDictionary *)card {
    [self.notifications addObject:@{ @"category":category ?: @"", @"cardID":card[@"id"] ?: @"" }];
}
@end

static NSMutableDictionary *Context(NSString *identifier, NSDictionary *extra) {
    NSMutableDictionary *card = [@{ @"id":identifier, @"title":identifier, @"agentEngine":@"codex", @"launchMode":@"manual" } mutableCopy];
    [card addEntriesFromDictionary:extra ?: @{}];
    return [@{ @"cardID":identifier, @"card":card, @"finished":@NO, @"latestSummary":@"Résultat" } mutableCopy];
}

int main(void) { @autoreleasepool {
    NotificationProbeDelegate *probe = [NotificationProbeDelegate new];
    probe.notifications = [NSMutableArray array];
    probe.runs = [NSMutableDictionary dictionary];
    probe.pendingRuns = [NSMutableArray array];
    probe.maxConcurrentCodexRuns = 1;
    probe.maxConcurrentClaudeRuns = 1;

    NSMutableDictionary *success = Context(@"success", nil);
    probe.runs[@"success"] = success;
    [probe finishRun:success success:YES error:nil];

    NSMutableDictionary *failure = Context(@"failure", nil);
    probe.runs[@"failure"] = failure;
    [probe finishRun:failure success:NO error:@"Échec"];

    NSMutableDictionary *scheduled = Context(@"scheduled", @{ @"launchMode":@"scheduled" });
    probe.runs[@"scheduled"] = scheduled;
    [probe finishRun:scheduled success:NO error:@"Créneau manqué"];

    NSMutableDictionary *chat = Context(@"chat", @{ @"utilityChat":@YES });
    probe.runs[@"chat"] = chat;
    [probe finishRun:chat success:YES error:nil];

    NSArray *expected = @[@"taskComplete", @"taskFailed", @"scheduleIssue", @"chatReply"];
    NSArray *actual = [probe.notifications valueForKey:@"category"];
    if (![actual isEqualToArray:expected]) {
        NSLog(@"Notification categories mismatch: %@", actual);
        return 1;
    }
    CachedNotificationSettings = @{ @"enabled":@NO, @"when":@"all", @"events":@{ @"taskComplete":@NO, @"taskFailed":@YES } };
    if ([probe shouldDeliverNotificationCategory:@"taskFailed" card:@{ @"notificationMode":@"inherit" }] ||
        ![probe shouldDeliverNotificationCategory:@"taskComplete" card:@{ @"notificationMode":@"always" }] ||
        [probe shouldDeliverNotificationCategory:@"taskFailed" card:@{ @"notificationMode":@"mute" }]) {
        NSLog(@"Task notification overrides do not take priority over global settings.");
        return 1;
    }
    CachedNotificationSettings = @{ @"enabled":@YES, @"when":@"all", @"events":@{ @"taskComplete":@NO, @"taskFailed":@YES } };
    if ([probe shouldDeliverNotificationCategory:@"taskComplete" card:@{}] ||
        ![probe shouldDeliverNotificationCategory:@"taskFailed" card:@{}]) {
        NSLog(@"Notification event switches are not applied independently.");
        return 1;
    }
    puts("PASS notification categories are routed to distinct macOS controls");
    puts("PASS global notification switches and task overrides are enforced");
    return 0;
}}
