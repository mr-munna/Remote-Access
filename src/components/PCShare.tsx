import { useState, useRef, useEffect } from "react";
import { Folder, Laptop, Loader2, RefreshCw, Check, X, AlertTriangle, Play, HelpCircle } from "lucide-react";
import CodeBlock from "./CodeBlock";

interface PCShareProps {
  serverUrl: string;
}

export default function PCShare({ serverUrl }: PCShareProps) {
  const [pairingCode, setPairingCode] = useState("");
  const [folderSelected, setFolderSelected] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [wsStatus, setWsStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [clientCount, setClientCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [showCliGuide, setShowCliGuide] = useState(false);

  const rootHandleRef = useRef<any | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Generate a random 6-digit pairing code on mount
  useEffect(() => {
    generateNewCode();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const generateNewCode = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setPairingCode(code);
    if (wsStatus === "connected" && wsRef.current) {
      // Disconnect if we generate a new code while running
      wsRef.current.close();
    }
  };

  // Resolve directory handles dynamically
  async function getDirectoryHandleForPath(root: any, pathParts: string[]): Promise<any> {
    let current = root;
    for (const part of pathParts) {
      current = await current.getDirectoryHandle(part);
    }
    return current;
  }

  // Resolve file handles dynamically
  async function getFileHandleForPath(root: any, pathParts: string[]): Promise<any> {
    const folderParts = pathParts.slice(0, -1);
    const filename = pathParts[pathParts.length - 1];
    const dirHandle = await getDirectoryHandleForPath(root, folderParts);
    return await dirHandle.getFileHandle(filename);
  }

  // Handle browser directory selection
  const handleSelectFolder = async () => {
    try {
      setErrorMessage("");
      if (!("showDirectoryPicker" in window)) {
        setErrorMessage("আপনার ব্রাউজারে File System Access API সাপোর্ট করে না। অনুগ্রহ করে Chrome, Edge বা Opera ব্রাউজার ব্যবহার করুন, অথবা নিচের Terminal Script পদ্ধতিটি ব্যবহার করুন।");
        return;
      }

      const handle = await (window as any).showDirectoryPicker({
        mode: "readwrite",
      });
      rootHandleRef.current = handle;
      setFolderName(handle.name);
      setFolderSelected(true);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setErrorMessage(`ফোল্ডার সিলেক্ট করতে সমস্যা হয়েছে: ${err.message}`);
      }
    }
  };

  // Start the Browser-based Web Share Connection
  const handleStartSharing = () => {
    if (!rootHandleRef.current) return;

    setWsStatus("connecting");
    setErrorMessage("");

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Register this connection as PC/Host
      ws.send(
        JSON.stringify({
          type: "register",
          role: "pc",
          code: pairingCode,
        })
      );
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Handle connection registration success
        if (msg.type === "registered") {
          setWsStatus("connected");
          return;
        }

        // Handle status broadcasts (number of phones connected)
        if (msg.type === "status") {
          setClientCount(msg.phoneCount);
          return;
        }

        // Handle error messages
        if (msg.type === "error") {
          setErrorMessage(msg.error || "একটি সমস্যা হয়েছে");
          ws.close();
          return;
        }

        // Handle incoming action requests from phone
        if (msg.type === "action" && rootHandleRef.current) {
          const { id, actionType, pathParts = [] } = msg;

          try {
            if (actionType === "list-dir") {
              const dirHandle = await getDirectoryHandleForPath(rootHandleRef.current, pathParts);
              const items: any[] = [];
              for await (const entry of dirHandle.values()) {
                items.push({
                  name: entry.name,
                  isDirectory: entry.kind === "directory",
                });
              }
              // Sort folders first, then files
              items.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
              });

              ws.send(JSON.stringify({ id, type: "response", success: true, data: items }));
            } 
            
            else if (actionType === "read-file") {
              const fileHandle = await getFileHandleForPath(rootHandleRef.current, pathParts);
              const file = await fileHandle.getFile();

              const filename = file.name.toLowerCase();
              const textExtensions = [".txt", ".md", ".json", ".js", ".ts", ".tsx", ".css", ".html", ".svg", ".xml", ".yml", ".yaml", ".ini", ".conf", ".log"];
              const isBinary = !file.type.startsWith("text/") && !textExtensions.some(ext => filename.endsWith(ext));

              if (isBinary) {
                // Read as base64 for download
                const reader = new FileReader();
                reader.onload = () => {
                  const result = reader.result as string;
                  const base64 = result.split(",")[1];
                  ws.send(JSON.stringify({
                    id,
                    type: "response",
                    success: true,
                    data: { content: base64, isBinary: true, mimeType: file.type || "application/octet-stream" },
                  }));
                };
                reader.readAsDataURL(file);
              } else {
                // Read as text
                const text = await file.text();
                ws.send(JSON.stringify({
                  id,
                  type: "response",
                  success: true,
                  data: { content: text, isBinary: false, mimeType: file.type || "text/plain" },
                }));
              }
            } 
            
            else if (actionType === "write-file") {
              const fileHandle = await getFileHandleForPath(rootHandleRef.current, pathParts);
              const writable = await fileHandle.createWritable();
              await writable.write(msg.content);
              await writable.close();

              ws.send(JSON.stringify({ id, type: "response", success: true }));
            } 
            
            else if (actionType === "create-entry") {
              const { name, isDirectory } = msg;
              const dirHandle = await getDirectoryHandleForPath(rootHandleRef.current, pathParts);
              if (isDirectory) {
                await dirHandle.getDirectoryHandle(name, { create: true });
              } else {
                await dirHandle.getFileHandle(name, { create: true });
              }

              ws.send(JSON.stringify({ id, type: "response", success: true }));
            } 
            
            else if (actionType === "delete-entry") {
              const parentDirParts = pathParts.slice(0, -1);
              const entryName = pathParts[pathParts.length - 1];
              const dirHandle = await getDirectoryHandleForPath(rootHandleRef.current, parentDirParts);
              await dirHandle.removeEntry(entryName, { recursive: true });

              ws.send(JSON.stringify({ id, type: "response", success: true }));
            } 
            
            else if (actionType === "rename-entry") {
              const { oldName, newName } = msg;
              const dirHandle = await getDirectoryHandleForPath(rootHandleRef.current, pathParts);
              const fileHandle = await dirHandle.getFileHandle(oldName);
              
              if (typeof (fileHandle as any).move === "function") {
                await (fileHandle as any).move(newName);
              } else {
                // Fallback copy & delete
                const newFileHandle = await dirHandle.getFileHandle(newName, { create: true });
                const file = await fileHandle.getFile();
                const writable = await newFileHandle.createWritable();
                await writable.write(file);
                await writable.close();
                await dirHandle.removeEntry(oldName);
              }

              ws.send(JSON.stringify({ id, type: "response", success: true }));
            } 
            
            else if (actionType === "upload-file") {
              const { filename, content } = msg;
              const dirHandle = await getDirectoryHandleForPath(rootHandleRef.current, pathParts);
              const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
              const writable = await fileHandle.createWritable();
              
              const buffer = Uint8Array.from(atob(content), c => c.charCodeAt(0));
              await writable.write(buffer);
              await writable.close();

              ws.send(JSON.stringify({ id, type: "response", success: true }));
            }
          } catch (err: any) {
            console.error("Action error:", err);
            ws.send(JSON.stringify({
              id,
              type: "response",
              success: false,
              error: err.message || "কাজটি সম্পন্ন করা যায়নি",
            }));
          }
        }
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
    };

    ws.onerror = () => {
      setWsStatus("disconnected");
      setErrorMessage("সার্ভারের সাথে কানেক্ট হতে সমস্যা হয়েছে।");
    };
  };

  const handleStopSharing = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setWsStatus("disconnected");
    setClientCount(0);
  };

  // Node.js script dynamically generated with current host URL
  const hostOrigin = window.location.origin;
  const nodeAgentCode = `/**
 * Remote PC File Access Companion Script
 * এটি আপনার কম্পিউটারে রান করলে আপনি মোবাইল থেকে আপনার পুরো পিসির ফাইল এক্সেস করতে পারবেন।
 */
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');

const code = "${pairingCode}";
const serverUrl = "${hostOrigin.replace(/^http/, "ws")}/ws";

console.log("-----------------------------------------");
console.log("🌐 Remote PC File Access - Agent Active");
console.log("-----------------------------------------");
console.log(\`🔌 কানেক্ট করা হচ্ছে: \${serverUrl}\`);
console.log(\`🔑 আপনার পেয়ারিং কোড: \${code}\`);
console.log("-----------------------------------------");

const ws = new WebSocket(serverUrl);
// আপনার পিসির যে ফোল্ডারটি শেয়ার করতে চান (Default: বর্তমান রান করা ফোল্ডার)
const sharedRoot = process.cwd(); 

ws.on('open', () => {
  console.log("✅ সার্ভারের সাথে কানেক্ট হয়েছে!");
  console.log(\`📁 শেয়ার করা ফোল্ডার: \${sharedRoot}\`);
  console.log("📱 এখন আপনার ফোন থেকে এই পেয়ারিং কোডটি দিয়ে ফাইল ব্রাউজ করুন।");
  ws.send(JSON.stringify({ type: 'register', role: 'pc', code }));
});

ws.on('message', async (data) => {
  let msg;
  try {
    msg = JSON.parse(data);
    if (msg.type !== 'action') return;

    const { id, actionType } = msg;
    const pathParts = msg.pathParts || [];
    
    // ডিরেক্টরি ট্রাভার্সাল প্রতিরোধ করতে সিকিউরিটি গার্ড
    const targetPath = path.resolve(sharedRoot, ...pathParts);
    if (!targetPath.startsWith(sharedRoot)) {
      ws.send(JSON.stringify({ 
        id, type: 'response', success: false, 
        error: 'এক্সেস ডিনাইড: শেয়ারড ফোল্ডারের বাইরে যাওয়া নিষেধ!' 
      }));
      return;
    }

    console.log(\`📥 রিকোয়েস্ট: \${actionType} -> \${pathParts.join('/') || '/'}\`);

    if (actionType === 'list-dir') {
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      const items = entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory()
      })).sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      ws.send(JSON.stringify({ id, type: 'response', success: true, data: items }));

    } else if (actionType === 'read-file') {
      const fileBuffer = await fs.readFile(targetPath);
      const filename = path.basename(targetPath);
      const isBinary = isBinaryFile(filename);

      if (isBinary) {
        ws.send(JSON.stringify({
          id, type: 'response', success: true,
          data: { content: fileBuffer.toString('base64'), isBinary: true, mimeType: 'application/octet-stream' }
        }));
      } else {
        ws.send(JSON.stringify({
          id, type: 'response', success: true,
          data: { content: fileBuffer.toString('utf8'), isBinary: false, mimeType: 'text/plain' }
        }));
      }

    } else if (actionType === 'write-file') {
      await fs.writeFile(targetPath, msg.content, 'utf8');
      ws.send(JSON.stringify({ id, type: 'response', success: true }));

    } else if (actionType === 'create-entry') {
      const fullPath = path.join(targetPath, msg.name);
      if (msg.isDirectory) {
        await fs.mkdir(fullPath, { recursive: true });
      } else {
        await fs.writeFile(fullPath, '', 'utf8');
      }
      ws.send(JSON.stringify({ id, type: 'response', success: true }));

    } else if (actionType === 'delete-entry') {
      const stat = await fs.stat(targetPath);
      if (stat.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true });
      } else {
        await fs.unlink(targetPath);
      }
      ws.send(JSON.stringify({ id, type: 'response', success: true }));

    } else if (actionType === 'rename-entry') {
      const parentDir = path.dirname(targetPath);
      const oldPath = path.join(parentDir, msg.oldName);
      const newPath = path.join(parentDir, msg.newName);
      await fs.rename(oldPath, newPath);
      ws.send(JSON.stringify({ id, type: 'response', success: true }));

    } else if (actionType === 'upload-file') {
      const fullPath = path.join(targetPath, msg.filename);
      const buffer = Buffer.from(msg.content, 'base64');
      await fs.writeFile(fullPath, buffer);
      ws.send(JSON.stringify({ id, type: 'response', success: true }));
    }
  } catch (err) {
    console.error(\`❌ ভুল হয়েছে: \${err.message}\`);
    if (msg && msg.id) {
      ws.send(JSON.stringify({ id: msg.id, type: 'response', success: false, error: err.message }));
    }
  }
});

ws.on('close', () => {
  console.log("🛑 সার্ভার থেকে কানেকশন বিচ্ছিন্ন হয়েছে! ৩ সেকেন্ড পর আবার চেষ্টা করা হচ্ছে...");
  setTimeout(() => process.exit(1), 3000);
});

ws.on('error', (err) => {
  console.error("❌ কানেকশন এরর:", err.message);
});

function isBinaryFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  const textExts = ['.txt', '.md', '.json', '.js', '.ts', '.tsx', '.css', '.html', '.svg', '.xml', '.yml', '.yaml', '.ini', '.conf', '.log'];
  return !textExts.includes(ext);
}
`;

  return (
    <div id="pc-share-container" className="space-y-6">
      <div className="bg-white border border-black/5 rounded-xl p-5 sm:p-6 shadow-sm relative overflow-hidden">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                <Laptop className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-[#141414]">
                ১. কম্পিউটারের ফাইল শেয়ারিং সার্ভিস
              </h2>
            </div>
            <p className="text-gray-500 text-xs mt-1 leading-relaxed">
              আপনার কম্পিউটার থেকে ব্রাউজার বা স্ক্রিপ্ট ব্যবহার করে ফাইল শেয়ার চালু করুন।
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={generateNewCode}
              disabled={wsStatus === "connecting"}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 bg-white text-gray-700 text-xs font-semibold flex items-center gap-1.5 transition duration-200 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${wsStatus === "connecting" ? "animate-spin" : ""}`} />
              কোড পরিবর্তন
            </button>
            <div className="px-4 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-center">
              <span className="text-[10px] text-gray-400 block leading-none mb-1 font-semibold uppercase">পেয়ারিং কোড</span>
              <span className="text-lg font-mono font-bold tracking-widest text-blue-600">
                {pairingCode}
              </span>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 p-4 rounded-lg bg-rose-50 border border-rose-100 text-rose-800 text-xs flex items-start gap-2.5 leading-relaxed">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-500" />
            <p>{errorMessage}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Method A: Web Browser sharing */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">সহজ মাধ্যম</span>
                <h3 className="text-xs font-bold text-[#141414]">১ম পদ্ধতি: ব্রাউজার শেয়ারিং (Instant)</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                কোনো কিছু ডাউনলোড ছাড়া সরাসরি ব্রাউজার থেকে কম্পিউটারের নির্দিষ্ট ফোল্ডার শেয়ার করতে পারেন। এটি অত্যন্ত নিরাপদ ও দ্রুত।
              </p>

              {folderSelected ? (
                <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-700 min-w-0">
                    <Folder className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-bold truncate max-w-[180px]">{folderName}</span>
                  </div>
                  <button
                    onClick={handleSelectFolder}
                    disabled={wsStatus !== "disconnected"}
                    className="text-xs text-emerald-600 hover:text-emerald-800 font-bold underline transition"
                  >
                    বদল করুন
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleSelectFolder}
                  className="w-full mt-4 py-4 border border-dashed border-gray-300 hover:border-blue-500 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-blue-600 bg-white hover:bg-blue-50/20 transition group duration-200 cursor-pointer"
                >
                  <Folder className="w-6 h-6 text-gray-400 group-hover:text-blue-500 transition" />
                  <span className="text-xs font-bold">কম্পিউটার ফোল্ডার সিলেক্ট করুন</span>
                </button>
              )}
            </div>

            <div className="mt-6 border-t border-gray-100 pt-4">
              {wsStatus === "disconnected" ? (
                <button
                  onClick={handleStartSharing}
                  disabled={!folderSelected}
                  className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
                >
                  <Play className="w-3.5 h-3.5" />
                  শেয়ারিং चालू করুন
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleStopSharing}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
                  >
                    <X className="w-3.5 h-3.5" />
                    শেয়ার বন্ধ করুন
                  </button>
                  <div className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-center flex items-center justify-center gap-1.5 min-w-[110px] relative">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping absolute left-3" />
                    <span className="w-2 h-2 bg-emerald-500 rounded-full relative left-3" />
                    <span className="text-[11px] text-gray-700 font-bold font-mono pl-3">{clientCount} Connected</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Method B: CLI Terminal Script */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">পাওয়ারফুল</span>
                <h3 className="text-xs font-bold text-[#141414]">২য় পদ্ধতি: পিসি টার্মিনাল স্ক্রিপ্ট (Full Access)</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                আপনার পুরো ড্রাইভ বা পিসির যেকোনো ফাইল এক্সেস করতে টার্মিনালে এই স্ক্রিপ্টটি রান করতে পারেন। (Node.js প্রয়োজন)।
              </p>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-4">
              <button
                onClick={() => setShowCliGuide(!showCliGuide)}
                className="w-full py-2.5 px-4 rounded-lg border border-gray-200 hover:border-gray-300 text-gray-700 hover:text-[#141414] font-bold text-xs flex items-center justify-center gap-2 transition bg-white cursor-pointer shadow-xs"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                টার্মিনাল স্ক্রিপ্ট গাইড দেখুন
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCliGuide && (
        <div className="bg-white border border-black/5 rounded-xl p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-[#141414] flex items-center gap-2">
              🖥️ কিভাবে পিসি টার্মিনাল স্ক্রিপ্টটি ব্যবহার করবেন?
            </h3>
            <button
              onClick={() => setShowCliGuide(false)}
              className="text-gray-400 hover:text-[#141414] p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3.5 text-xs text-gray-600 leading-relaxed">
            <p><strong>ধাপ ১:</strong> আপনার পিসির যেকোনো ফোল্ডারে একটি খালি টার্মিনাল বা কমান্ড প্রম্পট (CMD/PowerShell) খুলুন।</p>
            <p><strong>ধাপ ২:</strong> নিচের কমান্ডটি লিখে <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded font-mono text-[11px] text-gray-800">Enter</kbd> চাপুন WebSocket প্যাকেজটি ইন্সটল করতে:</p>
            <div className="bg-[#141414] text-gray-100 p-3 rounded-lg border border-neutral-800 font-mono text-[11px] select-all flex justify-between items-center">
              <span>npm install ws</span>
              <button
                onClick={() => navigator.clipboard.writeText("npm install ws")}
                className="text-[10px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
              >
                কপি
              </button>
            </div>
            
            <p><strong>ধাপ ৩:</strong> একটি নতুন ফাইল তৈরি করে নাম দিন <code className="text-blue-600 font-mono font-bold">agent.js</code> এবং নিচের কোডটি কপি করে সম্পূর্ণ পেস্ট করে সেভ করুন:</p>
            <CodeBlock code={nodeAgentCode} language="javascript" />

            <p><strong>ধাপ ৪:</strong> এবার টার্মিনালে নিচের কমান্ডটি দিয়ে স্ক্রিপ্টটি রান করুন:</p>
            <div className="bg-[#141414] text-gray-100 p-3 rounded-lg border border-neutral-800 font-mono text-[11px] select-all flex justify-between items-center">
              <span>node agent.js {pairingCode}</span>
              <button
                onClick={() => navigator.clipboard.writeText(`node agent.js ${pairingCode}`)}
                className="text-[10px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
              >
                কপি
              </button>
            </div>

            <p className="text-amber-800 bg-amber-50 border border-amber-100 p-3.5 rounded-lg flex items-start gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>নোট: স্ক্রিপ্টটি রান করা অবস্থায় আপনার পিসির ফাইলগুলো ফোন থেকে এক্সেস করা যাবে। কাজ শেষ হয়ে গেলে টার্মিনালটি বন্ধ বা <kbd className="px-1 py-0.5 bg-gray-200 rounded font-sans text-[10px]">Ctrl + C</kbd> প্রেস করলেই কানেকশন বন্ধ হয়ে যাবে।</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
