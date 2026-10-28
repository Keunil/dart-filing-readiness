import { cp, mkdir, unlink } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
try { await unlink('dist/samples.js'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await cp('public', 'dist', { recursive: true });
console.log('Static app copied to dist/');
