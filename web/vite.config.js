import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
  root: path.resolve(process.cwd(), 'web'),
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5180, proxy: { '/api': 'http://127.0.0.1:8930' } },
  base: '/utrip/',
  /* emptyOutDir 关掉：保留历史 hash 产物，让还缓存着旧 index.html 的浏览器仍能跑起来。
     代价是 dist 会慢慢堆文件，需要时手工清一次即可。 */
  build: { outDir: path.resolve(process.cwd(), 'web/dist'), emptyOutDir: false },
});
