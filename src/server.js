// Custom Next.js production server.
// The sandbox network layer drops `Transfer-Encoding: chunked` response bodies,
// so `next start` never delivers a body. This server fully buffers each response
// (status line + headers + body), strips `transfer-encoding`, sets an explicit
// `content-length`, and flushes everything in a single write. This also works
// around Next's built-in compression (which would otherwise send headers before
// our hook runs and trigger ERR_HTTP_HEADERS_SENT).
// Listens on both IPv4 and IPv6 stacks.

const { createServer } = require('http');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const chunks = [];
    let statusCode = 200;
    const headers = {};

    const origWriteHead = res.writeHead.bind(res);
    const origSetHeader = res.setHeader.bind(res);
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    const origFlushHeaders = res.flushHeaders ? res.flushHeaders.bind(res) : null;

    const key = (n) => String(n).toLowerCase();

    res.setHeader = (name, value) => {
      headers[key(name)] = value;
      return res;
    };
    res.getHeader = (name) => headers[key(name)];
    res.getHeaders = () => headers;
    res.hasHeader = (name) => headers[key(name)] !== undefined;
    res.removeHeader = (name) => {
      delete headers[key(name)];
      return res;
    };
    res.getHeaderNames = () => Object.keys(headers);

    res.writeHead = (status, statusMessage, h) => {
      let hdrs = h;
      if (typeof status === 'object') {
        hdrs = status;
        status = 200;
      } else if (typeof statusMessage === 'object' && !h) {
        hdrs = statusMessage;
      }
      statusCode = status;
      if (hdrs) {
        for (const k of Object.keys(hdrs)) headers[key(k)] = hdrs[k];
      }
      return res;
    };

    // Neutralize streaming flushes; we deliver the full body at once.
    if (origFlushHeaders) res.flushHeaders = () => {};

    res.write = (chunk) => {
      if (chunk != null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return true;
    };

    res.end = (chunk) => {
      if (chunk != null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      delete headers['transfer-encoding'];
      headers['content-length'] = body.length;
      origWriteHead(statusCode, headers);
      origWrite(body);
      origEnd();
      return res;
    };

    handle(req, res);
  });

  server.on('error', (err) => {
    // The second dual-stack bind (:: vs 0.0.0.0) on the same port collides on
    // platforms that share the socket; ignore it.
    if (err.code === 'EADDRINUSE') return;
    console.error('[server] error:', err);
  });

  server.listen(port, '::', () => {
    console.log(`> Ready on http://[::]:${port}`);
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`> Ready on http://0.0.0.0:${port}`);
  });
  console.log(`> Fox English frontend starting on port ${port}`);
});
