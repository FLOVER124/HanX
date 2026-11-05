import Foundation

enum AgentPDFEditing {
    static func execute(_ command: String, _ args: [String:Any]) throws -> [String:Any] {
        if command == "pdf_setup" { return try PDFEditingBridge.setup() }
        var request = args
        request["action"] = String(command.dropFirst(4))
        request["input"] = try AgentPath.inputURL(AgentIO.string(args["input"], "input")).path
        for key in ["page", "scale"] {
            if let string = args[key] as? String {
                guard let value = Double(string), value.isFinite else { throw AgentError("invalid_argument", "Invalid \(key)") }
                if key == "page" {
                    guard value.rounded() == value, value >= 0, value < 10000 else { throw AgentError("invalid_argument", "Invalid page") }
                    request[key] = Int(value)
                } else { request[key] = value }
            }
        }
        if let output = args["output"] as? String { request["output"] = AgentIO.url(output).path }
        if var ops = args["operations"] as? [[String:Any]] {
            let base = AgentIO.url(args["baseDirectory"] as? String ?? FileManager.default.currentDirectoryPath)
            for i in ops.indices { for key in ["image", "font"] {
                if let path = ops[i][key] as? String { ops[i][key] = URL(fileURLWithPath:path, relativeTo:base).standardizedFileURL.path }
            } }
            request["operations"] = ops
        }
        if command == "pdf_searchable" {
            guard let output = request["output"] as? String, URL(fileURLWithPath:output).pathExtension.lowercased() == "pdf" else { throw AgentError("invalid_argument","--output 결과.pdf를 지정하세요.") }
            guard args["page"] == nil || args["allPages"] as? Bool != true else { throw AgentError("invalid_argument","--page와 --all-pages 중 하나만 지정하세요.") }
            if FileManager.default.fileExists(atPath:output), args["force"] as? Bool != true { throw AgentError("output_exists","저장 파일이 이미 있습니다.") }
            var planRequest = request; planRequest["action"] = "ocr_plan"
            let plan = try PDFEditingBridge.call(planRequest)
            let pages = plan["pages"] as? [Int] ?? []
            guard !pages.isEmpty else { throw AgentError("invalid_argument","이미 선택 가능한 텍스트가 있는 페이지입니다.") }
            var operations: [[String: Any]] = [], empty: [Int] = []
            for page in pages {
                var ocr = request; ocr["action"] = "ocr"; ocr["page"] = page
                let result = try PDFEditingBridge.call(ocr)
                guard let words = result["words"] as? [[String:Any]], !words.isEmpty else { empty.append(page); continue }
                operations.append(["op":"add_ocr_layer","page":page,"regions":words])
            }
            guard !operations.isEmpty else { throw AgentError("invalid_input","선택한 페이지에서 글자를 인식하지 못했습니다.") }
            request["action"] = "edit"; request["revision"] = plan["revision"]; request["operations"] = operations
            var result = try PDFEditingBridge.call(request)
            result["recognizedPages"] = operations.compactMap { $0["page"] as? Int }
            result["skippedTextPages"] = plan["skippedPages"]; result["emptyPages"] = empty
            return result
        }
        return try PDFEditingBridge.call(request)
    }
}
