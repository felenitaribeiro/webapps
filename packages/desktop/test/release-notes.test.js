import test from 'node:test';
import assert from 'node:assert/strict';
import { renderInstallationNotes } from '../../../scripts/desktop/release-notes.mjs';

const base = 'https://github.com/neurodesk/webapps/releases/download/webapps-v0.6.20260916/';
const download = {
  version: '0.6.20260916', platform: 'windows-x64', kind: 'desktop', modelsIncluded: true,
  url: base + 'suite.zip.install.txt', sha256: 'a'.repeat(64),
  archiveFilename: 'suite.zip', archiveSha256: 'b'.repeat(64),
  parts: [{ url: base + 'suite.zip.part01' }, { url: base + 'suite.zip.part02' }],
};

test('multipart instructions download binary parts, join in order and verify the archive before extracting', () => {
  const notes = renderInstallationNotes([download]);
  assert.match(notes, /Invoke-WebRequest.*suite.zip.part01/);
  assert.match(notes, /copy \/b suite.zip.part01\+suite.zip.part02 suite.zip/);
  assert.match(notes, new RegExp('Get-FileHash.*' + download.archiveSha256));
  assert.doesNotMatch(notes, /install\.txt|aaaaaaaa/);
  assert.ok(notes.indexOf('Get-FileHash') < notes.indexOf('Expand-Archive'));
  assert.match(notes, /Start-Process/);
});

test('single-file and Apptainer downloads need no concatenation or archive extraction', () => {
  const notes = renderInstallationNotes([{
    version: download.version, platform: 'linux-x64-apptainer', kind: 'container', modelsIncluded: false,
    url: base + 'suite.sif', sha256: 'c'.repeat(64),
  }]);
  assert.match(notes, /curl --fail --location --retry 3/);
  assert.match(notes, /sha256sum -c -/);
  assert.match(notes, /apptainer run 'suite.sif' --verify/);
  assert.doesNotMatch(notes, /cat '|tar -x|unzip|Expand-Archive/);
});
