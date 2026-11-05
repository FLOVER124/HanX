import Foundation

/// Serially accessed by the GUI's worker queue. Revisions are complete PDFs so
/// undo never depends on PDF object IDs surviving serialization.
final class PDFEditingSession {
    let directory: URL
    private(set) var current: URL
    private(set) var source: URL
    private var history: [URL] = [], future: [URL] = []
    private var savedRevision: URL
    private var savedCopy = false
    var dirty: Bool { current != savedRevision }
    init(source: URL) throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("hanx-pdf-session-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        current = directory.appendingPathComponent("original.pdf"); savedRevision = current
        self.source = source
        do { try FileManager.default.copyItem(at: source, to: current) }
        catch { try? FileManager.default.removeItem(at: directory); throw error }
    }
    deinit { try? FileManager.default.removeItem(at: directory) }
    var needsSaveDialog: Bool { !savedCopy }
    func page(_ index: Int) throws -> [String: Any] {
        var result = try PDFEditingBridge.call(["action":"inspect", "input":current.path, "page":index])
        let preview = try PDFEditingBridge.call(["action":"render", "input":current.path, "page":index])
        result["image"] = preview["image"]; result["name"] = source.lastPathComponent
        result["dirty"] = dirty; result["canUndo"] = !history.isEmpty; result["canRedo"] = !future.isEmpty
        return result
    }
    func edit(_ args: [String: Any]) throws -> [String: Any] {
        let output = directory.appendingPathComponent(UUID().uuidString + ".pdf")
        var request = args
        request["action"] = "edit"; request["input"] = current.path; request["output"] = output.path; request["force"] = false
        let result = try PDFEditingBridge.call(request)
        history.append(current); future.removeAll(); current = output
        return result
    }
    func undo(redo: Bool) {
        if redo { if let previous = future.popLast() { history.append(current); current = previous } }
        else if let previous = history.popLast() { future.append(current); current = previous }
    }
    func save(_ destination: URL) throws {
        guard destination.pathExtension.lowercased() == "pdf" else { throw PDFEditingBridge.Failure(message: "PDF 형식으로 저장하세요.") }
        try Data(contentsOf: current).write(to: destination, options: .atomic)
        source = destination; savedRevision = current; savedCopy = true
    }
    func ocr(_ args: [String: Any]) throws -> [String: Any] {
        var request = args; request["action"] = "ocr"; request["input"] = current.path
        return try PDFEditingBridge.call(request)
    }
}
