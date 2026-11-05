import AppKit
import WebKit
import PDFKit

enum DocType { static let pdf = "com.adobe.pdf" }
final class CloseObserver: NSObject {
    var called = false
    @objc func document(_ document: NSDocument, shouldClose: Bool, contextInfo: UnsafeMutableRawPointer?) { called = true }
}
let observer = CloseObserver()
let application = NSApplication.shared
application.setActivationPolicy(.accessory)
let doc = try PDFEditingDocument(contentsOf:URL(fileURLWithPath:ProcessInfo.processInfo.environment["HANX_PDF_TEST_FIXTURE"]!),ofType:DocType.pdf)
doc.makeWindowControllers();doc.showWindows()
let window = doc.windowControllers[0].window!
if (try? doc.data(ofType: "public.plain-text")) != nil {
    print("FAIL PDF bytes reported as plain text")
    exit(1)
}
guard let modes = window.titlebarAccessoryViewControllers.compactMap({ $0.view as? NSSegmentedControl }).first else {
    print("FAIL missing edit mode switch"); exit(1)
}
guard modes.selectedSegment == 1, window.contentView is WKWebView else {
    print("FAIL PDF must open directly in the editor"); exit(1)
}
if ProcessInfo.processInfo.environment["HANX_PDF_TEST_READ_ONLY"] == "1" {
    modes.selectedSegment = 0
    _ = NSApp.sendAction(modes.action!, to: modes.target, from: modes)
    guard let reader=window.contentView as? PDFView, let pdf=reader.document,
          let page=pdf.page(at:0), page.numberOfCharacters == 0,
          page.thumbnail(of:NSSize(width:160,height:160),for:.cropBox).isValid else {
        print("FAIL expected a readable image-only PDF"); exit(1)
    }
    print("PASS native image-only PDF reading mode");exit(0)
}
let web = window.contentView as! WKWebView
let deadline = Date().addingTimeInterval(40)
var done = false
func evaluate(_ source: String) -> Any? {
    var value: Any?, finished=false
    web.evaluateJavaScript(source) { result, error in value=result; if let error=error { print(error) }; finished=true }
    while !finished && Date()<deadline { RunLoop.main.run(until:Date().addingTimeInterval(0.05)) }
    return value
}
while Date()<deadline {
    RunLoop.main.run(until:Date().addingTimeInterval(0.1))
    if evaluate("typeof state !== 'undefined' && !!state && !busy") as? Bool == true { done=true; break }
}
guard done else { print("FAIL native PDF UI",evaluate("document.body.innerText") ?? "");exit(1) }
guard evaluate("state.objects.length") as? Int == 3 else { print("FAIL object count");exit(1) }
_ = evaluate("select(0);inlineText(selected());$('inlineText').value='Unsaved draft';$('inlineText').dispatchEvent(new Event('input'));true")
while !doc.isDocumentEdited && Date()<deadline { RunLoop.main.run(until:Date().addingTimeInterval(0.05)) }
guard doc.isDocumentEdited else { print("FAIL inline draft missing native dirty state");exit(1) }
_ = evaluate("$('inlineText').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true")
while doc.isDocumentEdited && Date()<deadline { RunLoop.main.run(until:Date().addingTimeInterval(0.05)) }
guard !doc.isDocumentEdited else { print("FAIL canceled inline draft stays dirty");exit(1) }
_ = evaluate("select(1); $('delete').click(); true")
let controller = doc.windowControllers[0] as! PDFEditingWindowController
while !controller.hasPendingWork && Date()<deadline { RunLoop.main.run(until:Date().addingTimeInterval(0.01)) }
guard controller.hasPendingWork else { print("FAIL pending work not tracked");exit(1) }
doc.canClose(withDelegate:observer, shouldClose:#selector(CloseObserver.document(_:shouldClose:contextInfo:)),contextInfo:nil)
let guardDeadline = Date().addingTimeInterval(0.2)
while Date()<guardDeadline { RunLoop.main.run(until:Date().addingTimeInterval(0.02)) }
guard !observer.called else { print("FAIL close callback completed before edit finished");exit(1) }
while Date()<deadline { RunLoop.main.run(until:Date().addingTimeInterval(0.1)); if evaluate("!busy && state.objects.length===2") as? Bool == true { break } }
guard evaluate("state.objects.length") as? Int == 2 else { print("FAIL native delete", evaluate("document.body.innerText") ?? "");exit(1) }
guard doc.isDocumentEdited else { print("FAIL native document not marked dirty");exit(1) }
guard !observer.called else { print("FAIL unsaved edit closed without confirmation");exit(1) }
print("PASS native WKWebView PDF open, delete, rerender and deferred close confirmation")
exit(0)
