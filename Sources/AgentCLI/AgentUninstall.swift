import Foundation

/// Only owned installation locations are considered. Documents and arbitrary
/// paths recorded in setup.json are never deletion targets.
enum AgentUninstall {
    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }
    struct Context {
        var home: URL = FileManager.default.homeDirectoryForCurrentUser
        var executable: URL = (Bundle.main.executableURL ?? URL(fileURLWithPath: CommandLine.arguments[0])).resolvingSymlinksInPath()
        var environment: [String:String] = ProcessInfo.processInfo.environment
        var systemDirectories: [URL] = [URL(fileURLWithPath:"/Applications"),URL(fileURLWithPath:"/usr/local/bin")]
        var discoverManagers = true
        func env(_ name:String) -> String? { environment.first { $0.key.caseInsensitiveCompare(name) == .orderedSame }?.value }
    }
    struct Removal {
        let url: URL
        let parent: URL
        let resolved: URL
        let link: String?
        let emptyOnly: Bool
        init(_ url:URL, emptyOnly:Bool = false) {
            self.url=url.standardizedFileURL
            self.emptyOnly=emptyOnly
            parent=url.deletingLastPathComponent().resolvingSymlinksInPath()
            resolved=url.resolvingSymlinksInPath()
            link=try? FileManager.default.destinationOfSymbolicLink(atPath:url.path)
        }
    }
    struct Command {
        let file: URL
        let args: [String]
        let label: String
        var elevated = false
    }
    struct Plan {
        var removals: [Removal] = []
        var commands: [Command] = []
        var applications: [URL] = []
        var warnings: [String] = []
    }
    static let fm = FileManager.default
    static func exists(_ url:URL) -> Bool { (try? fm.attributesOfItem(atPath:url.path)) != nil }
    static func confirmed(_ answer:String) -> Bool { answer.trimmingCharacters(in:.whitespacesAndNewlines).lowercased() == "y" }
    static func find(_ name:String, _ context:Context) -> URL? {
        #if os(Windows)
        let paths=(context.env("PATH") ?? "").split(separator:";").map(String.init)
        let filename=name.hasSuffix(".exe") ? name : name+".exe"
        #else
        let paths=(context.env("PATH") ?? "").split(separator:":").map(String.init)+["/opt/homebrew/bin","/usr/local/bin","/usr/bin","/bin","/usr/sbin"]
        let filename=name
        #endif
        return paths.filter{!$0.isEmpty}.map{URL(fileURLWithPath:$0).appendingPathComponent(filename)}.first{fm.isExecutableFile(atPath:$0.path)}
    }
    static func query(_ executable:URL, _ args:[String]) -> String? {
        let p=Process(), pipe=Pipe();p.executableURL=executable;p.arguments=args
        p.standardOutput=pipe;p.standardError=FileHandle.nullDevice;p.standardInput=FileHandle.nullDevice
        do {
            try p.run()
            let timer=DispatchSource.makeTimerSource(queue:DispatchQueue.global())
            timer.schedule(deadline:.now()+15)
            timer.setEventHandler { if p.isRunning { p.terminate() } }
            timer.resume();defer { timer.cancel() }
            let data=pipe.fileHandleForReading.readDataToEndOfFile();p.waitUntilExit()
            return p.terminationStatus == 0 ? String(data:data,encoding:.utf8)?.trimmingCharacters(in:.whitespacesAndNewlines) : nil
        } catch { return nil }
    }
    static func ownedCLI(_ root:URL) -> Bool {
        let marker=root.appendingPathComponent("HANX-CLI-VERSION")
        if let v=try? String(contentsOf:marker,encoding:.utf8),v.trimmingCharacters(in:.whitespacesAndNewlines).range(of:"^\\d+\\.\\d+\\.\\d+$",options:.regularExpression) != nil { return true }
        let readme=(try? String(contentsOf:root.appendingPathComponent("README.md"),encoding:.utf8)) ?? ""
        return readme.hasPrefix("# HanX CLI") && exists(root.appendingPathComponent("LICENSE")) && ["hanx","hanx.exe","hanx-engine"].contains{exists(root.appendingPathComponent($0))}
    }
    static func ownedApp(_ url:URL) -> Bool {
        guard let data=try? Data(contentsOf:url.appendingPathComponent("Contents/Info.plist")),
              let plist=(try? PropertyListSerialization.propertyList(from:data,format:nil)) as? [String:Any] else { return false }
        return ["com.hanword.editor","org.studentsview.hanx","io.hanx.app"].contains(plist["CFBundleIdentifier"] as? String ?? "")
    }
    static func plan(_ c:Context = Context()) -> Plan {
        var result=Plan(),roots:[URL]=[],links:[URL]=[]
        func add(_ url:URL, emptyOnly:Bool = false) {
            guard exists(url),url.path != c.home.path,url.path != "/",!result.removals.contains(where:{$0.url == url.standardizedFileURL}) else { return }
            result.removals.append(Removal(url,emptyOnly:emptyOnly))
        }
        func cliFiles(_ root:URL) {
            guard ownedCLI(root) else { return }
            let manifestData=try? Data(contentsOf:root.appendingPathComponent("HANX-INSTALL.json"))
            let manifest=manifestData.flatMap{try? JSONSerialization.jsonObject(with:$0)} as? [String:Any]
            let runtime=Set(manifest?["runtimeFiles"] as? [String] ?? [])
            let fixed:Set<String>=["hanx","hanx.exe","hanx-cli.cmd","hanx-engine","HANX-INSTALL.json","HANX-CLI-VERSION","HANX-CLI-INSTALL.json","LICENSE","NOTICE","README.md","install-cli.sh","install-gui.sh"]
            for file in (try? fm.contentsOfDirectory(at:root,includingPropertiesForKeys:nil)) ?? [] {
                if fixed.contains(file.lastPathComponent) || (runtime.contains(file.lastPathComponent) && file.pathExtension.lowercased() == "dll") { add(file) }
            }
            for folder in ["lib","examples","third-party-licenses"] {
                let base=root.appendingPathComponent(folder)
                if (try? fm.destinationOfSymbolicLink(atPath:base.path)) != nil { add(base);continue }
                if let iterator=fm.enumerator(at:base,includingPropertiesForKeys:[.isDirectoryKey,.isSymbolicLinkKey]) {
                    var directories:[URL]=[]
                    for case let file as URL in iterator {
                        let values=try? file.resourceValues(forKeys:[.isDirectoryKey,.isSymbolicLinkKey])
                        if values?.isSymbolicLink == true { iterator.skipDescendants();add(file) }
                        else if values?.isDirectory == true { directories.append(file) }
                        else {
                            let name=file.lastPathComponent
                            let knownExample=["document.json","document-edits.json","spreadsheet.json","spreadsheet-edits.json","presentation.json","slide-background-edits.json","xml-edits.json"].contains(name)
                            if (folder == "lib" && name.hasPrefix("lib") && (name.contains(".so") || name.hasSuffix(".dylib"))) || (folder == "examples" && knownExample) || (folder == "third-party-licenses" && !["hanx","docx","pptx","xlsx","hwp","pdf"].contains(file.pathExtension.lowercased())) { add(file) }
                        }
                    }
                    for directory in directories { add(directory,emptyOnly:true) }
                }
                add(base,emptyOnly:true)
            }
            add(root,emptyOnly:true)
        }
        func app(_ url:URL) { if ownedApp(url) { add(url);result.applications.append(url) } }
        // Installation paths are allowlisted, never taken from setup.json.
        #if os(Windows)
        let local=URL(fileURLWithPath:c.env("LOCALAPPDATA") ?? c.home.appendingPathComponent("AppData/Local").path)
        let roaming=URL(fileURLWithPath:c.env("APPDATA") ?? c.home.appendingPathComponent("AppData/Roaming").path)
        roots += [local.appendingPathComponent("HanX")]
        let installation=local.appendingPathComponent("Programs/HanX")
        let uninstall=installation.appendingPathComponent("Uninstall HanX.exe")
        if exists(uninstall) {
            result.commands.append(Command(file:uninstall,args:["/S"],label:"HanX 설치 마법사 제거"))
            result.applications.append(installation)
        }
        roots += [roaming.appendingPathComponent("HanX"),roaming.appendingPathComponent("hanx-desktop")]
        #else
        let data=URL(fileURLWithPath:c.env("XDG_DATA_HOME") ?? c.home.appendingPathComponent(".local/share").path)
        roots += [data.appendingPathComponent("HanX")]
        let local=c.home.appendingPathComponent(".local")
        let cli=local.appendingPathComponent("lib/hanx")
        if ownedCLI(cli) { cliFiles(cli) }
        let gui=local.appendingPathComponent("lib/hanx-gui")
        if let folders=try? fm.contentsOfDirectory(at:gui,includingPropertiesForKeys:nil) {
            for folder in folders where folder.lastPathComponent.range(of:"^\\d+\\.\\d+\\.\\d+$",options:.regularExpression) != nil {
                for file in (try? fm.contentsOfDirectory(at:folder,includingPropertiesForKeys:nil)) ?? [] where file.lastPathComponent.hasPrefix("HanX-") && file.pathExtension == "AppImage" { add(file); result.applications.append(file) }
            }
        }
        let desktop=local.appendingPathComponent("share/applications/hanx.desktop")
        if let text=try? String(contentsOf:desktop,encoding:.utf8),text.contains("Name=HanX"),text.contains("HanX") { add(desktop) }
        links += [local.appendingPathComponent("bin/hanx"),local.appendingPathComponent("bin/hanx-cli")]
        #if os(macOS)
        app(c.home.appendingPathComponent("Applications/HanX.app"))
        for base in c.systemDirectories where base.lastPathComponent == "Applications" { app(base.appendingPathComponent("HanX.app")) }
        roots += [c.home.appendingPathComponent("Library/Application Support/HanX"),c.home.appendingPathComponent("Library/Application Support/hanx-desktop")]
        for id in ["com.hanword.editor","org.studentsview.hanx","HanX","hanx-desktop"] {
            roots += [c.home.appendingPathComponent("Library/Caches/"+id),c.home.appendingPathComponent("Library/Saved Application State/"+id+".savedState")]
        }
        for id in ["com.hanword.editor","org.studentsview.hanx","io.hanx.app"] {
            add(c.home.appendingPathComponent("Library/Preferences/"+id+".plist"))
        }
        #else
        for folder in ["HanX","hanx-desktop"] {
            roots += [URL(fileURLWithPath:c.env("XDG_CONFIG_HOME") ?? c.home.appendingPathComponent(".config").path).appendingPathComponent(folder),URL(fileURLWithPath:c.env("XDG_CACHE_HOME") ?? c.home.appendingPathComponent(".cache").path).appendingPathComponent(folder)]
        }
        #endif
        for base in c.systemDirectories where base.lastPathComponent == "bin" { links += [base.appendingPathComponent("hanx"),base.appendingPathComponent("hanx-cli")] }
        #endif
        // A marked custom-prefix install can be removed from its own executable.
        let ownRoot=c.executable.deletingLastPathComponent()
        if ownedCLI(ownRoot) { cliFiles(ownRoot) }
        #if !os(Windows)
        for directory in (c.env("PATH") ?? "").split(separator:":") {
            guard directory.hasPrefix("/") else { continue }
            for name in ["hanx","hanx-cli"] { links.append(URL(fileURLWithPath:String(directory)).appendingPathComponent(name)) }
        }
        #endif
        if exists(ownRoot.appendingPathComponent("HANX-INSTALL.json")),ownedCLI(ownRoot) { cliFiles(ownRoot) }
        #if os(Windows)
        if ownedCLI(ownRoot),let ps=find("powershell",c) {
            let helper=ownRoot.appendingPathComponent("../manage-path.ps1").standardizedFileURL
            if exists(helper),ownRoot.lastPathComponent == "cli",ownRoot.deletingLastPathComponent().lastPathComponent == "resources" {
                // NSIS handles this for its own install. No arbitrary PATH strings
                // or shell profile files are rewritten by the CLI.
                if !result.commands.contains(where:{$0.file.lastPathComponent == "Uninstall HanX.exe"}) {
                    result.commands.append(Command(file:ps,args:["-NoProfile","-ExecutionPolicy","Bypass","-File",helper.path,"-Action","Remove","-CliDirectory",ownRoot.path],label:"HanX CLI PATH 연결"))
                }
            }
        }
        #endif
        for root in roots {
            #if os(Linux)
            if root.lastPathComponent == "HanX",let versions=try? fm.contentsOfDirectory(at:root,includingPropertiesForKeys:nil) {
                for version in versions where version.lastPathComponent.range(of:"^\\d+\\.\\d+\\.\\d+$",options:.regularExpression) != nil {
                    for platform in ["linux-x64","linux-arm64"] {
                        let app=version.appendingPathComponent(platform+"/HanX.AppImage")
                        if exists(app) { result.applications.append(app) }
                    }
                }
            }
            #endif
            #if os(macOS)
            if root == c.home.appendingPathComponent("Library/Application Support/HanX"),exists(root.appendingPathComponent("CLI")) {
                for version in (try? fm.contentsOfDirectory(at:root.appendingPathComponent("CLI"),includingPropertiesForKeys:nil)) ?? [] { cliFiles(version) }
                add(root.appendingPathComponent("CLI"),emptyOnly:true)
                for entry in (try? fm.contentsOfDirectory(at:root,includingPropertiesForKeys:nil)) ?? [] where entry.lastPathComponent != "CLI" {
                    if ["setup.json","downloads","Cache","GPUCache","Code Cache","logs"].contains(entry.lastPathComponent) { add(entry) }
                }
                add(root,emptyOnly:true)
            } else { add(root) }
            #else
            add(root)
            #endif
        }
        for link in links {
            guard (try? fm.destinationOfSymbolicLink(atPath:link.path)) != nil else { continue }
            let target=link.resolvingSymlinksInPath()
            if result.removals.contains(where:{target.path.hasPrefix($0.url.path+"/") || target == $0.url}) { add(link) }
        }
        if c.discoverManagers { discoverManagers(c,&result) }
        // Remove links and nested entries before their parents; package-manager
        // operations precede all of these, so their registrations remain consistent.
        result.removals.sort {
            if ($0.link != nil) != ($1.link != nil) { return $0.link != nil }
            return $0.url.path.count > $1.url.path.count
        }
        return result
    }
    static func discoverManagers(_ c:Context,_ result:inout Plan) {
        #if os(Windows)
        let npm: (URL,[String])? = find("node",c).flatMap { node in
            let script=node.deletingLastPathComponent().appendingPathComponent("node_modules/npm/bin/npm-cli.js")
            return exists(script) ? (node,[script.path]) : nil
        }
        #else
        let npm: (URL,[String])? = find("npm",c).map{($0,[])}
        if let brew=find("brew",c),let list=query(brew,["list","--formula","--full-name"]) {
            for formula in list.components(separatedBy:.newlines) where ["hanx","studentsview/tap/hanx","flover124/tap/hanx"].contains(formula.lowercased()) {
                result.commands.append(Command(file:brew,args:["uninstall","--formula",formula],label:"Homebrew: "+formula))
            }
        }
        #if os(macOS)
        if let pkgutil=find("pkgutil",c),query(pkgutil,["--pkg-info","com.hanword.editor.installer"]) != nil {
            // Forget only after the package's files have actually been removed.
            result.commands.append(Command(file:pkgutil,args:["--forget","com.hanword.editor.installer"],label:"HanX pkg 설치 기록",elevated:true))
        }
        #else
        if let dpkg=find("dpkg-query",c),let apt=find("apt-get",c) {
            for package in ["hanx-desktop","hanx"] {
                if let metadata=query(dpkg,["-W","-f=${Status}\n${Homepage}",package]),metadata.hasPrefix("install ok installed\n"),
                   ["hanx.io","github.io/HanX"].contains(where:{metadata.contains($0)}) {
                    result.commands.append(Command(file:apt,args:["remove","--yes",package],label:"HanX Debian 패키지: "+package,elevated:true))
                }
            }
        }
        #endif
        #endif
        if let (file,prefix)=npm,let root=query(file,prefix+["root","--global"]) {
            let manifest=URL(fileURLWithPath:root).appendingPathComponent("@juyoungsuh/hanx/package.json")
            if let data=try? Data(contentsOf:manifest),let object=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],object["name"] as? String == "@juyoungsuh/hanx" {
                result.commands.append(Command(file:file,args:prefix+["uninstall","--global","@juyoungsuh/hanx"],label:"npm: @juyoungsuh/hanx"))
            }
        }
    }
    static func remove(_ item:Removal) throws {
        guard exists(item.url) else { return }
        guard item.url.deletingLastPathComponent().resolvingSymlinksInPath() == item.parent,
              (item.link != nil ? (try? fm.destinationOfSymbolicLink(atPath:item.url.path)) == item.link : item.url.resolvingSymlinksInPath() == item.resolved) else { throw Failure(message:"경로가 변경돼 삭제를 중단했습니다: \(item.url.path)") }
        if item.emptyOnly {
            guard (try fm.contentsOfDirectory(atPath:item.url.path)).isEmpty else { return }
        }
        try fm.removeItem(at:item.url)
    }
    @discardableResult static func apply(_ plan:Plan,answer:String,remove:(Removal)throws->Void,execute:(Command)throws->Void) throws -> Bool {
        guard confirmed(answer) else { return false }
        let receipts=plan.commands.filter{$0.args.first == "--forget"}
        for command in plan.commands where command.args.first != "--forget" { try execute(command) }
        for item in plan.removals { try remove(item) }
        for command in receipts { try execute(command) }
        return true
    }
    static func execute(_ command:Command) throws {
        let p=Process();p.executableURL=command.file;p.arguments=command.args
        if command.file.lastPathComponent == "brew", command.args.first == "uninstall" {
            var environment = ProcessInfo.processInfo.environment
            environment["HOMEBREW_NO_AUTOREMOVE"] = "1"
            p.environment = environment
        }
        #if !os(Windows)
        if command.elevated,NSUserName() != "root",let sudo=find("sudo",Context()) { p.executableURL=sudo;p.arguments=[command.file.path]+command.args }
        #endif
        p.standardInput=FileHandle.standardInput;p.standardOutput=FileHandle.standardOutput;p.standardError=FileHandle.standardError
        try p.run();p.waitUntilExit()
        guard p.terminationStatus == 0 else { throw Failure(message:"제거하지 못했습니다: \(command.label) (종료 코드 \(p.terminationStatus)). 권한과 실행 중인 앱을 확인한 뒤 다시 실행하세요.") }
    }
    static func runningApp(_ plan:Plan) -> Bool {
        #if os(Windows)
        guard let ps=find("powershell",Context()) else { return false }
        let output=query(ps,["-NoProfile","-Command","Get-Process | Where-Object { $_.ProcessName -eq 'HanX' -and $_.Id -ne \(ProcessInfo.processInfo.processIdentifier) } | Select-Object -ExpandProperty Path"]) ?? ""
        #else
        let output=query(URL(fileURLWithPath:"/bin/ps"),["-axo","comm="]) ?? ""
        #endif
        #if os(Linux)
        if let pgrep=find("pgrep",Context()),query(pgrep,["-x","HanX|hanx-desktop"]) != nil { return true }
        #endif
        return output.components(separatedBy:.newlines).contains { line in
            let path=line.trimmingCharacters(in:.whitespaces)
            return plan.applications.contains { path == $0.path || path.hasPrefix($0.path+"/") || path.hasPrefix($0.path+"\\") }
        }
    }
    static func run(_ args:[String]) -> Int32 {
        guard args.isEmpty || args == ["--dry-run"] else { print("사용법: hanx --delete [--dry-run]  (삭제에는 Y 확인이 필요합니다.)");return 2 }
        let p=plan()
        print("HanX 삭제\n")
        for item in p.commands { print("  - "+item.label) }
        for item in p.removals { print("  - "+item.url.path) }
        print("\n현재 사용자와 확인 가능한 공용 설치를 제거합니다. 작성한 문서와 공용 PDF 도구는 보존합니다.")
        if p.removals.isEmpty && p.commands.isEmpty { print("삭제할 설치 항목이 없습니다.");return 0 }
        if args == ["--dry-run"] { print("미리보기입니다. 파일을 변경하지 않았습니다.");return 0 }
        if runningApp(p) { print("열려 있는 HanX 앱에서 문서를 저장하고 앱을 종료한 뒤 다시 실행하세요.");return 2 }
        print("삭제할까요? [Y/N] (기본값 N): ",terminator:"")
        guard let answer=readLine(),confirmed(answer) else { print("삭제를 취소했습니다.");return 0 }
        do {
            #if os(Windows)
            try windowsWorker(p)
            #else
            try apply(p,answer:"Y",remove:{ item in
                do { try remove(item) }
                catch {
                    // Request OS authorization only for verified system-owned paths.
                    if ["/Applications/HanX.app","/usr/local/bin/hanx","/usr/local/bin/hanx-cli"].contains(item.url.path),
                       item.url.deletingLastPathComponent().resolvingSymlinksInPath() == item.parent,
                       item.url.resolvingSymlinksInPath() == item.resolved {
                        try execute(Command(file:URL(fileURLWithPath:"/bin/rm"),args:["-rf","--",item.url.path],label:item.url.path,elevated:true))
                    } else { throw error }
                }
            },execute:execute)
            print("HanX 삭제가 완료됐습니다. 새 터미널에서 확인하세요.")
            #endif
            return 0
        } catch { print("삭제를 마치지 못했습니다: \(error.localizedDescription)");return 1 }
    }
    #if os(Windows)
    static func windowsScript(_ plan:Plan, processID:Int32, interactive:Bool = true) -> String {
        func quote(_ s:String) -> String { "'"+s.replacingOccurrences(of:"'",with:"''")+"'" }
        // A separate console waits for the native process to exit before removing
        // Windows' locked executable. No arbitrary plan/script path is accepted.
        var script="""
        $ErrorActionPreference='Stop'
        function Remove-HanXItem([string]$target) {
          if (!(Test-Path -LiteralPath $target)) { return }
          $entry=Get-Item -Force -LiteralPath $target
          $parent=$entry.DirectoryName
          if ($entry.PSIsContainer) { $parent=$entry.Parent.FullName }
          while ($parent) {
            $ancestor=Get-Item -Force -LiteralPath $parent
            if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw ('경로가 변경됐습니다: '+$target) }
            $parent=$ancestor.Parent.FullName
          }
          if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { $entry.Delete(); return }
          if ($entry.PSIsContainer) {
            Get-ChildItem -Force -LiteralPath $target | ForEach-Object { Remove-HanXItem $_.FullName }
            [IO.Directory]::Delete($target)
          } else { [IO.File]::Delete($target) }
        }
        try { Wait-Process
        """
        script += " -Id \(processID) -ErrorAction SilentlyContinue; "
        for command in plan.commands {
            if command.file.lastPathComponent == "Uninstall HanX.exe" {
                script += " $task=Start-Process -FilePath \(quote(command.file.path)) -ArgumentList '/S' -Wait -PassThru; if ($task.ExitCode -ne 0) { throw \(quote(command.label)) }; "
            } else {
                script += "& \(quote(command.file.path)) \(command.args.map(quote).joined(separator:" ")); if ($LASTEXITCODE -ne 0) { throw \(quote(command.label)) }; "
            }
        }
        for item in plan.removals {
            if item.emptyOnly {
                script += "if ((Test-Path -LiteralPath \(quote(item.url.path))) -and !(Get-ChildItem -Force -LiteralPath \(quote(item.url.path)))) { Remove-HanXItem \(quote(item.url.path)) }; "
            } else { script += "Remove-HanXItem \(quote(item.url.path)); " }
        }
        script += "Write-Host 'HanX 삭제가 완료됐습니다.' } catch { Write-Host ('삭제 실패: '+$_.Exception.Message); " + (interactive ? "" : "exit 1;") + " }; "
        if interactive { script += "Read-Host 'Enter 키를 누르면 닫힙니다.'" }
        return script
    }
    static func windowsWorker(_ plan:Plan) throws {
        guard let ps=find("powershell",Context()) else { throw Failure(message:"Windows PowerShell을 찾을 수 없습니다.") }
        func quote(_ s:String) -> String { "'"+s.replacingOccurrences(of:"'",with:"''")+"'" }
        let script=windowsScript(plan,processID:ProcessInfo.processInfo.processIdentifier)
        let directory=fm.temporaryDirectory.appendingPathComponent("HanX-uninstall-"+UUID().uuidString)
        try fm.createDirectory(at:directory,withIntermediateDirectories:false,attributes:[.posixPermissions:0o700])
        let file=directory.appendingPathComponent("remove.ps1")
        try ("\u{feff}"+script).write(to:file,atomically:true,encoding:.utf8)
        let bootstrap="try { & "+quote(file.path)+" } finally { Remove-Item -LiteralPath "+quote(file.path)+" -Force; [IO.Directory]::Delete("+quote(directory.path)+") }"
        let encoded=Data(bootstrap.utf16.flatMap{[UInt8($0&255),UInt8($0>>8)]}).base64EncodedString()
        let launch="Start-Process -FilePath \(quote(ps.path)) -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',\(quote(encoded)))"
        try execute(Command(file:ps,args:["-NoProfile","-Command",launch],label:"HanX 삭제 창"))
        print("별도 삭제 창에서 작업을 이어갑니다. 그 창에서 최종 결과를 확인하세요.")
    }
    #endif
}
