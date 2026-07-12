/**
 * CourtVisionFramePlugin.mm
 *
 * iOS binding for the vision-camera frame processor. Registers a plugin
 * named "courtvisionFrame" that JS calls per frame; internally it locks the
 * CVPixelBuffer, downsamples via CoreImage to the analysis size, hands the
 * decoded RGBA bytes to `courtvision::frame_plugin::ProcessFrame`, and
 * returns the summary to JS as a JSI object.
 *
 * NOTE: This is a template — drop it into your Xcode project once `expo
 * prebuild` has generated the iOS folder. See `README.native.md` for the
 * step-by-step wiring instructions.
 */

#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/Frame.h>
#import <CoreImage/CoreImage.h>
#import <CoreVideo/CoreVideo.h>

#include "../cpp/CourtVisionFramePlugin.hpp"
#include "../cpp/SpatialEngine.hpp"

using namespace courtvision;
using namespace courtvision::frame_plugin;

// Singleton engine instance — the plugin is called on the frame-processor
// thread, and each app instance only tracks one live game at a time, so a
// process-wide singleton is fine.
static SpatialEngine& sharedEngine() {
    static SpatialEngine engine{SportRules{}};
    return engine;
}

@interface CourtVisionFrameProcessor : FrameProcessorPlugin
@end

@implementation CourtVisionFrameProcessor

- (instancetype)initWithProxy:(VisionCameraProxyHolder*)proxy
                      withOptions:(NSDictionary*)options {
    self = [super initWithProxy:proxy withOptions:options];
    return self;
}

- (id)callback:(Frame*)frame withArguments:(NSDictionary*)arguments {
    CMSampleBufferRef sampleBuffer = frame.buffer;
    CVPixelBufferRef pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
    if (pixelBuffer == nil) return @{ @"ball": [NSNull null] };

    // Downsample via CoreImage — offloaded to the GPU on modern iPhones.
    int downsampleWidth = 160;
    id widthObj = [arguments objectForKey:@"downsampleWidth"];
    if ([widthObj isKindOfClass:[NSNumber class]]) {
        downsampleWidth = [(NSNumber*)widthObj intValue];
    }
    // (Downsample implementation omitted for brevity — use CIContext render
    // to CGImage then to RGBA byte buffer, or vImage for the fastest path.)

    // Build the plain-buffer ABI expected by the C++ layer: [w, h, stride, rgba...]
    // TODO: fill in with the real decoded RGBA bytes from the downsampled image.
    std::vector<uint8_t> abiBuffer;

    FrameConfig config;
    config.downsampleWidth = downsampleWidth;

    const double timestampMs =
        CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer)) * 1000.0;

    FrameResult result = ProcessFrame(sharedEngine(),
                                      config,
                                      abiBuffer.empty() ? nullptr : abiBuffer.data(),
                                      timestampMs);

    NSMutableDictionary* ball = nil;
    if (result.ballFound) {
        ball = [NSMutableDictionary dictionary];
        ball[@"x"] = @(result.ballPoint.x);
        ball[@"y"] = @(result.ballPoint.y);
        ball[@"r"] = @(result.ballRadius);
        ball[@"confidence"] = @(result.ballConfidence);
        ball[@"predicted"] = @(result.ballPredicted);
    }

    return @{
        @"t": @(result.timestamp),
        @"ball": ball ?: (id)[NSNull null],
        @"ballInsideCourt": @(result.ballInsideCourt),
        @"reportedFps": @(result.reportedFps),
    };
}

VISION_EXPORT_FRAME_PROCESSOR(CourtVisionFrameProcessor, courtvisionFrame)

@end
