// Icon bundle loader - extracts SVG icons from icons.bundle file
// Bundle format: magic(4) + count(4) + [keyLen(2) + key + dataLen(4) + data]...
import _bundleUrl from '../icons.bundle';

let ICONS = {};
let bundleLoaded = false;
let bundlePromise = null;
const pendingIcons = new Set(); // Track pending icon names

function parseBundle(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const uint8 = new Uint8Array(arrayBuffer);
  let offset = 0;

  // Verify magic
  const magicBytes = uint8.subarray(offset, offset + 4);
  const magic = new TextDecoder().decode(magicBytes);
  if (magic !== 'FDIC') throw new Error(`Invalid icons bundle format: got "${magic}"`);
  offset += 4;

  // Read count
  const count = view.getUint32(offset, true);
  offset += 4;

  const result = {};
  for (let i = 0; i < count; i++) {
    // Read key length and key
    const keyLen = view.getUint16(offset, true);
    offset += 2;
    const keyBytes = uint8.subarray(offset, offset + keyLen);
    const key = new TextDecoder().decode(keyBytes);
    offset += keyLen;

    // Read data length and data
    const dataLen = view.getUint32(offset, true);
    offset += 4;
    const dataBytes = uint8.subarray(offset, offset + dataLen);
    const data = new TextDecoder().decode(dataBytes);
    offset += dataLen;

    // Convert to data URL for use with mask-image
    const base64 = btoa(data);
    result[key] = `data:image/svg+xml;base64,${base64}`;
  }

  return result;
}

// Update all icon elements with the loaded URLs
function updateAllIcons() {
  document.querySelectorAll('.fd-icon[data-icon]').forEach(el => {
    const name = el.dataset.icon;
    const url = ICONS[name];
    if (url) {
      el.style.maskImage = `url('${url}')`;
      el.style.webkitMaskImage = `url('${url}')`;
    }
  });
}

async function loadBundle(url = _bundleUrl) {
  if (bundleLoaded) return;
  if (bundlePromise) return bundlePromise;

  bundlePromise = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load icons bundle: ${response.status}`);
      const buffer = await response.arrayBuffer();

      ICONS = parseBundle(buffer);
      bundleLoaded = true;

      // Update all existing icon elements
      updateAllIcons();

      // Watch for new icon elements
      const observer = new MutationObserver(updateAllIcons);
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      console.error('Failed to load icon bundle:', e);
      throw e;
    }
  })();

  return bundlePromise;
}

// Start loading the bundle immediately
loadBundle();

// Returns markup for a tinted icon span. `name` must be a key in ICONS.
// opts.className: extra class(es) to append (e.g. to inherit a specific element's color).
// opts.style: extra inline CSS appended after the mask-image rules (e.g. transform flip).
export function icon(name, { className = '', style = '' } = {}) {
  const url = ICONS[name];
  const cls = className ? `fd-icon ${className}` : 'fd-icon';
  // Use data-icon attribute to track the icon name for later updates
  // If bundle is loaded, set the mask-image directly; otherwise it will be set via MutationObserver
  if (url) {
    return `<span class="${cls}" data-icon="${name}" style="-webkit-mask-image:url('${url}');mask-image:url('${url}');${style}"></span>`;
  } else {
    // Bundle not loaded yet - return placeholder that will be updated when loaded
    return `<span class="${cls}" data-icon="${name}" style="${style}"></span>`;
  }
}
