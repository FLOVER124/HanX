import AppKit
import Vision

/// A transient sheet: all instructions and limitations stay out of the ribbon
/// and document canvas. Only Apply creates an edit in the document.
final class SlideImageBackgroundEditor: NSWindowController {
    private let mode = NSSegmentedControl(labels: ["자동", "단색", "수동"], trackingMode: .selectOne, target: nil, action: nil)
    private let brush = NSSegmentedControl(labels: ["유지", "제거"], trackingMode: .selectOne, target: nil, action: nil)
    private let brushSize = NSSlider(value: 20, minValue: 2, maxValue: 80, target: nil, action: nil)
    private var mask: ImageBackgroundMask?
    private var cancelRequest: (() -> Void)?
    private let worker = DispatchQueue(label: "HanX.image-background", qos: .userInitiated)
    private let previewBitmap: SolidBackgroundRemoval.Bitmap
    private let preview = ImageTransparencyPreview(frame: NSRect(x: 20, y: 116, width: 600, height: 340))
    private let tolerance = NSSlider(value: 12, minValue: 0, maxValue: 100, target: nil, action: nil)
    private let color = NSColorWell(frame: NSRect(x: 86, y: 75, width: 48, height: 26))
    private let amount = NSTextField(labelWithString: "12")
    private let comparison = NSSegmentedControl(labels: ["제거 결과", "원본"], trackingMode: .selectOne, target: nil, action: nil)
    private let apply = NSButton(title: "적용", target: nil, action: nil)
    private let cancel = NSButton(title: "취소", target: nil, action: nil)
    private let progress = NSProgressIndicator()
    private var revision = 0
    private var closed = false
    private var working = false
    private var output: NSImage?
    private let completion: (Data?) -> Void

