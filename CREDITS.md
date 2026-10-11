# Credits

Everything is bundled locally; nothing is hotlinked.

## Code and libraries

| Name | Use | Licence |
|---|---|---|
| [three.js](https://threejs.org) | rendering | MIT |
| [Rapier](https://rapier.rs) (`@dimforge/rapier3d-compat`) | physics | Apache-2.0 |
| [Vite](https://vitejs.dev) | build tooling | MIT |

## Models and textures

| Asset | File | Source | Licence |
|---|---|---|---|
| Detailed tree geometry and leaf texture | `src/assets/fluffy-tree-*` | [fluffytree-threejs](https://github.com/leoawen/fluffytree-threejs) by Leonardo Soares Gonçalves | MIT (full text in `public/fluffy-tree-license.txt`) |
| Delivery van (Cesium Milk Truck) | `public/models/truck.glb` | © 2017 Cesium, from [glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CesiumMilkTruck) (Khronos Group) | [CC-BY 4.0 International with Trademark Limitations](https://creativecommons.org/licenses/by/4.0/). The Cesium logo on the model is a Cesium trademark and is not covered by the licence grant. |

## Audio

The engine, wind, road and collision sounds are synthesised at runtime with the Web Audio API. No audio files are used.

## Story

Story text is original (see `story/`).
