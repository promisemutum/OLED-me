// ============================================================
// OLED-me — Content Script
// Single-pass SVG filter pipeline + smart DOM dark mode
// ============================================================

const DEFAULT_SETTINGS = {
  enabled: true,
  globalContrast: 1.6,   // Updated
  globalBrightness: 0.9, // Updated
  globalSaturation: 1.2  // Updated
};

// --- Dark Mode Thresholds ---
const BG_THRESHOLD = 170;
const TEXT_DARK_LIMIT = 90;
const TEXT_BOOST_LIMIT = 210;
const BORDER_LIMIT = 170;

const MEDIA_TAGS = new Set([
  'IMG', 'VIDEO', 'CANVAS', 'IFRAME', 'SVG', 'PICTURE',
  'FIGURE', 'FIGCAPTION', 'SOURCE', 'OBJECT', 'EMBED'
]);
const MEDIA_SELECTOR = 'img, video, canvas, svg, picture, iframe, object, embed';

let currentSettings = { ...DEFAULT_SETTINGS };
let observer = null;
let isObserverActive = false;
let debounceTimer = null;

// ============================================================
// SETTINGS MANAGEMENT
// ============================================================
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

// ============================================================
// SVG FILTER PIPELINE (The Core OLED Simulation)
// ============================================================

/**
 * Generates a 9-point S-curve LUT for black crush.
 * Uses power curve: output = input^intensity
 * - intensity = 1.0 → linear (no effect)
 * - intensity > 1.0 → crushes shadows (darkens darks)
 * - Preserves 0 and 1 endpoints
 */
function generateSCurve(intensity) {
  const points = 9;
  const values = [];
  for (let i = 0; i < points; i++) {
    const x = i / (points - 1);
    if (i === 0 || i === points - 1) {
      values.push(x.toFixed(3));
    } else {
      values.push(Math.pow(x, intensity).toFixed(3));
    }
  }
  return values.join(' ');
}

/**
 * Inverse S-curve: output = input^(1/intensity)
 * Used to cancel the filter on media elements.
 */
function generateInverseSCurve(intensity) {
  return generateSCurve(1 / intensity);
}

/**
 * Injects the SVG filter definitions and applies them via CSS.
 * Single-pass pipeline: S-curve → Saturation → Brightness
 */
