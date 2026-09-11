#import "AppServerClient.h"
#include <signal.h>

@interface AppServerClient ()
@property(nonatomic, copy) NSString *executable;
@property(nonatomic, copy) NSArray<NSString *> *arguments;
@property(nonatomic, copy) NSString *cwd;
@property(nonatomic, strong) NSTask *task;
@property(nonatomic, strong) NSPipe *stdinPipe;
@property(nonatomic, strong) NSPipe *stdoutPipe;
@property(nonatomic, strong) NSPipe *stderrPipe;
@property(nonatomic, strong) NSMutableData *stderrData;
@property(nonatomic, strong) NSMutableString *partialLine;
@property(nonatomic, copy) AppServerMessageHandler messageHandler;
@property(nonatomic, copy) AppServerTerminationHandler terminationHandler;
@end

@implementation AppServerClient

- (instancetype)initWithExecutable:(NSString *)executable {
    return [self initWithExecutable:executable arguments:@[@"app-server", @"--stdio"] cwd:nil];
}
- (instancetype)initWithExecutable:(NSString *)executable arguments:(NSArray<NSString *> *)arguments cwd:(NSString *)cwd {
    self = [super init];
    if (self) { self.executable=executable; self.arguments=arguments; self.cwd=cwd; }
    return self;
}

- (BOOL)isRunning {
    return self.task.running;
}

- (BOOL)startWithMessageHandler:(AppServerMessageHandler)messageHandler
             terminationHandler:(AppServerTerminationHandler)terminationHandler
                           error:(NSError **)error {
    self.messageHandler = messageHandler;
    self.terminationHandler = terminationHandler;
    self.stderrData = [NSMutableData data];
    self.partialLine = [NSMutableString string];
    self.stdinPipe = [NSPipe pipe];
    self.stdoutPipe = [NSPipe pipe];
    self.stderrPipe = [NSPipe pipe];

    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:self.executable];
    task.arguments = self.arguments;
    if (self.cwd.length) task.currentDirectoryURL=[NSURL fileURLWithPath:self.cwd];
    NSMutableDictionary *environment=[NSProcessInfo.processInfo.environment mutableCopy];
    environment[@"PATH"]=[NSString stringWithFormat:@"/opt/homebrew/bin:/usr/local/bin:%@",environment[@"PATH"]?:@"/usr/bin:/bin"];
    [environment removeObjectForKey:@"CLAUDECODE"];
    for (NSString *key in self.extraEnvironment) environment[key] = self.extraEnvironment[key];
    task.environment=environment;
    task.standardInput = self.stdinPipe;
    task.standardOutput = self.stdoutPipe;
    task.standardError = self.stderrPipe;
    self.task = task;

    if (![task launchAndReturnError:error]) {self.messageHandler=nil;self.terminationHandler=nil;return NO;}
    // Parse bytes through newlines so UTF-8 characters split between reads survive.
    // Drain both pipes before reporting termination: a final result may arrive at EOF.
    dispatch_group_t readers=dispatch_group_create();
    dispatch_group_async(readers, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0), ^{
        NSMutableData *pending=[NSMutableData data];
        while (YES) {
            NSData *chunk=[self.stdoutPipe.fileHandleForReading availableData];
            if (!chunk.length) break;
            [pending appendData:chunk];
            while (YES) {
                const unsigned char *bytes=pending.bytes;NSUInteger index=0;
                while(index<pending.length && bytes[index]!='\n')index++;
                if(index==pending.length)break;
                NSData *line=[pending subdataWithRange:NSMakeRange(0,index)];
                [pending replaceBytesInRange:NSMakeRange(0,index+1) withBytes:NULL length:0];
                id object=[NSJSONSerialization JSONObjectWithData:line options:0 error:nil];
                if([object isKindOfClass:NSDictionary.class])dispatch_async(dispatch_get_main_queue(), ^{if(self.messageHandler)self.messageHandler(object);});
            }
            if(pending.length>16*1024*1024){[self stop];break;}
        }
        if(pending.length){id object=[NSJSONSerialization JSONObjectWithData:pending options:0 error:nil];if([object isKindOfClass:NSDictionary.class])dispatch_async(dispatch_get_main_queue(), ^{if(self.messageHandler)self.messageHandler(object);});}
    });
    dispatch_group_async(readers, dispatch_get_global_queue(QOS_CLASS_UTILITY,0), ^{
        while(YES){NSData *chunk=[self.stderrPipe.fileHandleForReading availableData];if(!chunk.length)break;if(self.stderrData.length<1024*1024)[self.stderrData appendData:chunk];}
    });
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY,0), ^{
        [task waitUntilExit];dispatch_group_wait(readers,DISPATCH_TIME_FOREVER);
        NSString *stderrText=[[NSString alloc]initWithData:self.stderrData encoding:NSUTF8StringEncoding]?:@"";
        dispatch_async(dispatch_get_main_queue(), ^{
            if(self.terminationHandler)self.terminationHandler(task.terminationStatus,stderrText);
            self.messageHandler=nil;self.terminationHandler=nil;
            [self.stdinPipe.fileHandleForWriting closeFile];
        });
    });
    return YES;
}

- (void)sendMessage:(NSDictionary *)message {
    if (!self.task.running) return;
    NSData *json = [NSJSONSerialization dataWithJSONObject:message options:0 error:nil];
    if (!json) return;
    NSMutableData *line = [json mutableCopy];
    [line appendData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]];
    @try {
        [self.stdinPipe.fileHandleForWriting writeData:line];
    } @catch (__unused NSException *exception) {
    }
}

- (void)stop {
    if (!self.task.running) return;
    [self.task terminate];
    // SIGTERM peut etre ignore. On ne laisse pas un agent survivre a l arret
    // demande par l utilisateur : passe le delai, on tue le processus.
    pid_t pid = self.task.processIdentifier;
    __weak typeof(self) weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (weakSelf.task.running && weakSelf.task.processIdentifier == pid) kill(pid, SIGKILL);
    });
}

@end
