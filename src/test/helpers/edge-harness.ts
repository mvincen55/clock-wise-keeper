import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';

/** Execute the shipped Deno entry point with mocked external modules and gateway.
 * Relative application modules are real; no network or production credentials. */
export function loadEdge(file: string, externals: Record<string, unknown>, gateway: typeof fetch) {
  let handler: (req: Request) => Promise<Response>;
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  function load(path: string): Record<string, unknown> {
    path = resolve(path);
    if (cache.has(path)) return cache.get(path)!.exports;
    const module = { exports: {} as Record<string, unknown> };
    cache.set(path, module);
    const js = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const require = (name: string) => {
      if (name in externals) return externals[name];
      if (name.startsWith('.')) return load(resolve(dirname(path), name));
      throw new Error(`Unmocked external module: ${name}`);
    };
    const Deno = { env: { get: () => 'synthetic-config' }, serve: (fn: typeof handler) => { handler = fn; } };
    new Function('require', 'module', 'exports', 'Deno', 'fetch', 'process', js)(require, module, module.exports, Deno, gateway, { env: {} });
    return module.exports;
  }
  const exports = load(file);
  return { exports, handle: (req: Request) => handler(req) };
}