    init(source: Data, completion: @escaping (Data?) -> Void) throws {
        self.completion = completion
        previewBitmap = try SolidBackgroundRemoval.decode(source, maximumDimension: nil)
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 640, height: 600), styleMask: [.titled], backing: .buffered, defer: false)
        panel.title = "그림 배경 제거"
        super.init(window: panel)
        guard let view = panel.contentView else { return }
        let hint = NSTextField(wrappingLabelWithString: "자동으로 피사체를 찾거나 단색 배경을 제거한 뒤 유지·제거 브러시로 다듬으세요. 수동 모드는 원본에서 시작합니다. 모드나 배경색을 바꾸면 브러시 수정이 초기화됩니다.")
        hint.frame = NSRect(x: 20, y: 532, width: 600, height: 54); hint.font = .systemFont(ofSize: 12)
        view.addSubview(hint); view.addSubview(preview)
        mode.frame = NSRect(x: 20, y: 491, width: 210, height: 28)
        if #available(macOS 14.0, *) { mode.selectedSegment = 0 } else { mode.selectedSegment = 1 }
        mode.target = self; mode.action = #selector(modeChanged); view.addSubview(mode)
        brush.frame = NSRect(x: 250, y: 491, width: 120, height: 28); brush.selectedSegment = 1; view.addSubview(brush)
        brushSize.frame = NSRect(x: 390, y: 491, width: 160, height: 28)
        brushSize.setAccessibilityLabel("브러시 크기"); view.addSubview(brushSize)
        let sizeLabel = NSTextField(labelWithString: "크기"); sizeLabel.frame = NSRect(x: 560, y: 495, width: 50, height: 20); view.addSubview(sizeLabel)
        preview.paint = { [weak self] start, end, displayedWidth in
            guard let self, !self.working, self.apply.isEnabled, self.comparison.selectedSegment == 0, var mask = self.mask else { return }
            let w = Double(mask.width), h = Double(mask.height)
            mask.stroke(from: CGPoint(x: start.x * w, y: start.y * h), to: CGPoint(x: end.x * w, y: end.y * h), radius: self.brushSize.doubleValue * w / displayedWidth / 2, keep: self.brush.selectedSegment == 0)
            self.mask = mask; self.renderMask()
        }
        let colorLabel = NSTextField(labelWithString: "배경색")
        colorLabel.frame = NSRect(x: 20, y: 79, width: 60, height: 20); view.addSubview(colorLabel)
        let rgb = previewBitmap.backgroundColor
        color.color = NSColor(srgbRed: Double(rgb.0) / 255, green: Double(rgb.1) / 255, blue: Double(rgb.2) / 255, alpha: 1)
        color.target = self; color.action = #selector(settingsChanged); color.setAccessibilityLabel("제거할 배경색"); view.addSubview(color)
        let rangeLabel = NSTextField(labelWithString: "허용 범위")
        rangeLabel.frame = NSRect(x: 152, y: 79, width: 70, height: 20); view.addSubview(rangeLabel)
        tolerance.frame = NSRect(x: 221, y: 75, width: 178, height: 26)
        tolerance.target = self; tolerance.action = #selector(settingsChanged); tolerance.isContinuous = false
        tolerance.setAccessibilityLabel("배경색 허용 범위"); view.addSubview(tolerance)
        amount.frame = NSRect(x: 404, y: 79, width: 32, height: 20); view.addSubview(amount)
        comparison.frame = NSRect(x: 455, y: 75, width: 165, height: 26); comparison.selectedSegment = 0
        comparison.target = self; comparison.action = #selector(showComparison); view.addSubview(comparison)
        let restoreHint = NSTextField(labelWithString: "원본 복원은 문서가 열려 있는 동안 사용할 수 있습니다.")
        restoreHint.frame = NSRect(x: 20, y: 47, width: 600, height: 18); restoreHint.font = .systemFont(ofSize: 11); restoreHint.textColor = .secondaryLabelColor; view.addSubview(restoreHint)
        apply.frame = NSRect(x: 532, y: 12, width: 88, height: 30); apply.bezelStyle = .rounded
        apply.target = self; apply.action = #selector(applyResult); apply.keyEquivalent = "\r"; view.addSubview(apply)
        cancel.frame = NSRect(x: 440, y: 12, width: 88, height: 30); cancel.bezelStyle = .rounded
        cancel.target = self; cancel.action = #selector(cancelEditing); cancel.keyEquivalent = "\u{1b}"; view.addSubview(cancel)
        progress.frame = NSRect(x: 20, y: 17, width: 20, height: 20); progress.style = .spinning; progress.isDisplayedWhenStopped = false; view.addSubview(progress)
        if let image = try? previewBitmap.cgImage() { preview.image = NSImage(cgImage: image, size: .zero) }
        updatePreview()
    }
    required init?(coder: NSCoder) { fatalError() }
    func present(on parent: NSWindow) { if let window { parent.beginSheet(window) } }
    private var rgb: (UInt8, UInt8, UInt8) {
        let c = color.color.usingColorSpace(.sRGB) ?? .white
        return (UInt8((c.redComponent * 255).rounded()), UInt8((c.greenComponent * 255).rounded()), UInt8((c.blueComponent * 255).rounded()))
    }
    @objc private func settingsChanged() { amount.stringValue = String(Int(tolerance.doubleValue)); updatePreview() }
    @objc private func modeChanged() {
        if mode.selectedSegment == 0 {
            if #available(macOS 14.0, *) {} else {
                mode.selectedSegment = 1
                let alert = NSAlert(); alert.messageText = "자동 피사체 분리는 macOS 14 이상에서 사용할 수 있습니다"
                alert.informativeText = "이 Mac에서는 단색 및 수동 모드를 사용할 수 있습니다."
                if let window { alert.beginSheetModal(for: window) }
            }
        }
        updatePreview()
    }
    private func renderMask() {
        guard let mask, let image = try? mask.preview(of: previewBitmap).cgImage() else { return }
        output = NSImage(cgImage: image, size: NSSize(width: previewBitmap.width, height: previewBitmap.height))
        showComparison()
    }
    private func updatePreview() {
        revision += 1; cancelRequest?(); cancelRequest = nil; mask = nil
        let token = revision, bitmap = previewBitmap, color = rgb, tolerance = tolerance.doubleValue / 100 * 255, selectedMode = mode.selectedSegment
        self.tolerance.isEnabled = selectedMode == 1; self.color.isEnabled = selectedMode == 1
        apply.isEnabled = false; progress.startAnimation(nil)
        var generate: () throws -> ImageBackgroundMask = {
            if selectedMode == 1 {
                let removed = try bitmap.removing(color: color, tolerance: tolerance)
                let values = (0..<(bitmap.width * bitmap.height)).map { removed.rgba[$0 * 4 + 3] == 0 && bitmap.rgba[$0 * 4 + 3] != 0 ? UInt8(0) : UInt8(255) }
                return ImageBackgroundMask(values: values, width: bitmap.width, height: bitmap.height)
            }
            return ImageBackgroundMask(values: [UInt8](repeating: 255, count: bitmap.width * bitmap.height), width: bitmap.width, height: bitmap.height)
        }
        if selectedMode == 0, #available(macOS 14.0, *) {
            let request = VNGenerateForegroundInstanceMaskRequest()
            cancelRequest = { request.cancel() }
            generate = { try SubjectBackgroundRemoval.mask(for: bitmap, request: request) }
        }
        let generation = generate
        worker.async { [weak self] in
            let result = Result { try generation() }
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.closed, token == self.revision else { return }
                self.cancelRequest = nil; self.progress.stopAnimation(nil)
                switch result {
                case .success(let mask): self.mask = mask; self.apply.isEnabled = true; self.renderMask()
                case .failure(let error): self.showError(error)
                }
            }
        }
    }
    @objc private func showComparison() {
        if comparison.selectedSegment == 1, let image = try? previewBitmap.cgImage() { preview.image = NSImage(cgImage: image, size: .zero) }
        else { preview.image = output }
    }
    @objc private func applyResult() {
        guard !working, let mask else { return }
        working = true; revision += 1
        let token = revision, bitmap = previewBitmap
        apply.isEnabled = false; tolerance.isEnabled = false; color.isEnabled = false; mode.isEnabled = false
        progress.startAnimation(nil)
        worker.async { [weak self] in
            let result = Result { try mask.applying(to: bitmap).png() }
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.closed, self.revision == token else { return }
                self.working = false; self.progress.stopAnimation(nil)
                switch result {
                case .success(let data): self.finish(data)
                case .failure(let error):
                    self.apply.isEnabled = true; self.mode.isEnabled = true
                    self.tolerance.isEnabled = self.mode.selectedSegment == 1; self.color.isEnabled = self.mode.selectedSegment == 1
                    self.showError(error)
                }
            }
        }
    }
    private func showError(_ error: Error) {
        guard let window else { return }
        let alert = NSAlert(); alert.messageText = "배경을 제거할 수 없습니다"; alert.informativeText = error.localizedDescription
        alert.beginSheetModal(for: window)
    }
    @objc private func cancelEditing() { finish(nil) }
    private func finish(_ data: Data?) {
        guard !closed else { return }; closed = true; revision += 1; cancelRequest?(); cancelRequest = nil; color.deactivate()
        if let window { window.sheetParent?.endSheet(window); window.orderOut(nil) }
        completion(data)
    }
}

