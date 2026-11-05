#if canImport(AppKit) && !HANX_PORTABLE
import Foundation
#if canImport(FoundationXML)
import FoundationXML
#endif
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import PDFKit

/// Recover page layout and editable text with visual fragments for artwork.
enum PDFReader {
    static func isPDF(_ data: Data) -> Bool {
        data.prefix(1024).range(of: Data("%PDF-".utf8)) != nil
    }

    static func read(_ data: Data) throws -> UDocument {
        guard isPDF(data) else { throw FormatError.invalid("Cannot read PDF document") }
        return try PDFLayoutReader.read(data)
    }
}
#endif
