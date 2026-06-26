chrome.runtime.onInstalled.addListener((details) => {
  console.log(`OLED-ify ${details.reason}! Checking default values.`);

  chrome.storage.sync.get(null, (currentSettings) => {
  const defaults = {
    enabled: true,
    globalContrast: 1.6,   // Updated
    globalBrightness: 0.9, // Updated
    globalSaturation: 1.2  // Updated
  };

    const missingSettings = {};
    let needsUpdate = false;

    for (const key in defaults) {
      if (!(key in currentSettings)) {
        missingSettings[key] = defaults[key];
        needsUpdate = true;
      }
    }

    // Clean up old/unused keys
    const validKeys = Object.keys(defaults);
    const keysToRemove = Object.keys(currentSettings).filter(key => !validKeys.includes(key));
    if (keysToRemove.length > 0) {
      console.log("Removing outdated settings:", keysToRemove);
      chrome.storage.sync.remove(keysToRemove);
    }

    if (needsUpdate) {
      console.log("Adding missing default settings:", missingSettings);
      chrome.storage.sync.set(missingSettings);
    } else {
      console.log("All necessary settings already exist.");
    }
  });
});