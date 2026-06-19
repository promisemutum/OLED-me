// This listener fires once when the extension is first installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("OLED-ify installed! Setting default values.");
  
  // Save default settings to Chrome's synced storage
  chrome.storage.sync.set({
    enabled: true,
    intensity: 0.8,
    saturationBoost: 1.15,
    mediaCrushStrength: 0.5,
    excludedSites: [],
    autoDetect: true
  });
});