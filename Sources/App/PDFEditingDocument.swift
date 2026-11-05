import AppKit
import WebKit
import PDFKit
import UniformTypeIdentifiers

enum HanXPrinting {
    static func operation(_ data: Data, info: NSPrintInfo, settings: [NSPrintInfo.AttributeKey:Any]) throws -> NSPrintOperation {
        let copy=info.copy() as! NSPrintInfo
        copy.dictionary().addEntries(from:settings)
        guard let pdf=PDFDocument(data:data), let operation=pdf.printOperation(for:copy,scalingMode:.pageScaleToFit,autoRotate:true) else {
            throw PDFEditingBridge.Failure(message:"인쇄할 문서를 준비하지 못했습니다.")
        }
        operation.showsPrintPanel=true;operation.showsProgressPanel=true
        return operation
    }
}

@objc(PDFEditingDocument)
final class PDFEditingDocument: NSDocument {
    var session: PDFEditingSession!
    override class var autosavesInPlace: Bool { false }
    override class var readableTypes: [String] { [DocType.pdf] }
    override class var writableTypes: [String] { [DocType.pdf] }
    private(set) var originalPDF: PDFDocument!
    override func read(from url: URL, ofType typeName: String) throws {
        let opened = try PDFEditingSession(source: url)
        guard let pdf = PDFDocument(url: opened.current), pdf.isLocked || pdf.pageCount > 0 else {
            throw PDFEditingBridge.Failure(message: "PDF 문서를 열 수 없습니다.")
        }
        session = opened
        originalPDF = pdf
    }
    override func canClose(withDelegate delegate: Any, shouldClose shouldCloseSelector: Selector?, contextInfo: UnsafeMutableRawPointer?) {
        if let controller = windowControllers.first as? PDFEditingWindowController, controller.hasPendingWork {
            controller.afterPendingWork { [weak self] in self?.canClose(withDelegate:delegate,shouldClose:shouldCloseSelector,contextInfo:contextInfo) }
            return
        }
        super.canClose(withDelegate:delegate,shouldClose:shouldCloseSelector,contextInfo:contextInfo)
    }
    override func data(ofType typeName: String) throws -> Data {
        guard typeName == DocType.pdf else { throw PDFEditingBridge.Failure(message: "PDF 형식으로 저장하세요.") }
        return try Data(contentsOf: session.current)
    }
    override func makeWindowControllers() { addWindowController(PDFEditingWindowController(document: self)) }
    override func printOperation(withSettings settings: [NSPrintInfo.AttributeKey:Any]) throws -> NSPrintOperation {
        try HanXPrinting.operation(Data(contentsOf:session.current),info:printInfo,settings:settings)
    }
    override func printDocument(_ sender: Any?) { (windowControllers.first as? PDFEditingWindowController)?.action("print") }
    override func save(_ sender: Any?) { (windowControllers.first as? PDFEditingWindowController)?.action("save") }
    override func saveAs(_ sender: Any?) { (windowControllers.first as? PDFEditingWindowController)?.action("saveAs") }
    override func saveTo(_ sender: Any?) { saveAs(sender) }
}

private final class PDFScriptHandler: NSObject, WKScriptMessageHandler {
    weak var owner: PDFEditingWindowController?
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) { owner?.receive(message) }
}

