import {neurodeskViteConfig} from '../../scripts/lib/vite-app-config.mjs';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {isolationFallback} from '../../scripts/lib/isolation-fallback-plugin.mjs';
const syncroPackage=JSON.parse(await readFile(new URL('../../packages/syncro/package.json',import.meta.url),'utf8'));
const appPackage=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8'));
if(syncroPackage.version!==appPackage.version)throw new Error('SYNcro app and package versions must match.');
// MindGrab and registration runtime assets are staged into public/ by scripts/copy-runtime-assets.mjs.
function assets(){return {name:'syncro-assets',async generateBundle(){
 for(const name of ['FSL-LICENSE.txt'])this.emitFile({type:'asset',fileName:'data/'+name,source:await readFile(new URL('../../packages/syncro/data/'+name,import.meta.url))});
 execFileSync('node',['scripts/build.mjs'],{cwd:new URL('../../packages/syncro/',import.meta.url),stdio:'inherit'});
 const temporary=await mkdtemp(join(tmpdir(),'syncro-pack-'));
 try {const packed=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',temporary],{cwd:new URL('../../packages/syncro/',import.meta.url),encoding:'utf8'}));
 this.emitFile({type:'asset',fileName:'downloads/'+packed[0].filename,source:await readFile(join(temporary,packed[0].filename))});}finally{await rm(temporary,{recursive:true,force:true});}
}};}
export default neurodeskViteConfig({appId:'syncro',plugins:[assets(),isolationFallback()],define:{__SYNCRO_PACKAGE_VERSION__:JSON.stringify(syncroPackage.version)},build:{target:'esnext'},optimizeDeps:{exclude:['onnxruntime-web']},server:{host:'127.0.0.1',port:5175},preview:{host:'127.0.0.1',port:5175}});
