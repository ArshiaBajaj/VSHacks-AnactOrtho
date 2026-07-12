module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@": "./src",
            "@app": "./app",
            "@courtvision/core": "../../packages/core/src",
            "@courtvision/vision": "../../packages/vision/src",
            "@courtvision/tokens": "../../packages/tokens/src",
          },
        },
      ],
      "react-native-worklets-core/plugin",
      "react-native-reanimated/plugin",
    ],
  };
};
