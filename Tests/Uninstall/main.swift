import Foundation
let fm = FileManager.default
let root = fm.temporaryDirectory.appendingPathComponent("hanx-delete-test-" + UUID().uuidString)
try fm.createDirectory(at: root, withIntermediateDirectories: true)
defer { try? fm.removeItem(at: root) }
func write(_ path: String, _ value: String = "test") throws { let u=root.appendingPathComponent(path); try fm.createDirectory(at:u.deletingLastPathComponent(),withIntermediateDirectories:true);try Data(value.utf8).write(to:u) }
try write("home/Documents/report.hanx")
try write("home/.local/share/HanX/setup.json", "{\"components\":\"all\",\"gui\":\"/do/not/trust\"}")
try write("home/Library/Application Support/HanX/CLI/2.13.0/HANX-CLI-VERSION", "2.13.0")
try write("home/Library/Application Support/HanX/CLI/2.13.0/hanx")
try write("home/Library/Application Support/HanX/CLI/2.13.0/report.hanx")
try write("home/Library/Application Support/HanX/CLI/2.13.0/unrelated.dll")
try write("home/Library/Application Support/HanX/CLI/2.13.0/owned.dll")
try write("home/Library/Application Support/HanX/CLI/2.13.0/hanx-cli.cmd")
try write("home/Library/Application Support/HanX/CLI/2.13.0/HANX-INSTALL.json", "{\"product\":\"HanX\",\"runtimeFiles\":[\"owned.dll\"]}")
try write("home/Library/Application Support/HanX/CLI/2.13.0/pdf/worker.py")
try write("home/Library/Application Support/HanX/CLI/2.13.0/pdf/requirements.txt")
try write("home/Library/Application Support/HanX/CLI/2.13.0/pdf/keep.pdf")
try write("home/.local/bin/other")
let home=root.appendingPathComponent("home")
let cli=home.appendingPathComponent("Library/Application Support/HanX/CLI/2.13.0/hanx")
#if !os(Windows)
try fm.createSymbolicLink(at:home.appendingPathComponent(".local/bin/hanx"),withDestinationURL:cli)
#endif
let config=AgentUninstall.Context(home:home, executable:cli, environment:[:], systemDirectories:[], discoverManagers:false)
let plan=AgentUninstall.plan(config)
#if !os(Windows)
assert(plan.removals.contains{ $0.url.lastPathComponent == "hanx" && $0.url.path.contains(".local/bin") })
#endif
assert(!plan.removals.contains{ $0.url.path.contains("Documents") || $0.url.path.contains("/do/not/trust") })
for answer in ["", "n", "N", "no", "yes", "y anything"] { assert(!AgentUninstall.confirmed(answer)) }
assert(AgentUninstall.confirmed("Y"));assert(AgentUninstall.confirmed(" y "))
// Cancelling must not call any deletion operation.
var deletes=0
let cancelled=try AgentUninstall.apply(plan, answer:"N", remove:{_ in deletes += 1}, execute:{_ in});assert(!cancelled)
assert(deletes == 0 && fm.fileExists(atPath:cli.path))
let applied=try AgentUninstall.apply(plan, answer:"Y", remove:AgentUninstall.remove, execute:{_ in});assert(applied)
assert(!fm.fileExists(atPath:cli.path))
assert(!fm.fileExists(atPath:cli.deletingLastPathComponent().appendingPathComponent("pdf/worker.py").path))
assert(fm.fileExists(atPath:cli.deletingLastPathComponent().appendingPathComponent("pdf/keep.pdf").path))
assert(fm.fileExists(atPath:home.appendingPathComponent("Documents/report.hanx").path))
assert(fm.fileExists(atPath:cli.deletingLastPathComponent().appendingPathComponent("report.hanx").path))
assert(fm.fileExists(atPath:cli.deletingLastPathComponent().appendingPathComponent("unrelated.dll").path))
assert(!fm.fileExists(atPath:cli.deletingLastPathComponent().appendingPathComponent("owned.dll").path))
assert(!fm.fileExists(atPath:cli.deletingLastPathComponent().appendingPathComponent("hanx-cli.cmd").path))
assert(fm.fileExists(atPath:home.appendingPathComponent(".local/bin/other").path))
#if !os(Windows)
// A swapped parent must never redirect removal into someone else's directory.
try write("home/cache/file");try write("outside/file")
let entry=AgentUninstall.Removal(home.appendingPathComponent("cache/file"))
try fm.removeItem(at:home.appendingPathComponent("cache"))
try fm.createSymbolicLink(at:home.appendingPathComponent("cache"),withDestinationURL:root.appendingPathComponent("outside"))
do { try AgentUninstall.remove(entry);fatalError("Changed parent accepted") } catch {}
assert(fm.fileExists(atPath:root.appendingPathComponent("outside/file").path))
// A symlink itself can be removed, without deleting its target.
let link=home.appendingPathComponent("link")
try fm.createSymbolicLink(at:link,withDestinationURL:root.appendingPathComponent("outside"))
try AgentUninstall.remove(.init(link));assert(fm.fileExists(atPath:root.appendingPathComponent("outside/file").path))
#endif
#if os(Windows)
let script=AgentUninstall.windowsScript(plan,processID:0)
let scriptFile=root.appendingPathComponent("syntax.ps1");try ("\u{feff}"+script).write(to:scriptFile,atomically:true,encoding:.utf8)
let ps=AgentUninstall.find("powershell",AgentUninstall.Context())!
let escaped=scriptFile.path.replacingOccurrences(of:"'",with:"''")
let parse="$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('"+escaped+"',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|Out-String|Write-Output;exit 1};Write-Output 'OK'"
assert(AgentUninstall.query(ps,["-NoProfile","-Command",parse]) == "OK")
try write("worker 폴더/file's.txt")
try write("worker 폴더/keep.hanx")
var workerPlan=AgentUninstall.Plan()
workerPlan.removals=[.init(root.appendingPathComponent("worker 폴더/file's.txt")),.init(root.appendingPathComponent("worker 폴더"),emptyOnly:true)]
let workerFile=root.appendingPathComponent("worker.ps1")
try ("\u{feff}"+AgentUninstall.windowsScript(workerPlan,processID:0,interactive:false)).write(to:workerFile,atomically:true,encoding:.utf8)
let task=Process();task.executableURL=ps;task.arguments=["-NoProfile","-ExecutionPolicy","Bypass","-File",workerFile.path];task.standardInput=FileHandle.nullDevice
try task.run();task.waitUntilExit();assert(task.terminationStatus == 0)
assert(!fm.fileExists(atPath:root.appendingPathComponent("worker 폴더/file's.txt").path))
assert(fm.fileExists(atPath:root.appendingPathComponent("worker 폴더/keep.hanx").path))
#endif
print("UNINSTALL_PLAN_CONFIRMATION_AND_DOCUMENT_PRESERVATION_OK")
