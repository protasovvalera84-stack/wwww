/**
 * NexaLink Desktop — Preload script
 * Exposes safe APIs to the renderer process.
 */

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("nexalink", {
  platform: process.platform,
  isDesktop: true,
  version: require("./package.json").version,
});
