import Foundation
var failures = 0
func check(_ result: Bool, _ name: String) { if result { print("PASS \(name)") } else { print("FAIL \(name)"); failures += 1 } }
let pixels: [UInt8] = [20,40,60,128, 255,0,0,255, 0,0,255,0, 0,255,0,64]
var s = ImageAdjustments.Settings()
check(try ImageAdjustments.apply(pixels, width: 2, height: 2, settings: s) == pixels, "identity preserves every channel including original alpha")
s.opacity = 50
let transparent = try ImageAdjustments.apply(pixels, width: 2, height: 2, settings: s)
check(transparent[3] == 64 && transparent[7] == 128 && transparent[11] == 0 && transparent[15] == 32, "opacity multiplies existing alpha")
s = .init(); s.filter = .grayscale
let gray = try ImageAdjustments.apply(pixels, width: 2, height: 2, settings: s)
check(gray[4] == 54 && gray[5] == 54 && gray[6] == 54 && gray[7] == 255, "grayscale uses Rec709 luminance")
s.filter = .sepia
let sepia = try ImageAdjustments.apply(pixels, width: 2, height: 2, settings: s)
check(Array(sepia[4...7]) == [100,89,69,255], "sepia matrix keeps alpha")
s.filter = .invert
check(Array(try ImageAdjustments.apply(pixels, width: 2, height: 2, settings: s)[0...3]) == [235,215,195,128], "invert preserves alpha")
s = .init(); s.contrast = -100
let flat = try ImageAdjustments.apply(pixels, width: 2, height: 2, settings: s)
check(Array(flat[0...3]) == [128,128,128,128], "minimum contrast produces midpoint")
s = .init(); s.brightness = 100
check(Array(try ImageAdjustments.apply(pixels, width: 2, height: 2, settings: s)[0...3]) == [255,255,255,128], "brightness clamps safely")
s = .init(); s.saturation = 0
check(try ImageAdjustments.apply(pixels, width: 2, height: 2, settings: s) == gray, "zero saturation matches grayscale")
let solid = [UInt8](repeating: 255, count: 8 * 8 * 4)
s = .init(); s.skewX = 30
let skew = try ImageAdjustments.apply(solid, width: 8, height: 8, settings: s)
check(skew.count == solid.count && skew[3] == 255 && skew[7 * 4 + 3] == 0 && skew[(4 * 8 + 4) * 4 + 3] == 255, "skew maps center and transparent exterior with fixed dimensions")
s.skewY = 30
check(try ImageAdjustments.apply(solid, width: 8, height: 8, settings: s).count == solid.count, "combined skew remains invertible")
s = .init(); s.perspectiveX = 75
let tapered = try ImageAdjustments.apply(solid, width: 8, height: 8, settings: s)
check(tapered[3] == 255 && tapered[31] == 0 && tapered[(4*8+4)*4+3] == 255, "positive horizontal perspective narrows the right edge")
s.opacity = .nan
do { _ = try ImageAdjustments.apply(pixels, width: 2, height: 2, settings: s); check(false,"NaN rejected") } catch { check(true,"NaN rejected") }
do { _ = try ImageAdjustments.apply([], width: Int.max, height: 2, settings: .init()); check(false,"unsafe dimensions rejected") } catch { check(true,"unsafe dimensions rejected") }
exit(failures == 0 ? 0 : 1)