function applyOledFilter() {
  if (!document.head || !document.body) return;

  // 1. Inject SVG filter definitions into the DOM
  let svgContainer = document.getElementById('oled-svg-container');
  if (!svgContainer) {
    svgContainer = document.createElement('div');
    svgContainer.id = 'oled-svg-container';
    svgContainer.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    document.body.insertAdjacentElement('afterbegin', svgContainer);
  }

  const intensity = currentSettings.globalContrast;
  const forwardCurve = generateSCurve(intensity);
  const inverseCurve = generateInverseSCurve(intensity);
  const brightness = currentSettings.globalBrightness;
  const inverseBrightness = (1 / brightness).toFixed(3);
  const saturation = currentSettings.globalSaturation;
  const inverseSaturation = (1 / saturation).toFixed(3);

  // Forward filter: Black crush → Saturation → Brightness
  // Inverse filter (for media): Inverse Brightness → Inverse Saturation → Inverse Black crush
  // (Order is reversed for correct mathematical cancellation)
  svgContainer.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="oled-forward" color-interpolation-filters="linearRGB">
          <feComponentTransfer>
            <feFuncR type="table" tableValues="${forwardCurve}"/>
            <feFuncG type="table" tableValues="${forwardCurve}"/>
            <feFuncB type="table" tableValues="${forwardCurve}"/>
          </feComponentTransfer>
          <feColorMatrix type="saturate" values="${saturation}"/>
          <feComponentTransfer>
            <feFuncR type="linear" slope="${brightness}" intercept="0"/>
            <feFuncG type="linear" slope="${brightness}" intercept="0"/>
            <feFuncB type="linear" slope="${brightness}" intercept="0"/>
          </feComponentTransfer>
        </filter>
        <filter id="oled-inverse" color-interpolation-filters="linearRGB">
          <feComponentTransfer>
            <feFuncR type="linear" slope="${inverseBrightness}" intercept="0"/>
            <feFuncG type="linear" slope="${inverseBrightness}" intercept="0"/>
            <feFuncB type="linear" slope="${inverseBrightness}" intercept="0"/>
          </feComponentTransfer>
          <feColorMatrix type="saturate" values="${inverseSaturation}"/>
          <feComponentTransfer>
            <feFuncR type="table" tableValues="${inverseCurve}"/>
            <feFuncG type="table" tableValues="${inverseCurve}"/>
            <feFuncB type="table" tableValues="${inverseCurve}"/>
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  `;

  // 2. Apply via CSS
  let style = document.getElementById('oled-filter-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'oled-filter-style';
    document.head.appendChild(style);
  }

  style.textContent = `
    html {
      filter: url(#oled-forward) !important;
      will-change: filter;
    }
    ${MEDIA_SELECTOR} {
      filter: url(#oled-inverse) !important;
    }
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

// ============================================================
// DOM DARK MODE (True #000000 Backgrounds)
// ============================================================

function disableOled() {
  // Remove SVG filter
  const svgContainer = document.getElementById('oled-svg-container');
  if (svgContainer) svgContainer.remove();

  // Remove CSS filter
  const style = document.getElementById('oled-filter-style');
  if (style) style.remove();

  // Revert DOM modifications
  document.querySelectorAll('.oled-modified').forEach(el => {
    el.style.removeProperty('background-color');
    el.style.removeProperty('color');
    el.style.removeProperty('border-color');
    el.style.removeProperty('box-shadow');
    el.classList.remove('oled-modified');
  });

  if (observer) {
    observer.disconnect();
    isObserverActive = false;
  }
}

function oledifyPage() {
  if (!currentSettings.enabled) return;
  applyDarkMode();
  applyOledFilter();
  if (!isObserverActive) initObserver();
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

function containsMedia(el) {
  try {
    return el.querySelector(MEDIA_SELECTOR) !== null;
  } catch (e) {
    return false;
  }
}

function hasBackgroundImage(computedStyle) {
  const bgImage = computedStyle.backgroundImage;
  return bgImage && bgImage !== 'none';
}

function applyDarkMode() {
  const root = document.body || document.documentElement;
  if (!root) return;

  const elements = root.querySelectorAll('*');
  elements.forEach(el => {
    if (!el.isConnected || MEDIA_TAGS.has(el.tagName)) return;
    if (el.classList.contains('oled-modified')) return;

    try {
      const cs = window.getComputedStyle(el);
      let modified = false;

      // --- BACKGROUND: darken light backgrounds to true black ---
      const bgData = getRGBA(cs.backgroundColor);
      if (bgData && bgData.alpha > 0.5 && getLuminance(bgData.rgb) >= BG_THRESHOLD) {
        if (!hasBackgroundImage(cs) && !containsMedia(el)) {
          el.style.setProperty('background-color', '#000000', 'important');
          modified = true;
        }
      }

      // --- TEXT COLOR: adjust for readability on dark backgrounds ---
      const isInDarkContext = modified || isAncestorOledModified(el);
      if (isInDarkContext) {
        const textColor = getRGBA(cs.color);
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
      const borderData = getRGBA(cs.borderTopColor);
      if (borderData && getLuminance(borderData.rgb) >= BORDER_LIMIT) {
        if (parseFloat(cs.borderTopWidth) > 0) {
          el.style.setProperty('border-color', '#333333', 'important');
          modified = true;
        }
      }

      // --- BOX SHADOWS (remove to prevent glow on black) ---
      if (cs.boxShadow && cs.boxShadow !== 'none') {
        el.style.setProperty('box-shadow', 'none', 'important');
        modified = true;
      }

      if (modified) el.classList.add('oled-modified');
    } catch (e) { /* ignore disconnected nodes */ }
  });
}

function isAncestorOledModified(el) {
  let parent = el.parentElement;
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

// ============================================================
// HELPERS
// ============================================================
function getRGBA(colorString) {
  if (!colorString || colorString === 'transparent' || colorString === 'rgba(0, 0, 0, 0)') return null;
  const match = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
  if (!match) return null;
  const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
  if (alpha === 0) return null;
  return {
    rgb: [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])],
    alpha
  };
}

function getLuminance(rgb) {
  if (!rgb) return 255;
  // Perceptually weighted (ITU-R BT.601)
  return (0.299 * rgb[0]) + (0.587 * rgb[1]) + (0.114 * rgb[2]);
}

// ============================================================
// MUTATION OBSERVER (Debounced)
// ============================================================
function initObserver() {
  if (!currentSettings.enabled) return;

  if (document.documentElement) {
    observer = new MutationObserver((mutations) => {
      if (!currentSettings.enabled) return;
      const relevant = mutations.some(m => m.type === 'childList');
      if (!relevant) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        applyDarkMode();
      }, 300);
    });

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

// ============================================================
// ENTRY POINT
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSettingsAndRun);
} else {
  loadSettingsAndRun();
}