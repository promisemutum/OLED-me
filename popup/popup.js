const DEFAULT_SETTINGS = {
  enabled: true,
  globalContrast: 1.6,   // Updated
  globalBrightness: 0.9, // Updated
  globalSaturation: 1.2  // Updated
};

// --- DEBOUNCE UTILITY ---
// Prevents firing a function too many times in rapid succession
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

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

  // --- DEBOUNCED STORAGE WRITE ---
  // Wait 300ms after the user stops dragging before writing to storage.
  // This prevents the MAX_WRITE_OPERATIONS_PER_MINUTE quota error.
  const debouncedSave = debounce((key, value) => {
    chrome.storage.sync.set({ [key]: value });
  }, 300);

  // 2. Listen for slider changes
  const sliderIds = Object.keys(DEFAULT_SETTINGS).filter(k => k !== 'enabled');
  sliderIds.forEach(id => {
    const input = document.getElementById(id);
    const valSpan = document.getElementById(id + 'Val');
    
    if (input) {
      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        // Update the UI text immediately so it feels responsive
        if(valSpan) valSpan.textContent = val; 
        
        // Use the debounced save instead of direct chrome.storage.sync.set
        debouncedSave(id, val);
      });
    }
  });

  // 3. Listen for Master Toggle switch (Clicks are fine, no debounce needed)
  masterToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    updateUIState(isEnabled);
    chrome.storage.sync.set({ enabled: isEnabled });
  });

  // 4. Listen for Reset button (Clicks are fine, no debounce needed)
  resetBtn.addEventListener('click', () => {
    const currentEnabledState = masterToggle.checked;
    const settingsToReset = { ...DEFAULT_SETTINGS, enabled: currentEnabledState };
    
    chrome.storage.sync.set(settingsToReset, () => {
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