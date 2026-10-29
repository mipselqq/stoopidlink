import { readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function terminalEntry(): Plugin {
  return {
    name: 'terminal-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(
          '<!-- terminal-entry -->',
          '<script type="module" src="/src/main.ts"></script>',
        );
      },
    },
  };
}

function standaloneHtml(): Plugin {
  return {
    name: 'standalone-html',
    apply: 'build',
    closeBundle() {
      const out = resolve(import.meta.dirname, 'dist');
      let html = readFileSync(resolve(out, 'index.html'), 'utf8').replace(
        /<script id="file-fallback">[\s\S]*?<\/script>/,
        '',
      );
      const scriptTag = /<script type="module" crossorigin src="([^"]+)"><\/script>/;
      const scriptUrl = scriptTag.exec(html)?.[1];
      const styleTag = /<link rel="stylesheet" crossorigin href="([^"]+)">/;
      const styleUrl = styleTag.exec(html)?.[1];
      if (!scriptUrl || !styleUrl)
        this.error('Could not find the generated JavaScript and CSS files to inline.');

      const scriptPath = resolve(out, scriptUrl);
      const stylePath = resolve(out, styleUrl);
      let css = readFileSync(stylePath, 'utf8');
      for (const font of ['jixellation-regular.woff2', 'jixellation-bold.woff2']) {
        const data = readFileSync(
          resolve(import.meta.dirname, 'public/assets/fonts', font),
        ).toString('base64');
        css = css.replaceAll(`url(../assets/fonts/${font})`, `url(data:font/woff2;base64,${data})`);
      }
      const js = readFileSync(scriptPath, 'utf8').replace(
        /import\((['"])\.\/([^'"]+)\1\)/g,
        (_match, quote, file) => `import(${quote}./assets/${file}${quote})`,
      );
      html = html
        .replace(scriptTag, `<script type="module">${js}</script>`)
        .replace(styleTag, `<style>${css}</style>`);
      writeFileSync(resolve(out, 'index.html'), html);
      unlinkSync(scriptPath);
      unlinkSync(stylePath);
      rmSync(resolve(out, 'assets/fonts'), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  base: './',
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8081', xfwd: true } } },
  preview: { proxy: { '/api': { target: 'http://127.0.0.1:8081', xfwd: true } } },
  plugins: [terminalEntry(), standaloneHtml()],
  build: { target: 'es2022', assetsInlineLimit: 4096, modulePreload: false },
});
