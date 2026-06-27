// Asset import type declarations — lets the bundler/IDE resolve binary imports.
declare module '*.glb' { const src: string; export default src; }
declare module '*.gltf' { const src: string; export default src; }
declare module '*.bundle' { const src: string; export default src; }
