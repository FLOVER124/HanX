import AppKit
import ImageIO

var failures = 0
func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    if condition() { print("PASS \(message)") } else { failures += 1; print("FAIL \(message)") }
}
let white:[UInt8] = [255,255,255,255], black:[UInt8] = [0,0,0,255]
// A black ring encloses a white center. Global color replacement would destroy it.
var pixels = Array(repeating:white,count:25)
for i in [6,7,8,11,13,16,17,18] { pixels[i]=black }
let source = pixels.flatMap { $0 }
let result = try SolidBackgroundRemoval.remove(rgba:source,width:5,height:5,color:(255,255,255),tolerance:0)
check(result[3] == 0 && result[24*4+3] == 0, "matching edge background becomes transparent")
check(result[12*4+3] == 255, "enclosed white subject detail remains opaque")
check(result[6*4+3] == 255, "nonmatching subject remains opaque")
check(source[3] == 255, "source pixel buffer is unchanged")
let near:[UInt8] = [245,245,245,255, 0,0,0,255]
let narrow = try SolidBackgroundRemoval.remove(rgba:near,width:2,height:1,color:(255,255,255),tolerance:5)
let wide = try SolidBackgroundRemoval.remove(rgba:near,width:2,height:1,color:(255,255,255),tolerance:15)
check(narrow[3] == 255 && wide[3] == 0 && wide[7] == 255, "tolerance changes only matching pixels")
let transparent:[UInt8] = [0,0,0,0, 255,255,255,255, 0,0,0,255]
let through = try SolidBackgroundRemoval.remove(rgba:transparent,width:3,height:1,color:(255,255,255),tolerance:0)
check(through[3] == 0 && through[7] == 0 && through[11] == 255, "existing transparency and subject opacity survive")
do { _ = try SolidBackgroundRemoval.remove(rgba:[0],width:1,height:1,color:(255,255,255),tolerance:10); check(false,"invalid pixel buffers rejected") } catch { check(true,"invalid pixel buffers rejected") }
// Refine a mask, never the destructively modified pixels: Keep can restore RGB/alpha.
let original = SolidBackgroundRemoval.Bitmap(rgba: [200,100,50,128, 20,40,60,255, 1,2,3,0], width: 3, height: 1)
var mask = ImageBackgroundMask(values: [128,0,255], width: 3, height: 1)
let masked = try mask.applying(to: original)
check(masked.rgba[3] == 64 && masked.rgba[7] == 0 && masked.rgba[11] == 0, "mask multiplies original alpha and preserves transparent pixels")
mask.stroke(from: CGPoint(x: 1.5,y: 0.5), to: CGPoint(x: 1.5,y: 0.5), radius: 0.6, keep: true)
let restored = try mask.applying(to: original)
check(Array(restored.rgba[4..<8]) == Array(original.rgba[4..<8]), "keep brush restores original color and alpha")
var line = ImageBackgroundMask(values: [UInt8](repeating:255,count:15), width:5,height:3)
line.stroke(from: CGPoint(x:0.5,y:0.5),to:CGPoint(x:4.5,y:0.5),radius:0.51,keep:false)
check(Array(line.values[0..<5]) == [0,0,0,0,0] && line.values[10] == 255, "continuous brush fills drag gaps in top-left coordinates without vertical inversion")
line.stroke(from: CGPoint(x:-1,y:-1),to:CGPoint(x:0.5,y:0.5),radius:1,keep:true)
check(line.values[0] == 255, "edge strokes clip safely")
do {
    _ = try ImageBackgroundMask(values:[255],width:1,height:1).applying(to: original)
    check(false,"mismatched mask dimensions rejected")
} catch { check(true,"mismatched mask dimensions rejected") }
let decoded = try SolidBackgroundRemoval.decode(original.png())
check(decoded.width == 3 && decoded.height == 1 && decoded.rgba[3] == 128, "original full-resolution PNG decode preserves extent and alpha")
let previewMask = ImageBackgroundMask(values: [0,255,255], width: 3, height: 1)
let previewPixels = try previewMask.preview(of: original, maximumDimension: 3)
let finalPreviewPixels = try previewMask.applying(to: original)
check(previewPixels.rgba == finalPreviewPixels.rgba, "preview at native size matches final compositing")
// TIFF carries an explicit EXIF orientation; normalized pixels must rotate once.
let orientedBytes = NSMutableData()
let orientedDestination = CGImageDestinationCreateWithData(orientedBytes, "public.tiff" as CFString, 1, nil)!
let orientationFixture = SolidBackgroundRemoval.Bitmap(rgba: [255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,0,255, 255,0,255,255, 0,255,255,255], width: 3, height: 2)
CGImageDestinationAddImage(orientedDestination, try orientationFixture.cgImage(), [kCGImagePropertyOrientation: 6] as CFDictionary)
check(CGImageDestinationFinalize(orientedDestination), "EXIF fixture encodes")
let oriented = try SolidBackgroundRemoval.decode(orientedBytes as Data)
check(oriented.width == 2 && oriented.height == 3, "EXIF rotation normalizes full-resolution dimensions")
check(Array(oriented.rgba[0..<4]) == [255,255,0,255], "EXIF rotation maps bottom-left source to top-left normalized pixel")
let edgeMask = ImageBackgroundMask(values: [0,255,0], width: 3, height: 1)
check(edgeMask.feathered(radius: 1).values == [85,85,85], "feather averages boundaries using clamped edge samples")
check(edgeMask.values == [0,255,0] && edgeMask.feathered(radius: 0).values == edgeMask.values, "feather is nondestructive and zero restores exact mask")
let solidMask = ImageBackgroundMask(values: [255,255,255,255], width: 2, height: 2)
check(solidMask.feathered(radius: 20).values == solidMask.values, "large radius preserves uniform mask on tiny images")
var soft = ImageBackgroundMask(values: [255,255,255], width: 3, height: 1)
soft.stroke(from: CGPoint(x: 0.5,y: 0.5), to: CGPoint(x: 0.5,y: 0.5), radius: 2, keep: false, hardness: 0)
check(soft.values == [0,128,255], "soft brush has opaque center and proportional falloff")
soft.stroke(from: CGPoint(x: 0.5,y: 0.5), to: CGPoint(x: 0.5,y: 0.5), radius: 2, keep: true, hardness: 0)
check(soft.values == [255,192,255], "soft keep brush restores mask progressively")
let featherApplied = try edgeMask.feathered(radius: 1).applying(to: original)
check(featherApplied.rgba[11] == 0, "feather never resurrects originally transparent pixels")
exit(failures == 0 ? 0 : 1)
