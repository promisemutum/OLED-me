// --- SETTINGS MANAGEMENT ---
const DEFAULT_SETTINGS = {
  enabled: true,
  globalContrast: 1.12,
  globalBrightness: 1.08,
  globalSaturation: 1.15
};

// Hardcoded thresholds for simpler internal logic
const BG_THRESHOLD = 170; // Backgrounds lighter than this will become black
const TEXT_DARK_LIMIT = 90; // Text darker than this will become white
const TEXT_BOOST_LIMIT = 210; // Text between 90 and 210 will be boosted
const BORDER_LIMIT = 170; // Borders lighter than this will be dimmed

// Tags that should never have their background modified (media elements)
const MEDIA_TAGS = new Set([
  'IMG', 'VIDEO', 'CANVAS', 'IFRAME', 'SVG', 'PICTURE',
  'FIGURE', 'FIGCAPTION', 'SOURCE', 'OBJECT', 'EMBED', 'MAP', 'AREA'
]);

// Selector string for querySelector to find any nested media
const MEDIA_SELECTOR = 'img, video, canvas, svg, picture, iframe, object, embed';

let currentSettings = { ...DEFAULT_SETTINGS };

function loadSettingsAndRun() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    currentSettings = settings;
    if (currentSettings.enabled) {
      oledifyPage();
    } else {
      disableOled();
    }
  });
}

// Listen for real-time changes from the popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    for (let key in changes) {
      currentSettings[key] = changes[key].newValue;
    }
    if (currentSettings.enabled) {
      oledifyPage();
    } else {
      disableOled();
    }
  }
});

function disableOled() {
  const cStyle = document.getElementById('oled-global-contrast');
  if (cStyle) cStyle.remove();

  document.querySelectorAll('.oled-modified').forEach(el => {
    el.style.removeProperty('background-color');
    el.style.removeProperty('color');
    el.style.removeProperty('border-color');
    el.style.removeProperty('box-shadow');
    el.classList.remove('oled-modified');
  });
  
  // Pause observer while disabled
  observer.disconnect();
  isObserverActive = false;
}

// --- CORE FUNCTIONS ---
function oledifyPage() {
  if (!currentSettings.enabled) return;
  applyDarkMode();
  addGlobalContrastBoost();
  
  // Ensure observer is running
  if (!isObserverActive) {
    initObserver();
  }
}

function resetDarkMode() {
  document.querySelectorAll('.oled-modified').forEach(el => {
    el.style.removeProperty('background-color');
    el.style.removeProperty('color');
    el.style.removeProperty('border-color');
    el.style.removeProperty('box-shadow');
    el.classList.remove('oled-modified');
  });
}

/**
 * Checks if an element contains ANY media descendants (not just direct children).
 * Uses querySelector which stops at the first match for efficiency.
 */
function containsMedia(el) {
  try {
    return el.querySelector(MEDIA_SELECTOR) !== null;
  } catch (e) {
    return false;
  }
}

/**
 * Checks if an element uses a background-image that would be hidden
 * by setting background-color to black.
 */
function hasBackgroundImage(computedStyle) {
  const bgImage = computedStyle.backgroundImage;
  return bgImage && bgImage !== 'none';
}

function applyDarkMode() {
  const root = document.body || document.documentElement;
  if (!root) return;
  
  const elements = root.querySelectorAll('*');

  elements.forEach(el => {
    if (!el.isConnected) return; // Skip disconnected nodes
    
    // Skip media elements entirely
    if (MEDIA_TAGS.has(el.tagName)) return;
    
    // Quick skip check to avoid expensive computed style if already modified
    if (el.classList.contains('oled-modified')) return;

    try {
      const computedStyle = window.getComputedStyle(el);
      let modified = false;

      // --- BACKGROUND ---
      // Only darken light backgrounds, but SKIP elements that:
      //   1. Have a semi-transparent background (likely an overlay — making it solid black would cover content beneath)
      //   2. Have a background-image (would be hidden by solid black)
      //   3. Contain ANY media descendants (images/videos would be obscured)
      const bgData = getRGBA(computedStyle.backgroundColor);
      if (bgData && bgData.alpha > 0.5 && getLuminance(bgData.rgb) >= BG_THRESHOLD) {
        if (!hasBackgroundImage(computedStyle) && !containsMedia(el)) {
          el.style.setProperty('background-color', '#000000', 'important');
          modified = true;
        }
      }

      // --- TEXT COLOR ---
      // Only modify text color if the background was actually darkened,
      // OR if the element itself is inside a darkened container.
      // This prevents mangling text on light-mode pages that weren't touched.
      const isInDarkContext = modified || isAncestorOledModified(el);
      
      if (isInDarkContext) {
        const textColor = getRGBA(computedStyle.color);
        if (textColor) {
          const lum = getLuminance(textColor.rgb);
          if (lum < TEXT_DARK_LIMIT) {
            el.style.setProperty('color', '#ffffff', 'important');
            modified = true;
          } else if (lum < TEXT_BOOST_LIMIT) {
            const boosted = boostColor(textColor.rgb, 1.45);
            el.style.setProperty('color', `rgb(${boosted[0]},${boosted[1]},${boosted[2]})`, 'important');
            modified = true;
          }
        }
      }

      // --- BORDERS ---
      const borderData = getRGBA(computedStyle.borderTopColor);
      if (borderData && getLuminance(borderData.rgb) >= BORDER_LIMIT) {
        if (parseFloat(computedStyle.borderTopWidth) > 0) {
          el.style.setProperty('border-color', '#333333', 'important');
          modified = true;
        }
      }

      // --- BOX SHADOWS ---
      const shadow = computedStyle.boxShadow;
      if (shadow && shadow !== 'none') {
        el.style.setProperty('box-shadow', 'none', 'important');
        modified = true;
      }
      
      if (modified) {
        el.classList.add('oled-modified');
      }
    } catch (e) {
      // Ignore elements that throw errors (e.g., disconnected nodes)
    }
  });
}

