import Foundation

/// Shared local PDF worker for the native app, portable app and CLI. Each call is
/// isolated in a process; no PDFium handles cross threads or document revisions.
enum PDFEditingBridge {
    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }
    static var runtimeDirectory: URL {
        #if os(Windows)
        let root = ProcessInfo.processInfo.environment["LOCALAPPDATA"] ?? FileManager.default.homeDirectoryForCurrentUser.path
        return URL(fileURLWithPath: root).appendingPathComponent("HanX/pdf-runtime")
        #else
        let root = ProcessInfo.processInfo.environment["XDG_DATA_HOME"].map { URL(fileURLWithPath:$0) } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".local/share")
        return root.appendingPathComponent("HanX/pdf-runtime")
        #endif
    }
    static var worker: URL? {
        let fm = FileManager.default
        let executable = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath().deletingLastPathComponent()
        var candidates: [URL] = []
        if let resources = Bundle.main.resourceURL { candidates.append(resources.appendingPathComponent("PDF/worker.py")) }
        candidates += [executable.appendingPathComponent("pdf/worker.py"), executable.deletingLastPathComponent().appendingPathComponent("Tools/pdf/worker.py")]
        if let override = ProcessInfo.processInfo.environment["HANX_PDF_WORKER"] { candidates.insert(URL(fileURLWithPath: override), at: 0) }
        return candidates.first { fm.fileExists(atPath: $0.path) }
    }
    static func executables(_ names: [String]) -> [URL] {
        #if os(Windows)
        let separator: Character = ";"
        let suffix = ".exe"
        #else
        let separator: Character = ":"
        let suffix = ""
        #endif
        let env = ProcessInfo.processInfo.environment
        let search = env.first { $0.key.lowercased() == "path" }?.value ?? ""
        var dirs = search.split(separator: separator).map(String.init)
        #if os(macOS)
        dirs = ["/Library/Frameworks/Python.framework/Versions/Current/bin", "/opt/homebrew/bin", "/usr/local/bin"] + dirs + ["/usr/bin"]
        #elseif os(Windows)
        dirs = dirs.filter { URL(fileURLWithPath:$0).lastPathComponent.lowercased() != "windowsapps" }
        #endif
        var result: [URL] = []
        for name in names { for dir in dirs {
            let url = URL(fileURLWithPath: dir).appendingPathComponent(name + suffix)
            if FileManager.default.isExecutableFile(atPath:url.path), !result.contains(url) { result.append(url) }
        } }
        return result
    }
    static var python: URL? {
        let fm = FileManager.default
        if let override = ProcessInfo.processInfo.environment["HANX_PDF_PYTHON"], fm.isExecutableFile(atPath: override) { return URL(fileURLWithPath: override) }
        #if os(Windows)
        let local = runtimeDirectory.appendingPathComponent("Scripts/python.exe")
        #else
        let local = runtimeDirectory.appendingPathComponent("bin/python3")
        #endif
        return fm.isExecutableFile(atPath: local.path) ? local : executables(["python3", "python", "py"]).first
    }
    static func process(_ executable: URL, _ arguments: [String], input: Data = Data(), timeout: TimeInterval = 150) throws -> (Int32, Data, Data) {
        let fm = FileManager.default, directory = fm.temporaryDirectory.appendingPathComponent("hanx-pdf-process-" + UUID().uuidString)
        try fm.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: directory) }
        let inURL = directory.appendingPathComponent("request"), outURL = directory.appendingPathComponent("response"), errURL = directory.appendingPathComponent("error")
        try input.write(to: inURL)
        fm.createFile(atPath: outURL.path, contents: nil); fm.createFile(atPath: errURL.path, contents: nil)
        let stdin = try FileHandle(forReadingFrom: inURL), stdout = try FileHandle(forWritingTo: outURL), stderr = try FileHandle(forWritingTo: errURL)
        defer { try? stdin.close(); try? stdout.close(); try? stderr.close() }
        let task = Process(); task.executableURL = executable; task.arguments = arguments
        task.standardInput = stdin; task.standardOutput = stdout; task.standardError = stderr
        var env = ProcessInfo.processInfo.environment
        env["PYTHONIOENCODING"] = "utf-8"; env["PYTHONUTF8"] = "1"
        #if os(macOS)
        env["PATH"] = (env["PATH"] ?? "") + ":/opt/homebrew/bin:/usr/local/bin"
        #endif
        task.environment = env
        try task.run()
        let deadline = Date().addingTimeInterval(timeout)
        while task.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.025) }
        if task.isRunning { task.terminate(); throw Failure(message: "PDF 작업 시간이 초과됐습니다.") }
        task.waitUntilExit()
        let size = (try? fm.attributesOfItem(atPath: outURL.path)[.size] as? NSNumber)?.intValue ?? 0
        guard size < 96 * 1024 * 1024 else { throw Failure(message: "PDF 응답이 너무 큽니다.") }
        return (task.terminationStatus, try Data(contentsOf: outURL), try Data(contentsOf: errURL))
    }
    static func call(_ request: [String: Any]) throws -> [String: Any] {
        #if canImport(Vision) && canImport(AppKit) && !HANX_PORTABLE
        if request["action"] as? String == "ocr" { return try PDFLocalOCR.recognize(request) }
        #endif
        guard let worker = worker else { throw Failure(message: "PDF 편집 엔진 파일이 없습니다. HanX 설치 파일을 확인하세요.") }
        guard let python = python else { throw Failure(message: "Python 3.10 이상을 설치하고 hanx pdf setup을 실행하세요.") }
        let (status, output, error) = try process(python, [worker.path], input: JSONSerialization.data(withJSONObject: request))
        guard let result = try? JSONSerialization.jsonObject(with: output) as? [String: Any] else {
            throw Failure(message: "PDF 엔진을 실행하지 못했습니다. " + String(decoding: error.prefix(2000), as: UTF8.self))
        }
        guard status == 0, result["ok"] as? Bool == true, let data = result["data"] as? [String: Any] else {
            throw Failure(message: (result["error"] as? [String: Any])?["message"] as? String ?? "PDF 편집에 실패했습니다.")
        }
        return data
    }
    /// Explicit setup only; never install dependencies just by opening a file.
    static func setup() throws -> [String: Any] {
        guard let worker = worker else { throw Failure(message:"PDF 편집 엔진 파일을 찾을 수 없습니다.") }
        let python = executables(["python3", "python", "py"]).first { candidate in
            let probe = try? process(candidate,["-I","-c","import sys,venv; sys.exit(0 if sys.version_info >= (3,10) else 1)"],timeout:10)
            return probe?.0 == 0
        }
        guard let python = python else { throw Failure(message:"Python 3.10 이상과 venv를 설치하고 다시 시도하세요.") }
        let commands: [(URL, [String])] = [(python, ["-m", "venv", runtimeDirectory.path])]
        for (exe,args) in commands {
            let (code,_,error) = try process(exe,args,timeout:180)
            if code != 0 { throw Failure(message: String(decoding:error.prefix(2000),as:UTF8.self)) }
        }
        #if os(Windows)
        let local = runtimeDirectory.appendingPathComponent("Scripts/python.exe")
        #else
        let local = runtimeDirectory.appendingPathComponent("bin/python3")
        #endif
        let (code,_,error) = try process(local,["-m","pip","install","--disable-pip-version-check","-r",worker.deletingLastPathComponent().appendingPathComponent("requirements.txt").path],timeout:300)
        if code != 0 { throw Failure(message: "PDF 엔진 준비에 실패했습니다. " + String(decoding:error.suffix(2000),as:UTF8.self)) }
        return ["ready":true,"runtime":runtimeDirectory.path]
    }
}
