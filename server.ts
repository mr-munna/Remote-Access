import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Shared files in-memory store (expires after 15 minutes)
interface SharedFile {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  expiresAt: number;
}

const sharedFiles = new Map<string, SharedFile>();

// Clean up expired shared files every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, file] of sharedFiles.entries()) {
    if (now > file.expiresAt) {
      sharedFiles.delete(id);
    }
  }
}, 5 * 60 * 1000);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const PORT = 3000;

  // Parse JSON payloads up to 100MB to allow file uploading/sharing
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ limit: "100mb", extended: true }));

  // API Route: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route: Share a file publicly (returns a downloadable link)
  app.post("/api/share", (req, res) => {
    try {
      const { filename, mimeType, content } = req.body;
      if (!filename || !mimeType || !content) {
        res.status(400).json({ success: false, error: "Missing required fields" });
        return;
      }

      const buffer = Buffer.from(content, "base64");
      const shareId = Math.random().toString(36).substring(2, 10);
      const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

      sharedFiles.set(shareId, {
        filename,
        mimeType,
        buffer,
        expiresAt,
      });

      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const shareUrl = `${appUrl}/shared/${shareId}`;

      res.json({ success: true, shareId, shareUrl, expiresAt });
    } catch (error: any) {
      console.error("Error in /api/share:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Route: Download shared file
  app.get("/shared/:shareId", (req, res) => {
    const { shareId } = req.params;
    const file = sharedFiles.get(shareId);

    if (!file || Date.now() > file.expiresAt) {
      res.status(404).send(`
        <!DOCTYPE html>
        <html lang="bn">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>ফাইল পাওয়া যায়নি - Remote PC Manager</title>
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f3f4f6; color: #1f2937; }
            .card { background: white; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); text-align: center; max-width: 400px; }
            h1 { color: #ef4444; font-size: 1.5rem; margin-top: 0; }
            p { color: #4b5563; line-height: 1.5; }
            .btn { display: inline-block; margin-top: 1rem; padding: 0.5rem 1rem; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 0.375rem; font-weight: 500; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>ফাইল পাওয়া যায়নি বা মেয়াদ শেষ!</h1>
            <p>দুঃখিত, এই ফাইলটির শেয়ার লিংকটির ১৫ মিনিটের মেয়াদ শেষ হয়ে গেছে অথবা লিংকটি ভুল। অনুগ্রহ করে নতুন করে শেয়ার লিংক তৈরি করুন।</p>
            <a href="/" class="btn">হোম পেজে যান</a>
          </div>
        </body>
        </html>
      `);
      return;
    }

    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.setHeader("Content-Type", file.mimeType);
    res.send(file.buffer);
  });

  // WebSocket signaling and relay registry
  const activePCs = new Map<string, WebSocket>();
  const activePhones = new Map<string, Set<WebSocket>>();
  const connectionInfo = new Map<WebSocket, { role: "pc" | "phone"; code: string }>();

  function broadcastStatus(code: string) {
    const pcConnected = activePCs.has(code);
    const phoneCount = activePhones.get(code)?.size || 0;
    const statusMsg = JSON.stringify({
      type: "status",
      pcConnected,
      phoneCount,
    });

    const pcWs = activePCs.get(code);
    if (pcWs && pcWs.readyState === WebSocket.OPEN) {
      pcWs.send(statusMsg);
    }

    const phones = activePhones.get(code);
    if (phones) {
      for (const phoneWs of phones) {
        if (phoneWs.readyState === WebSocket.OPEN) {
          phoneWs.send(statusMsg);
        }
      }
    }
  }

  wss.on("connection", (ws: WebSocket) => {
    ws.on("message", (messageStr: string) => {
      try {
        const msg = JSON.parse(messageStr);

        if (msg.type === "register") {
          const { role, code } = msg;
          if (!role || !code) {
            ws.send(JSON.stringify({ type: "error", error: "Role and code are required to register" }));
            return;
          }

          // Register connection
          connectionInfo.set(ws, { role, code });

          if (role === "pc") {
            // Overwrite existing PC connection if any (reconnection handling)
            const oldPc = activePCs.get(code);
            if (oldPc && oldPc !== ws && oldPc.readyState === WebSocket.OPEN) {
              oldPc.send(JSON.stringify({ type: "error", error: "Another PC has registered with this code" }));
              oldPc.close();
            }
            activePCs.set(code, ws);
          } else if (role === "phone") {
            if (!activePhones.has(code)) {
              activePhones.set(code, new Set());
            }
            activePhones.get(code)!.add(ws);
          }

          ws.send(JSON.stringify({ type: "registered", success: true, role, code }));
          broadcastStatus(code);
        } else {
          // Check if this ws is registered
          const info = connectionInfo.get(ws);
          if (!info) {
            ws.send(JSON.stringify({ type: "error", error: "Connection not registered" }));
            return;
          }

          const { role, code } = info;

          if (role === "phone") {
            // Forward actions from Phone to PC
            const pcWs = activePCs.get(code);
            if (pcWs && pcWs.readyState === WebSocket.OPEN) {
              pcWs.send(messageStr);
            } else {
              ws.send(JSON.stringify({
                id: msg.id,
                type: "response",
                success: false,
                error: "পিসি অফলাইন আছে। অনুগ্রহ করে পিসি অন রাখুন এবং ফাইল শেয়ারিং চালু করুন।",
              }));
            }
          } else if (role === "pc") {
            // Forward responses or notifications from PC to all registered phones
            const phones = activePhones.get(code);
            if (phones) {
              for (const phoneWs of phones) {
                if (phoneWs.readyState === WebSocket.OPEN) {
                  phoneWs.send(messageStr);
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.error("Error processing WS message:", err);
        ws.send(JSON.stringify({ type: "error", error: "Invalid message format" }));
      }
    });

    ws.on("close", () => {
      const info = connectionInfo.get(ws);
      if (info) {
        const { role, code } = info;
        connectionInfo.delete(ws);

        if (role === "pc") {
          if (activePCs.get(code) === ws) {
            activePCs.delete(code);
          }
        } else if (role === "phone") {
          const phones = activePhones.get(code);
          if (phones) {
            phones.delete(ws);
            if (phones.size === 0) {
              activePhones.delete(code);
            }
          }
        }
        broadcastStatus(code);
      }
    });
  });

  // Upgrade HTTP connections to WebSockets on /ws path
  server.on("upgrade", (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, "http://localhost").pathname : "";
    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Integrate Vite as middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
