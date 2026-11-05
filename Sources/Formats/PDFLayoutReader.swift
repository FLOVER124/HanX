import Foundation
#if canImport(AppKit) && !HANX_PORTABLE
import AppKit
#endif

/// The shared PDF layout worker recovers text lines, columns and visual fragments.
/// Equations without Unicode mappings remain cropped images, never private-use text.
enum PDFLayoutReader {
    /// Source text remains available to agents even where a chart or table is
    /// represented visually in the editable model. Do not infer text from crops.
    static func text(at url: URL) throws -> String {
        let result=try PDFEditingBridge.call(["action":"text","input":url.path])
        return result["text"] as? String ?? ""
    }
    static func read(_ data: Data) throws -> UDocument {
        let path=FileManager.default.temporaryDirectory.appendingPathComponent("hanx-layout-"+UUID().uuidString+".pdf")
        try data.write(to:path);defer { try? FileManager.default.removeItem(at:path) }
        let result=try PDFEditingBridge.call(["action":"layout","input":path.path])
        guard let pages=result["pages"] as? [[String:Any]], !pages.isEmpty else { throw FormatError.invalid("PDF 페이지 배치를 읽지 못했습니다.") }
        let doc=UDocument();doc.source = .docx
        let family=result["fontFamily"] as? String ?? "Arial"
        doc.warnings=["PDF의 본문과 단 구성을 복원했습니다. 수식과 도표는 모양을 보존하는 이미지로 가져옵니다. 스캔 페이지의 본문 편집에는 OCR이 필요합니다."]
        func number(_ value:Any?,_ fallback:Double=0)->Double {(value as? NSNumber)?.doubleValue ?? fallback}
        func paragraphs(_ blocks:[[String:Any]])->[Block] {
            blocks.map { block in
                var paragraph=Paragraph();paragraph.markProps.size=1
                paragraph.props.alignment = .left
                paragraph.props.indentLeft=number(block["left"])
                paragraph.props.spaceBefore=number(block["before"])
                paragraph.props.lineSpacing = .exact(max(1,number(block["height"],12)))
                for run in block["runs"] as? [[String:Any]] ?? [] {
                    if let encoded=run["image"] as? String,let image=Data(base64Encoded:encoded) {
                        let key="pdf-layout-\(doc.images.count).png";doc.images[key]=ImageData(name:key,data:image)
                        paragraph.inlines.append(.image(id:key,width:number(run["width"],10),height:number(run["height"],10)))
                    } else if let text=run["text"] as? String {
                        var props=CharProps();props.fontName=family;props.eastAsianFontName=family;props.size=number(run["size"],10);props.color=RGB(hex:run["color"] as? String ?? "000000") ?? .black
                        if let desired=run["width"] as? Double,desired>0,!text.isEmpty {
                            #if canImport(AppKit) && !HANX_PORTABLE
                            let measured=Double(AttributedBridge.text(text,props).size().width)
                            #else
                            let measured=text.unicodeScalars.reduce(0.0){$0+($1.value>0x2e80 ? 1:0.5)}*props.size
                            #endif
                            if measured>0 {props.widthRatio=max(35,min(200,desired/measured*100))}
                        }
                        paragraph.inlines.append(.text(text,props));paragraph.markProps=props
                    }
                }
                return .paragraph(paragraph)
            }
        }
        func cellTopInset(_ blocks:inout [Block])->Double {
            // Layout engines may ignore space-before on a cell's first line.
            // Cell padding preserves that source offset across both writers.
            guard case .paragraph(var first)?=blocks.first else {return 0}
            let inset=first.props.spaceBefore;first.props.spaceBefore=0;blocks[0] = .paragraph(first)
            return inset
        }
        let topMargin=pages.map {number($0["top"])}.min() ?? 0
        for (pageIndex,page) in pages.enumerated() {
            var section=Section();section.page=PageSetup(width:number(page["width"],595),height:number(page["height"],842),marginTop:topMargin,marginBottom:0,marginLeft:number(page["left"]),marginRight:number(page["right"]),header:0,footer:0)
            section.blocks=paragraphs(page["header"] as? [[String:Any]] ?? [])
            let columns=page["columns"] as? [[String:Any]] ?? []
            if columns.count==1 { section.blocks += paragraphs(columns[0]["blocks"] as? [[String:Any]] ?? []) }
            else if !columns.isEmpty {
                var table=Table();table.borderWidth=0
                var row:[TableCell]=[]
                for column in columns {
                    var cell=TableCell();cell.blocks=paragraphs(column["blocks"] as? [[String:Any]] ?? []);cell.width=number(column["width"],200);cell.padding=Insets(left:0,right:0,top:cellTopInset(&cell.blocks),bottom:0);cell.borders = .none;row.append(cell);table.columnWidths.append(cell.width!)
                }
                table.rows=[row];section.blocks.append(.table(table))
            }
            section.blocks += paragraphs(page["footer"] as? [[String:Any]] ?? [])
            let offset=max(0,number(page["top"])-topMargin)
            if offset>0,case .paragraph(var first)?=section.blocks.first {first.props.spaceBefore += offset;section.blocks[0] = .paragraph(first)}
            if let value=page["background"] as? String,let color=RGB(hex:value) {
                var cell=TableCell();cell.blocks=section.blocks;cell.background=color
                cell.width=section.page.contentWidth;cell.height=max(1,section.page.contentHeight-2)
                cell.padding=Insets(left:0,right:0,top:cellTopInset(&cell.blocks),bottom:0);cell.borders = .none
                var table=Table();table.borderWidth=0;table.columnWidths=[section.page.contentWidth];table.rows=[[cell]]
                section.blocks=[.table(table)]
            }
            if page["textFree"] as? Bool == true {doc.warnings.append("PDF \(pageIndex+1) 페이지는 이미지로 보존했습니다. 본문 편집에는 OCR이 필요합니다.")}
            doc.sections.append(section)
        }
        return doc
    }
}
