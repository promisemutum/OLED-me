const DEFAULT_SETTINGS = {
  enabled: true,
  globalContrast: 1.12,
  globalBrightness: 1.08,
  globalSaturation: 1.15
};

document.addEventListener('DOMContentLoaded', () => {
  const masterToggle = document.getElementById('masterToggle');
  const settingsContainer = document.getElementById('settingsContainer');
  const resetBtn = document.getElementById('resetBtn');

  // Helper to visually disable sliders if extension is off
  function updateUIState(isEnabled) {
    if (isEnabled) {
      settingsContainer.classList.remove('disabled-state');
    } else {
      settingsContainer.classList.add('disabled-state');
    }
  }

  // 1. Load existing settings
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    masterToggle.checked = settings.enabled;
    updateUIState(settings.enabled);
    
    Object.keys(DEFAULT_SETTINGS).forEach(key => {
      if (key === 'enabled') return;
      const input = document.getElementById(key);
      const valSpan = document.getElementById(key + 'Val');
      if (input) {
        input.value = settings[key];
        if(valSpan) valSpan.textContent = settings[key];
      }
    });
  });

  // 2. Listen for slider changes
  const sliderIds = Object.keys(DEFAULT_SETTINGS).filter(k => k !== 'enabled');
  sliderIds.forEach(id => {
    const input = document.getElementById(id);
    const valSpan = document.getElementById(id + 'Val');
    if (input) {
      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        if(valSpan) valSpan.textContent = val;
        chrome.storage.sync.set({ [id]: val });
      });
    }
  });

  // 3. Listen for Master Toggle switch
  masterToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    updateUIState(isEnabled);
    chrome.storage.sync.set({ enabled: isEnabled });
  });

  // 4. Listen for Reset button
  resetBtn.addEventListener('click', () => {
    // Only reset sliders, keep the enabled state as is
    const currentEnabledState = masterToggle.checked;
    const settingsToReset = { ...DEFAULT_SETTINGS, enabled: currentEnabledState };
    
    chrome.storage.sync.set(settingsToReset, () => {
      // Update UI to reflect reset defaults
      Object.keys(DEFAULT_SETTINGS).forEach(key => {
        if (key === 'enabled') return;
        const input = document.getElementById(key);
        const valSpan = document.getElementById(key + 'Val');
        if (input) {
          input.value = DEFAULT_SETTINGS[key];
          if(valSpan) valSpan.textContent = DEFAULT_SETTINGS[key];
        }
      });
    });
  });
});