// Generates 60 invented color frames. No camera, athlete data, or source media.
// swift make-video.swift /absolute/private-output/synthetic.mp4
import AVFoundation
import Foundation

guard CommandLine.arguments.count == 2 else { fatalError("Pass an external synthetic.mp4 output path") }
let output = URL(fileURLWithPath: CommandLine.arguments[1])
guard !FileManager.default.fileExists(atPath: output.path) else { fatalError("Refusing to replace existing media") }
let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: 320, AVVideoHeightKey: 180])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input,
    sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
        kCVPixelBufferWidthKey as String: 320, kCVPixelBufferHeightKey as String: 180])
writer.add(input)
guard writer.startWriting() else { fatalError("Unable to start synthetic writer") }
writer.startSession(atSourceTime: .zero)
for frame in 0..<60 {
    while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
    var buffer: CVPixelBuffer?
    guard let pool = adaptor.pixelBufferPool,
          CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &buffer) == kCVReturnSuccess,
          let buffer else { fatalError("Pixel buffer unavailable") }
    CVPixelBufferLockBaseAddress(buffer, [])
    let bytes = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
    let stride = CVPixelBufferGetBytesPerRow(buffer)
    for y in 0..<180 { for x in 0..<320 {
        let offset = y * stride + x * 4
        bytes[offset] = 255; bytes[offset + 1] = UInt8((x + frame * 3) % 256)
        bytes[offset + 2] = UInt8(y); bytes[offset + 3] = UInt8(80 + frame)
    } }
    CVPixelBufferUnlockBaseAddress(buffer, [])
    guard adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(frame), timescale: 30)) else { fatalError("Append failed") }
}
input.markAsFinished()
let completed = DispatchSemaphore(value: 0)
writer.finishWriting { completed.signal() }
completed.wait()
guard writer.status == .completed else { fatalError("Synthetic video failed: \(String(describing: writer.error))") }
print(output.path)
