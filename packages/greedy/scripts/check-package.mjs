import { access, readFile } from 'node:fs/promises';

for (const filename of [
  'THIRD_PARTY_NOTICES.md',
  'native/linux-x64/greedy-rs',
  'native/windows-x64/greedy-rs.exe',
  'native/macos-arm64/greedy-rs',
]) {
  await access(new URL(`../${filename}`, import.meta.url));
}
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
console.log(`Verified release inputs for ${manifest.name}@${manifest.version}`);
