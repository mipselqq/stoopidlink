import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serverConfig } from './server-config.mjs';

export function pagesApiURL(address, port, httpsPort = '50027') {
  return serverConfig(address, port, httpsPort).apiURL;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const apiURL = pagesApiURL(
      process.env.SERVER_ADDR,
      process.env.SERVER_PORT,
      process.env.SERVER_HTTPS_PORT,
    );
    const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      stdio: 'inherit',
      env: { ...process.env, VITE_SHARED_API_URL: apiURL },
    });
    if (build.error) throw build.error;
    process.exitCode = build.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
