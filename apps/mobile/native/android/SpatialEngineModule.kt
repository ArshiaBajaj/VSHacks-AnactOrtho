package com.courtvision.ai

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap

/**
 * Android bridge for the CourtVision SpatialEngine.
 *
 * The engine itself is C++ (see native/cpp/SpatialEngine.hpp) and is linked
 * into the app via CMake — see `android/app/CMakeLists.txt` after
 * `expo prebuild`. This Kotlin class only carries the async, imperative API
 * (setHomography, registerScore, reset, …) that the JS side needs to
 * call outside the frame-processor thread. The hot per-frame path is
 * handled by the vision-camera JNI plugin, not this module.
 */
class SpatialEngineModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init { System.loadLibrary("courtvision-jni") }

    override fun getName(): String = "SpatialEngine"

    @ReactMethod
    fun init(sport: String, promise: Promise) {
        try {
            nativeInit(sport)
            promise.resolve(null)
        } catch (t: Throwable) {
            promise.reject("cv_engine_init_failed", t)
        }
    }

    @ReactMethod
    fun setHomography(matrix: ReadableArray, promise: Promise) {
        try {
            val floats = FloatArray(9) { i -> matrix.getDouble(i).toFloat() }
            nativeSetHomography(floats)
            promise.resolve(null)
        } catch (t: Throwable) {
            promise.reject("cv_engine_homography_failed", t)
        }
    }

    @ReactMethod
    fun setCourt(flatQuad: ReadableArray, promise: Promise) {
        try {
            val floats = FloatArray(8) { i -> flatQuad.getDouble(i).toFloat() }
            nativeSetCourt(floats)
            promise.resolve(null)
        } catch (t: Throwable) {
            promise.reject("cv_engine_court_failed", t)
        }
    }

    @ReactMethod
    fun step(input: ReadableMap, promise: Promise) {
        try {
            // TODO: extract ball + poses from `input`, call nativeStep(...)
            val result = WritableNativeMap().apply {
                putInt("scoreA", 0)
                putInt("scoreB", 0)
                putArray("events", WritableNativeArray())
            }
            promise.resolve(result)
        } catch (t: Throwable) {
            promise.reject("cv_engine_step_failed", t)
        }
    }

    @ReactMethod
    fun reset(promise: Promise) {
        nativeReset()
        promise.resolve(null)
    }

    private external fun nativeInit(sport: String)
    private external fun nativeSetHomography(matrix: FloatArray)
    private external fun nativeSetCourt(quad: FloatArray)
    private external fun nativeReset()
}
