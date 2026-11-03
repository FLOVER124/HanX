import AppKit

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
var failures = 0
func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    if condition() { print("PASS \(message)") } else { failures += 1; print("FAIL \(message)") }
}
func descendants(_ view: NSView) -> [NSView] { view.subviews.flatMap { [$0] + descendants($0) } }
func settle() { RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.2)) }
let originalPixels: [UInt8] = [255,255,255,255, 0,0,0,255, 255,255,255,255, 0,0,0,128]
let bitmap = SolidBackgroundRemoval.Bitmap(rgba: originalPixels, width: 2, height: 2)
let originalPNG = try bitmap.png()
let decoded = try SolidBackgroundRemoval.decode(originalPNG)
check(decoded.width == 2 && decoded.height == 2 && decoded.rgba == originalPixels, "PNG round trip preserves pixel orientation and existing alpha")
let borderFixture = SolidBackgroundRemoval.Bitmap(rgba: [255,255,255,255, 255,255,255,255, 0,0,0,255], width: 3, height: 1)
check(borderFixture.backgroundColor == (255,255,255), "border sampling chooses the dominant opaque background")
let processed = try decoded.removing(color: (255,255,255), tolerance: 0).png()
let finalPixels = try SolidBackgroundRemoval.decode(processed).rgba
check(finalPixels[3] == 0 && finalPixels[7] == 255 && finalPixels[11] == 0 && finalPixels[15] == 128, "transparent PNG removes background and retains subject alpha")
do { _ = try SolidBackgroundRemoval.decode(Data("not an image".utf8)); check(false, "unsupported image data rejected") } catch { check(true, "unsupported image data rejected") }

let doc = SlideDocument()
doc.undoManager?.groupsByEvent = false
var shape = SlideShape(id: 7, name: "Fixture", kind: .image, frame: Frame(x: 40, y: 50, w: 200, h: 100))
shape.imageID = "fixture.png"; shape.rotation = 25; shape.flipH = true
var slide = Slide(); slide.shapes = [shape]
doc.pres.slides = [slide]; doc.pres.images = ["fixture.png": ImageData(name: "fixture.png", data: originalPNG)]
func action(_ body: () -> Void) { doc.undoManager?.beginUndoGrouping(); body(); doc.undoManager?.endUndoGrouping() }
action { check(doc.replaceImageBackground(slide: 0, shapeID: 7, expectedImageID: "fixture.png", png: processed), "replace selected image succeeds") }
let editedID = doc.pres.slides[0].shapes[0].imageID!
check(editedID != "fixture.png" && doc.pres.images[editedID]?.data == processed, "replacement uses separate PNG asset")
check(doc.pres.images["fixture.png"]?.data == originalPNG, "original bytes remain untouched")
check(doc.pres.slides[0].shapes[0].frame.x == 40 && doc.pres.slides[0].shapes[0].rotation == 25 && doc.pres.slides[0].shapes[0].flipH, "replacement preserves geometry and orientation")
check(doc.originalImageForBackgroundEditing(editedID)?.data == originalPNG, "reopening editor uses original full-resolution bytes")
check(doc.canRestoreImageBackground(editedID), "processed asset has session restore provenance")
doc.undoManager?.undo()
check(doc.pres.slides[0].shapes[0].imageID == "fixture.png" && doc.pres.images[editedID] == nil, "undo restores original and removes generated media")
doc.undoManager?.redo()
check(doc.pres.slides[0].shapes[0].imageID == editedID && doc.canRestoreImageBackground(editedID), "redo restores processed image and restore availability")
action { _ = doc.replaceImageBackground(slide: 0, shapeID: 7, expectedImageID: editedID, png: processed) }
let secondID = doc.pres.slides[0].shapes[0].imageID!
action { doc.edit("Reorder fixture") { $0.slides.insert(Slide(), at: 0) } }
action { check(doc.restoreImageBackground(slide: 1, shapeID: 7), "restore follows image after slide reorder") }
check(doc.pres.slides[1].shapes[0].imageID == "fixture.png", "repeated removal restores first original")
doc.undoManager?.undo()
check(doc.pres.slides[1].shapes[0].imageID == secondID, "restoration itself supports undo")
check(!doc.replaceImageBackground(slide: 1, shapeID: 7, expectedImageID: "fixture.png", png: processed), "stale image replacement is rejected")
let independent = SlideDocument()
check(!independent.canRestoreImageBackground(secondID), "restore provenance does not leak across documents")

