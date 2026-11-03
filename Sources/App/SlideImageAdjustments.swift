import AppKit

final class SlideImageAdjustments: NSWindowController {
    private let bitmap: SolidBackgroundRemoval.Bitmap
    private let thumbnail: SolidBackgroundRemoval.Bitmap
    private let preview = AdjustmentPreview(frame: NSRect(x: 20, y: 230, width: 640, height: 340))
    private var sliders: [NSSlider] = []
    private var values: [NSTextField] = []
    private let filter = NSPopUpButton()
    private let comparison = NSSegmentedControl(labels: ["보정 결과", "원본"], trackingMode: .selectOne, target: nil, action: nil)
    private let apply = NSButton(title: "적용", target: nil, action: nil)
    private let reset = NSButton(title: "초기화", target: nil, action: nil)
    private let progress = NSProgressIndicator()
    private let worker = DispatchQueue(label: "hanx.image-adjustments", qos: .userInitiated)
    private let completion: (Data?) -> Void
    private var revision = 0
    private var closed = false
    private var working = false
    private var output: NSImage?
    private let defaults: [Double] = [0, 0, 0, 100, 0, 0, 0, 0]

    init(source: Data, completion: @escaping (Data?) -> Void) throws {
        self.completion = completion
        bitmap = try SolidBackgroundRemoval.decode(source)
        thumbnail = try SolidBackgroundRemoval.decode(source, maximumDimension: 800)
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 680, height: 620), styleMask: [.titled], backing: .buffered, defer: false)
        panel.title = "그림 보정"
        super.init(window: panel)
        guard let view = panel.contentView else { return }
        view.addSubview(preview)
        let names = ["투명도", "밝기", "대비", "채도", "가로 기울이기", "세로 기울이기", "가로 원근", "세로 원근"]
        let ranges: [(Double, Double)] = [(0,100),(-100,100),(-100,100),(0,200),(-30,30),(-30,30),(-75,75),(-75,75)]
        for i in 0..<names.count {
            let x = 20 + (i % 2) * 330, y = 191 - (i / 2) * 44
            let label = NSTextField(labelWithString: names[i]); label.frame = NSRect(x: x, y: y + 18, width: 180, height: 20); view.addSubview(label)
            let slider = NSSlider(value: defaults[i], minValue: ranges[i].0, maxValue: ranges[i].1, target: self, action: #selector(changed))
            slider.frame = NSRect(x: x, y: y, width: 240, height: 22); slider.isContinuous = false; slider.setAccessibilityLabel(names[i]); view.addSubview(slider); sliders.append(slider)
            let value = NSTextField(labelWithString: ""); value.frame = NSRect(x: x + 248, y: y, width: 65, height: 22); view.addSubview(value); values.append(value)
        }
        filter.addItems(withTitles: ["원래 색상", "흑백", "세피아", "색상 반전"]); filter.frame = NSRect(x: 20, y: 580, width: 170, height: 28)
        filter.target = self; filter.action = #selector(changed); filter.setAccessibilityLabel("그림 필터"); view.addSubview(filter)
        comparison.frame = NSRect(x: 470, y: 580, width: 190, height: 28); comparison.selectedSegment = 0
        comparison.target = self; comparison.action = #selector(showComparison); view.addSubview(comparison)
        reset.frame = NSRect(x: 20, y: 18, width: 88, height: 30); reset.bezelStyle = .rounded; reset.target = self; reset.action = #selector(resetValues); view.addSubview(reset)
        let cancel = NSButton(title: "취소", target: self, action: #selector(cancelEditing)); cancel.frame = NSRect(x: 480, y: 18, width: 88, height: 30); cancel.bezelStyle = .rounded; cancel.keyEquivalent = "\u{1b}"; view.addSubview(cancel)
        apply.frame = NSRect(x: 572, y: 18, width: 88, height: 30); apply.bezelStyle = .rounded; apply.target = self; apply.action = #selector(applyResult); apply.keyEquivalent = "\r"; view.addSubview(apply)
        progress.frame = NSRect(x: 120, y: 24, width: 20, height: 20); progress.style = .spinning; progress.isDisplayedWhenStopped = false; view.addSubview(progress)
        changed()
    }
    required init?(coder: NSCoder) { fatalError() }
    func present(on parent: NSWindow) { if let window { parent.beginSheet(window) } }
    private var settings: ImageAdjustments.Settings {
        var s = ImageAdjustments.Settings()
        s.opacity = 100 - sliders[0].doubleValue; s.brightness = sliders[1].doubleValue; s.contrast = sliders[2].doubleValue
        s.saturation = sliders[3].doubleValue; s.skewX = sliders[4].doubleValue; s.skewY = sliders[5].doubleValue
        s.perspectiveX = sliders[6].doubleValue; s.perspectiveY = sliders[7].doubleValue
        s.filter = ImageAdjustments.Filter.allCases[max(0, filter.indexOfSelectedItem)]
        return s
    }
    @objc private func resetValues() {
        for i in sliders.indices { sliders[i].doubleValue = defaults[i] }
        filter.selectItem(at: 0); changed()
    }
    @objc private func changed() {
        guard !working else { return }
        for i in sliders.indices { values[i].stringValue = "\(Int(sliders[i].doubleValue.rounded()))\((4...5).contains(i) ? "°" : "%")" }
        revision += 1; let token = revision, source = thumbnail, options = settings
        apply.isEnabled = false; progress.startAnimation(nil)
        worker.async { [weak self] in
            let result = Result { () throws -> CGImage in
                let pixels = try ImageAdjustments.apply(source.rgba, width: source.width, height: source.height, settings: options)
                return try SolidBackgroundRemoval.Bitmap(rgba: pixels, width: source.width, height: source.height).cgImage()
            }
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.closed, token == self.revision else { return }
                self.progress.stopAnimation(nil)
                switch result {
                case .success(let image): self.output = NSImage(cgImage: image, size: .zero); self.apply.isEnabled = true; self.showComparison()
                case .failure(let error): self.showError(error)
                }
            }
        }
    }
    @objc private func showComparison() {
        if comparison.selectedSegment == 1, let image = try? thumbnail.cgImage() { preview.image = NSImage(cgImage: image, size: .zero) }
        else { preview.image = output }
    }
    @objc private func applyResult() {
        guard !working, apply.isEnabled else { return }
        working = true; revision += 1; let token = revision, source = bitmap, options = settings
        apply.isEnabled = false; filter.isEnabled = false; reset.isEnabled = false; sliders.forEach { $0.isEnabled = false }; progress.startAnimation(nil)
        worker.async { [weak self] in
            let result = Result { () throws -> Data in
                let pixels = try ImageAdjustments.apply(source.rgba, width: source.width, height: source.height, settings: options)
                return try SolidBackgroundRemoval.Bitmap(rgba: pixels, width: source.width, height: source.height).png()
            }
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.closed, token == self.revision else { return }
                self.progress.stopAnimation(nil); self.working = false
                switch result {
                case .success(let png): self.finish(png)
                case .failure(let error):
                    self.apply.isEnabled = true; self.filter.isEnabled = true; self.reset.isEnabled = true; self.sliders.forEach { $0.isEnabled = true }; self.showError(error)
                }
            }
        }
    }
    private func showError(_ error: Error) {
        guard let window else { return }; let alert = NSAlert(); alert.messageText = "그림을 보정할 수 없습니다"; alert.informativeText = error.localizedDescription; alert.beginSheetModal(for: window)
    }
    @objc private func cancelEditing() { finish(nil) }
    private func finish(_ data: Data?) {
        guard !closed else { return }; closed = true; revision += 1
        if let window { window.sheetParent?.endSheet(window); window.orderOut(nil) }
        completion(data)
    }
}

private final class AdjustmentPreview: NSView {
    var image: NSImage? { didSet { needsDisplay = true } }
    override func draw(_ dirtyRect: NSRect) {
        NSColor.white.setFill(); bounds.fill(); NSColor(calibratedWhite: 0.84, alpha: 1).setFill()
        for y in stride(from: 0, to: Int(bounds.height), by: 12) { for x in stride(from: 0, to: Int(bounds.width), by: 12) where (x / 12 + y / 12) % 2 == 0 { NSRect(x: x, y: y, width: 12, height: 12).fill() } }
        guard let image, image.size.width > 0, image.size.height > 0 else { return }
        let scale = min(bounds.width / image.size.width, bounds.height / image.size.height)
        let size = NSSize(width: image.size.width * scale, height: image.size.height * scale)
        image.draw(in: NSRect(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2, width: size.width, height: size.height))
    }
}
