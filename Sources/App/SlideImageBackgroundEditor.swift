import AppKit

/// A transient sheet: all instructions and limitations stay out of the ribbon
/// and document canvas. Only Apply creates an edit in the document.
final class SlideImageBackgroundEditor: NSWindowController {
    private let source: Data
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
        self.source = source; self.completion = completion
        previewBitmap = try SolidBackgroundRemoval.decode(source, maximumDimension: 900)
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 640, height: 548), styleMask: [.titled], backing: .buffered, defer: false)
        panel.title = "단색 배경 제거"
        super.init(window: panel)
        guard let view = panel.contentView else { return }
        let hint = NSTextField(wrappingLabelWithString: "그림 가장자리와 이어진 비슷한 색을 투명하게 만듭니다. 복잡한 사진의 피사체를 자동으로 구분하지는 않습니다. 배경색과 허용 범위를 조절한 뒤 결과를 확인하세요.")
        hint.frame = NSRect(x: 20, y: 474, width: 600, height: 54); hint.font = .systemFont(ofSize: 12)
        view.addSubview(hint); view.addSubview(preview)
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
        updatePreview()
    }
    required init?(coder: NSCoder) { fatalError() }
    func present(on parent: NSWindow) { if let window { parent.beginSheet(window) } }
    private var rgb: (UInt8, UInt8, UInt8) {
        let c = color.color.usingColorSpace(.sRGB) ?? .white
        return (UInt8((c.redComponent * 255).rounded()), UInt8((c.greenComponent * 255).rounded()), UInt8((c.blueComponent * 255).rounded()))
    }
    @objc private func settingsChanged() { amount.stringValue = String(Int(tolerance.doubleValue)); updatePreview() }
    private func updatePreview() {
        revision += 1
        let token = revision, bitmap = previewBitmap, color = rgb, tolerance = tolerance.doubleValue / 100 * 255
        apply.isEnabled = false; progress.startAnimation(nil)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result = Result { try bitmap.removing(color: color, tolerance: tolerance).cgImage() }
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.closed, token == self.revision else { return }
                self.progress.stopAnimation(nil)
                switch result {
                case .success(let image):
                    self.output = NSImage(cgImage: image, size: .zero); self.apply.isEnabled = true; self.showComparison()
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
        guard !working else { return }
        working = true; revision += 1
        apply.isEnabled = false; tolerance.isEnabled = false; color.isEnabled = false
        progress.startAnimation(nil)
        let data = source, color = rgb, tolerance = tolerance.doubleValue / 100 * 255
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result = Result { try SolidBackgroundRemoval.decode(data).removing(color: color, tolerance: tolerance).png() }
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.closed else { return }
                self.working = false; self.progress.stopAnimation(nil)
                switch result {
                case .success(let data): self.finish(data)
                case .failure(let error):
                    self.apply.isEnabled = true; self.tolerance.isEnabled = true; self.color.isEnabled = true
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
        guard !closed else { return }; closed = true; revision += 1; color.deactivate()
        if let window { window.sheetParent?.endSheet(window); window.orderOut(nil) }
        completion(data)
    }
}

private final class ImageTransparencyPreview: NSView {
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
