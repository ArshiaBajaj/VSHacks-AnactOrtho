import type { ExpoConfig } from "expo/config";

/**
 * Expo config for Anact Ortho. Uses the dev-client model (not Expo Go)
 * because we ship native modules (vision-camera frame processors,
 * fast-tflite, our own C++ SpatialEngine) that Expo Go cannot host.
 */
const config: ExpoConfig = {
  name: "Anact Ortho",
  slug: "anact-ortho",
  scheme: "anactortho",
  version: "0.1.0",
  orientation: "default",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "dark",
  splash: {
    image: "./assets/images/splash.png",
    resizeMode: "cover",
    backgroundColor: "#0f172a",
  },
  assetBundlePatterns: ["**/*", "assets/models/*.tflite"],
  ios: {
    bundleIdentifier: "com.courtvision.ai",
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        "Anact Ortho uses your camera on-device to officiate the game, track players, and generate your scout report. Nothing is uploaded.",
      NSMicrophoneUsageDescription:
        "Optional — used only if you record a highlight clip with sound. Nothing is uploaded.",
      NSPhotoLibraryAddUsageDescription:
        "Save your highlight clips and scout card back to Photos.",
      UIBackgroundModes: ["audio"],
    },
  },
  android: {
    package: "com.courtvision.ai",
    adaptiveIcon: {
      foregroundImage: "./assets/images/icon.png",
      backgroundColor: "#0f172a",
    },
    permissions: [
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.READ_EXTERNAL_STORAGE",
    ],
  },
  plugins: [
    "expo-router",
    [
      "react-native-vision-camera",
      {
        cameraPermissionText:
          "$(PRODUCT_NAME) needs the camera to officiate the game on-device.",
        enableMicrophonePermission: false,
        enableCodeScanner: false,
      },
    ],
    "expo-speech",
    "expo-av",
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
