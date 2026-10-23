// Dynamic config layered over app.json (Expo merges both).
// Only job: wire Firebase's google-services.json for Android push when the
// file is present, so a missing file never breaks the Android build.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const googleServices = path.join(__dirname, "google-services.json");
  if (fs.existsSync(googleServices)) {
    config.android = { ...(config.android || {}), googleServicesFile: "./google-services.json" };
  }
  return config;
};
