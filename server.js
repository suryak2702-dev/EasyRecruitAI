/**
 * Node.js wrapper that starts the Python FastAPI backend and reverse-proxies
 * all HTTP requests to it. Bolt's preview only supports Node.js-based servers,
 * so this shim lets the real EasyRecruit Python application run inside Bolt.
 */
const { spawn } = require("child_process");
const http = require("http");
const httpProxy = require("http-proxy");

const PYTHON_PORT = 8001;
// Bolt's PORT env (9091) is used by Bolt's own infrastructure proxy.
// The preview system detects our server from stdout, so we listen on 3000.
const PREVIEW_PORT = 3000;

// Start the Python backend
const pythonProc = spawn("python3", ["main.py"], {
  env: { ...process.env, PORT: String(PYTHON_PORT), HOST: "127.0.0.1", DEBUG: "false" },
  stdio: ["ignore", "pipe", "pipe"],
  cwd: __dirname,
});

pythonProc.stdout.on("data", (data) => {
  process.stdout.write(`[python] ${data}`);
});
pythonProc.stderr.on("data", (data) => {
  process.stderr.write(`[python] ${data}`);
});
pythonProc.on("exit", (code) => {
  console.error(`Python backend exited with code ${code}`);
  process.exit(code || 1);
});

// Graceful shutdown
function killPython() {
  try { pythonProc.kill("SIGTERM"); } catch (e) {}
}
process.on("SIGINT", () => { killPython(); process.exit(0); });
process.on("SIGTERM", () => { killPython(); process.exit(0); });

// Wait for Python to be ready, then start the proxy (one-shot)
let started = false;
function waitForPython(maxRetries, callback) {
  let retries = 0;
  function tryConnect() {
    if (started) return;
    const req = http.get(`http://127.0.0.1:${PYTHON_PORT}/api/v1/health`, (res) => {
      if (res.statusCode === 200 && !started) {
        started = true;
        console.log(`Python backend is ready on port ${PYTHON_PORT}`);
        callback();
      } else {
        retry();
      }
      res.resume();
    });
    req.on("error", () => retry());
    req.setTimeout(2000, () => { req.destroy(); retry(); });
  }
  function retry() {
    retries++;
    if (retries >= maxRetries) {
      console.error(`Python backend did not start after ${maxRetries} attempts`);
      process.exit(1);
    }
    setTimeout(tryConnect, 500);
  }
  tryConnect();
}

const proxy = httpProxy.createProxyServer({});

proxy.on("error", (err, req, res) => {
  console.error("Proxy error:", err.message);
  if (res && !res.headersSent) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ detail: "Backend temporarily unavailable. The Python server may be starting up." }));
  }
});

waitForPython(60, () => {
  const server = http.createServer((req, res) => {
    proxy.web(req, res, { target: `http://127.0.0.1:${PYTHON_PORT}` });
  });

  // WebSocket support (uvicorn uses it for reload/lifespan)
  server.on("upgrade", (req, socket, head) => {
    proxy.ws(req, socket, head, { target: `ws://127.0.0.1:${PYTHON_PORT}` });
  });

  server.listen(PREVIEW_PORT, "0.0.0.0", () => {
    console.log(`EasyRecruit proxy listening on port ${PREVIEW_PORT} → Python backend on ${PYTHON_PORT}`);
  });
  server.on("error", (err) => {
    console.error(`Server error: ${err.message}`);
  });
});
