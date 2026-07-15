import { useState, useEffect } from "react";
import { Laptop, Smartphone, HelpCircle, Shield, Globe, HardDrive } from "lucide-react";
import PCShare from "./components/PCShare";
import PhoneClient from "./components/PhoneClient";

export default function App() {
  const [activeTab, setActiveTab] = useState<"phone" | "pc">("phone");
  const [initialCode, setInitialCode] = useState("");
  const [serverUrl, setServerUrl] = useState("");

  useEffect(() => {
    // Determine site URL dynamically
    const url = window.location.origin;
    setServerUrl(url);

    // Read pairing code from URL if provided (?code=123456)
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get("code");
    if (codeParam && codeParam.length === 6) {
      setInitialCode(codeParam);
      setActiveTab("phone");
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F5F3] text-[#1A1A1A] font-sans antialiased flex flex-col">
      {/* Premium Dark Top Workstation Header */}
      <header className="h-14 bg-[#141414] text-white flex items-center justify-between px-4 sm:px-6 border-b border-[#333] shrink-0 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold italic text-base shadow-inner text-white">R</div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono opacity-50 uppercase tracking-widest leading-none">Remote Connection</span>
            <span className="text-xs sm:text-sm font-bold tracking-tight mt-0.5">Main-Workstation-Pro-01</span>
          </div>
        </div>

        <div className="flex items-center space-x-4 sm:space-x-8 text-[11px] font-mono">
          <div className="flex flex-col text-right sm:text-left">
            <span className="opacity-50 uppercase text-[9px] leading-none">Status</span>
            <span className="text-green-400 font-bold mt-0.5">CONNECTED [SECURE]</span>
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="opacity-50 uppercase text-[9px] leading-none">Latency</span>
            <span className="text-slate-300 mt-0.5">14ms</span>
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="opacity-50 uppercase text-[9px] leading-none">Bandwidth</span>
            <span className="text-slate-300 mt-0.5">12.4 Mbps</span>
          </div>
          <div className="hidden sm:block w-px h-8 bg-white/10"></div>
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-orange-400 to-red-500 shadow-sm"></div>
            <span className="hidden md:inline-block text-slate-200">Admin Account</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6">
        
        {/* Brand Banner / Guide Intro */}
        <div className="bg-white p-6 rounded-xl border border-black/5 shadow-sm text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-blue-50 text-[11px] font-semibold text-blue-600 border border-blue-100">
            <Globe className="w-3.5 h-3.5 animate-pulse" />
            <span>সরাসরি পিসি টু মোবাইল কানেক্ট করুন</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-[#141414]">
            Remote PC File Manager
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm max-w-xl mx-auto leading-relaxed">
            আপনার কম্পিউটার অন থাকা অবস্থায় পৃথিবীর যেকোনো প্রান্ত থেকে পিসির ফাইলগুলো ব্রাউজ, এডিট এবং সরাসরি হোয়াটসঅ্যাপ বা ফেসবুকে শেয়ার করুন।
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-black/5 rounded-xl p-4 flex items-start gap-3 shadow-xs">
            <span className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0 border border-blue-100">
              <HardDrive className="w-4 h-4" />
            </span>
            <div>
              <h4 className="text-xs font-bold text-[#141414]">ফাইল ম্যানেজমেন্ট</h4>
              <p className="text-[11px] text-gray-500 mt-0.5">ফাইল কপি, মুভ, রিনেম ও ডিলিট করুন সরাসরি আপনার ফোন থেকে।</p>
            </div>
          </div>
          <div className="bg-white border border-black/5 rounded-xl p-4 flex items-start gap-3 shadow-xs">
            <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0 border border-indigo-100">
              <Shield className="w-4 h-4" />
            </span>
            <div>
              <h4 className="text-xs font-bold text-[#141414]">ইন-অ্যাপ এডিটর</h4>
              <p className="text-[11px] text-gray-500 mt-0.5">পিসির যেকোনো টেক্সট বা কোড ফাইল রিমোটলি এডিট ও সেভ করুন।</p>
            </div>
          </div>
          <div className="bg-white border border-black/5 rounded-xl p-4 flex items-start gap-3 shadow-xs">
            <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600 shrink-0 border border-emerald-100">
              <Globe className="w-4 h-4" />
            </span>
            <div>
              <h4 className="text-xs font-bold text-[#141414]">সোশ্যাল শেয়ারিং</h4>
              <p className="text-[11px] text-gray-500 mt-0.5">ফাইল শেয়ার লিংক জেনারেট করে সরাসরি হোয়াটসঅ্যাপে পাঠান।</p>
            </div>
          </div>
        </div>

        {/* Tab Selection Navigation */}
        <div className="grid grid-cols-2 gap-2 bg-[#141414] border border-[#333] p-1.5 rounded-xl shadow-md">
          <button
            onClick={() => setActiveTab("phone")}
            className={`py-3 px-4 rounded-lg font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition duration-300 cursor-pointer ${
              activeTab === "phone"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>📱 মোবাইল কন্ট্রোল</span>
          </button>
          
          <button
            onClick={() => setActiveTab("pc")}
            className={`py-3 px-4 rounded-lg font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition duration-300 cursor-pointer ${
              activeTab === "pc"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            <Laptop className="w-4 h-4" />
            <span>🖥️ পিসি শেয়ারিং</span>
          </button>
        </div>

        {/* Main Section */}
        <main className="space-y-6">
          {activeTab === "phone" ? (
            <PhoneClient initialCode={initialCode} />
          ) : (
            <PCShare serverUrl={serverUrl} />
          )}
        </main>

        {/* Informative Footer */}
        <footer className="mt-12 text-center space-y-4 border-t border-gray-200 pt-8">
          <div className="flex justify-center items-center gap-2 text-gray-400 text-xs font-mono">
            <HelpCircle className="w-4 h-4 text-gray-400" />
            <span>কিভাবে কাজ করে?</span>
          </div>
          <p className="text-gray-500 text-[11px] max-w-md mx-auto leading-relaxed">
            ১. প্রথমে আপনার কম্পিউটার থেকে <strong>পিসি শেয়ারিং</strong> ট্যাবে গিয়ে যেকোনো ফোল্ডার সিলেক্ট করে শেয়ারিং চালু করুন। <br />
            ২. এরপর সেখানে পাওয়া <strong>৬ সংখ্যার কোডটি</strong> আপনার মোবাইলে বসিয়ে কানেক্ট করে ফাইল এক্সেস নিন।
          </p>
          <div className="text-[10px] text-gray-400 font-mono flex items-center justify-center gap-3">
            <span>&copy; {new Date().getFullYear()} Remote PC File Manager</span>
            <span>|</span>
            <span className="text-green-600 font-bold">VERSION 2.4.0-STABLE</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
