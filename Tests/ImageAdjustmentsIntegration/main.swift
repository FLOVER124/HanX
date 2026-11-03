import AppKit
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
var failures = 0
func check(_ value: @autoclosure () -> Bool, _ title: String) { if value() { print("PASS \(title)") } else { failures += 1; print("FAIL \(title)") } }
func descendants(_ view: NSView) -> [NSView] { view.subviews.flatMap { [$0] + descendants($0) } }
func settle(_ seconds: Double = 0.2) { RunLoop.main.run(until: Date(timeIntervalSinceNow: seconds)) }
let bitmap = SolidBackgroundRemoval.Bitmap(rgba: [255,0,0,255, 0,255,0,128, 0,0,255,255, 20,40,60,0], width: 2, height: 2)
let original = try bitmap.png()
let doc = SlideDocument(); doc.undoManager?.groupsByEvent = false
var shape = SlideShape(id: 7, kind: .image, frame: Frame(x: 20, y: 30, w: 200, h: 100)); shape.imageID = "fixture"; shape.rotation = 15
var slide = Slide(); slide.shapes = [shape]
doc.pres.slides = [slide]; doc.pres.images = ["fixture": ImageData(name: "fixture.png", data: original)]
doc.makeWindowControllers()
let controller = doc.windowControllers.first as! SlideWindowController
controller.window!.setFrameOrigin(NSPoint(x: -10000, y: -10000)); controller.showWindow(nil); controller.selectShape(7)
controller.ribbonCommand("imageAdjustments", ""); settle()
check(controller.window!.attachedSheet != nil, "ribbon opens adjustments sheet")
let controls = controller.window!.attachedSheet!.contentView!.subviews
let sliders = controls.compactMap { $0 as? NSSlider }
check(sliders.count == 8, "all eight adjustment controls are present")
sliders[0].doubleValue = 50; _ = sliders[0].sendAction(sliders[0].action, to: sliders[0].target); settle()
let popup = controls.compactMap { $0 as? NSPopUpButton }.first!
popup.selectItem(at: 1); _ = popup.sendAction(popup.action, to: popup.target); settle()
let apply = controls.compactMap { $0 as? NSButton }.first { $0.title == "적용" }!
check(apply.isEnabled, "preview completes before apply")
doc.undoManager?.beginUndoGrouping(); apply.performClick(nil); settle(0.4); doc.undoManager?.endUndoGrouping()
check(controller.window!.attachedSheet == nil, "apply closes sheet")
let imageID = doc.pres.slides[0].shapes[0].imageID!
let edited = try SolidBackgroundRemoval.decode(doc.pres.images[imageID]!.data)
check(edited.rgba[3] == 128 && edited.rgba[7] == 64, "saved image contains transparency")
check(abs(Int(edited.rgba[0]) - Int(edited.rgba[1])) <= 1 && abs(Int(edited.rgba[1]) - Int(edited.rgba[2])) <= 1, "saved image contains grayscale")
check(doc.pres.slides[0].shapes[0].rotation == 15 && doc.pres.slides[0].shapes[0].frame.w == 200, "adjustment preserves shape geometry")
check(doc.originalImageForBackgroundEditing(imageID)?.data == original, "session restore retains original bytes")
doc.undoManager?.undo(); check(doc.pres.slides[0].shapes[0].imageID == "fixture", "undo restores original image")
doc.undoManager?.redo(); check(doc.pres.slides[0].shapes[0].imageID == imageID, "redo restores adjustment")
let folder = FileManager.default.temporaryDirectory.appendingPathComponent("HanX-image-adjustments-" + UUID().uuidString)
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: folder) }
let file = folder.appendingPathComponent("edited.pptx"); try PPTXWriter.write(doc.pres).write(to: file)
let reopened = try SlidesIO.load(url: file)
let reopenedID = reopened.slides[0].shapes[0].imageID!
let reopenedPixels = try SolidBackgroundRemoval.decode(reopened.images[reopenedID]!.data).rgba
check(reopenedPixels == edited.rgba, "PPTX reopen preserves baked pixel effects")
controller.selectShape(7); controller.ribbonCommand("imageAdjustments", ""); settle()
let cancel = controller.window!.attachedSheet!.contentView!.subviews.compactMap { $0 as? NSButton }.first { $0.title == "취소" }!
cancel.performClick(nil); settle()
check(doc.pres.slides[0].shapes[0].imageID == imageID, "cancel does not modify document")
controller.window?.orderOut(nil)
exit(failures == 0 ? 0 : 1)
