import AppKit
import AVFoundation
import CoreImage
import Foundation

struct Scene: Decodable {
    let slide: String
    let audio: String
    let duration: Double
    let audioOffset: Double
}

enum RenderError: Error, CustomStringConvertible {
    case usage
    case missingImage(String)
    case missingTrack(String)
    case writer(String)
    case export(String)

    var description: String {
        switch self {
        case .usage:
            return "Usage: swift render_video.swift <timeline.json> <output.mp4>"
        case .missingImage(let path):
            return "Could not load slide: \(path)"
        case .missingTrack(let path):
            return "Could not load media track: \(path)"
        case .writer(let message):
            return "Video writer failed: \(message)"
        case .export(let message):
            return "Video export failed: \(message)"
        }
    }
}

@main
struct VideoRenderer {
    static let width = 1920
    static let height = 1080
    static let fps: Int32 = 30

    static func main() async throws {
        guard CommandLine.arguments.count == 3 else { throw RenderError.usage }

        let timelineURL = URL(fileURLWithPath: CommandLine.arguments[1])
        let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
        let silentURL = outputURL
            .deletingLastPathComponent()
            .appendingPathComponent(".hola-mundo-claude-mcp-silent.mp4")

        let data = try Data(contentsOf: timelineURL)
        let scenes = try JSONDecoder().decode([Scene].self, from: data)

        for url in [silentURL, outputURL] {
            try? FileManager.default.removeItem(at: url)
        }

        try await writeSilentVideo(scenes: scenes, to: silentURL)
        try await addNarration(scenes: scenes, videoURL: silentURL, outputURL: outputURL)
        try? FileManager.default.removeItem(at: silentURL)

        print("Rendered \(outputURL.path)")
    }

    static func writeSilentVideo(scenes: [Scene], to outputURL: URL) async throws {
        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
        let compressionProperties: [String: Any] = [
            AVVideoAverageBitRateKey: 8_000_000,
            AVVideoExpectedSourceFrameRateKey: fps,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        ]
        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: compressionProperties,
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = false

        let attributes: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
        ]
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: attributes
        )

        guard writer.canAdd(input) else {
            throw RenderError.writer("Cannot add video input")
        }
        writer.add(input)
        guard writer.startWriting() else {
            throw RenderError.writer(writer.error?.localizedDescription ?? "startWriting returned false")
        }
        writer.startSession(atSourceTime: .zero)

        let images = try scenes.map { scene -> CIImage in
            guard let image = CIImage(
                contentsOf: URL(fileURLWithPath: scene.slide),
                options: [.applyOrientationProperty: true]
            ) else {
                throw RenderError.missingImage(scene.slide)
            }
            return image.cropped(to: CGRect(x: 0, y: 0, width: width, height: height))
        }

        let context = CIContext(options: [.cacheIntermediates: false])
        let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
        let transitionFrames = Int(fps) / 2
        var globalFrame: Int64 = 0

        for (index, scene) in scenes.enumerated() {
            let frameCount = max(1, Int((scene.duration * Double(fps)).rounded()))
            for localFrame in 0..<frameCount {
                while !input.isReadyForMoreMediaData {
                    usleep(1_000)
                }

                var frameImage = images[index]
                if index + 1 < images.count && localFrame >= frameCount - transitionFrames {
                    let progress = Double(localFrame - (frameCount - transitionFrames))
                        / Double(transitionFrames)
                    frameImage = frameImage
                        .applyingFilter(
                            "CIDissolveTransition",
                            parameters: [
                                kCIInputTargetImageKey: images[index + 1],
                                kCIInputTimeKey: progress,
                            ]
                        )
                        .cropped(to: CGRect(x: 0, y: 0, width: width, height: height))
                }

                var buffer: CVPixelBuffer?
                let status = CVPixelBufferCreate(
                    kCFAllocatorDefault,
                    width,
                    height,
                    kCVPixelFormatType_32BGRA,
                    attributes as CFDictionary,
                    &buffer
                )
                guard status == kCVReturnSuccess, let pixelBuffer = buffer else {
                    throw RenderError.writer("CVPixelBufferCreate returned \(status)")
                }

                context.render(
                    frameImage,
                    to: pixelBuffer,
                    bounds: CGRect(x: 0, y: 0, width: width, height: height),
                    colorSpace: colorSpace
                )

                let time = CMTime(value: globalFrame, timescale: fps)
                guard adaptor.append(pixelBuffer, withPresentationTime: time) else {
                    throw RenderError.writer(writer.error?.localizedDescription ?? "append failed")
                }
                globalFrame += 1
            }
        }

        input.markAsFinished()
        await withCheckedContinuation { continuation in
            writer.finishWriting {
                continuation.resume()
            }
        }
        guard writer.status == .completed else {
            throw RenderError.writer(writer.error?.localizedDescription ?? "unknown failure")
        }
    }

    static func addNarration(
        scenes: [Scene],
        videoURL: URL,
        outputURL: URL
    ) async throws {
        let composition = AVMutableComposition()
        let videoAsset = AVURLAsset(url: videoURL)
        guard let sourceVideo = try await videoAsset.loadTracks(withMediaType: .video).first,
              let targetVideo = composition.addMutableTrack(
                withMediaType: .video,
                preferredTrackID: kCMPersistentTrackID_Invalid
              )
        else {
            throw RenderError.missingTrack(videoURL.path)
        }

        let videoDuration = try await videoAsset.load(.duration)
        try targetVideo.insertTimeRange(
            CMTimeRange(start: .zero, duration: videoDuration),
            of: sourceVideo,
            at: .zero
        )

        guard let targetAudio = composition.addMutableTrack(
            withMediaType: .audio,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw RenderError.writer("Cannot create narration track")
        }

        var cursor = CMTime.zero
        for scene in scenes {
            let audioURL = URL(fileURLWithPath: scene.audio)
            let asset = AVURLAsset(url: audioURL)
            guard let track = try await asset.loadTracks(withMediaType: .audio).first else {
                throw RenderError.missingTrack(scene.audio)
            }
            let duration = try await asset.load(.duration)
            let at = CMTimeAdd(
                cursor,
                CMTime(seconds: scene.audioOffset, preferredTimescale: 600)
            )
            try targetAudio.insertTimeRange(
                CMTimeRange(start: .zero, duration: duration),
                of: track,
                at: at
            )
            cursor = CMTimeAdd(
                cursor,
                CMTime(seconds: scene.duration, preferredTimescale: 600)
            )
        }

        guard let exporter = AVAssetExportSession(
            asset: composition,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            throw RenderError.export("Could not create AVAssetExportSession")
        }
        exporter.outputURL = outputURL
        exporter.outputFileType = .mp4
        exporter.shouldOptimizeForNetworkUse = true

        await withCheckedContinuation { continuation in
            exporter.exportAsynchronously {
                continuation.resume()
            }
        }
        guard exporter.status == .completed else {
            throw RenderError.export(exporter.error?.localizedDescription ?? "unknown failure")
        }
    }
}
