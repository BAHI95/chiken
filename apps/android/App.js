const React = require("react");
const ReactNative = require("react-native");
const { AppShell } = require("@farm/mobile-shell");

module.exports = function AndroidApp() {
  return React.createElement(AppShell, {
    platformName: "Android",
    ReactNative,
  });
};

module.exports.default = module.exports;
