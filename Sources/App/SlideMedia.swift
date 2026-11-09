import AppKit
import AVFoundation
import AVKit
import ImageIO
import UniformTypeIdentifiers

enum SlideMedia {
    static let videoLimit = 16 * 1024 * 1024
    /// Largest image file accepted for decoding; the stored PNG stays within `videoLimit`.
    static let imageFileLimit = 128 * 1024 * 1024
    static let pixelLimit = 16_000_000.0
    static let unreadableImage = "그림을 읽을 수 없습니다. PNG, JPEG, WebP, HEIC, GIF, BMP, TIFF, SVG 형식을 사용하세요."
    static let movieExtensions = ["mp4", "m4v"]

    struct Imported {
        let name: String
        let size: CGSize
        let poster: ImageData
        let video: ImageData?
    }

    static func accepts(_ url: URL) -> Bool {
        guard url.isFileURL else { return false }
        return movieExtensions.contains(url.pathExtension.lowercased()) || UTType(filenameExtension:url.pathExtension)?.conforms(to:.image) == true
    }

    private static func error(_ message: String) -> NSError {
        NSError(domain: "HanX.SlideMedia", code: 1, userInfo: [NSLocalizedDescriptionKey:message])
    }

    // AVFoundation must never follow references from an embedded movie to other files or hosts.
    private static func asset(_ url: URL) -> AVURLAsset {
        AVURLAsset(url: url, options: [AVURLAssetReferenceRestrictionsKey:0xffff])
    }

