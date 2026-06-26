// This listener fires once when the extension is first installed or updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`OLED-ify ${details.reason}! Checking default values.`);

  // 1. Fetch all currently stored settings
  chrome.storage.sync.get(null, (currentSettings) => {
    
    // 2. Define all default settings
    const defaults = {
      enabled: true,
      globalContrast: 1.12,
      globalBrightness: 1.08,
      globalSaturation: 1.15
    };

    // 3. Find which settings are missing from storage
    const missingSettings = {};
    let needsUpdate = false;

    for (const key in defaults) {
      if (!(key in currentSettings)) {
        missingSettings[key] = defaults[key];
        needsUpdate = true;
      }
    }

    // 4. Clean up old, unused settings from storage
    const validKeys = Object.keys(defaults);
    const keysToRemove = Object.keys(currentSettings).filter(key => !validKeys.includes(key));
    
    if (keysToRemove.length > 0) {
      console.log("Removing outdated settings:", keysToRemove);
      chrome.storage.sync.remove(keysToRemove);
    }

    // 5. Only save if there are actually new settings to add
    if (needsUpdate) {
      console.log("Adding missing default settings:", missingSettings);
      chrome.storage.sync.set(missingSettings);
    } else {
      console.log("All necessary settings already exist.");
    }
  });
});