import { useState, useEffect, useRef, ChangeEvent } from "react";
import { 
  Folder, File, FileText, FileImage, FileCode, Trash2, Edit, Plus, ArrowLeft, 
  Download, Share2, Copy, Check, UploadCloud, X, ChevronRight, Loader2, 
  Power, Globe, RefreshCw, Smartphone, AlertTriangle, Eye, ArrowLeftRight
} from "lucide-react";
import { FileItem, WSMessage } from "../types";

interface PhoneClientProps {
  initialCode?: string;
}

export default function PhoneClient({ initialCode = "" }: PhoneClientProps) {
  const [code, setCode] = useState(initialCode);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [pcOnline, setPcOnline] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // File viewing / editing state
  const [viewingFile, setViewingFile] = useState<{ name: string; content: string; isBinary: boolean; mimeType: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editorContent, setEditorContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Modals / Input states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNameInput, setNewNameInput] = useState("");
  const [createIsFolder, setCreateIsFolder] = useState(false);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");

  // Share state
  const [isSharingFile, setIsSharingFile] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [shareExpires, setShareExpires] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRequestsRef = useRef<Map<string, { resolve: (val: any) => void; reject: (err: any) => void; timeout: any }>>(new Map());

  // Automatically parse initialCode from prop
  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
    }
  }, [initialCode]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  const connect = () => {
    if (!code || code.length < 6) {
      setErrorMessage("অনুগ্রহ করে একটি সঠিক ৬ ডিজিটের পেয়ারিং কোড দিন।");
      return;
    }

    setIsConnecting(true);
    setErrorMessage("");

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Register this connection as Phone
      ws.send(
        JSON.stringify({
          type: "register",
          role: "phone",
          code: code,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Handle connection registration success
        if (msg.type === "registered") {
          setIsConnected(true);
          setIsConnecting(false);
          return;
        }

        // Handle status broadcasts (whether the PC is online)
        if (msg.type === "status") {
          setPcOnline(msg.pcConnected);
          if (msg.pcConnected && files.length === 0 && !isLoadingFiles) {
            // Load initial directory listing automatically
            loadDirectory([]);
          }
          return;
        }

        // Handle general error messages
        if (msg.type === "error") {
          setErrorMessage(msg.error || "একটি সমস্যা হয়েছে");
          disconnect();
          return;
        }

        // Handle responses from PC
        if (msg.type === "response" && msg.id) {
          const pending = pendingRequestsRef.current.get(msg.id);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingRequestsRef.current.delete(msg.id);
            if (msg.success) {
              pending.resolve(msg.data);
            } else {
              pending.reject(new Error(msg.error || "পিসি কাজটি সম্পন্ন করতে পারেনি"));
            }
          }
        }
      } catch (err) {
        console.error("WS parse error on phone:", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsConnecting(false);
      setPcOnline(false);
      setFiles([]);
    };

    ws.onerror = () => {
      setErrorMessage("সার্ভারের সাথে কানেক্ট হতে সমস্যা হয়েছে।");
      disconnect();
    };
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    // Reject all pending requests
    for (const [id, req] of pendingRequestsRef.current.entries()) {
      clearTimeout(req.timeout);
      req.reject(new Error("কানেকশন বিচ্ছিন্ন হয়েছে"));
    }
    pendingRequestsRef.current.clear();
    setIsConnected(false);
    setIsConnecting(false);
    setPcOnline(false);
    setFiles([]);
    setCurrentPath([]);
    setViewingFile(null);
  };

  // Promise-based WebSocket action request
  const sendAction = (actionType: string, payload: Partial<WSMessage> = {}): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error("সার্ভার কানেকশন সচল নেই।"));
        return;
      }

      if (!pcOnline) {
        reject(new Error("পিসি অফলাইনে আছে। অনুগ্রহ করে আপনার কম্পিউটারের শেয়ারিং সার্ভিস চালু রাখুন।"));
        return;
      }

      const id = Math.random().toString(36).substring(2, 11);
      const timeout = setTimeout(() => {
        pendingRequestsRef.current.delete(id);
        reject(new Error("পিসি থেকে উত্তর পেতে দেরি হচ্ছে। অনুগ্রহ করে পিসির ইন্টারনেট এবং স্ক্রিপ্ট চেক করুন।"));
      }, 15000); // 15s timeout

      pendingRequestsRef.current.set(id, { resolve, reject, timeout });

      const requestMsg = JSON.stringify({
        id,
        type: "action",
        actionType,
        pathParts: currentPath,
        ...payload,
      });

      wsRef.current.send(requestMsg);
    });
  };

  // Load folder files
  const loadDirectory = async (path: string[]) => {
    setIsLoadingFiles(true);
    setErrorMessage("");
    try {
      const data = await sendAction("list-dir", { pathParts: path });
      setFiles(data || []);
      setCurrentPath(path);
    } catch (err: any) {
      setErrorMessage(err.message || "ফোল্ডার লোড করা যায়নি");
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Navigate deeper into a folder
  const handleFolderClick = (folderName: string) => {
    loadDirectory([...currentPath, folderName]);
  };

  // Navigate to folder via breadcrumb
  const handleBreadcrumbClick = (index: number) => {
    const nextPath = currentPath.slice(0, index);
    loadDirectory(nextPath);
  };

  // Open file for viewing / editing
  const handleFileClick = async (filename: string) => {
    setErrorMessage("");
    setIsLoadingFiles(true);
    try {
      const data = await sendAction("read-file", { pathParts: [...currentPath, filename] });
      setViewingFile({
        name: filename,
        content: data.content,
        isBinary: !!data.isBinary,
        mimeType: data.mimeType || "text/plain",
      });
      setEditorContent(data.content);
      setIsEditing(false);
    } catch (err: any) {
      setErrorMessage(err.message || "ফাইল পড়া যায়নি");
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Save changes back to PC
  const handleSaveFile = async () => {
    if (!viewingFile) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      await sendAction("write-file", {
        pathParts: [...currentPath, viewingFile.name],
        content: editorContent,
      });
      setViewingFile(prev => prev ? { ...prev, content: editorContent } : null);
      setIsEditing(false);
    } catch (err: any) {
      setErrorMessage(err.message || "ফাইল সেভ করা যায়নি");
    } finally {
      setIsSaving(false);
    }
  };

  // Create file / folder
  const handleCreateEntry = async () => {
    if (!newNameInput.trim()) return;
    setIsLoadingFiles(true);
    setShowCreateModal(false);
    setErrorMessage("");
    try {
      await sendAction("create-entry", {
        name: newNameInput.trim(),
        isDirectory: createIsFolder,
      });
      setNewNameInput("");
      loadDirectory(currentPath);
    } catch (err: any) {
      setErrorMessage(err.message || "নতুন এন্ট্রি তৈরি করা যায়নি");
      setIsLoadingFiles(false);
    }
  };

  // Delete file / folder
  const handleDeleteEntry = async (name: string, isDir: boolean) => {
    const confirmMessage = isDir 
      ? `আপনি কি নিশ্চিত যে ফোল্ডার "${name}" এবং এটার ভেতরের সকল ফাইল ডিলিট করতে চান?`
      : `আপনি কি নিশ্চিত যে ফাইল "${name}" ডিলিট করতে চান?`;

    if (!window.confirm(confirmMessage)) return;

    setIsLoadingFiles(true);
    setErrorMessage("");
    try {
      await sendAction("delete-entry", {
        pathParts: [...currentPath, name],
      });
      loadDirectory(currentPath);
    } catch (err: any) {
      setErrorMessage(err.message || "ডিলিট করা সম্ভব হয়নি");
      setIsLoadingFiles(false);
    }
  };

  // Rename entry
  const handleRenameEntry = async () => {
    if (!renamingFile || !renameInput.trim() || renamingFile === renameInput.trim()) {
      setRenamingFile(null);
      return;
    }
    setIsLoadingFiles(true);
    setErrorMessage("");
    const oldName = renamingFile;
    setRenamingFile(null);
    try {
      await sendAction("rename-entry", {
        oldName,
        newName: renameInput.trim(),
      });
      setRenameInput("");
      loadDirectory(currentPath);
    } catch (err: any) {
      setErrorMessage(err.message || "নাম পরিবর্তন করা সম্ভব হয়নি");
      setIsLoadingFiles(false);
    }
  };

  // Upload file from phone to PC
  const handlePhoneFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage("দুঃখিত, ৫০ মেগাবাইটের চেয়ে বড় ফাইল শেয়ারিং করার ক্ষেত্রে স্পিড কম হতে পারে। অনুগ্রহ করে ছোট ফাইল আপলোড করুন।");
      return;
    }

    setIsLoadingFiles(true);
    setErrorMessage("");

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(",")[1];
        await sendAction("upload-file", {
          filename: file.name,
          content: base64,
        });
        loadDirectory(currentPath);
      } catch (err: any) {
        setErrorMessage(err.message || "ফাইল আপলোড করতে সমস্যা হয়েছে");
        setIsLoadingFiles(false);
      }
    };
    reader.onerror = () => {
      setErrorMessage("মোবাইলের ফাইলটি রিড করা সম্ভব হয়নি");
      setIsLoadingFiles(false);
    };
    reader.readAsDataURL(file);
  };

  // Download file to Phone
  const handleDownloadFile = async (filename: string) => {
    setErrorMessage("");
    setIsLoadingFiles(true);
    try {
      const data = await sendAction("read-file", { pathParts: [...currentPath, filename] });
      
      const byteCharacters = atob(data.content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.mimeType || "application/octet-stream" });
      
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      setErrorMessage(err.message || "ডাউনলোড ব্যর্থ হয়েছে");
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Generate public downloadable share link for 15 minutes
  const handleShareFile = async (filename: string) => {
    setErrorMessage("");
    setIsSharingFile(filename);
    setShareLink("");
    try {
      // 1. Pull file contents from PC
      const data = await sendAction("read-file", { pathParts: [...currentPath, filename] });
      
      // 2. Upload file to Express public share storage
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          mimeType: data.mimeType || "application/octet-stream",
          content: data.content,
        }),
      });

      const result = await res.json();
      if (result.success) {
        setShareLink(result.shareUrl);
        setShareExpires(result.expiresAt);
      } else {
        throw new Error(result.error || "শেয়ার লিংক জেনারেট করা সম্ভব হয়নি");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "ফাইল শেয়ার করতে ব্যর্থ হয়েছে");
      setIsSharingFile(null);
    }
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error("Link copy failed:", err);
    }
  };

  const triggerNativeShare = async () => {
    if (!shareLink) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: isSharingFile || "Shared File",
          text: `রিমোটলি পিসি থেকে পাঠানো ফাইলের ডাউনলোড লিংক (মেয়াদ ১৫ মিনিট):`,
          url: shareLink,
        });
      } else {
        handleCopyShareLink();
      }
    } catch (err) {
      console.error("Native share failed", err);
    }
  };

  // File extension checking helpers for rendering rich icons
  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    const size = "w-10 h-10";
    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext || "")) {
      return <FileImage className={`${size} text-indigo-400`} />;
    }
    if (["js", "ts", "tsx", "jsx", "html", "css", "json", "py", "java", "cpp", "c", "go", "php"].includes(ext || "")) {
      return <FileCode className={`${size} text-emerald-400`} />;
    }
    if (["txt", "md", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext || "")) {
      return <FileText className={`${size} text-blue-400`} />;
    }
    return <File className={`${size} text-slate-400`} />;
  };

  // Quick sharing redirect URLs
  const whatsAppShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`রিমোটলি পিসি থেকে পাঠানো ফাইল (ডাউনলোড লিংক ১৫ মিনিট সচল): ${shareLink}`)}`;
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`;

  return (
    <div id="phone-client-container" className="space-y-6">
      {!isConnected ? (
        <div className="bg-white border border-black/5 rounded-xl p-6 shadow-sm max-w-md mx-auto relative overflow-hidden">
          <div className="flex flex-col items-center text-center pb-4 mb-4 border-b border-gray-100">
            <span className="p-3 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 mb-3">
              <Smartphone className="w-6 h-6" />
            </span>
            <h2 className="text-lg font-bold text-[#141414]">২. মোবাইল থেকে ফাইল অ্যাক্সেস</h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              কম্পিউটারের পেয়ারিং কোডটি দিয়ে দেশের যেকোনো জায়গা থেকে আপনার পিসির সম্পূর্ণ এক্সেস নিন।
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">
                কম্পিউটারের ৬-ডিজিটের পেয়ারিং কোড
              </label>
              <input
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="যেমন: 483912"
                className="w-full text-center tracking-widest text-lg font-mono font-bold bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-lg py-2.5 text-gray-900 outline-none transition"
              />
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-800 text-xs flex items-start gap-2 leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <p>{errorMessage}</p>
              </div>
            )}

            <button
              onClick={connect}
              disabled={isConnecting || code.length < 6}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-100 disabled:text-gray-400 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  কানেক্ট করা হচ্ছে...
                </>
              ) : (
                <>
                  <Power className="w-3.5 h-3.5" />
                  পিসিতে কানেক্ট করুন
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-black/5 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-[500px]">
          {/* Active Client Connection Header */}
          <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                <Smartphone className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-[#141414] flex items-center gap-2 leading-none">
                  মোবাইল কন্ট্রোল মোড
                  <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded ${pcOnline ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${pcOnline ? "bg-emerald-500" : "bg-rose-500"}`} />
                    {pcOnline ? "পিসি অনলাইন" : "পিসি অফলাইন"}
                  </span>
                </h3>
                <span className="text-[10px] text-gray-400 font-mono mt-1 block">কোড: {code}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => loadDirectory(currentPath)}
                disabled={isLoadingFiles}
                className="p-1.5 rounded-lg border border-gray-200 hover:border-gray-300 bg-white text-gray-600 hover:text-black transition cursor-pointer"
                title="রিফ্রেশ"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={disconnect}
                className="py-1.5 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 border border-rose-100 transition cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                কানেকশন বন্ধ
              </button>
            </div>
          </div>

          {/* Breadcrumbs Navigation */}
          <div className="bg-gray-50/50 px-5 py-2 border-b border-gray-100 flex items-center gap-1.5 overflow-x-auto text-[11px] text-gray-500">
            <button
              onClick={() => handleBreadcrumbClick(0)}
              className="hover:text-blue-600 font-bold"
            >
              PC Home
            </button>
            {currentPath.map((part, index) => (
              <span key={index} className="flex items-center gap-1.5 shrink-0">
                <ChevronRight className="w-3 h-3 text-gray-300" />
                <button
                  onClick={() => handleBreadcrumbClick(index + 1)}
                  className="hover:text-blue-600 font-bold truncate max-w-[120px]"
                >
                  {part}
                </button>
              </span>
            ))}
          </div>

          {errorMessage && (
            <div className="m-4 p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-800 text-xs flex items-start gap-2 leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <p>{errorMessage}</p>
            </div>
          )}

          {/* File Operations Bar */}
          <div className="px-5 py-2.5 bg-gray-50/20 border-b border-gray-100 flex items-center justify-between gap-3">
            <button
              onClick={() => {
                setCreateIsFolder(false);
                setShowCreateModal(true);
              }}
              className="py-1.5 px-3 rounded-lg bg-white border border-gray-200 hover:border-gray-300 text-gray-700 hover:text-[#141414] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              নতুন ফাইল / ফোল্ডার
            </button>

            <label className="py-1.5 px-3 rounded-lg bg-blue-50 border border-blue-100 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs">
              <UploadCloud className="w-3.5 h-3.5" />
              মোবাইল থেকে আপলোড
              <input
                type="file"
                className="hidden"
                onChange={handlePhoneFileUpload}
              />
            </label>
          </div>

          {/* Directory Listing File Area */}
          <div className="flex-1 p-5 relative min-h-[300px]">
            {isLoadingFiles ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/50 backdrop-blur-xs">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin mb-2" />
                <span className="text-xs text-gray-500">ফাইল লোড হচ্ছে...</span>
              </div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
                <Folder className="w-10 h-10 mb-3 text-gray-300" />
                <span className="text-xs font-semibold">এই ফোল্ডারে কোনো ফাইল নেই</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="group bg-white border border-gray-100 hover:border-blue-200 hover:bg-blue-50/5 rounded-lg p-2.5 flex items-center justify-between gap-3 transition duration-150 shadow-xs"
                  >
                    {/* Item Icon and Information */}
                    <div 
                      onClick={() => file.isDirectory ? handleFolderClick(file.name) : handleFileClick(file.name)}
                      className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                    >
                      {file.isDirectory ? (
                        <Folder className="w-8 h-8 text-amber-500 shrink-0" />
                      ) : (
                        getFileIcon(file.name)
                      )}
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-gray-800 block truncate group-hover:text-blue-600 transition">
                          {file.name}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {file.isDirectory ? "ফোল্ডার" : "ফাইল"}
                        </span>
                      </div>
                    </div>

                    {/* Options / Action Menu */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {/* Rename Trigger */}
                      <button
                        onClick={() => {
                          setRenamingFile(file.name);
                          setRenameInput(file.name);
                        }}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition cursor-pointer"
                        title="নাম বদলান"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>

                      {!file.isDirectory && (
                        <>
                          {/* Download File */}
                          <button
                            onClick={() => handleDownloadFile(file.name)}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-emerald-600 transition cursor-pointer"
                            title="ডাউনলোড"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Share file */}
                          <button
                            onClick={() => handleShareFile(file.name)}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition cursor-pointer"
                            title="শেয়ার"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {/* Delete file/folder */}
                      <button
                        onClick={() => handleDeleteEntry(file.name, file.isDirectory)}
                        className="p-1 rounded hover:bg-rose-50 text-gray-400 hover:text-rose-600 transition cursor-pointer"
                        title="ডিলিট"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RENAME ENTRY MODAL */}
      {renamingFile && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-[#141414] flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-blue-600" />
              নাম পরিবর্তন করুন
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              "{renamingFile}" এর নতুন নাম দিন:
            </p>
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-lg px-3 py-2 text-gray-900 outline-none text-xs font-medium"
              placeholder="নতুন নাম"
              autoFocus
            />
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setRenamingFile(null)}
                className="flex-1 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition cursor-pointer"
              >
                বাতিল
              </button>
              <button
                onClick={handleRenameEntry}
                disabled={!renameInput.trim() || renameInput === renamingFile}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer"
              >
                পরিবর্তন করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE ENTRY MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-[#141414] flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              নতুন আইটেম তৈরি
            </h3>
            
            <div className="grid grid-cols-2 gap-1.5 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setCreateIsFolder(false)}
                className={`py-1 rounded text-[11px] font-bold transition ${!createIsFolder ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"}`}
              >
                নতুন ফাইল (.txt)
              </button>
              <button
                onClick={() => setCreateIsFolder(true)}
                className={`py-1 rounded text-[11px] font-bold transition ${createIsFolder ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"}`}
              >
                নতুন ফোল্ডার
              </button>
            </div>

            <input
              type="text"
              value={newNameInput}
              onChange={(e) => setNewNameInput(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-lg px-3 py-2 text-gray-900 outline-none text-xs font-medium"
              placeholder={createIsFolder ? "যেমন: Documents" : "যেমন: todo.txt"}
              autoFocus
            />

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewNameInput("");
                }}
                className="flex-1 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition cursor-pointer"
              >
                বাতিল
              </button>
              <button
                onClick={handleCreateEntry}
                disabled={!newNameInput.trim()}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer"
              >
                তৈরি করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW / EDIT FILE SIDEBAR OR FULL PANEL */}
      {viewingFile && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs flex flex-col z-50">
          {/* Header Panel */}
          <div className="bg-white px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewingFile(null)}
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-black transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <span className="text-[10px] text-gray-400 font-mono leading-none block uppercase font-bold">ফাইল ভিউয়ার</span>
                <span className="text-sm font-bold text-gray-800">{viewingFile.name}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!viewingFile.isBinary && (
                <>
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => setIsEditing(false)}
                        className="py-1.5 px-3 rounded-lg border border-gray-200 hover:border-gray-300 text-gray-600 text-xs font-bold transition cursor-pointer bg-white"
                      >
                        বাতিল
                      </button>
                      <button
                        onClick={handleSaveFile}
                        disabled={isSaving}
                        className="py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            সংরক্ষণ হচ্ছে...
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            সংরক্ষণ করুন
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="py-1.5 px-3 rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold flex items-center gap-1.5 border border-gray-200 transition cursor-pointer shadow-xs"
                    >
                      <Edit className="w-3.5 h-3.5 text-blue-600" />
                      এডিট করুন
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => handleDownloadFile(viewingFile.name)}
                className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 hover:text-emerald-600 transition cursor-pointer shadow-xs"
                title="ডাউনলোড"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Viewer Panel Body */}
          <div className="flex-1 p-5 overflow-auto bg-gray-50">
            {viewingFile.isBinary ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                {viewingFile.mimeType.startsWith("image/") ? (
                  <div className="max-w-md max-h-[70vh] rounded-lg overflow-hidden border border-gray-200 shadow-xl bg-white p-2">
                    <img
                      src={`data:${viewingFile.mimeType};base64,${viewingFile.content}`}
                      alt={viewingFile.name}
                      referrerPolicy="no-referrer"
                      className="object-contain w-full h-full"
                    />
                  </div>
                ) : (
                  <>
                    <span className="p-4 rounded-xl bg-white border border-gray-100 text-gray-400">
                      <File className="w-12 h-12" />
                    </span>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-gray-800">এই ফাইলটি সরাসরি রিড করা সম্ভব নয়</p>
                      <p className="text-xs text-gray-500 max-w-sm mx-auto">
                        এটি একটি বাইনারি ফাইল ({viewingFile.mimeType})। অনুগ্রহ করে ডাউনলোড বাটনে ক্লিক করে ফাইলটি আপনার ডিভাইসে ওপেন করুন।
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownloadFile(viewingFile.name)}
                      className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      ফাইলটি ডাউনলোড করুন
                    </button>
                  </>
                )}
              </div>
            ) : isEditing ? (
              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                className="w-full h-full bg-[#141414] text-gray-100 font-mono text-xs outline-none resize-none leading-relaxed p-4 rounded-lg border border-neutral-800"
                placeholder="এখানে কিছু লিখুন..."
                autoFocus
              />
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-xs overflow-auto">
                <pre className="font-mono text-xs text-gray-800 leading-relaxed whitespace-pre-wrap select-text">
                  {viewingFile.content || (
                    <span className="italic text-gray-400">ফাইলটি সম্পূর্ণ খালি</span>
                  )}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SHARE MODAL */}
      {isSharingFile && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-blue-600" />
                ফাইল শেয়ার লিংক জেনারেটর
              </h3>
              <button
                onClick={() => setIsSharingFile(null)}
                className="text-gray-400 hover:text-black p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-[10px] text-gray-400 uppercase font-bold block">ফাইলের নাম:</span>
                <span className="text-xs font-bold text-gray-700 truncate block mt-0.5">{isSharingFile}</span>
              </div>

              {!shareLink ? (
                <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
                  <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                  <p className="text-xs text-gray-400">ডাউনলোড লিংক তৈরি করা হচ্ছে...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-[#141414] border border-neutral-800 rounded-lg p-3 flex items-center justify-between gap-3 font-mono text-xs text-slate-300">
                    <span className="truncate flex-1 select-all">{shareLink}</span>
                    <button
                      onClick={handleCopyShareLink}
                      className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-slate-400 hover:text-white transition cursor-pointer shrink-0"
                      title="লিংক কপি করুন"
                    >
                      {copiedLink ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                    <span>নিরাপত্তা স্বার্থে লিংকটির মেয়াদ ১৫ মিনিট পর্যন্ত সচল থাকবে।</span>
                  </p>

                  <div className="grid grid-cols-3 gap-2 pt-2">
                    {/* WhatsApp */}
                    <a
                      href={whatsAppShareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold text-center transition cursor-pointer flex items-center justify-center"
                    >
                      WhatsApp
                    </a>

                    {/* Facebook */}
                    <a
                      href={facebookShareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold text-center transition cursor-pointer flex items-center justify-center"
                    >
                      Facebook
                    </a>

                    {/* Native Share */}
                    <button
                      onClick={triggerNativeShare}
                      className="py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition cursor-pointer"
                    >
                      অন্যান্য অ্যাপ
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
