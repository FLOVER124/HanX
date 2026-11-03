import AppKit
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let controller = HWDocumentController()
let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)
defer { try? FileManager.default.removeItem(at:dir) }
for (kind,doc) in [(HanXFile.Kind.document, try HWDocument(type: HanXFile.type) as NSDocument),(.spreadsheet, try SheetDocument(type:HanXFile.type)),(.presentation, try SlideDocument(type:HanXFile.type))] {
    let url = dir.appendingPathComponent("한글 이름 \(kind.rawValue).hanx")
    precondition(doc.fileType == HanXFile.type)
    precondition(doc.fileNameExtension(forType: doc.fileType!, saveOperation:.saveOperation) == "hanx")
    try doc.data(ofType:HanXFile.type).write(to:url)
    let reopened = try controller.makeDocument(withContentsOf:url,ofType:HanXFile.type)
    precondition(type(of:reopened) == type(of:doc))
    precondition(reopened.fileType == HanXFile.type)
    let result = try reopened.data(ofType:HanXFile.type)
    precondition(result.starts(with:kind.header))
    print("PASS \(kind.rawValue) native save and editor routing")
}
