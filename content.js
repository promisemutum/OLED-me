function injectOledStyles() {
  if (document.getElementById('oled-ify-styles')) return;

  const style = document.createElement('style');
  style.id = 'oled-ify-styles';

  style.textContent = `
    /* ── 1. Root: black canvas + safe text color (NO filter) ── */
    /* We removed filter: contrast() saturate() from html.
       That filter was the #1 reason videos/iframes went black. */
    html, body {
      background-color: #000000 !important;
      color: #e6e6e6 !important;
    }

    /* ── 2. UI containers: black bg, light text ── */
    /* :not(:has(...)) skips any container that directly holds media,
       so thumbnail/hero/avatar wrappers keep their background-image. */
    div:not(:has(> img)):not(:has(> video)):not(:has(> picture)):not(:has(> svg)):not(:has(> canvas)),
    header, nav, footer, section, aside, main, article {
      background-color: #000000 !important;
      color: #e6e6e6 !important;
    }

    /* ── 3. Media: fully protected ── */
    /* No filter, transparent background, never overridden. */
    img, picture, video, canvas, svg, iframe {
      filter: none !important;
      background-color: transparent !important;
    }

    /* ── 4. Scrollbar ── */
    ::-webkit-scrollbar { background: #000 !important; }
    ::-webkit-scrollbar-thumb { background: #1f1f1f !important; }
  `;

  document.documentElement.appendChild(style);
}

injectOledStyles();