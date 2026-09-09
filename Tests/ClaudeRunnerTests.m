// Native bridge integration tests. No account, network inference or user board required.
#define main CtrlKanbApplicationMain
#import "../Sources/App/main.m"
#undef main
@interface ProbeDelegate : CodexBoardDelegate
@property(nonatomic) BOOL complete;
@property(nonatomic,strong) NSDictionary *result;
@property(nonatomic,strong) NSMutableArray *events;
@property(nonatomic,copy) NSString *decision;
@property(nonatomic) NSInteger finishCount;
@property(nonatomic) NSInteger targetFinishCount;
@end
@implementation ProbeDelegate
- (void)sendFunction:(NSString *)function object:(id)object {
    [self.events addObject:@{@"event":function,@"data":object?:@{}}];
    if([function isEqual:@"approvalRequested"]){
        NSDictionary *answer=[object[@"kind"]isEqual:@"input"]?@{@"answers":@{@"Quelle couleur ?":@{@"answers":@[@"Sauge"]}}}:@{@"decision":self.decision?:@"accept"};
        [self respondToServerRequest:@{@"cardID":object[@"cardID"],@"requestID":object[@"requestID"],@"result":answer}];
    }
    if([function isEqual:@"runnerFinished"]||[function isEqual:@"runnerCanceled"]){
        self.result=object;self.finishCount+=1;
        if(self.finishCount>=MAX(1,self.targetFinishCount))self.complete=YES;
    }
    if([function isEqual:@"claudeSessionsSynced"]){self.result=object;self.complete=YES;}
}
- (void)notifyTitle:(NSString *)title message:(NSString *)message category:(NSString *)category card:(NSDictionary *)card {}
@end
int main(int argc,const char *argv[]){@autoreleasepool{
    ProbeDelegate *probe=[ProbeDelegate new];probe.runs=[NSMutableDictionary dictionary];probe.pendingRuns=[NSMutableArray array];probe.maxConcurrentCodexRuns=1;probe.maxConcurrentClaudeRuns=1;probe.events=[NSMutableArray array];probe.decision=NSProcessInfo.processInfo.environment[@"TEST_DECISION"]?:@"accept";
    NSDictionary *environment=NSProcessInfo.processInfo.environment;
    NSString *syncHome=environment[@"TEST_SYNC_HOME"],*syncSession=environment[@"TEST_SYNC_SESSION"];
    if(syncHome.length&&syncSession.length){
        [probe syncClaudeSessions:@[@{@"sessionID":syncSession,@"accountID":@"claude-code:test",@"accountHome":syncHome}]];
        NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:5];while(!probe.complete&&deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.02]];
        NSData *output=[NSJSONSerialization dataWithJSONObject:@{@"complete":@(probe.complete),@"result":probe.result?:@{},@"events":probe.events} options:0 error:nil];puts([[NSString alloc]initWithData:output encoding:NSUTF8StringEncoding].UTF8String);
        return probe.complete?0:2;
    }
    BOOL queuePair=[environment[@"TEST_QUEUE_PAIR"]boolValue];
    if(queuePair){probe.maxConcurrentClaudeRuns=2;probe.targetFinishCount=2;}
    NSMutableDictionary *card=[@{@"id":@"test-card",@"title":environment[@"TEST_TITLE"]?:@"Café — test",@"prompt":environment[@"TEST_PROMPT"]?:@"Café, caractères et reprise",@"agentEngine":@"claude-code",@"model":environment[@"TEST_MODEL"]?:@"sonnet",@"reasoningEffort":environment[@"TEST_EFFORT"]?:@"medium"}mutableCopy];
    NSString *session=NSProcessInfo.processInfo.environment[@"TEST_SESSION"];if(session)card[@"conversationID"]=session;
    NSString *mode=NSProcessInfo.processInfo.environment[@"TEST_MODE"]?:@"workspaceWrite";
    NSDictionary *space=@{@"name":environment[@"TEST_SPACE_NAME"]?:@"Projet test",@"rootPath":environment[@"TEST_CWD"]?:@"/private/tmp"};
    [probe runCard:@{@"card":card,@"space":space,@"mode":mode}];
    if(queuePair){NSMutableDictionary *second=[card mutableCopy];second[@"id"]=@"test-card-2";[probe runCard:@{@"card":second,@"space":space,@"mode":mode}];}
    if([NSProcessInfo.processInfo.environment[@"TEST_STOP"]boolValue])dispatch_after(dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_SEC/5),dispatch_get_main_queue(),^{[probe stopCard:@"test-card"];});
    NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:45];while(!probe.complete&&deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.02]];
    NSData *output=[NSJSONSerialization dataWithJSONObject:@{@"complete":@(probe.complete),@"result":probe.result?:@{},@"events":probe.events} options:0 error:nil];puts([[NSString alloc]initWithData:output encoding:NSUTF8StringEncoding].UTF8String);
    return probe.complete?0:2;
}}
