import * as THREE from 'three';

const gradientData = new Uint8Array([48, 132, 224]);
export const toonGradientMap = new THREE.DataTexture(
  gradientData,
  gradientData.length,
  1,
  THREE.RedFormat
);
toonGradientMap.minFilter = THREE.NearestFilter;
toonGradientMap.magFilter = THREE.NearestFilter;
toonGradientMap.generateMipmaps = false;
toonGradientMap.needsUpdate = true;

const convertedMaterials = new WeakMap();

export function toToonMaterial(source) {
  if (!source) return source;
  const cached = convertedMaterials.get(source);
  if (cached) return cached;

  const toon = new THREE.MeshToonMaterial({
    color: source.color ?? 0xffffff,
    map: source.map ?? null,
    gradientMap: toonGradientMap,
    emissive: source.emissive ?? 0x000000,
    emissiveMap: source.emissiveMap ?? null,
    emissiveIntensity: source.emissiveIntensity ?? 1,
    alphaMap: source.alphaMap ?? null,
    alphaTest: source.alphaTest ?? 0,
    transparent: source.transparent ?? false,
    opacity: source.opacity ?? 1,
    side: source.side ?? THREE.FrontSide,
    vertexColors: source.vertexColors ?? false,
    wireframe: source.wireframe ?? false,
  });
  toon.name = source.name;
  convertedMaterials.set(source, toon);
  return toon;
}
