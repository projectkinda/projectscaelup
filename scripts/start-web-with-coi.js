#!/usr/bin/env node
// expo-sqlite's web backend needs SharedArrayBuffer, which browsers only
// expose on cross-origin-isolated pages (COOP/COEP response headers).
// @expo/cli's dev server serves the HTML shell through an internal layer
// that metro.config.js's server.enhanceMiddleware can't reach, so instead
// we run the real dev server on an internal port and front it with a tiny
// reverse proxy (on the port the harness/user actually hits) that adds
// those two headers to every response, including the HTML document.
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const publicPort = Number(process.env.PORT) || 8081;

function findFreePort(callback) {
  const finder = net.createServer();
  finder.listen(0, '127.0.0.1', () => {
    const { port } = finder.address();
    finder.close(() => callback(port));
  });
}

function waitForUpstream(internalPort, callback) {
  const attempt = () => {
    const req = http.get({ host: '127.0.0.1', port: internalPort, path: '/' }, res => {
      res.resume();
      callback();
    });
    req.on('error', () => setTimeout(attempt, 300));
  };
  attempt();
}

function addCoiHeaders(headers) {
  return {
    ...headers,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  };
}

findFreePort(internalPort => {
  const expo = spawn(
    'npx',
    ['expo', 'start', '--web', '--port', String(internalPort)],
    { stdio: 'inherit' },
  );

  expo.on('exit', code => {
    process.exit(code ?? 0);
  });

  waitForUpstream(internalPort, () => {
    const proxy = http.createServer((clientReq, clientRes) => {
      const upstreamReq = http.request(
        {
          host: '127.0.0.1',
          port: internalPort,
          path: clientReq.url,
          method: clientReq.method,
          headers: clientReq.headers,
        },
        upstreamRes => {
          clientRes.writeHead(upstreamRes.statusCode, addCoiHeaders(upstreamRes.headers));
          upstreamRes.pipe(clientRes);
        },
      );
      upstreamReq.on('error', () => clientRes.destroy());
      clientReq.pipe(upstreamReq);
    });

    proxy.on('upgrade', (clientReq, clientSocket, head) => {
      const upstreamReq = http.request({
        host: '127.0.0.1',
        port: internalPort,
        path: clientReq.url,
        method: clientReq.method,
        headers: clientReq.headers,
      });
      upstreamReq.end();
      upstreamReq.on('upgrade', (upstreamRes, upstreamSocket) => {
        clientSocket.write(
          `HTTP/1.1 101 Switching Protocols\r\n` +
            Object.entries(upstreamRes.headers)
              .map(([key, value]) => `${key}: ${value}\r\n`)
              .join('') +
            '\r\n',
        );
        upstreamSocket.write(head);
        upstreamSocket.pipe(clientSocket);
        clientSocket.pipe(upstreamSocket);
      });
      upstreamReq.on('error', () => clientSocket.destroy());
    });

    proxy.listen(publicPort, () => {
      console.log(
        `[start-web-with-coi] Serving cross-origin-isolated web preview on http://localhost:${publicPort} (proxying expo on ${internalPort})`,
      );
    });
  });
});
