import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#elseif os(Windows)
import WinSDK
#endif

enum AgentUpdate {
    static var terminalOutput:Bool {
        #if os(Windows)
        var mode:DWORD=0
        guard let output=GetStdHandle(STD_OUTPUT_HANDLE) else { return false }
        return GetConsoleMode(output,&mode)
        #else
        return isatty(STDOUT_FILENO) != 0
        #endif
    }
    private final class ResultBox: @unchecked Sendable { var value: String? }
    static func status() -> [String:Any] {
        let box=ResultBox(),done=DispatchSemaphore(value:0)
        var request=URLRequest(url:URL(string:"https://registry.npmjs.org/@juyoungsuh%2fhanx/latest")!)
        request.timeoutInterval=4
        let session=URLSession(configuration:.ephemeral)
        let task=session.dataTask(with:request) { data,response,_ in
            defer { done.signal() }
            guard let response=response as? HTTPURLResponse,response.statusCode == 200,
                  let data,data.count<=1_048_576,let object=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],
                  let version=object["version"] as? String,
                  version.range(of:"^\\d{1,6}\\.\\d{1,6}\\.\\d{1,6}$",options:.regularExpression) != nil else { return }
            box.value=version
        }
        task.resume()
        guard done.wait(timeout:.now()+5) == .success,let latest=box.value else {
            task.cancel();session.invalidateAndCancel()
            return ["version":AgentIO.version,"latestVersion":NSNull(),"status":"Version check unavailable","updateAvailable":NSNull()]
        }
        session.finishTasksAndInvalidate()
        let local=AgentIO.version.split(separator:".").compactMap { Int($0) },remote=latest.split(separator:".").compactMap { Int($0) }
        let older=local.lexicographicallyPrecedes(remote)
        return ["version":AgentIO.version,"latestVersion":latest,"status":older ? "Update available" : local == remote ? "Up to date" : "Newer local version","updateAvailable":older]
    }
    static func run(_ command:String) -> Int32 {
        if command == "--update" || command == "update" {
            // Managed installations intercept this flag in their setup launcher.
            let error:[String:Any] = ["ok":false,"error":["code":"standalone_update","message":"직접 설치한 CLI는 최신 다운로드로 교체하세요. npm 또는 Homebrew로 설치하면 hanx --update를 사용할 수 있습니다.","download":"https://github.com/FLOVER124/HanX/releases/latest"]]
            if let data=try? AgentIO.json(error) { FileHandle.standardOutput.write(data);print("") }
            return 2
        }
        let info=status()
        if terminalOutput {
            print("HanX \(AgentIO.version)  \(info["status"] as? String ?? "")")
            if info["updateAvailable"] as? Bool == true { print("Latest \(info["latestVersion"] as? String ?? "")  hanx --update") }
        } else if let data=try? AgentIO.json(["ok":true,"version":AgentIO.version,"data":info]) { FileHandle.standardOutput.write(data);print("") }
        return 0
    }
}
