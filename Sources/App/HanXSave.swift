import AppKit
import UniformTypeIdentifiers

extension NSDocument {
    /// First Save of an imported file proposes a local sibling and preserves the import.
    func saveImportedAsHanX() {
        guard let original = fileURL else { return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [UTType(HanXFile.type) ?? .data]
        panel.directoryURL = original.deletingLastPathComponent()
        panel.nameFieldStringValue = original.deletingPathExtension().appendingPathExtension("hanx").lastPathComponent
        panel.isExtensionHidden = false
        guard let window = windowForSheet else { return }
        panel.beginSheetModal(for: window) { result in
            guard result == .OK, let url = panel.url else { return }
            self.save(to: url, ofType: HanXFile.type, for: .saveAsOperation) { error in
                if let error { self.presentError(error) }
            }
        }
    }
}