let folder = FileManager.default.temporaryDirectory.appendingPathComponent("HanX-image-tests-" + UUID().uuidString)
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: folder) }
let pptx = folder.appendingPathComponent("background.pptx")
try PPTXWriter.write(doc.pres).write(to: pptx)
let reopened = try SlidesIO.load(url: pptx)
let reopenedID = reopened.slides[1].shapes.first(where: { $0.kind == .image })!.imageID!
let reopenedBitmap = try SolidBackgroundRemoval.decode(reopened.images[reopenedID]!.data)
check(reopenedBitmap.rgba == finalPixels, "PPTX export/import retains transparent image pixels")

// Exercise the actual ribbon command and sheet cancellation without changing the document.
doc.makeWindowControllers()
let controller = doc.windowControllers.first as! SlideWindowController
controller.window!.setFrameOrigin(NSPoint(x: -10000, y: -10000))
doc.pres.slides = [slide]; doc.undoManager?.removeAllActions(); controller.reload()
controller.debugRibbon.showTab("그림")
controller.showWindow(nil); settle()
controller.selectShape(7)
controller.ribbonCommand("imageBackground", "")
if let content = controller.window!.attachedSheet?.contentView,
   let modes = descendants(content).compactMap({ $0 as? NSSegmentedControl }).first(where: { $0.segmentCount == 3 }) {
    modes.selectedSegment = 1; _ = modes.sendAction(modes.action, to: modes.target)
}
settle()
let sheet = controller.window!.attachedSheet
check(sheet != nil, "ribbon background removal opens a preview sheet")
if let content = sheet?.contentView {
    let controls = descendants(content)
    if let snapshot = content.bitmapImageRepForCachingDisplay(in: content.bounds) {
        content.cacheDisplay(in: content.bounds, to: snapshot)
        let composed = NSImage(size: content.bounds.size)
        composed.lockFocus()
        NSColor.white.setFill(); NSRect(origin: .zero, size: content.bounds.size).fill()
        NSImage(data: snapshot.representation(using: .png, properties: [:])!)?.draw(in: NSRect(origin: .zero, size: content.bounds.size))
        composed.unlockFocus()
        try NSBitmapImageRep(data: composed.tiffRepresentation!)?.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: "/tmp/hanx-image-background-sheet.png"))
    }
    check(controls.contains { $0 is NSSlider } && controls.contains { $0 is NSColorWell }, "preview sheet provides tolerance and background color controls")
    if let button = controls.compactMap({ $0 as? NSButton }).first(where: { $0.title == "취소" }) { button.performClick(nil) }
}
settle()
check(controller.window!.attachedSheet == nil && doc.pres.slides[0].shapes[0].imageID == "fixture.png" && doc.undoManager?.canUndo == false, "cancel closes sheet without document mutation or undo entry")
controller.selectShape(7)
controller.ribbonCommand("imageBackground", "")
if let content = controller.window!.attachedSheet?.contentView,
   let modes = descendants(content).compactMap({ $0 as? NSSegmentedControl }).first(where: { $0.segmentCount == 3 }) {
    modes.selectedSegment = 1; _ = modes.sendAction(modes.action, to: modes.target)
}
settle()
if let content = controller.window!.attachedSheet?.contentView {
    let controls = descendants(content)
    if let slider = controls.compactMap({ $0 as? NSSlider }).first(where: { $0.accessibilityLabel() == "배경색 허용 범위" }) {
        slider.doubleValue = 100; _ = slider.sendAction(slider.action, to: slider.target)
    }
    let button = controls.compactMap({ $0 as? NSButton }).first(where: { $0.title == "적용" })
    let deadline = Date(timeIntervalSinceNow: 5)
    while button?.isEnabled == false && Date() < deadline { settle() }
    doc.undoManager?.beginUndoGrouping()
    button?.performClick(nil)
    while controller.window!.attachedSheet != nil && Date() < deadline { settle() }
    doc.undoManager?.endUndoGrouping()
}
let appliedID = doc.pres.slides[0].shapes[0].imageID!
let applied = try SolidBackgroundRemoval.decode(doc.pres.images[appliedID]!.data)
check(appliedID != "fixture.png" && stride(from: 3, to: applied.rgba.count, by: 4).allSatisfy { applied.rgba[$0] == 0 }, "Apply at tolerance 100 removes the full color range")
action { controller.ribbonCommand("restoreImage", "") }
check(doc.pres.slides[0].shapes[0].imageID == "fixture.png", "ribbon Restore returns original image after Apply")
controller.close()
exit(failures == 0 ? 0 : 1)
