# SYNcro tutorial assets

These deidentified NIfTI images reproduce the four tutorials documented by
[`rordenlab/SYNcro`](https://github.com/rordenlab/SYNcro) at source revision
`8e2d82f743c475611903dd870a218b97751ff11e`. They are browser examples, not
validation goldens. Consumers must pin the Hugging Face dataset commit and
verify both byte length and SHA-256 before exposing a file to the pipeline.

| File | Bytes | SHA-256 | Source | Terms |
| --- | ---: | --- | --- | --- |
| `CT.nii.gz` | 5,812,929 | `d1df3c9899b5703da5237c2f6f7c0f7e95652400973e9239e895292a1dd6fa7a` | [Acute Ischemic Stroke Dataset](https://github.com/GriffinLiang/AISD) | AISD non-commercial dataset terms |
| `CT-lesion.nii.gz` | 7,925 | `a5b1503f73baf467d104296d18a9e89c694f52ae35c2849962abd8331a9b9eed` | [Acute Ischemic Stroke Dataset](https://github.com/GriffinLiang/AISD) | AISD non-commercial dataset terms |
| `T1w.nii.gz` | 3,438,242 | `8c2729a64df0e4b5e11e58b803a50736be2b061f3d066f83f39f479e4438e901` | [Clinical toolbox](https://github.com/neurolabusc/Clinical) | BSD-2-Clause repository license |
| `T1w-lesion.nii.gz` | 8,384 | `4884512a6a4ec256e5851db827cebab086a5b0f27d22eadecb03e03cb0c211a0` | [SYNcro tutorial](https://github.com/rordenlab/SYNcro/tree/8e2d82f743c475611903dd870a218b97751ff11e/tutorial) | `NOASSERTION` |
| `sub-101_T1w.nii.gz` | 4,619,526 | `753ed0812286604068a67489caecf8df2e8f3349de8e5af3d18f5c6744be6869` | [OpenNeuro ds004889 1.1.2](https://openneuro.org/datasets/ds004889/versions/1.1.2) | CC0-1.0 |
| `sub-101_rec-TRACE_dwi.nii.gz` | 631,349 | `27303b7a328840c20b5f736ab1aebd6d9d5fee55e62eac840a271864e689c73d` | [OpenNeuro ds004889 1.1.2](https://openneuro.org/datasets/ds004889/versions/1.1.2) | CC0-1.0 |
| `sub-101_space-TRACE_desc-lesion_mask.nii.gz` | 2,381 | `cdd5cc70dcc49f425e90e9b102545708ce70ecb76179fcdfc739ab258eea1b92` | [OpenNeuro ds004889 1.1.2](https://openneuro.org/datasets/ds004889/versions/1.1.2) | CC0-1.0 |

The assets have mixed upstream terms. `LicenseRef-AISD-NonCommercial` means the
AISD dataset permits academic and non-academic use only for non-commercial
research, teaching, publication or personal experimentation. `NOASSERTION`
records that the tutorial repository does not state terms for the derived T1w
lesion annotation; it is not a grant of redistribution permission. Confirm that
permission before a public release. The webapps source-code license does not
relicense any image.
