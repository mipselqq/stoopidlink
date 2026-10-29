import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve('dist');
let checked = 0;

function localFile(specifier, owner) {
  if (!specifier.startsWith('.')) return;
  const file = resolve(dirname(owner), specifier.split(/[?#]/)[0]);
  assert.ok(existsSync(file), `${owner} refers to missing bundle file: ${specifier}`);
  checked++;
}

function javascript(source, owner) {
  const ast = ts.createSourceFile(owner, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      localFile(node.moduleSpecifier.text, owner);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const path = node.arguments[0];
      if (path && ts.isStringLiteralLike(path)) localFile(path.text, owner);
    }
    if (ts.isNewExpression(node) && node.expression.getText(ast) === 'URL') {
      const [path, base] = node.arguments ?? [];
      if (path && ts.isStringLiteralLike(path) && base?.getText(ast) === 'import.meta.url') {
        localFile(path.text, owner);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}

const index = resolve(root, 'index.html');
const html = readFileSync(index, 'utf8');
assert.ok(!html.includes('/src/main.ts'), 'The build still points to the development entry.');
const entry = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(entry, 'The standalone module entry is missing.');
javascript(entry, index);
for (const file of readdirSync(resolve(root, 'assets'))) {
  if (file.endsWith('.js')) {
    const path = resolve(root, 'assets', file);
    javascript(readFileSync(path, 'utf8'), path);
  }
}
console.log(`Build verified: inline entry and ${checked} local module/worker references.`);
