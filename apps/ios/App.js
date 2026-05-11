const React = require("react");
const ReactNative = require("react-native");
const { AppShell } = require("@farm/mobile-shell");

module.exports = function IOSApp() {
  return React.createElement(AppShell, {
    platformName: "iPhone / iPad",
    ReactNative,
  });
};

module.exports.default = module.exports;
