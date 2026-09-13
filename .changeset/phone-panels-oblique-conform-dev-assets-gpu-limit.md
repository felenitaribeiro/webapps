---
"greedy": patch
"topofit": patch
"@neurodesk/topofit": patch
"syncro": patch
"synthsr": patch
"@neurodesk/webapp-components": patch
"@neurodesk/runtime-support": patch
"ants": patch
---

Greedy and EdgeReg show all three viewer panels on phones. TopoFit conforms oblique scans through the same order-3 cubic spline as axis-aligned ones. SYNcro serves its MindGrab and registration runtime assets in the dev server. SynthSR opts into its validated large-buffer WebGPU path, so a 256×256×192 T1 runs full-volume on the measured Apple M4 Pro while other shared U-Net callers retain their existing limit. Add the standalone ANTS registration demo.
