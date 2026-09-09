#import <Foundation/Foundation.h>
#import <sys/file.h>
#import <fcntl.h>
#import <unistd.h>

static NSString *DataPath(void) {
    NSString *override = NSProcessInfo.processInfo.environment[@"CTRL_KANB_DATA_FILE"];
    if (override.length) return override.stringByStandardizingPath;
    NSString *support = NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES).firstObject;
    return [support stringByAppendingPathComponent:@"CTRL KANB/board.json"];
}

static int LockData(void) {
    NSString *folder = DataPath().stringByDeletingLastPathComponent;
    [NSFileManager.defaultManager createDirectoryAtPath:folder withIntermediateDirectories:YES attributes:@{ NSFilePosixPermissions:@(0700) } error:nil];
    NSString *lockPath = [DataPath() stringByAppendingString:@".lock"];
    int descriptor = open(lockPath.fileSystemRepresentation, O_CREAT | O_RDWR, 0600);
    if (descriptor >= 0 && flock(descriptor, LOCK_EX) != 0) { close(descriptor); return -1; }
    return descriptor;
}

static void UnlockData(int descriptor) { if (descriptor >= 0) { flock(descriptor, LOCK_UN); close(descriptor); } }

static NSMutableDictionary *LoadBoard(void) {
    int lock = LockData();
    NSData *data = [NSData dataWithContentsOfFile:DataPath()];
    NSMutableDictionary *board = data ? [NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingMutableContainers error:nil] : nil;
    UnlockData(lock);
    return board;
}

static BOOL SaveBoard(NSMutableDictionary *board) {
    NSString *path = DataPath();
    int lock = LockData();
    if (lock < 0) return NO;
    board[@"modifiedAt"] = [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]];
    board[@"version"] = @22;
    NSData *data = [NSJSONSerialization dataWithJSONObject:board options:NSJSONWritingPrettyPrinted | NSJSONWritingSortedKeys error:nil];
    NSData *current = [NSData dataWithContentsOfFile:path];
    NSString *previous = [[path stringByDeletingPathExtension] stringByAppendingString:@".previous.json"];
    if (current) { [current writeToFile:previous options:NSDataWritingAtomic error:nil]; [NSFileManager.defaultManager setAttributes:@{ NSFilePosixPermissions:@(0600) } ofItemAtPath:previous error:nil]; }
    BOOL success = [data writeToFile:path options:NSDataWritingAtomic error:nil];
    if (success) [NSFileManager.defaultManager setAttributes:@{ NSFilePosixPermissions:@(0600) } ofItemAtPath:path error:nil];
    UnlockData(lock);
    return success;
}

static NSString *Option(NSArray<NSString *> *args, NSString *flag) {
    NSUInteger index = [args indexOfObject:flag];
    return index != NSNotFound && index + 1 < args.count ? args[index + 1] : nil;
}

static NSMutableDictionary *FindSpace(NSMutableDictionary *board, NSString *query) {
    for (NSMutableDictionary *space in board[@"spaces"]) {
        if ([space[@"id"] caseInsensitiveCompare:query] == NSOrderedSame ||
            [[space[@"id"] lowercaseString] hasPrefix:[query lowercaseString]] ||
            [space[@"name"] caseInsensitiveCompare:query] == NSOrderedSame) return space;
    }
    return nil;
}

static NSMutableDictionary *FindCard(NSMutableDictionary *board, NSString *query) {
    NSMutableArray *matches = [NSMutableArray array];
    for (NSMutableDictionary *card in board[@"cards"]) {
        if ([[card[@"id"] lowercaseString] hasPrefix:[query lowercaseString]] ||
            [card[@"title"] localizedCaseInsensitiveContainsString:query]) [matches addObject:card];
    }
    return matches.count == 1 ? matches.firstObject : nil;
}

static NSString *PriorityCode(NSDictionary *board, NSString *priorityID) {
    for (NSDictionary *priority in board[@"settings"][@"priorities"]) if ([priority[@"id"] isEqual:priorityID]) return priority[@"code"] ?: priorityID;
    return priorityID ?: @"N";
}

