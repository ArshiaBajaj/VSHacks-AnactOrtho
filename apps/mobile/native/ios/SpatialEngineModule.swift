/**
 * SpatialEngineModule.swift
 *
 * TurboModule bridge exposing the C++ SpatialEngine to JS. Only used for the
 * *async* API surface — e.g. `SpatialEngine.setHomography(H)` and imperative
 * score reporting from the UI. The hot per-frame path skips this bridge
 * entirely and calls the C++ engine directly from the vision-camera plugin.
 *
 * Once you `expo prebuild`, drop this file into the app target and add the
 * corresponding `.m` glue (or use `expo-modules-core` to auto-register).
 */

import Foundation

@objc(SpatialEngine)
class SpatialEngineModule: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc
    func `init`(_ sport: String,
                resolver resolve: @escaping RCTPromiseResolveBlock,
                rejecter reject: @escaping RCTPromiseRejectBlock) {
        // TODO: forward to CourtVisionSpatialEngineBridge (C++ shim) with sport rules.
        resolve(nil)
    }

    @objc
    func setHomography(_ matrix: [NSNumber],
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        // matrix is a 9-element row-major float array.
        resolve(nil)
    }

    @objc
    func setCourt(_ flatQuad: [NSNumber],
                  resolver resolve: @escaping RCTPromiseResolveBlock,
                  rejecter reject: @escaping RCTPromiseRejectBlock) {
        // flatQuad = [x0,y0, x1,y1, x2,y2, x3,y3] in normalized image space.
        resolve(nil)
    }

    @objc
    func step(_ input: NSDictionary,
              resolver resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Forward to the C++ engine and marshal EmittedEvent[] back to JS.
        resolve([
            "scoreA": 0,
            "scoreB": 0,
            "events": [] as [Any]
        ])
    }

    @objc
    func reset(_ resolve: @escaping RCTPromiseResolveBlock,
               rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(nil)
    }
}
