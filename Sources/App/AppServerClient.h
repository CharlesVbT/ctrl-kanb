#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^AppServerMessageHandler)(NSDictionary *message);
typedef void (^AppServerTerminationHandler)(int status, NSString *stderrText);

@interface AppServerClient : NSObject

@property(nonatomic, readonly, getter=isRunning) BOOL running;
/// Variables ajoutees a l environnement du processus. Sert a isoler le compte
/// utilise : CODEX_HOME et CLAUDE_CONFIG_DIR deplacent l authentification.
@property(nonatomic, strong, nullable) NSDictionary<NSString *, NSString *> *extraEnvironment;

- (instancetype)initWithExecutable:(NSString *)executable;
- (instancetype)initWithExecutable:(NSString *)executable arguments:(NSArray<NSString *> *)arguments cwd:(NSString * _Nullable)cwd;
- (BOOL)startWithMessageHandler:(AppServerMessageHandler)messageHandler
             terminationHandler:(AppServerTerminationHandler)terminationHandler
                           error:(NSError **)error;
- (void)sendMessage:(NSDictionary *)message;
- (void)stop;

@end

NS_ASSUME_NONNULL_END
