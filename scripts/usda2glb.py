"""Convert a single-mesh Hyper3D/Blender sim_ready.usda (Z-up, triangulated,
faceVarying normals + st) into a Y-up GLB with an embedded JPEG texture.

usage: python3 -I usda2glb.py <in.usda> <texture.png> <out.glb> <texSize> <workdir>
"""
import json, re, struct, subprocess, sys

src, tex, out, size, work = sys.argv[1:6]
txt = open(src).read()


def arr(name, kind):
    m = re.search(re.escape(name) + r'\s*=\s*\[([^\]]*)\]', txt)
    if not m:
        raise SystemExit('missing ' + name)
    body = m.group(1)
    if kind == 'int':
        return [int(v) for v in re.findall(r'-?\d+', body)]
    tup = re.findall(r'\(([^)]*)\)', body)
    return [tuple(float(v) for v in t.split(',')) for t in tup]


counts = arr('int[] faceVertexCounts', 'int')
idx = arr('int[] faceVertexIndices', 'int')
pts = arr('point3f[] points', 'vec')
nrm = arr('normal3f[] normals', 'vec')
st = arr('texCoord2f[] primvars:st', 'vec')
assert all(c == 3 for c in counts), 'non-triangle faces'
assert len(nrm) == len(idx) == len(st), (len(nrm), len(idx), len(st))

# Z-up → Y-up: (x, y, z) → (x, z, -y)
zy = lambda v: (v[0], v[2], -v[1])

verts, remap, indices = [], {}, []
for k, pi in enumerate(idx):
    n = zy(nrm[k])
    key = (pi, round(n[0], 3), round(n[1], 3), round(n[2], 3), round(st[k][0], 5), round(st[k][1], 5))
    vi = remap.get(key)
    if vi is None:
        vi = len(verts)
        remap[key] = vi
        verts.append((zy(pts[pi]), n, (st[k][0], 1.0 - st[k][1])))
    indices.append(vi)

subprocess.run(['sips', '-Z', size, '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', tex,
                '--out', f'{work}/tex.jpg'], check=True, capture_output=True)
jpg = open(f'{work}/tex.jpg', 'rb').read()

buf = bytearray()
views, accessors = [], []


def push(data, target=None):
    while len(buf) % 4:
        buf.append(0)
    v = {'buffer': 0, 'byteOffset': len(buf), 'byteLength': len(data)}
    if target:
        v['target'] = target
    buf.extend(data)
    views.append(v)
    return len(views) - 1


P = [v[0] for v in verts]
mn = [min(p[i] for p in P) for i in range(3)]
mx = [max(p[i] for p in P) for i in range(3)]
pv = push(b''.join(struct.pack('<3f', *p) for p in P), 34962)
nv = push(b''.join(struct.pack('<3f', *v[1]) for v in verts), 34962)
tv = push(b''.join(struct.pack('<2f', *v[2]) for v in verts), 34962)
big = len(verts) > 65535
iv = push(b''.join(struct.pack('<I' if big else '<H', i) for i in indices), 34963)
iview = push(jpg)
accessors = [
    {'bufferView': pv, 'componentType': 5126, 'count': len(verts), 'type': 'VEC3', 'min': mn, 'max': mx},
    {'bufferView': nv, 'componentType': 5126, 'count': len(verts), 'type': 'VEC3'},
    {'bufferView': tv, 'componentType': 5126, 'count': len(verts), 'type': 'VEC2'},
    {'bufferView': iv, 'componentType': 5125 if big else 5123, 'count': len(indices), 'type': 'SCALAR'},
]
name = out.rsplit('/', 1)[-1].rsplit('.', 1)[0]
gltf = {
    'asset': {'version': '2.0', 'generator': 'usda2glb (ForestDefenderII)'},
    'scene': 0, 'scenes': [{'nodes': [0]}],
    'nodes': [{'mesh': 0, 'name': name}],
    'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2},
                                              'indices': 3, 'material': 0}]}],
    'materials': [{'name': name, 'doubleSided': False,
                   'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 1.0}}],
    'textures': [{'source': 0, 'sampler': 0}],
    'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
    'images': [{'bufferView': iview, 'mimeType': 'image/jpeg'}],
    'accessors': accessors, 'bufferViews': views,
}
while len(buf) % 4:
    buf.append(0)
gltf['buffers'] = [{'byteLength': len(buf)}]
js = json.dumps(gltf, separators=(',', ':')).encode()
while len(js) % 4:
    js += b' '
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(buf), 0x004E4942)); f.write(buf)
print(name, 'verts', len(verts), 'tris', len(indices) // 3, 'bytes', 12 + 8 + len(js) + 8 + len(buf),
      'bbox', [round(a, 3) for a in mn], [round(a, 3) for a in mx])
