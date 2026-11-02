import AppKit

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
exit(failures == 0 ? 0 : 1)