private final class ImageTransparencyPreview: NSView {
    var paint: ((CGPoint, CGPoint, Double) -> Void)?
    private var previous: CGPoint?
    private var imageRect: NSRect {
        guard let image, image.size.width > 0, image.size.height > 0 else { return .zero }
        let scale = min(bounds.width / image.size.width, bounds.height / image.size.height)
        let size = NSSize(width: image.size.width * scale, height: image.size.height * scale)
        return NSRect(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2, width: size.width, height: size.height)
    }
    private func paintEvent(_ event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil), rect = imageRect
        guard rect.width > 0, rect.height > 0, rect.contains(point) else { previous = nil; return }
        let normalized = CGPoint(x: (point.x - rect.minX) / rect.width, y: 1 - (point.y - rect.minY) / rect.height)
        paint?(previous ?? normalized, normalized, rect.width); previous = normalized
    }
    override func mouseDown(with event: NSEvent) { previous = nil; paintEvent(event) }
    override func mouseDragged(with event: NSEvent) { paintEvent(event) }
    override func mouseUp(with event: NSEvent) { previous = nil }
    var image: NSImage? { didSet { needsDisplay = true } }
    override func draw(_ dirtyRect: NSRect) {
        NSColor.white.setFill(); bounds.fill()
        NSColor(calibratedWhite: 0.84, alpha: 1).setFill()
        for y in stride(from: 0, to: Int(bounds.height), by: 12) {
            for x in stride(from: 0, to: Int(bounds.width), by: 12) where (x / 12 + y / 12) % 2 == 0 {
                NSRect(x: x, y: y, width: min(12, Int(bounds.width) - x), height: min(12, Int(bounds.height) - y)).fill()
            }
        }
        guard let image, image.size.width > 0, image.size.height > 0 else { return }
        let scale = min(bounds.width / image.size.width, bounds.height / image.size.height)
        let size = NSSize(width: image.size.width * scale, height: image.size.height * scale)
        image.draw(in: NSRect(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2, width: size.width, height: size.height))
    }
}
