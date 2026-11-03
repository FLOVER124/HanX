import AppKit

/// Source-aligned crop rectangle, in fractions of the original image.
enum SlideImageCrop {
    static let full = CGRect(x: 0, y: 0, width: 1, height: 1)

    static func composed(_ outer: CGRect, _ inner: CGRect) -> CGRect {
        CGRect(x: outer.minX + outer.width * inner.minX, y: outer.minY + outer.height * inner.minY,
               width: outer.width * inner.width, height: outer.height * inner.height)
    }

    static func frame(for shape: SlideShape, rect: CGRect, restoring: Bool = false) -> Frame {
        let f = shape.frame
        let width = restoring ? f.w / rect.width : f.w
        let height = restoring ? f.h / rect.height : f.h
        let dx = (rect.midX - 0.5) * width * (shape.flipH ? -1 : 1)
        let dy = (rect.midY - 0.5) * height * (shape.flipV ? -1 : 1)
        let (rx, ry) = ShapeGeometry.rotated(dx, dy, shape.rotation)
        let w = restoring ? width : width * rect.width
        let h = restoring ? height : height * rect.height
        let sign = restoring ? -1.0 : 1.0
        return Frame(x: f.x + (f.w - w) / 2 + sign * rx, y: f.y + (f.h - h) / 2 + sign * ry, w: w, h: h)
    }

    static func crop(_ bitmap: SolidBackgroundRemoval.Bitmap, selection: CGRect) throws -> (Data, CGRect) {
        let rect = selection.standardized.intersection(full)
        guard !rect.isNull, !rect.isEmpty else { throw SolidBackgroundRemoval.Failure.invalidImage }
        let width = bitmap.width, height = bitmap.height
        let left = Int(floor(rect.minX * Double(width))), right = min(width, Int(ceil(rect.maxX * Double(width))))
        let top = Int(floor(rect.minY * Double(height))), bottom = min(height, Int(ceil(rect.maxY * Double(height))))
        var pixels = [UInt8]()
        pixels.reserveCapacity((right-left) * (bottom-top) * 4)
        for row in top..<bottom {
            pixels.append(contentsOf: bitmap.rgba[((row*width+left)*4)..<((row*width+right)*4)])
        }
        let cropped = SolidBackgroundRemoval.Bitmap(rgba: pixels, width: right-left, height: bottom-top)
        let exact = CGRect(x: Double(left)/Double(width), y: Double(top)/Double(height),
                           width: Double(right-left)/Double(width), height: Double(bottom-top)/Double(height))
        return (try cropped.png(), exact)
    }
}

final class SlideCropPreview: NSView {
    var image: NSImage?
    private(set) var selection = SlideImageCrop.full
    var onChange: ((CGRect) -> Void)?
    private var anchor: CGPoint?
    override var isFlipped: Bool { true }

    private var imageRect: CGRect {
        guard let image else { return .zero }
        let scale = min(bounds.width / image.size.width, bounds.height / image.size.height)
        let w = image.size.width * scale, h = image.size.height * scale
        return CGRect(x: bounds.midX - w/2, y: bounds.midY - h/2, width: w, height: h)
    }

    override func draw(_ dirtyRect: NSRect) {
        NSColor.controlBackgroundColor.setFill(); bounds.fill()
        let rect = imageRect
        image?.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
        let inside = SlideImageCrop.composed(rect, selection)
        let overlay = NSBezierPath(rect: rect); overlay.append(NSBezierPath(rect: inside)); overlay.windingRule = .evenOdd
        NSColor.black.withAlphaComponent(0.5).setFill(); overlay.fill()
        NSColor.white.setStroke(); NSBezierPath(rect: inside).stroke()
    }

    private func point(_ event: NSEvent) -> CGPoint {
        let p = convert(event.locationInWindow, from: nil), rect = imageRect
        return CGPoint(x: max(0, min(1, (p.x-rect.minX)/rect.width)), y: max(0, min(1, (p.y-rect.minY)/rect.height)))
    }
    override func mouseDown(with event: NSEvent) {
        anchor = imageRect.contains(convert(event.locationInWindow, from: nil)) ? point(event) : nil
    }
    override func mouseDragged(with event: NSEvent) {
        guard let a = anchor else { return }
        let b = point(event)
        selection = CGRect(x: min(a.x,b.x), y: min(a.y,b.y), width: abs(a.x-b.x), height: abs(a.y-b.y))
        needsDisplay = true; onChange?(selection)
    }
    override func mouseUp(with event: NSEvent) { anchor = nil }
    func reset() { selection = SlideImageCrop.full; needsDisplay = true; onChange?(selection) }
}

final class SlideImageCropEditor: NSWindowController {
    private let bitmap: SolidBackgroundRemoval.Bitmap
    private let preview = SlideCropPreview(frame: NSRect(x: 16, y: 58, width: 568, height: 344))
    private let apply = NSButton(title: "자르기", target: nil, action: nil)
    private let completion: ((Data, CGRect)?) -> Void
    init(data: Data, completion: @escaping ((Data, CGRect)?) -> Void) throws {
        bitmap = try SolidBackgroundRemoval.decode(data)
        self.completion = completion
        let panel = NSPanel(contentRect: NSRect(x: 0,y: 0,width: 600,height: 440), styleMask: [.titled], backing: .buffered, defer: false)
        panel.title = "그림 자르기"
        super.init(window: panel)
        let label = NSTextField(labelWithString: "그림에서 남길 영역을 드래그하세요.")
        label.frame = NSRect(x: 16,y: 408,width: 568,height: 22)
        preview.image = NSImage(cgImage: try bitmap.cgImage(), size: NSSize(width: bitmap.width,height: bitmap.height))
        preview.onChange = { [weak self] selection in self?.apply.isEnabled = !selection.isEmpty && selection != SlideImageCrop.full }
        let reset = NSButton(title: "다시 선택", target: self, action: #selector(resetSelection))
        let cancel = NSButton(title: "취소", target: self, action: #selector(cancel))
        reset.frame = NSRect(x: 16,y: 12,width: 94,height: 30); cancel.frame = NSRect(x: 388,y: 12,width: 90,height: 30)
        apply.frame = NSRect(x: 484,y: 12,width: 100,height: 30)
        apply.target = self; apply.action = #selector(crop); apply.isEnabled = false; apply.keyEquivalent = "\r"; cancel.keyEquivalent = "\u{1b}"
        for control in [label, preview, reset, cancel, apply] { panel.contentView?.addSubview(control) }
    }
    required init?(coder: NSCoder) { fatalError() }
    @objc private func resetSelection() { preview.reset() }
    @objc private func cancel() { finish(nil) }
    @objc private func crop() {
        do { finish(try SlideImageCrop.crop(bitmap, selection: preview.selection)) }
        catch { if let window { NSAlert(error: error).beginSheetModal(for: window) } }
    }
    private func finish(_ value: (Data, CGRect)?) {
        if let window { window.sheetParent?.endSheet(window); window.orderOut(nil) }
        completion(value)
    }
}
