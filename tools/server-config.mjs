import { isIP } from 'node:net';

export function networkPort(value, name = 'SERVER_PORT') {
  const text = String(value ?? '').trim();
  if (!/^[1-9]\d{0,4}$/.test(text) || Number(text) > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535.`);
  }
  return Number(text);
}

export function serverConfig(address, port, httpsPort = '50027') {
  const host = String(address ?? '')
    .trim()
    .replace(/^\[([^\]]+)\]$/, '$1');
  const domain =
    host.length <= 253 &&
    host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
  if (!host || host.includes('%') || (!isIP(host) && (!domain || /^[\d.]+$/.test(host)))) {
    throw new Error(
      'SERVER_ADDR must be a hostname or IP address, without a scheme, port or path.',
    );
  }
  const apiPort = networkPort(port);
  const publicPort = networkPort(httpsPort, 'SERVER_HTTPS_PORT');
  const authority = isIP(host) === 6 ? `[${host}]` : host;
  return {
    host,
    port: apiPort,
    httpsPort: publicPort,
    apiURL: `https://${authority}:${publicPort}/api`,
    listenAddress: `:${apiPort}`,
  };
}