    private static func movieURL(_ data: Data) throws -> URL {
        guard data.count >= 12, data[4..<8].elementsEqual("ftyp".utf8) else { throw error("MP4 또는 M4V 동영상이 아닙니다.") }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: false, attributes: [.posixPermissions:0o700])
        let url = dir.appendingPathComponent("embedded.mp4")
        do { try data.write(to: url, options: .atomic); return url }
        catch { try? FileManager.default.removeItem(at: dir); throw error }
    }

    static func read(_ url: URL) throws -> Imported {
        guard accepts(url), try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true else {
            throw error("로컬 그림 또는 MP4/M4V 파일을 선택하세요.")
        }
        let name = url.lastPathComponent
        let isMovie = movieExtensions.contains(url.pathExtension.lowercased())
        let limit = isMovie ? videoLimit : imageFileLimit
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        guard try file.seekToEnd() <= UInt64(limit) else { throw error(isMovie ? "동영상 한 개의 최대 크기는 16 MiB입니다." : "그림 파일은 128 MiB 이하만 넣을 수 있습니다.") }
        try file.seek(toOffset: 0)
        let data = try file.read(upToCount: limit + 1) ?? Data()
        guard !data.isEmpty, data.count <= limit else { throw error("파일을 읽을 수 없습니다.") }
        if isMovie {
            let movie = try movieURL(data)
            defer { try? FileManager.default.removeItem(at: movie.deletingLastPathComponent()) }
            let generator = AVAssetImageGenerator(asset: asset(movie))
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 1280, height: 1280)
            if let frame = try? generator.copyCGImage(at: .zero, actualTime: nil),
               let poster = NSBitmapImageRep(cgImage: frame).representation(using: .png, properties: [:]) {
                return Imported(name: name, size: CGSize(width: frame.width, height: frame.height), poster: ImageData(name: "poster.png", data: poster), video: ImageData(name: name, data: data))
            }
            return Imported(name: name, size: CGSize(width:480,height:270), poster: SlideMovie.poster, video: ImageData(name:name,data:data))
        }
        let image = try normalizedImage(data, name: name)
        return Imported(name:name,size:image.size,poster:ImageData(name:"image.png",data:image.data),video:nil)
    }

    /// Reads an image file and converts it with `normalizedImage`.
    static func imageFile(_ url: URL) throws -> (data: Data, size: CGSize) {
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size > 0, size <= imageFileLimit else { throw error("그림 파일은 128 MiB 이하만 넣을 수 있습니다.") }
        return try normalizedImage(Data(contentsOf: url), name: url.lastPathComponent)
    }

    /// Decodes any image macOS can read (PNG, JPEG, HEIC, WebP, GIF, BMP, TIFF, AVIF, ICO, and
    /// SVG/PDF/EPS through NSImage) to PNG. Images above 16 million pixels or a 16 MiB PNG
    /// are scaled down instead of being rejected.
    static func normalizedImage(_ data: Data, name: String) throws -> (data: Data, size: CGSize) {
        var image: CGImage?
        if let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) > 0,
           let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
           let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
           let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue, width > 0, height > 0 {
            let side = max(width, height) * min(1, (pixelLimit / (width * height)).squareRoot())
            image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: max(1, Int(side.rounded()))
            ] as CFDictionary)
        }
        if image == nil, let vector = NSImage(data: data), vector.size.width > 0, vector.size.height > 0 {
            // Vector formats have no pixel size: draw the long side at 2048 px.
            let w = Double(vector.size.width), h = Double(vector.size.height)
            let scale = min(2048 / max(w, h), (pixelLimit / (w * h)).squareRoot())
            let width = max(1, Int((w * scale).rounded())), height = max(1, Int((h * scale).rounded()))
            image = draw(width, height) { context in
                NSGraphicsContext.saveGraphicsState()
                NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
                vector.draw(in: NSRect(x: 0, y: 0, width: width, height: height))
                NSGraphicsContext.restoreGraphicsState()
            }
        }
        guard var current = image else { throw error("\(name): \(unreadableImage)") }
        for _ in 0..<10 {
            if let png = NSBitmapImageRep(cgImage: current).representation(using: .png, properties: [:]), png.count <= videoLimit {
                return (png, CGSize(width: current.width, height: current.height))
            }
            let width = Int(Double(current.width) * 0.8), height = Int(Double(current.height) * 0.8), source = current
            guard let smaller = draw(width, height, { context in
                context.interpolationQuality = .high
                context.draw(source, in: CGRect(x: 0, y: 0, width: width, height: height))
            }) else { break }
            current = smaller
        }
        throw error("\(name): 그림을 16 MiB 이하로 줄이지 못했습니다.")
    }

    private static func draw(_ width: Int, _ height: Int, _ body: (CGContext) -> Void) -> CGImage? {
        guard width > 0, height > 0, let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        body(context)
        return context.makeImage()
    }

    static func play(_ media: ImageData?, in window: NSWindow, completion: @escaping () -> Void = {}) {
        do {
            guard let media else { throw error("포함된 동영상 데이터를 찾을 수 없습니다.") }
            let url = try movieURL(media.data)
            let item = AVPlayerItem(asset: asset(url))
            let player = AVPlayer(playerItem: item)
            let view = AVPlayerView(frame: CGRect(x: 0, y: 0, width: min(640,window.frame.width*0.75), height: min(360,window.frame.height*0.6)))
            view.controlsStyle = .floating
            view.player = player
            let alert = NSAlert()
            alert.messageText = media.name
            alert.accessoryView = view
            alert.addButton(withTitle: "닫기")
            let observation = item.observe(\.status, options: [.new]) { item, _ in
                guard item.status == .failed else { return }
                DispatchQueue.main.async { alert.informativeText = item.error?.localizedDescription ?? "이 동영상을 재생할 수 없습니다." }
            }
            alert.beginSheetModal(for: window) { _ in
                observation.invalidate(); player.pause(); view.player = nil; player.replaceCurrentItem(with: nil)
                try? FileManager.default.removeItem(at: url.deletingLastPathComponent()); completion()
            }
            player.play()
        } catch {
            let alert = NSAlert(error: error)
            alert.beginSheetModal(for: window) { _ in completion() }
        }
    }
}
