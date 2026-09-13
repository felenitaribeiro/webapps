---
"greedy": patch
"topofit": patch
"@neurodesk/topofit": patch
"syncro": patch
"synthsr": patch
"@neurodesk/webapp-components": patch
"@neurodesk/runtime-support": patch
---

Greedy shows all three viewer panels on phones. TopoFit conforms oblique scans through the same order-3 cubic spline as axis-aligned ones. SYNcro serves its MindGrab and registration runtime assets in the dev server. The shared WebGPU U-Net executor lets the adapter's buffer limits govern full-volume SynthSR, so a 256×256×192 T1 runs full-volume on Apple silicon.
