# @courtvision/mobile

React Native + Expo dev-client app for **Anact Ortho**. This is the production mobile surface — everything that ships on iOS + Android and touches the camera / NPU / TTS lives here.

## First-run setup

```bash
# From the repo root:
npm install

# Generate the native iOS + Android projects. This creates ios/ and android/
# in this workspace using the config from app.config.ts.
npm run mobile:prebuild

# iOS-only
cd ios && pod install && cd ..

# Run
npm run mobile:ios
# or
npm run mobile:android
```

The first native build takes 3–8 min. Subsequent runs go through Metro (fast) unless a native dependency changes.

## Directory guide

```
apps/mobile/
├─ app.config.ts        # Expo config (permissions, plugins, bundle IDs)
├─ babel.config.js      # module-resolver + worklets-core + reanimated plugins
├─ metro.config.js      # Monorepo wiring — watches ../../packages
├─ tsconfig.json        # Extends root, adds RN + expo-router types
│
├─ app/                 # expo-router routes (file-based)
│   ├─ _layout.tsx      # Root stack, splash, audio warmup, safe-area provider
│   └─ (tabs)/
│       ├─ _layout.tsx  # Bottom nav: Setup / Live / Scout
│       ├─ index.tsx    # Setup & calibration screen
│       ├─ live.tsx     # Live session — camera + frame processor + HUD
│       └─ scout.tsx    # Scout dashboard — heatmap, momentum, highlights
│
├─ src/
│   ├─ audio/whistle.ts               # Referee whistle + score cue via expo-av
│   ├─ camera/
│   │   ├─ format.ts                  # Pick 30fps/720p format from the device
│   │   ├─ frameProcessor.ts          # Worklet bridge to native C++ plugin
│   │   └─ frameBus.ts                # Worklet → JS analysis pump
│   ├─ components/
│   │   ├─ Screen.tsx                 # SafeArea + ScrollView shell
│   │   └─ ScreenHeader.tsx           # Overline / title / subtitle / chip
│   ├─ design/                        # Text, Button, Card, Chip, theme.ts
│   ├─ engine/spatialEngineNative.ts  # JS SpatialEngine (native + TS fallback)
│   └─ tts/speak.ts                   # expo-speech wrapper (offline TTS)
│
├─ native/
│   ├─ cpp/
│   │   ├─ SpatialEngine.hpp                  # C++ state machine (header-only)
│   │   ├─ CourtVisionFramePlugin.hpp         # Frame-processor plugin API
│   │   └─ CourtVisionFramePlugin.cpp         # Ball prior + engine step
│   ├─ ios/
│   │   ├─ CourtVisionFramePlugin.mm          # Vision-camera plugin (Obj-C++)
│   │   └─ SpatialEngineModule.swift          # TurboModule bridge stub
│   └─ android/
│       └─ SpatialEngineModule.kt             # JNI bridge stub
│
└─ assets/
    ├─ audio/     # whistle.wav, score.wav, crowd.wav (synth placeholders — see gen_audio.py)
    ├─ fonts/     # (Inter + Geist family)
    ├─ images/    # icon.png, splash.png, adaptive-icon.png
    └─ models/    # (drop pose_landmarker_lite.tflite / .mlmodelc here)
```

## Wiring the native modules after `expo prebuild`

`expo prebuild` regenerates `ios/` and `android/` from `app.config.ts`. Once
that's done, add our C++ + native bridge files to the generated projects:

### iOS

1. Open `ios/CourtVisionAI.xcworkspace` in Xcode.
2. Right-click the `CourtVisionAI` group → **Add files to "CourtVisionAI"…** and select `native/cpp/` and `native/ios/CourtVisionFramePlugin.mm`, `native/ios/SpatialEngineModule.swift`.
3. In **Build Settings → Header Search Paths**, add `$(SRCROOT)/../native/cpp` (recursive).
4. If Swift + Obj-C++ isn't already bridged, let Xcode auto-generate `CourtVisionAI-Bridging-Header.h`.

### Android

1. Copy `native/android/SpatialEngineModule.kt` into `android/app/src/main/java/com/courtvision/ai/`.
2. Register the module in the generated `MainApplication.kt`:
   ```kotlin
   override fun getPackages(): List<ReactPackage> =
       PackageList(this).packages.apply {
           add(SpatialEnginePackage())
       }
   ```
3. Create `android/app/src/main/cpp/CMakeLists.txt` and include the C++ sources:
   ```cmake
   add_library(courtvision-jni SHARED
     ../../../native/cpp/CourtVisionFramePlugin.cpp
   )
   target_include_directories(courtvision-jni PUBLIC ../../../native/cpp)
   ```
4. Point `android/app/build.gradle` at that CMakeLists via `externalNativeBuild`.

## Development tips

- **No physical device?** The Setup screen falls back to the "permission needed" curtain; the Live screen still works via manual score/whistle buttons and the SpatialEngine's TypeScript fallback.
- **Debug backend**: the Live screen surfaces which SpatialEngine path is active (`native-cxx` vs `typescript-fallback`) so you always know if your native module is linked.
- **Simulate frames on the simulator**: use `_debugPushAnalysis(...)` from `src/camera/frameBus.ts` to inject synthetic frame observations for UI development without a camera.
