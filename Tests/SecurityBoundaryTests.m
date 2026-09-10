// Focused local-data security tests. All fixtures live in a temporary folder.
#define main CtrlKanbApplicationMain
#import "../Sources/App/main.m"
#undef main

static mode_t Permissions(NSString *path) {
    struct stat info;
    return lstat(path.fileSystemRepresentation, &info) == 0 ? info.st_mode & 0777 : 0;
}

@interface SecurityProbeDelegate : CodexBoardDelegate
@property(nonatomic,strong) NSMutableArray *events;
@end
@implementation SecurityProbeDelegate
- (void)sendFunction:(NSString *)function object:(id)object {
    [self.events addObject:@{ @"event":function ?: @"", @"data":object ?: @{} }];
}
@end

int main(int argc, const char *argv[]) { @autoreleasepool {
    NSString *dataFile = NSProcessInfo.processInfo.environment[@"CTRL_KANB_DATA_FILE"];
    NSString *fixtureRoot = NSProcessInfo.processInfo.environment[@"TEST_SECURITY_ROOT"];
    if (!dataFile.length || !fixtureRoot.length) return 2;
    NSString *dataRoot = dataFile.stringByDeletingLastPathComponent;
    if ([NSProcessInfo.processInfo.environment[@"TEST_PARENT_LINK"] boolValue]) {
        NSString *victimMarker = NSProcessInfo.processInfo.environment[@"TEST_VICTIM_FILE"];
        NSData *before = [NSData dataWithContentsOfFile:victimMarker];
        mode_t beforeRoot = Permissions(dataRoot.stringByResolvingSymlinksInPath);
        mode_t beforeMarker = Permissions(victimMarker);
        AppendBoardEvent(@{ @"type":@"security.parent-link" });
        int dataLock = AcquireBoardLock();
        if (dataLock >= 0) ReleaseBoardLock(dataLock);
        SecureDataDirectory();
        BOOL unchanged = [before isEqualToData:[NSData dataWithContentsOfFile:victimMarker]] &&
            beforeRoot == Permissions(dataRoot.stringByResolvingSymlinksInPath) && beforeMarker == Permissions(victimMarker);
        BOOL wroteThroughLink = [NSFileManager.defaultManager fileExistsAtPath:[dataRoot stringByAppendingPathComponent:@"events.jsonl"]] ||
            [NSFileManager.defaultManager fileExistsAtPath:[dataFile stringByAppendingString:@".lock"]];
        if (dataLock >= 0 || !unchanged || wroteThroughLink) {
            fprintf(stderr, "parent symlink boundary failed lock=%d unchanged=%d wrote=%d\n", dataLock, unchanged, wroteThroughLink);
            return 3;
        }
        puts("PASS dossier de données symbolique refusé");
        return 0;
    }
    NSString *localFile = [dataRoot stringByAppendingPathComponent:@"local.txt"];
    NSString *victimRoot = [fixtureRoot stringByAppendingPathComponent:@"victim"];
    NSString *victimFile = [victimRoot stringByAppendingPathComponent:@"outside.txt"];
    NSString *directoryLink = [dataRoot stringByAppendingPathComponent:@"external-directory"];
    NSString *fileLink = [dataRoot stringByAppendingPathComponent:@"external-file"];
    NSString *eventPath = [dataRoot stringByAppendingPathComponent:@"events.jsonl"];

    chmod(localFile.fileSystemRepresentation, 0644);
    chmod(victimRoot.fileSystemRepresentation, 0755);
    chmod(victimFile.fileSystemRepresentation, 0644);
    SecureFolderTree(dataRoot);
    BOOL treeSafe = Permissions(localFile) == 0600 && Permissions(victimRoot) == 0755 && Permissions(victimFile) == 0644;

    NSData *before = [NSData dataWithContentsOfFile:victimFile];
    AppendBoardEvent(@{ @"type":@"security.test" });
    NSData *after = [NSData dataWithContentsOfFile:victimFile];
    BOOL eventLinkSafe = [before isEqualToData:after];

    [NSFileManager.defaultManager removeItemAtPath:eventPath error:nil];
    AppendBoardEvent(@{ @"type":@"security.control" });
    NSData *eventData = [NSData dataWithContentsOfFile:eventPath];
    BOOL normalEventWorks = eventData.length > 0 && Permissions(eventPath) == 0600;

    NSString *inside = [dataRoot stringByAppendingPathComponent:@"local.txt"];
    BOOL pathsSafe = PathIsInsideRoot(inside, dataRoot) &&
        !PathIsInsideRoot([dataRoot stringByAppendingPathComponent:@"../victim/outside.txt"], dataRoot) &&
        !PathIsInsideRoot(fileLink, dataRoot) && !PathIsInsideRoot(directoryLink, dataRoot);

    if (!treeSafe || !eventLinkSafe || !normalEventWorks || !pathsSafe) {
        fprintf(stderr, "security boundaries failed tree=%d eventLink=%d normalEvent=%d paths=%d\n",
                treeSafe, eventLinkSafe, normalEventWorks, pathsSafe);
        return 3;
    }

    SecurityProbeDelegate *probe=[SecurityProbeDelegate new];probe.events=[NSMutableArray array];
    NSMutableDictionary *base=[@{ @"version":@22,@"spaces":@[],@"cards":@[],@"settings":@{},@"modifiedAt":@"base" } mutableCopy];
    [NSJSONSerialization dataWithJSONObject:base options:0 error:nil];
    [[NSJSONSerialization dataWithJSONObject:base options:0 error:nil] writeToFile:dataFile atomically:YES];
    probe.lastPresentedBoard=base;
    NSMutableDictionary *incoming=[base mutableCopy];incoming[@"cards"]=@[@{ @"id":@"app-card",@"title":@"Interface" }];incoming[@"modifiedAt"]=@"app";
    NSMutableDictionary *external=[base mutableCopy];external[@"cards"]=@[@{ @"id":@"cli-card",@"title":@"CLI" }];external[@"modifiedAt"]=@"cli";
    [[NSJSONSerialization dataWithJSONObject:external options:0 error:nil] writeToFile:dataFile atomically:YES];
    [probe saveBoard:incoming];
    NSDictionary *merged=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:dataFile] options:0 error:nil];
    NSSet *mergedIDs=[NSSet setWithArray:[merged[@"cards"] valueForKey:@"id"]];
    BOOL mergeSafe=mergedIDs.count==2&&[mergedIDs containsObject:@"app-card"]&&[mergedIDs containsObject:@"cli-card"]&&
        [probe.events filteredArrayUsingPredicate:[NSPredicate predicateWithFormat:@"event == 'boardMerged'"]].count==1;

    probe.lastPresentedBoard=merged;[probe.events removeAllObjects];
    NSMutableDictionary *localConflict=[merged mutableCopy],*remoteConflict=[merged mutableCopy];
    NSMutableArray *localCards=[[merged[@"cards"] mutableCopy] mutableCopy],*remoteCards=[[merged[@"cards"] mutableCopy] mutableCopy];
    NSUInteger cliIndex=[localCards indexOfObjectPassingTest:^BOOL(NSDictionary *item,NSUInteger index,BOOL *stop){return [item[@"id"]isEqual:@"cli-card"];}];
    localCards[cliIndex]=@{ @"id":@"cli-card",@"title":@"Local" };remoteCards[cliIndex]=@{ @"id":@"cli-card",@"title":@"Remote" };
    localConflict[@"cards"]=localCards;localConflict[@"modifiedAt"]=@"local";
    remoteConflict[@"cards"]=remoteCards;remoteConflict[@"modifiedAt"]=@"remote";
    [[NSJSONSerialization dataWithJSONObject:remoteConflict options:0 error:nil] writeToFile:dataFile atomically:YES];
    [probe saveBoard:localConflict];
    NSDictionary *afterConflict=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:dataFile] options:0 error:nil];
    NSDictionary *remoteCard=[afterConflict[@"cards"] filteredArrayUsingPredicate:[NSPredicate predicateWithFormat:@"id == 'cli-card'"]].firstObject;
    BOOL conflictSafe=[remoteCard[@"title"]isEqual:@"Remote"]&&[NSFileManager.defaultManager fileExistsAtPath:BoardConflictPath()]&&
        [probe.events filteredArrayUsingPredicate:[NSPredicate predicateWithFormat:@"event == 'boardSaveConflict'"]].count==1;
    if(!mergeSafe||!conflictSafe){fprintf(stderr,"concurrent board merge failed merge=%d conflict=%d\n",mergeSafe,conflictSafe);return 3;}
    puts("PASS liens symboliques et chemins restent dans leur périmètre");
    puts("PASS modifications application et CLI fusionnées sans perte silencieuse");
    return 0;
} }
