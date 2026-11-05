#if canImport(Vision) && canImport(AppKit) && !HANX_PORTABLE
import AppKit
import PDFKit
import Vision

enum PDFLocalOCR {
    static func recognize(_ request: [String:Any]) throws -> [String:Any] {
        guard let path = request["input"] as? String, let doc = PDFDocument(url: URL(fileURLWithPath:path)), !doc.isLocked, doc.allowsCopying else {
            throw PDFEditingBridge.Failure(message:"PDF를 읽을 수 없거나 내용 추출이 허용되지 않습니다.")
        }
        let index = request["page"] as? Int ?? 0
        guard index >= 0, let page = doc.page(at:index) else { throw PDFEditingBridge.Failure(message:"페이지 번호를 확인하세요.") }
        let rect = page.bounds(for:.cropBox)
        guard rect.width.isFinite, rect.height.isFinite, rect.width > 0, rect.height > 0 else { throw PDFEditingBridge.Failure(message:"PDF 페이지 크기가 올바르지 않습니다.") }
        let size = NSSize(width:rect.width*min(3,4000/max(rect.width,rect.height)),height:rect.height*min(3,4000/max(rect.width,rect.height)))
        let image = page.thumbnail(of:size,for:.cropBox)
        guard let cg = image.cgImage(forProposedRect:nil,context:nil,hints:nil) else { throw PDFEditingBridge.Failure(message:"OCR 페이지를 준비하지 못했습니다.") }
        let language = request["language"] as? String ?? "kor+eng"
        let mapping = ["kor":"ko-KR","eng":"en-US","jpn":"ja-JP"]
        let names = language.split(separator:"+").map(String.init)
        guard !names.isEmpty, names.allSatisfy({mapping[$0] != nil}) else { throw PDFEditingBridge.Failure(message:"OCR 언어가 지원 범위를 벗어났습니다.") }
        let recognition = VNRecognizeTextRequest()
        recognition.recognitionLevel = .accurate
        recognition.recognitionLanguages = names.compactMap { mapping[$0] }
        recognition.usesLanguageCorrection = true
        try VNImageRequestHandler(cgImage:cg,options:[:]).perform([recognition])
        let lines = (recognition.results ?? []).compactMap { observation -> [String:Any]? in
            guard let text = observation.topCandidates(1).first else { return nil }
            let b = observation.boundingBox
            return ["text":text.string,"confidence":Double(text.confidence)*100,"viewBounds":[b.minX,1-b.maxY,b.maxX,1-b.minY]]
        }
        return ["text":lines.compactMap { $0["text"] as? String }.joined(separator:"\n"),"words":lines,"language":language,"engine":"Vision","granularity":"line"]
    }
}
#endif
