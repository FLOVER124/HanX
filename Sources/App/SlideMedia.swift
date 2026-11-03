import AppKit
import AVFoundation
import AVKit
import ImageIO
import UniformTypeIdentifiers

enum SlideMedia {
    static let videoLimit = 16 * 1024 * 1024
    private static let movieExtensions = ["mp4", "m4v"]

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
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        guard try file.seekToEnd() <= UInt64(videoLimit) else { throw error("파일 한 개의 최대 크기는 16 MiB입니다.") }
        try file.seek(toOffset: 0)
        let data = try file.read(upToCount: videoLimit + 1) ?? Data()
        guard !data.isEmpty, data.count <= videoLimit else { throw error("16 MiB 이하의 파일을 선택하세요.") }
        if movieExtensions.contains(url.pathExtension.lowercased()) {
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
        guard let source = CGImageSourceCreateWithData(data as CFData,nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any],
              let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
              let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue,
              width > 0, height > 0, width * height <= 16_000_000,
              let image = CGImageSourceCreateThumbnailAtIndex(source,0,[
                kCGImageSourceCreateThumbnailFromImageAlways:true,
                kCGImageSourceCreateThumbnailWithTransform:true,
                kCGImageSourceThumbnailMaxPixelSize:max(width,height)
              ] as CFDictionary),
              let png = NSBitmapImageRep(cgImage:image).representation(using:.png,properties:[:]),
              png.count <= videoLimit else { throw error("16 MiB, 1,600만 화소 이하의 PNG 또는 JPEG 그림을 선택하세요.") }
        return Imported(name:name,size:CGSize(width:image.width,height:image.height),poster:ImageData(name:"image.png",data:png),video:nil)
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
