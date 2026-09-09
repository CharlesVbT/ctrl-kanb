#import <Cocoa/Cocoa.h>
#import <sys/file.h>
#import <fcntl.h>
#import <unistd.h>
#import <errno.h>

static NSString *EnvValue(NSString *name) {
    NSDictionary *env = NSProcessInfo.processInfo.environment;
    return env[[@"CTRL_KANB_" stringByAppendingString:name]];
}

// Meme resolution que l application pour partager le verrou et le statut.
static NSString *BoardDataPath(void) {
    NSString *override = EnvValue(@"DATA_FILE");
    if (override.length) return override.stringByStandardizingPath;
    NSString *support = NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES).firstObject;
    return [support stringByAppendingPathComponent:@"CTRL KANB/board.json"];
}

static NSString *SchedulerStatusPath(void) {
    return [[BoardDataPath() stringByDeletingLastPathComponent] stringByAppendingPathComponent:@"scheduler-status.json"];
}

static BOOL ApplicationProcessIsRunning(void) {
    NSString *lockPath = [[BoardDataPath() stringByDeletingLastPathComponent] stringByAppendingPathComponent:@"engine.lock"];
    int descriptor = open(lockPath.fileSystemRepresentation, O_CREAT | O_RDWR, 0600);
    if (descriptor < 0) return [NSRunningApplication runningApplicationsWithBundleIdentifier:@"app.ctrlkanb.macos"].count > 0;
    if (flock(descriptor, LOCK_EX | LOCK_NB) != 0) {
        close(descriptor);
        return errno == EWOULDBLOCK || errno == EAGAIN;
    }
    flock(descriptor, LOCK_UN);
    close(descriptor);
    return [NSRunningApplication runningApplicationsWithBundleIdentifier:@"app.ctrlkanb.macos"].count > 0;
}

static NSString *ISODate(void) {
    return [[[NSISO8601DateFormatter alloc] init] stringFromDate:NSDate.date];
}

static void WriteStatus(NSString *state, NSString *message, NSError *error) {
    NSMutableDictionary *status = [@{
        @"checkedAt": ISODate(),
        @"state": state ?: @"unknown",
        @"message": message ?: @""
    } mutableCopy];
    if (error.localizedDescription.length) status[@"error"] = error.localizedDescription;
    NSString *folder = SchedulerStatusPath().stringByDeletingLastPathComponent;
    [NSFileManager.defaultManager createDirectoryAtPath:folder withIntermediateDirectories:YES attributes:nil error:nil];
    NSData *json = [NSJSONSerialization dataWithJSONObject:status options:NSJSONWritingPrettyPrinted | NSJSONWritingSortedKeys error:nil];
    [json writeToFile:SchedulerStatusPath() options:NSDataWritingAtomic error:nil];
}

static NSDictionary *LoadBoard(void) {
    NSData *data = [NSData dataWithContentsOfFile:BoardDataPath()];
    id object = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    return [object isKindOfClass:NSDictionary.class] ? object : nil;
}

static NSString *ApplicationBundlePath(void) {
    // argv[0] est fourni par l appelant : on part de l executable reel.
    NSString *executable = NSBundle.mainBundle.executablePath.stringByStandardizingPath;
    NSString *resources = executable.stringByDeletingLastPathComponent;
    NSString *contents = resources.stringByDeletingLastPathComponent;
    return contents.stringByDeletingLastPathComponent;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSDictionary *board = LoadBoard();
        BOOL enabled = [board[@"settings"][@"backgroundSchedulerEnabled"] boolValue];
        if (!enabled) {
            WriteStatus(@"disabled", @"Le moteur est désactivé dans CTRL KANB.", nil);
            return 0;
        }

        if (ApplicationProcessIsRunning()) {
            WriteStatus(@"running", @"CTRL KANB est actif en arrière-plan.", nil);
            return 0;
        }

        NSString *bundlePath = ApplicationBundlePath();
        if (![NSFileManager.defaultManager fileExistsAtPath:[bundlePath stringByAppendingPathComponent:@"Contents/Info.plist"]]) {
            WriteStatus(@"error", @"L’application CTRL KANB est introuvable.", nil);
            return 2;
        }

        NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
        configuration.activates = NO;
        configuration.addsToRecentItems = NO;
        configuration.arguments = @[@"--background"];
        NSMutableDictionary *launchEnvironment = [NSMutableDictionary dictionary];
        for (NSString *key in @[@"CTRL_KANB_DATA_FILE", @"CTRL_KANB_LAUNCH_AGENTS_DIR", @"CTRL_KANB_SKIP_LAUNCHCTL", @"CTRL_KANB_CODEX_PATH", @"CTRL_KANB_CLAUDE_PATH"]) {
            NSString *value = NSProcessInfo.processInfo.environment[key];
            if (value.length) launchEnvironment[key] = value;
        }
        if (launchEnvironment.count) configuration.environment = launchEnvironment;
        dispatch_semaphore_t completion = dispatch_semaphore_create(0);
        __block NSError *launchError = nil;
        [[NSWorkspace sharedWorkspace] openApplicationAtURL:[NSURL fileURLWithPath:bundlePath] configuration:configuration completionHandler:^(__unused NSRunningApplication *application, NSError *error) {
            launchError = error;
            dispatch_semaphore_signal(completion);
        }];
        long waitResult = dispatch_semaphore_wait(completion, dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_SEC));
        if (waitResult != 0) {
            WriteStatus(@"error", @"macOS n’a pas répondu à la demande de relance.", nil);
            return 3;
        }
        if (launchError) {
            WriteStatus(@"error", @"Le lancement discret de CTRL KANB a échoué.", launchError);
            return 3;
        }
        WriteStatus(@"launched", @"CTRL KANB a été relancé discrètement.", nil);
    }
    return 0;
}