/**
 * Check if any ancestor of an element has been OLED-modified (i.e., its
 * background was set to black). This tells us the text inside needs
 * color adjustment too.
 */
function isAncestorOledModified(el) {
  let parent = el.parentElement;
  // Walk up at most 5 levels to avoid performance issues on deep DOMs
  let depth = 0;
  while (parent && depth < 5) {
    if (parent.classList.contains('oled-modified')) return true;
    parent = parent.parentElement;
    depth++;
  }
  return false;
}

function boostColor(rgb, factor) {
  return rgb.map(c => {
    const boosted = Math.round(c * factor);
    return Math.min(255, Math.round(boosted + (255 - boosted) * 0.15));
  });
}

function addGlobalContrastBoost() {
  if (!document.head) return;
  let style = document.getElementById('oled-global-contrast');
  if (!style) {
    style = document.createElement('style');
    style.id = 'oled-global-contrast';
    document.head.appendChild(style);
  }
  
  // Apply filter to html but counteract it on media elements
  // so images/videos display with their natural colors
  style.textContent = `
    html {
      filter: contrast(${currentSettings.globalContrast}) brightness(${currentSettings.globalBrightness}) saturate(${currentSettings.globalSaturation}) !important;
    }
    /* Reset the filter on media elements so images/videos look natural */
    img, video, canvas, picture, svg, iframe, object, embed {
      filter: brightness(${1 / currentSettings.globalBrightness}) contrast(${1 / currentSettings.globalContrast}) saturate(${1 / currentSettings.globalSaturation}) !important;
    }
    /* Only restyle headings/links inside OLED-modified containers */
    .oled-modified h1, .oled-modified h2, .oled-modified h3,
    .oled-modified h4, .oled-modified h5, .oled-modified h6,
    h1.oled-modified, h2.oled-modified, h3.oled-modified,
    h4.oled-modified, h5.oled-modified, h6.oled-modified { 
      color: #ffffff !important; 
    }
    .oled-modified a, a.oled-modified { color: #8ab4f8 !important; }
    .oled-modified a:visited, a.oled-modified:visited { color: #c58af9 !important; }
  `;
}

// --- HELPERS ---

/**
 * Parses an rgb/rgba color string and returns { rgb: [r,g,b], alpha: a }.
 * Returns null for transparent, missing, or unparseable values.
 */
function getRGBA(colorString) {
  if (!colorString || colorString === 'transparent' || colorString === 'rgba(0, 0, 0, 0)') return null;
  const match = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
  if (!match) return null;
  const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
  // Treat fully transparent as "no background"
  if (alpha === 0) return null;
  return { rgb: [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])], alpha };
}

function getLuminance(rgb) {
  if (!rgb) return 255;
  return (0.299 * rgb[0]) + (0.587 * rgb[1]) + (0.114 * rgb[2]);
}

// --- EXECUTION & OBSERVER ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSettingsAndRun);
} else {
  loadSettingsAndRun();
}

// DEBOUNCED OBSERVER
let debounceTimer;
let isObserverActive = false;

const observer = new MutationObserver((mutations) => { 
  if (!currentSettings.enabled) return;
  
  // Check if we actually need to re-run (avoid triggering on our own class/style additions)
  const relevantMutations = mutations.some(m => {
    if (m.type === 'childList') return true;
    return false;
  });
  
  if (!relevantMutations) return;
  
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    applyDarkMode();
  }, 300); // Increased debounce for performance
});

function initObserver() {
  if (!currentSettings.enabled) return;
  
  if (document.documentElement) {
    // Only observe childList to avoid infinite loops when modifying attributes
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    isObserverActive = true;
  } else {
    // documentElement doesn't exist yet (document_start)
    const tempObserver = new MutationObserver(() => {
      if (document.documentElement) {
        tempObserver.disconnect();
        initObserver();
      }
    });
    tempObserver.observe(document, { childList: true });
  }
}