final class PDFEditingWindowController: NSWindowController, WKNavigationDelegate {
    private let web: WKWebView
    private let queue = DispatchQueue(label: "io.hanx.pdf-editor")
    private weak var pdfDocument: PDFEditingDocument?
    private let handler: PDFScriptHandler
    private var pageURL: URL?
    private let reader = PDFView()
    private var displayedRevision: URL
    private let modes = NSSegmentedControl(labels: ["읽기", "개체 편집"], trackingMode: .selectOne, target: nil, action: nil)
    private var pendingWork = 0
    var hasPendingWork: Bool { pendingWork > 0 }
    func afterPendingWork(_ completion: @escaping () -> Void) {
        queue.async { DispatchQueue.main.async(execute:completion) }
    }
    init(document: PDFEditingDocument) {
        pdfDocument = document
        displayedRevision = document.session.current
        handler = PDFScriptHandler()
        let config = WKWebViewConfiguration()
        config.userContentController.add(handler, name: "hanxPDF")
        web = WKWebView(frame: .zero, configuration: config)
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1250, height: 850), styleMask: [.titled,.closable,.miniaturizable,.resizable], backing: .buffered, defer: false)
        window.minSize = NSSize(width: 900, height: 640); window.title = document.session.source.lastPathComponent + " — HanX"; window.contentView = reader; window.center()
        super.init(window: window)
        handler.owner = self
        web.navigationDelegate = self
        reader.autoScales = true
        reader.document = document.originalPDF
        modes.target = self
        modes.action = #selector(changeMode(_:))
        modes.selectedSegment = 1
        modes.sizeToFit()
        let accessory = NSTitlebarAccessoryViewController()
        accessory.view = modes
        accessory.layoutAttribute = .right
        window.addTitlebarAccessoryViewController(accessory)
        changeMode(modes)
    }
    @objc private func changeMode(_ sender: NSSegmentedControl) {
        if sender.selectedSegment == 0 {
            if hasPendingWork {
                afterPendingWork { [weak self] in
                    guard let self, self.modes.selectedSegment == 0 else { return }
                    self.changeMode(self.modes)
                }
                return
            }
            if let revision = pdfDocument?.session.current, revision != displayedRevision,
               let updated = PDFDocument(url: revision) {
                reader.document = updated
                displayedRevision = revision
            }
            window?.contentView = reader
            return
        }
        window?.contentView = web
        guard pageURL == nil else { return }
        var candidates = [Bundle.main.resourceURL?.appendingPathComponent("PDFEditor/index.html")].compactMap { $0 }
        if Bundle.main.bundleURL.pathExtension.lowercased() != "app" { candidates.append(URL(fileURLWithPath:FileManager.default.currentDirectoryPath).appendingPathComponent("desktop/pdf/index.html")) }
        if let url = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }) {
            pageURL = url; web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            modes.selectedSegment = 0
            window?.contentView = reader
            presentMissingEditor()
        }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    private func presentMissingEditor() { let alert = NSAlert(); alert.messageText = "PDF 편집 화면 파일을 찾지 못했습니다."; alert.runModal() }
    func action(_ name: String) {
        if name == "print", window?.contentView === reader {
            do { try pdfDocument?.printOperation(withSettings:[:]).runModal(for:window!,delegate:nil,didRun:nil,contextInfo:nil) } catch { presentError(error) }
            return
        }
        if window?.contentView === reader {
            savePDF(asCopy: name == "saveAs") { [weak self] _, error in
                if let error { self?.presentError(error) }
            }
        } else {
            web.evaluateJavaScript("window.hanxPDFAction(\"\(name)\")")
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url?.standardizedFileURL == pageURL?.standardizedFileURL ? .allow : .cancel)
    }
    private func reply(_ id: Int, _ data: Any?, _ error: Error? = nil) {
        let envelope: [String:Any] = error.map { ["ok":false,"error":$0.localizedDescription] } ?? ["ok":true,"data":data ?? NSNull()]
        guard let encoded = try? JSONSerialization.data(withJSONObject: envelope), let json = String(data:encoded,encoding:.utf8) else { return }
        web.evaluateJavaScript("window.hanxPDFReply(\(id),\(json))")
    }
    private func savePDF(asCopy: Bool, completion: @escaping (Bool?, Error?) -> Void) {
        guard let doc = pdfDocument, let session = doc.session, let window else { return }
        func save(to destination: URL) {
            pendingWork += 1
            queue.async {
                do {
                    try session.save(destination)
                    DispatchQueue.main.async {
                        self.pendingWork -= 1
                        doc.fileURL = destination
                        doc.updateChangeCount(.changeCleared)
                        completion(true, nil)
                    }
                } catch {
                    DispatchQueue.main.async {
                        self.pendingWork -= 1
                        completion(nil, error)
                    }
                }
            }
        }
        if asCopy || session.needsSaveDialog {
            let panel = NSSavePanel()
            panel.allowedContentTypes = [.pdf]
            panel.directoryURL = session.source.deletingLastPathComponent()
            panel.nameFieldStringValue = session.source.deletingPathExtension().lastPathComponent + "-편집.pdf"
            panel.beginSheetModal(for: window) { response in
                if response == .OK, let destination = panel.url { save(to: destination) }
                else { completion(nil, nil) }
            }
        } else {
            save(to: session.source)
        }
    }
    fileprivate func receive(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.standardizedFileURL == pageURL?.standardizedFileURL,
              let request = message.body as? [String:Any], let id = request["id"] as? Int, let action = request["action"] as? String,
              let doc = pdfDocument, let session = doc.session else { return }
        let args = request["args"] as? [String:Any] ?? [:]
        if action == "draft" {
            doc.updateChangeCount((args["active"] as? Bool == true || session.dirty) ? .changeDone : .changeCleared)
            reply(id,true);return
        }
        if action == "copyText" {
            guard let text = args["text"] as? String, text.utf8.count <= 8_000_000 else { reply(id,nil,PDFEditingBridge.Failure(message:"복사할 텍스트가 너무 큽니다."));return }
            NSPasteboard.general.clearContents(); reply(id,NSPasteboard.general.setString(text,forType:.string));return
        }
        if action == "chooseImage" || action == "chooseFont" {
            let panel = NSOpenPanel(); panel.allowsMultipleSelection = false
            panel.allowedContentTypes = action == "chooseImage" ? [.png,.jpeg,.tiff] : [UTType(filenameExtension:"ttf") ?? .data]
            panel.beginSheetModal(for: window!) { [weak self] response in self?.reply(id,response == .OK ? panel.url?.path : nil) }; return
        }
        if action == "save" {
            savePDF(asCopy: args["as"] as? Bool == true) { [weak self] result, error in
                self?.reply(id, result, error)
            }
            return
        }
        pendingWork += 1
        queue.async { [weak self] in
            guard let self = self else { return }
            do {
                let result: Any
                switch action {
                case "print":
                    DispatchQueue.main.async {
                        self.pendingWork -= 1
                        do {
                            let operation=try doc.printOperation(withSettings:[:])
                            operation.runModal(for:self.window!,delegate:nil,didRun:nil,contextInfo:nil)
                            self.reply(id,true)
                        } catch { self.reply(id,nil,error) }
                    }
                    return
                case "document":
                    DispatchQueue.main.async {
                        self.pendingWork -= 1
                        do {
                            guard let kind = NSClassFromString("HWDocument") as? NSDocument.Type else { throw PDFEditingBridge.Failure(message:"문서 편집기를 찾지 못했습니다.") }
                            let imported = try kind.init(contentsOf:session.current, ofType:DocType.pdf)
                            imported.fileURL = nil
                            imported.fileType = kind.readableTypes.first
                            imported.displayName = session.source.deletingPathExtension().lastPathComponent
                            NSDocumentController.shared.addDocument(imported)
                            imported.makeWindowControllers(); imported.showWindows()
                            imported.updateChangeCount(.changeDone)
                            self.reply(id,true)
                        } catch { self.reply(id,nil,error) }
                    }
                    return
                case "thumbnail": result = try PDFEditingBridge.call(["action":"render","input":session.current.path,"page":args["page"] as? Int ?? 0,"scale":0.2])
                case "page": result = try session.page(args["page"] as? Int ?? 0)
                case "edit": result = try session.edit(args)
                case "undo", "redo": session.undo(redo: action == "redo"); result = true
                case "ocr": result = try session.ocr(args)
                case "setup": result = try PDFEditingBridge.setup()
                default: throw PDFEditingBridge.Failure(message:"지원하지 않는 PDF 작업입니다.")
                }
                let dirty = session.dirty
                DispatchQueue.main.async {
                    self.pendingWork -= 1
                    if ["edit","undo","redo"].contains(action) { doc.updateChangeCount(dirty ? .changeDone : .changeCleared) }
                    self.reply(id,result)
                }
            } catch { DispatchQueue.main.async { self.pendingWork -= 1; self.reply(id,nil,error) } }
        }
    }
}