static void Help(void) {
    puts("ctrl-kanb — pilote le Kanban local\n"
         "\n"
         "Commandes :\n"
         "  spaces\n"
         "  cards [--space <nom|id>]\n"
         "  show <carte>\n"
         "  add-space --name <nom> --path <dossier> [--color <hex>]\n"
         "  add-card --space <nom|id> --title <titre> --prompt <texte> [--board <classic|routines>] [--status <statut>] [--mode <mode>] [--priority <id>] [--number <n>] [--launch <manual|scheduled|codex>] [--at <date-heure>]\n"
         "  move <carte> <backlog|ready|queued|running|needsInput|review|done>\n"
         "  schedule <carte> --at <AAAA-MM-JJTHH:MM> [--missed <catchUp|skip>]\n"
         "  unschedule <carte>\n"
         "  link <carte> <conversation-id> [--name <titre>]\n"
         "  unlink <carte>\n"
         "  delete-card <carte>\n"
         "  data-path");
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSMutableArray<NSString *> *args = [NSMutableArray array];
        for (int i = 1; i < argc; i++) [args addObject:[NSString stringWithUTF8String:argv[i]]];
        NSString *command = args.firstObject;
        if (!command || [@[@"help", @"--help", @"-h"] containsObject:command]) { Help(); return 0; }
        if ([command isEqualToString:@"data-path"]) { puts(DataPath().UTF8String); return 0; }
        NSMutableDictionary *board = LoadBoard();
        if (!board) { fputs("Erreur : lance d'abord CTRL KANB pour initialiser les données.\n", stderr); return 1; }

        if ([command isEqualToString:@"spaces"]) {
            for (NSDictionary *space in board[@"spaces"]) printf("%.8s\t%s\t%s\n", [space[@"id"] UTF8String], [space[@"name"] UTF8String], [space[@"rootPath"] UTF8String]);
        } else if ([command isEqualToString:@"cards"]) {
            NSMutableDictionary *space = Option(args, @"--space") ? FindSpace(board, Option(args, @"--space")) : nil;
            for (NSDictionary *card in board[@"cards"]) {
                if (space && ![card[@"spaceID"] isEqualToString:space[@"id"]]) continue;
                NSDictionary *owner = FindSpace(board, card[@"spaceID"]);
                NSString *thread = [card[@"conversationID"] isKindOfClass:NSString.class] ? card[@"conversationID"] : @"-";
                NSString *priority = card[@"priorityLevelID"] ?: card[@"priority"] ?: @"normal";
                NSNumber *number = card[@"priorityNumber"] ?: @0;
                printf("%.8s\t%s-%02ld\t%s\t%s\t%s\t%s\t%.8s\n", [card[@"id"] UTF8String], [PriorityCode(board, priority) UTF8String], (long)number.integerValue, [(card[@"boardPresetID"] ?: @"classic") UTF8String], [card[@"status"] UTF8String], [owner[@"name"] UTF8String], [card[@"title"] UTF8String], thread.UTF8String);
            }
        } else if ([command isEqualToString:@"show"] && args.count >= 2) {
            NSDictionary *card = FindCard(board, args[1]);
            NSDictionary *space = card ? FindSpace(board, card[@"spaceID"]) : nil;
            if (!card) { fputs("Erreur : carte introuvable ou ambiguë.\n", stderr); return 1; }
            NSString *conversation = card[@"conversationID"] ?: @"aucune";
            NSString *conversationName = card[@"conversationName"] ?: @"";
            printf("ID: %s\nTitre: %s\nEspace: %s\nDossier: %s\nTableau: %s\nStatut: %s\nPriorité: %s-%02ld\nMode: %s\nConversation: %s %s\nPrompt:\n%s\n",
                   [card[@"id"] UTF8String], [card[@"title"] UTF8String], [space[@"name"] UTF8String], [space[@"rootPath"] UTF8String], [(card[@"boardPresetID"] ?: @"classic") UTF8String], [card[@"status"] UTF8String], [PriorityCode(board, card[@"priorityLevelID"] ?: card[@"priority"] ?: @"normal") UTF8String], (long)[card[@"priorityNumber"] integerValue], [card[@"runMode"] UTF8String], conversation.UTF8String, conversationName.UTF8String, [card[@"prompt"] UTF8String]);
        } else if ([command isEqualToString:@"add-space"]) {
            NSString *name = Option(args, @"--name"), *path = Option(args, @"--path");
            if (!name.length || !path.length) { fputs("Erreur : --name et --path sont requis.\n", stderr); return 1; }
            NSString *spaceID = NSUUID.UUID.UUIDString.lowercaseString;
            NSMutableDictionary *space = [@{ @"id": spaceID, @"name": name, @"rootPath": path, @"accentHex": Option(args, @"--color") ?: @"6E75FF", @"createdAt": [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]] } mutableCopy];
            [board[@"spaces"] addObject:space];
            if (!SaveBoard(board)) return 1;
            printf("Espace créé : %.8s %s\n", spaceID.UTF8String, name.UTF8String);
        } else if ([command isEqualToString:@"add-card"]) {
            NSString *spaceQuery = Option(args, @"--space"), *title = Option(args, @"--title"), *prompt = Option(args, @"--prompt");
            NSMutableDictionary *space = spaceQuery ? FindSpace(board, spaceQuery) : nil;
            if (!space || !title.length || !prompt.length) { fputs("Erreur : --space, --title et --prompt sont requis.\n", stderr); return 1; }
            NSString *cardID = NSUUID.UUID.UUIDString.lowercaseString;
            NSString *now = [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]];
            NSString *priority = Option(args, @"--priority") ?: @"normal";
            NSInteger nextNumber = 1;
            for (NSDictionary *existing in board[@"cards"]) if ([existing[@"spaceID"] isEqual:space[@"id"]] && [(existing[@"priorityLevelID"] ?: existing[@"priority"]) isEqual:priority]) nextNumber = MAX(nextNumber, [existing[@"priorityNumber"] integerValue] + 1);
            NSNumber *number = Option(args, @"--number") ? @([Option(args, @"--number") integerValue]) : @(nextNumber);
            NSString *launchMode = Option(args, @"--launch") ?: @"manual", *scheduledAt = Option(args, @"--at") ?: @"";
            if ([launchMode isEqual:@"scheduled"] && !scheduledAt.length) { fputs("Erreur : --at est requis pour un lancement programmé.\n", stderr); return 1; }
            NSString *boardPresetID = Option(args, @"--board") ?: (([launchMode isEqual:@"scheduled"] || [launchMode isEqual:@"codex"]) ? @"routines" : @"classic");
            if (![@[@"classic", @"routines"] containsObject:boardPresetID]) { fputs("Erreur : --board doit valoir classic ou routines.\n", stderr); return 1; }
            NSMutableDictionary *card = [@{ @"id": cardID, @"spaceID": space[@"id"], @"boardPresetID":boardPresetID, @"title": title, @"prompt": prompt, @"status": Option(args, @"--status") ?: @"backlog", @"priority": priority, @"priorityLevelID":priority, @"priorityNumber":number, @"categoryAssignments":@{}, @"runMode": Option(args, @"--mode") ?: @"workspaceWrite", @"launchMode":launchMode, @"scheduledAt":scheduledAt, @"missedRunPolicy":@"catchUp", @"scheduleState":[launchMode isEqual:@"scheduled"] ? @"pending" : @"", @"labels":@[], @"subtasks":@[], @"dependencies":@[], @"conversations":@[], @"recurrence":@"none", @"recurrenceSource":[launchMode isEqual:@"codex"] ? @"codex" : @"board", @"createdAt": now, @"updatedAt": now } mutableCopy];
            [board[@"cards"] addObject:card];
            if (!SaveBoard(board)) return 1;
            printf("Carte créée : %.8s %s\n", cardID.UTF8String, title.UTF8String);
        } else if ([command isEqualToString:@"move"] && args.count >= 3) {
            NSMutableDictionary *card = FindCard(board, args[1]);
            NSArray *statuses = @[@"backlog", @"ready", @"queued", @"running", @"needsInput", @"review", @"done"];
            if (!card || ![statuses containsObject:args[2]]) { fputs("Erreur : carte ou statut invalide.\n", stderr); return 1; }
            card[@"status"] = args[2];
            card[@"updatedAt"] = [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]];
            if (!SaveBoard(board)) return 1;
            printf("Carte déplacée : %.8s -> %s\n", [card[@"id"] UTF8String], [args[2] UTF8String]);
        } else if ([command isEqualToString:@"schedule"] && args.count >= 2) {
            NSMutableDictionary *card = FindCard(board, args[1]);
            NSString *scheduledAt = Option(args, @"--at"), *missed = Option(args, @"--missed") ?: @"catchUp";
            if (!card || !scheduledAt.length || ![@[@"catchUp", @"skip"] containsObject:missed]) { fputs("Erreur : carte, --at ou politique invalide.\n", stderr); return 1; }
            card[@"launchMode"] = @"scheduled"; card[@"scheduledAt"] = scheduledAt; card[@"missedRunPolicy"] = missed; card[@"scheduleState"] = @"pending"; card[@"scheduleAttempts"] = @0; card[@"scheduleNextAttemptAt"] = @""; card[@"recurrenceSource"] = @"board"; card[@"updatedAt"] = [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]];
            if (!SaveBoard(board)) return 1;
            printf("Carte programmée : %.8s -> %s\n", [card[@"id"] UTF8String], scheduledAt.UTF8String);
        } else if ([command isEqualToString:@"unschedule"] && args.count >= 2) {
            NSMutableDictionary *card = FindCard(board, args[1]);
            if (!card) { fputs("Erreur : carte introuvable ou ambiguë.\n", stderr); return 1; }
            card[@"launchMode"] = @"manual"; card[@"scheduleState"] = @""; card[@"scheduleNextAttemptAt"] = @""; card[@"recurrenceSource"] = @"board"; card[@"updatedAt"] = [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]];
            if (!SaveBoard(board)) return 1;
            printf("Programmation retirée : %.8s\n", [card[@"id"] UTF8String]);
        } else if ([command isEqualToString:@"link"] && args.count >= 3) {
            NSMutableDictionary *card = FindCard(board, args[1]);
            NSString *threadID = args[2];
            if (!card || !threadID.length) { fputs("Erreur : carte ou identifiant de conversation invalide.\n", stderr); return 1; }
            card[@"conversationID"] = threadID;
            card[@"conversationName"] = Option(args, @"--name") ?: card[@"title"];
            card[@"updatedAt"] = [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]];
            board[@"version"] = @22;
            if (!SaveBoard(board)) return 1;
            printf("Conversation liée : %.8s -> %.8s\n", [card[@"id"] UTF8String], threadID.UTF8String);
        } else if ([command isEqualToString:@"unlink"] && args.count >= 2) {
            NSMutableDictionary *card = FindCard(board, args[1]);
            if (!card) { fputs("Erreur : carte introuvable ou ambiguë.\n", stderr); return 1; }
            [card removeObjectsForKeys:@[@"conversationID", @"conversationName", @"conversationPreview", @"conversationCwd"]];
            card[@"updatedAt"] = [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]];
            board[@"version"] = @22;
            if (!SaveBoard(board)) return 1;
            printf("Conversation dissociée : %.8s\n", [card[@"id"] UTF8String]);
        } else if ([command isEqualToString:@"delete-card"] && args.count >= 2) {
            NSMutableDictionary *card = FindCard(board, args[1]);
            if (!card) { fputs("Erreur : carte introuvable ou ambiguë.\n", stderr); return 1; }
            [board[@"cards"] removeObject:card];
            if (!SaveBoard(board)) return 1;
            printf("Carte supprimée : %.8s\n", [card[@"id"] UTF8String]);
        } else {
            fputs("Erreur : commande inconnue ou incomplète. Utilise ctrl-kanb help.\n", stderr);
            return 1;
        }
    }
    return 0;
}
