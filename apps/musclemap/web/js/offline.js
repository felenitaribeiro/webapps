import { createInfoDialog, renderCommand } from '@neurodesk/webapp-components/ui';

const offline = createInfoDialog({ id: 'offlineDialog' });
document.getElementById('standaloneButton').addEventListener('click', () => {
  offline.open('Run offline', document.getElementById('offlineContent'));
  offline.body.querySelector('#offlineChecksumCommand').append(renderCommand({
    id: 'offlineChecksum',
    label: 'container checksum command',
    command: "echo '8322cc60d222b9cecd053c0d0c9362b6  musclemap_1.4.0_20260827.simg' | md5sum --check",
  }).root);
  offline.body.querySelector('#offlineRunCommand').append(renderCommand({
    id: 'offlineRun',
    label: 'offline segmentation command',
    command: 'apptainer exec --cleanenv --bind "$PWD:/data" --pwd /data musclemap_1.4.0_20260827.simg mm_segment -i /data/image.nii.gz -r wholebody --model_version 1.4 -g N',
  }).root);
});
