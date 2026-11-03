import AppKit

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let source = SolidBackgroundRemoval.Bitmap(rgba: [
    255,0,0,255, 0,255,0,255, 0,0,255,255, 0,0,0,255,
    255,255,0,255, 255,0,255,255, 0,255,255,255, 255,255,255,255
], width: 4, height: 2)
let (png, region) = try SlideImageCrop.crop(source, selection: CGRect(x:0.5,y:0,width:0.5,height:1))
let cropped = try SolidBackgroundRemoval.decode(png)
precondition(cropped.width == 2 && cropped.height == 2)
precondition(cropped.rgba == [0,0,255,255, 0,0,0,255, 0,255,255,255, 255,255,255,255])
let doc = SlideDocument()
doc.undoManager?.groupsByEvent = false
var shape = SlideShape(id:7, kind:.image, frame:Frame(x:20,y:30,w:400,h:200))
shape.rotation = 90; shape.flipH = true; shape.imageID = "source"
doc.pres.slides = [Slide(shapes:[shape])]
doc.pres.images = ["source":ImageData(name:"source.png",data:try source.png())]
doc.undoManager?.beginUndoGrouping()
precondition(doc.replaceImageBackground(slide:0,shapeID:7,expectedImageID:"source",png:png,actionName:"그림 자르기",crop:region))
doc.undoManager?.endUndoGrouping()
let edited = doc.pres.slides[0].shapes[0]
precondition(edited.frame == Frame(x:120,y:-70,w:200,h:200))
doc.undoManager?.undo(); precondition(doc.pres.slides[0].shapes[0].frame == shape.frame)
doc.undoManager?.redo(); precondition(doc.pres.slides[0].shapes[0].imageID == edited.imageID)
let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".pptx")
defer { try? FileManager.default.removeItem(at:url) }
try PPTXWriter.write(doc.pres).write(to:url)
let restored = try SlidesIO.load(url:url), picture = restored.slides[0].shapes[0]
precondition(picture.frame == edited.frame && picture.rotation == 90 && picture.flipH)
precondition(restored.images[picture.imageID!]?.data == png)
doc.undoManager?.beginUndoGrouping()
precondition(doc.restoreImageBackground(slide:0,shapeID:7))
doc.undoManager?.endUndoGrouping()
precondition(abs(doc.pres.slides[0].shapes[0].frame.x - shape.frame.x) < 0.00001 && abs(doc.pres.slides[0].shapes[0].frame.y - shape.frame.y) < 0.00001 && doc.pres.slides[0].shapes[0].frame.w == shape.frame.w && doc.pres.slides[0].shapes[0].imageID == "source")
doc.makeWindowControllers()
let controller = doc.windowControllers.first as! SlideWindowController
controller.window!.setFrameOrigin(NSPoint(x:-10000,y:-10000)); controller.showWindow(nil); controller.selectShape(7)
controller.ribbonCommand("imageCrop","")
precondition(controller.window?.attachedSheet?.title == "그림 자르기")
let cancel = controller.window!.attachedSheet!.contentView!.subviews.compactMap { $0 as? NSButton }.first { $0.title == "취소" }!
cancel.performClick(nil); RunLoop.main.run(until: Date(timeIntervalSinceNow:0.2))
precondition(doc.pres.slides[0].shapes[0].imageID == "source")

func mouse(_ view: NSView, _ type: NSEvent.EventType, _ point: CGPoint, count: Int = 1) -> NSEvent {
    NSEvent.mouseEvent(with: type, location: view.convert(point,to:nil), modifierFlags: [], timestamp: 0,
        windowNumber: view.window!.windowNumber, context:nil,eventNumber:0,clickCount:count,pressure:1)!
}
let canvas = controller.debugCanvas
doc.undoManager?.beginUndoGrouping()
canvas.mouseDown(with: mouse(canvas,.leftMouseDown,CGPoint(x:220,y:130),count:2))
doc.undoManager?.endUndoGrouping()
let sheet = controller.window!.attachedSheet!
let preview = sheet.contentView!.subviews.compactMap { $0 as? SlideCropPreview }.first!
preview.mouseDown(with:mouse(preview,.leftMouseDown,CGPoint(x:130,y:130)))
preview.mouseDragged(with:mouse(preview,.leftMouseDragged,CGPoint(x:370,y:210)))
preview.mouseUp(with:mouse(preview,.leftMouseUp,CGPoint(x:370,y:210)))
let apply = sheet.contentView!.subviews.compactMap { $0 as? NSButton }.first { $0.title == "자르기" }!
precondition(apply.isEnabled)
doc.undoManager?.beginUndoGrouping(); apply.performClick(nil); doc.undoManager?.endUndoGrouping()
RunLoop.main.run(until: Date(timeIntervalSinceNow:0.2))
precondition(doc.pres.slides[0].shapes[0].imageID != "source")
doc.undoManager?.beginUndoGrouping()
controller.ribbonCommand("backgroundDesign","0")
doc.undoManager?.endUndoGrouping()
precondition(doc.pres.slides[0].backgroundEnd == RGB(hex:"80D3E9"))
controller.ribbonCommand("backgroundCustom","")
precondition(controller.window!.attachedSheet != nil)
let gradientSheet = controller.window!.attachedSheet!
func allViews(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(allViews) }
let gradientControls = allViews(gradientSheet.contentView!)
let wells = gradientControls.compactMap { $0 as? NSColorWell }
wells[0].color = .red; wells[1].color = .blue; wells[2].color = .green
gradientControls.compactMap { $0 as? NSButton }.first { $0.title == "중간 색 사용" }!.state = .on
gradientControls.compactMap { $0 as? NSSlider }.first!.doubleValue = 33
let degreeField = gradientControls.compactMap { $0 as? NSTextField }.first { $0.isEditable }!
degreeField.stringValue = "90"
doc.undoManager?.beginUndoGrouping()
gradientControls.compactMap { $0 as? NSButton }.first { $0.title == "적용" }!.performClick(nil)
RunLoop.main.run(until: Date(timeIntervalSinceNow:0.2))
doc.undoManager?.endUndoGrouping()
precondition(doc.pres.slides[0].gradientAngle == 90 && doc.pres.slides[0].backgroundMiddle != nil && doc.pres.slides[0].backgroundMiddlePosition == 33)
let gradientImage = SlideRenderer.image(doc.pres.slides[0],doc.pres,width:100)
let gradientBitmap = try SolidBackgroundRemoval.decode(gradientImage.tiffRepresentation!)
let top = Array(gradientBitmap.rgba[0..<3])
let bottomIndex = ((gradientBitmap.height-1)*gradientBitmap.width)*4
let bottom = Array(gradientBitmap.rgba[bottomIndex..<(bottomIndex+3)])
precondition(top[0] > top[2] && bottom[2] > bottom[0])
controller.close()
for name in ["letter","labels"] {
    let model = DocumentTemplates.make(name)!
    let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".docx")
    try DOCXWriter(model).write().write(to:file)
    let document = HWDocument()
    try document.read(from:file,ofType:DocType.docx)
    document.makeWindowControllers()
    let reopened = document.currentModel()
    precondition(!reopened.sections[0].blocks.isEmpty)
    document.close()
    try? FileManager.default.removeItem(at:file)
}

print("PASS: crop pixels, rotated/mirrored frame, undo/redo, PPTX round trip, original size restoration, ribbon cancel, double click, drag crop and apply")
