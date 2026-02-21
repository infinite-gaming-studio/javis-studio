import os
import re

SRC_DIR = "/Users/nvo/Coding/javis-studio/src"

REPLACEMENTS = {
    # globals.css
    r"--background: #0d0f14;": "--background: #f8fafc;",
    r"--foreground: #e2e8f0;": "--foreground: #0f172a;",
    r"background: #334155;": "background: #cbd5e1;",
    r"background: #475569;": "background: #94a3b8;",

    # page.tsx
    r"bg-\[\#0d0f14\] text-white": "bg-slate-50 text-slate-900",
    r"bg-\[\#0d0f14\]/90": "bg-white/90",
    r"border-slate-800": "border-slate-200",
    r"bg-slate-900/60 border border-slate-800": "bg-white border border-slate-200 shadow-sm",
    r"className=\"w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200": "className=\"w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200",
    r"className=\"w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200": "className=\"w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200",
    r"bg-red-900/30 border border-red-700/50 px-4 py-3 text-sm text-red-300": "bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600",
    
    # PromptEditor.tsx
    r"bg-slate-700 hover:bg-violet-600/70 text-slate-300 hover:text-white transition-colors duration-150 border border-slate-600 hover:border-violet-500": "bg-slate-100 hover:bg-violet-500 text-slate-600 hover:text-white transition-colors duration-150 border border-slate-200 hover:border-violet-400",
    r"bg-slate-800 border border-slate-600 focus:border-violet-500 outline-none\n                   text-sm text-slate-200 placeholder-slate-600": "bg-slate-50 border border-slate-200 focus:border-violet-500 outline-none\n                   text-sm text-slate-700 placeholder-slate-400",
    
    # VoiceSettings.tsx & General
    r"text-slate-400": "text-slate-500",
    r"bg-slate-800 border border-slate-600 hover:border-violet-500 text-sm text-slate-400 hover:text-slate-200": "bg-slate-50 border border-slate-200 hover:border-violet-400 text-sm text-slate-600 hover:text-slate-900",
    r"bg-violet-600/20 border-violet-500 text-violet-300": "bg-violet-50 border-violet-400 text-violet-700",
    r"bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-500": "bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300",
    r"max={1}": "max={2}",
    r"bg-slate-800 border border-slate-600 focus:border-violet-500 outline-none text-sm text-slate-200": "bg-slate-50 border border-slate-200 focus:border-violet-500 outline-none text-sm text-slate-700",
    r"bg-violet-600\" : \"bg-slate-700\"": "bg-violet-500\" : \"bg-slate-200\"",
    
    # ScriptPreview.tsx
    r"bg-yellow-500/20 text-yellow-300 border-yellow-500/40": "bg-yellow-50 text-yellow-700 border-yellow-200",
    r"bg-blue-500/20 text-blue-300 border-blue-500/40": "bg-blue-50 text-blue-700 border-blue-200",
    r"bg-indigo-500/20 text-indigo-300 border-indigo-500/40": "bg-indigo-50 text-indigo-700 border-indigo-200",
    r"bg-red-500/20 text-red-300 border-red-500/40": "bg-red-50 text-red-700 border-red-200",
    r"bg-pink-500/20 text-pink-300 border-pink-500/40": "bg-pink-50 text-pink-700 border-pink-200",
    r"bg-orange-500/20 text-orange-300 border-orange-500/40": "bg-orange-50 text-orange-700 border-orange-200",
    r"bg-green-500/20 text-green-300 border-green-500/40": "bg-green-50 text-green-700 border-green-200",
    r"bg-purple-500/20 text-purple-300 border-purple-500/40": "bg-purple-50 text-purple-700 border-purple-200",
    r"bg-slate-500/20 text-slate-300 border-slate-500/40": "bg-slate-100 text-slate-700 border-slate-200",
    
    r"bg-slate-800/60 border border-slate-700": "bg-white border border-slate-200 shadow-sm",
    r"hover:border-slate-500": "hover:border-slate-400",
    r"bg-slate-700 border border-slate-600 rounded-lg px-2 py-0.5 text-slate-300": "bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-slate-700",
    r"text-sm text-slate-200 outline-none resize-none placeholder-slate-600": "text-sm text-slate-800 outline-none resize-none placeholder-slate-400",
    r"border border-dashed border-slate-700 py-10": "border border-dashed border-slate-300 py-10 bg-slate-50/50",
    r"text-slate-600": "text-slate-500",

    # ImageUploader.tsx
    r"border-slate-600 hover:border-slate-400 bg-slate-800/40": "border-slate-300 hover:border-slate-400 bg-slate-50",
    r"border-violet-400 bg-violet-500/10": "border-violet-500 bg-violet-50",
    r"bg-slate-800": "bg-slate-100",
    
    # AudioPlayer.tsx
    r"bg-slate-700 hover:bg-violet-600/50": "bg-slate-100 hover:bg-violet-100",
    r"bg-slate-700": "bg-slate-200",
}

for root, _, files in os.walk(SRC_DIR):
    for file in files:
        if file.endswith((".tsx", ".css")):
            path = os.path.join(root, file)
            with open(path, "r") as f:
                content = f.read()
            
            # Additional logic for specific files to avoid wrong replaces
            if file == "page.tsx":
                content = content.replace("bg-slate-900/60 border border-slate-800", "bg-white border border-slate-200 shadow-sm")
                
            for old, new in REPLACEMENTS.items():
                content = content.replace(old, new)
            
            with open(path, "w") as f:
                f.write(content)

print("Done converting theme.")
