/**
 * Expo config plugin: use a real release keystore when CI provides one.
 *
 * The Expo prebuild template signs the `release` build type with the debug
 * keystore so local release builds work. That is fine for internal testing but
 * not for Play. When `ANDROID_KEYSTORE_PATH` is set (CI restores it from a
 * secret), this plugin adds a `whattocookRelease` signing config and wires the
 * release build type to it. Without the env var the generated project keeps the
 * template behaviour, so local `assembleRelease` still works.
 */
const { withAppBuildGradle } = require('expo/config-plugins');
const fs = require('node:fs');

const MARKER = 'whattocookRelease';

module.exports = function withReleaseSigning(config) {
  const keystore = process.env.ANDROID_KEYSTORE_PATH;
  if (!keystore || !fs.existsSync(keystore)) return config;

  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) return cfg;

    contents = contents.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {
        ${MARKER} {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }`,
    );

    contents = contents.replace(
      /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig signingConfigs.' + MARKER,
    );

    cfg.modResults.contents = contents;
    return cfg;
  });
};
