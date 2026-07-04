import _bundleUrl from '../models.bundle';

const MAGIC = 'FDB1';

export async function loadBundle(url = _bundleUrl) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load model bundle: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  let offset = 0;

  const magic = new TextDecoder().decode(new Uint8Array(buffer, offset, 4));
  offset += 4;
  if (magic !== MAGIC) throw new Error('Invalid model bundle signature');

  const count = view.getUint32(offset, true);
  offset += 4;

  const map = new Map();
  for (let i = 0; i < count; i++) {
    const keyLen = view.getUint16(offset, true);
    offset += 2;
    const key = new TextDecoder().decode(new Uint8Array(buffer, offset, keyLen));
    offset += keyLen;
    const dataLen = view.getUint32(offset, true);
    offset += 4;
    map.set(key, buffer.slice(offset, offset + dataLen));
    offset += dataLen;
  }

  return map;
}
