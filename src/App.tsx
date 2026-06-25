import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  BookOpen, 
  FileText, 
  LayoutDashboard, 
  Search, 
  Plus, 
  Calendar, 
  Brain, 
  LogOut, 
  User as UserIcon,
  ChevronRight,
  CheckCircle2,
  Circle,
  Sparkles,
  Loader2,
  Menu,
  X,
  Mail,
  Sun,
  Moon,
  Download,
  Bot,
  Send,
  MessageSquare,
  Telescope,
  Paperclip,
  Upload,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import { User, Resource, Flashcard, PlannerTask } from './types';
import { generateStudyNotes, generateFlashcards } from './services/geminiService';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// --- Local Supporting Document Helpers & Components (Held locally on user device) ---

interface LocalAttachedFile {
  id: string;
  name: string;
  size: number;
  content: string;
  category?: 'Syllabus' | 'Past Papers' | 'Textbook' | 'General';
}

const extractTextFromFile = async (file: File): Promise<string> => {
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arr = new Uint8Array(e.target?.result as ArrayBuffer);
          if (!(window as any).pdfjsLib) {
            await new Promise<void>((res, rej) => {
              const script = document.createElement('script');
              script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.js';
              script.onload = () => res();
              script.onerror = () => rej(new Error('Failed to load local PDF parser.'));
              document.head.appendChild(script);
            });
          }
          const pdfjsLib = (window as any).pdfjsLib;
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
          
          const loadingTask = pdfjsLib.getDocument({ data: arr });
          const pdf = await loadingTask.promise;
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n';
          }
          resolve(fullText);
        } catch (err) {
          reject(new Error("Unable to parse this PDF. Please verify it is not password-protected."));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsArrayBuffer(file);
    });
  } else {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string || '');
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsText(file);
    });
  }
};

const LocalDocumentUploader = ({ 
  attachedFiles, 
  onAttach, 
  onRemove,
  onUpdateCategory
}: { 
  attachedFiles: LocalAttachedFile[]; 
  onAttach: (file: LocalAttachedFile) => void; 
  onRemove: (id: string) => void; 
  onUpdateCategory?: (id: string, category: 'Syllabus' | 'Past Papers' | 'Textbook' | 'General') => void;
}) => {
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setParsing(true);
    setError(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (attachedFiles.some(f => f.name === file.name)) {
          continue;
        }
        const content = await extractTextFromFile(file);
        if (content.trim().length === 0) {
          throw new Error(`The file "${file.name}" appears to be empty.`);
        }
        onAttach({
          id: Math.random().toString(36).substring(2, 9),
          name: file.name,
          size: file.size,
          content,
          category: 'General'
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to read file");
    } finally {
      setParsing(false);
      e.target.value = '';
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Paperclip size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Supporting Reference Documents</h4>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-normal">
              Attach Syllabus, past papers or lesson outlines (PDF, TXT, MD). Held entirely in memory on your device.
            </p>
          </div>
        </div>
        <div className="relative shrink-0 flex items-center">
          <input
            type="file"
            multiple
            accept=".pdf,.txt,.md,.csv,.json"
            onChange={handleFileChange}
            id="local-doc-input"
            className="hidden"
            disabled={parsing}
          />
          <label
            htmlFor="local-doc-input"
            className={cn(
              "inline-flex items-center gap-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold text-xs px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors shadow-sm cursor-pointer",
              parsing && "opacity-50 pointer-events-none"
            )}
          >
            {parsing ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
            Attach Document
          </label>
        </div>
      </div>

      {error && (
        <p className="text-xs text-rose-500 font-medium px-1 flex items-center gap-1">
          ⚠️ {error}
        </p>
      )}

      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {attachedFiles.map((file) => (
            <div 
              key={file.id} 
              className="flex items-center gap-2.5 bg-blue-50/60 dark:bg-blue-900/10 border border-blue-100/60 dark:border-blue-900/30 text-blue-700 dark:text-blue-400 px-3.5 py-1.5 rounded-xl text-xs font-medium animate-fadeIn shadow-xs"
            >
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Loaded locally" />
                <span className="truncate max-w-[120px] font-semibold" title={file.name}>{file.name}</span>
                <span className="text-[10px] text-blue-400 font-mono">({formatSize(file.size)})</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 border-l border-blue-200/40 dark:border-blue-900/40 pl-2">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Tag:</span>
                <select
                  value={file.category || 'General'}
                  onChange={(e) => onUpdateCategory?.(file.id, e.target.value as any)}
                  className="bg-white/95 dark:bg-slate-900 text-[10px] font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 px-1.5 py-0.5 rounded-md cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="General">General</option>
                  <option value="Syllabus">Syllabus</option>
                  <option value="Past Papers">Past Papers</option>
                  <option value="Textbook">Textbook</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => onRemove(file.id)}
                className="text-blue-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors cursor-pointer ml-1"
                title="Remove document"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold px-2.5 py-1 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100/50 dark:border-emerald-900/30 rounded-xl">
            <ShieldCheck size={12} /> Held 100% on device
          </div>
        </div>
      )}
    </div>
  );
};

// --- Components ---

const Sidebar = ({ user, onLogout, darkMode, onToggleTheme }: { 
  user: User; 
  onLogout: () => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}) => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Library', path: '/library', icon: BookOpen },
    { name: 'Notes', path: '/notes', icon: FileText },
    { name: 'Flashcards', path: '/flashcards', icon: Brain },
    { name: 'Planner', path: '/planner', icon: Calendar },
    { name: 'AI Tutor', path: '/chatbot', icon: MessageSquare },
  ];

  return (
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-slate-800 dark:text-white rounded-lg shadow-md"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="p-6 flex flex-col items-center border-b border-slate-100 dark:border-slate-800">
            <Link to="/" className="flex flex-col items-center gap-2 group">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/10 blur-2xl rounded-full group-hover:bg-blue-500/20 transition-colors" />
                <img 
                  src="https://7sbuvzfixakzf4rt.public.blob.vercel-storage.com/studenthub.png" 
                  alt="StudentHub Logo" 
                  className="w-24 h-24 lg:w-32 lg:h-32 object-contain relative z-10"
                  referrerPolicy="no-referrer"
                />
              </div>
              <span className="text-blue-600 dark:text-blue-400 font-black text-2xl lg:text-3xl tracking-tighter">StudentHub</span>
            </Link>
          </div>

          <nav className="flex-1 px-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-colors",
                  location.pathname === item.path
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800"
                )}
              >
                <item.icon size={20} />
                <span className="font-medium">{item.name}</span>
              </Link>
            ))}

            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 space-y-1">
              <p className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Support</p>
              
              <a
                href="https://wa.me/263778557569?text=Technical%20Support"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl transition-colors text-sm"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" className="shrink-0 text-emerald-500">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.432 5.631 1.433h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-xs leading-none">WhatsApp Support 1</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">+263 77 855 7569</span>
                </div>
              </a>

              <a
                href="https://wa.me/263778654020?text=Technical%20Support"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl transition-colors text-sm"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" className="shrink-0 text-emerald-500">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.432 5.631 1.433h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-xs leading-none">WhatsApp Support 2</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">+263 77 865 4020</span>
                </div>
              </a>

              <a
                href="https://wa.me/263777013404?text=Technical%20Support"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl transition-colors text-sm"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" className="shrink-0 text-emerald-500">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.432 5.631 1.433h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-xs leading-none">WhatsApp Support 3</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">+263 77 701 3404</span>
                </div>
              </a>

              <a
                href="mailto:princessdube1502@gmail.com?subject=Technical%20Support"
                className="flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl transition-colors text-sm"
              >
                <Mail size={18} className="text-blue-500 shrink-0" />
                <span className="font-medium">Email Support</span>
              </a>
            </div>
          </nav>

          <div className="p-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 px-4 py-3 mb-2">
              <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-400">
                <UserIcon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.username}</p>
                  <button 
                    onClick={onLogout}
                    className="lg:hidden p-1 text-slate-400 hover:text-red-600 transition-colors"
                    title="Logout"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                <button 
                  onClick={onToggleTheme}
                  className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white transition-all duration-300"
                >
                  {darkMode ? <Sun size={12} /> : <Moon size={12} />}
                  {darkMode ? 'Light Mode' : 'Dark Mode'}
                </button>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center justify-center gap-3 w-full px-4 py-3 mt-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 rounded-xl font-bold hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white transition-all duration-300 shadow-sm"
            >
              <LogOut size={20} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

// --- Pages ---

const Dashboard = ({ user, onLogout }: { user: User; onLogout: () => void }) => {
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);

  useEffect(() => {
    fetch(`/api/planner/${user.id}`).then(res => res.json()).then(setTasks);
    fetch(`/api/resources?limit=3`).then(res => res.json()).then(setResources);
  }, [user.id]);

  const todayTasks = tasks.filter(t => t.date === format(new Date(), 'yyyy-MM-dd'));

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white transition-colors">Welcome back, {user.username}! 👋</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Here's what's happening with your studies today.</p>
        </div>
        <button 
          onClick={onLogout}
          className="lg:hidden flex items-center justify-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl font-bold border border-red-100 dark:border-red-900/30"
        >
          <LogOut size={18} />
          Logout
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-900 dark:text-white">Today's Tasks</h2>
            <Calendar className="text-blue-600" size={20} />
          </div>
          <div className="space-y-3">
            {todayTasks.length > 0 ? todayTasks.map(task => (
              <div key={task.id} className="flex items-center gap-3">
                {task.completed ? <CheckCircle2 className="text-blue-500" size={18} /> : <Circle className="text-slate-300 dark:text-slate-600" size={18} />}
                <span className={cn("text-sm transition-colors", task.completed ? "text-slate-400 dark:text-slate-600 line-through" : "text-slate-700 dark:text-slate-300")}>{task.title}</span>
              </div>
            )) : <p className="text-sm text-slate-400 dark:text-slate-600">No tasks for today.</p>}
          </div>
          <Link to="/planner" className="mt-4 block text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline">View full planner</Link>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-900 dark:text-white">Recent Resources</h2>
            <BookOpen className="text-blue-600" size={20} />
          </div>
          <div className="space-y-3">
            {resources.slice(0, 3).map(res => (
              <div key={res.id} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded flex items-center justify-center text-slate-400 dark:text-slate-500">
                  {res.type === 'book' ? <BookOpen size={16} /> : <FileText size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{res.title}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{res.subject}</p>
                </div>
              </div>
            ))}
          </div>
          <Link to="/library" className="mt-4 block text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline">Browse library</Link>
        </div>

        <div className="bg-blue-600 dark:bg-blue-700 p-6 rounded-2xl shadow-lg text-white transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">AI Study Buddy</h2>
            <Sparkles size={20} />
          </div>
          <p className="text-blue-100 text-sm mb-4">Need quick notes or flashcards? Let AI help you study faster.</p>
          <Link to="/notes" className="inline-flex items-center gap-2 bg-white dark:bg-slate-100 text-blue-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-50 transition-colors">
            Try AI Notes
          </Link>
        </div>
      </div>
    </div>
  );
};

const Library = () => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');

  useEffect(() => {
    fetch('/api/subjects').then(res => res.json()).then(setSubjects);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (type) params.append('type', type);
    if (selectedSubject) params.append('subject', selectedSubject);
    
    fetch(`/api/resources?${params.toString()}`)
      .then(res => res.json())
      .then(setResources);
  }, [search, type, selectedSubject]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white transition-colors">Digital Library</h1>
          <p className="text-slate-500 dark:text-slate-400">Access textbooks and study materials.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
          <input
            type="text"
            placeholder="Search books, topics..."
            className="pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-64 text-slate-900 dark:text-white placeholder-slate-400 transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setType('')} className={cn("px-4 py-2 rounded-full text-sm font-medium transition-colors", !type ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}>All</button>
        <button onClick={() => setType('book')} className={cn("px-4 py-2 rounded-full text-sm font-medium transition-colors", type === 'book' ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}>Books</button>
        <button onClick={() => setType('note')} className={cn("px-4 py-2 rounded-full text-sm font-medium transition-colors", type === 'note' ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}>Notes</button>
        <select 
          className="px-4 py-2 rounded-full text-sm font-medium bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 focus:outline-none transition-colors"
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
        >
          <option value="">All Subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {resources.map(res => (
          <motion.div 
            layout
            key={res.id} 
            className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                res.type === 'book' ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" : "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
              )}>
                {res.type === 'book' ? <BookOpen size={24} /> : <FileText size={24} />}
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{res.subject}</span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{res.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">{res.content}</p>
            <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-50 dark:border-slate-800 transition-colors">
              <span className="text-xs text-slate-400 dark:text-slate-500">By {res.author}</span>
              <button className="text-blue-600 dark:text-blue-400 font-bold text-sm flex items-center gap-1 hover:gap-2 transition-all">
                Read Now <ChevronRight size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const Notes = () => {
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<LocalAttachedFile[]>([]);

  const handleGenerate = async () => {
    if (!topic) return;
    setLoading(true);
    try {
      const docsPayload = attachedFiles.map(f => ({ name: f.name, content: f.content, category: f.category || 'General' }));
      const result = await generateStudyNotes(topic, docsPayload);
      setNotes(result || '');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white transition-colors">AI Note Generator</h1>
        <p className="text-slate-500 dark:text-slate-400">Enter a topic and let AI compile study notes for you.</p>
      </header>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="e.g. Quantum Mechanics, French Revolution..."
          className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-400 transition-colors"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <button
          onClick={handleGenerate}
          disabled={loading || !topic}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
          Generate
        </button>
      </div>

      <LocalDocumentUploader
        attachedFiles={attachedFiles}
        onAttach={(file) => setAttachedFiles(prev => [...prev, file])}
        onRemove={(id) => setAttachedFiles(prev => prev.filter(f => f.id !== id))}
        onUpdateCategory={(id, category) => setAttachedFiles(prev => prev.map(f => f.id === id ? { ...f, category } : f))}
      />

      <AnimatePresence mode="wait">
        {notes && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm prose dark:prose-invert max-w-none transition-colors"
          >
            <div className="flex justify-between items-center mb-6 not-prose">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Study Notes: {topic}</h2>
              <button 
                onClick={() => {
                  const blob = new Blob([notes], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${topic.replace(/\s+/g, '_')}_notes.md`;
                  a.click();
                }}
                className="text-blue-600 dark:text-blue-400 text-sm font-bold flex items-center gap-1"
              >
                Download MD
              </button>
            </div>
            <Markdown>{notes}</Markdown>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Flashcards = ({ user }: { user: User }) => {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    fetch(`/api/flashcards/${user.id}`).then(res => res.json()).then(setCards);
  }, [user.id]);

  const handleGenerate = async () => {
    if (!topic) return;
    setLoading(true);
    try {
      const result = await generateFlashcards(topic, count);
      for (const card of result) {
        const res = await fetch('/api/flashcards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, subject: topic, ...card })
        });
        const newCard = await res.json();
        setCards(prev => [...prev, { id: newCard.id, user_id: user.id, subject: topic, ...card }]);
      }
      setTopic('');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const currentCard = cards[currentIndex];

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white transition-colors">Flashcards</h1>
        <p className="text-slate-500 dark:text-slate-400">Create or generate flashcards for active recall.</p>
      </header>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Topic for AI flashcards..."
          className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-400 transition-colors"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <div className="flex gap-3">
          <input
            type="number"
            min="1"
            max="20"
            className="w-20 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-colors"
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
          />
          <button
            onClick={handleGenerate}
            disabled={loading || !topic}
            className="flex-1 sm:flex-none bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
            Generate
          </button>
        </div>
      </div>

      {cards.length > 0 ? (
        <div className="space-y-6">
          <div 
            className="perspective-1000 h-64 cursor-pointer"
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <motion.div
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.6, type: 'spring' }}
              className="relative w-full h-full preserve-3d"
            >
              {/* Front */}
              <div className="absolute inset-0 backface-hidden bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-blue-900/30 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-lg transition-colors">
                <span className="text-xs font-bold text-blue-400 uppercase mb-4">{currentCard.subject}</span>
                <p className="text-xl font-bold text-slate-800 dark:text-white">{currentCard.question}</p>
                <p className="mt-8 text-sm text-slate-400 dark:text-slate-500">Click to flip</p>
              </div>
              {/* Back */}
              <div 
                className="absolute inset-0 backface-hidden bg-blue-600 text-white rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-lg"
                style={{ transform: 'rotateY(180deg)' }}
              >
                <p className="text-lg font-medium">{currentCard.answer}</p>
              </div>
            </motion.div>
          </div>

          <div className="flex items-center justify-between">
            <button 
              onClick={() => {
                setCurrentIndex(prev => Math.max(0, prev - 1));
                setIsFlipped(false);
              }}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 font-bold hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-30 transition-colors"
              disabled={currentIndex === 0}
            >
              Previous
            </button>
            <span className="text-slate-400 dark:text-slate-500 font-medium">{currentIndex + 1} / {cards.length}</span>
            <button 
              onClick={() => {
                setCurrentIndex(prev => Math.min(cards.length - 1, prev + 1));
                setIsFlipped(false);
              }}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 font-bold hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-30 transition-colors"
              disabled={currentIndex === cards.length - 1}
            >
              Next
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-blue-50 dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 transition-colors">
          <Brain className="mx-auto text-slate-300 dark:text-slate-700 mb-4" size={48} />
          <p className="text-slate-500 dark:text-slate-400">No flashcards yet. Generate some to start studying!</p>
        </div>
      )}
    </div>
  );
};

const Planner = ({ user }: { user: User }) => {
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [newTask, setNewTask] = useState('');
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    fetch(`/api/planner/${user.id}`).then(res => res.json()).then(setTasks);
  }, [user.id]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask) return;
    const res = await fetch('/api/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, title: newTask, date: newDate })
    });
    const data = await res.json();
    setTasks(prev => [...prev, { id: data.id, user_id: user.id, title: newTask, date: newDate, completed: 0 }]);
    setNewTask('');
  };

  const toggleTask = async (task: PlannerTask) => {
    const newStatus = task.completed ? 0 : 1;
    
    if (newStatus === 1) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 2000);
    }

    await fetch(`/api/planner/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: newStatus })
    });
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: newStatus } : t));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 relative">
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: -20 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-6 py-3 rounded-full font-bold shadow-lg flex items-center gap-2"
          >
            <Sparkles size={20} />
            Great job! Task completed.
          </motion.div>
        )}
      </AnimatePresence>

      <header>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white transition-colors">Study Planner</h1>
        <p className="text-slate-500 dark:text-slate-400">Organize your study sessions and deadlines.</p>
      </header>

      <form onSubmit={handleAddTask} className="flex flex-col sm:flex-row gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <input
          type="text"
          placeholder="What do you need to study?"
          className="flex-1 px-4 py-2 bg-blue-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-colors"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
        />
        <input
          type="date"
          className="px-4 py-2 bg-blue-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-colors"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
        />
        <button
          type="submit"
          disabled={!newTask}
          className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          Add Task
        </button>
      </form>

      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {tasks.map(task => (
            <motion.div 
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ 
                opacity: task.completed ? 0.6 : 1, 
                x: 0,
                scale: 1
              }}
              exit={{ opacity: 0, scale: 0.95 }}
              whileTap={{ scale: 0.98 }}
              key={task.id} 
              className={cn(
                "flex items-center gap-4 p-4 rounded-2xl border transition-all",
                task.completed ? "bg-blue-50 dark:bg-blue-900/10 border-slate-100 dark:border-slate-800" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm"
              )}
            >
              <button onClick={() => toggleTask(task)} className="text-blue-600 dark:text-blue-400 shrink-0">
                <motion.div
                  initial={false}
                  animate={{ scale: task.completed ? [1, 1.2, 1] : 1 }}
                  transition={{ duration: 0.3 }}
                >
                  {task.completed ? <CheckCircle2 size={24} /> : <Circle className="text-slate-300 dark:text-slate-700" size={24} />}
                </motion.div>
              </button>
              <div className="flex-1 min-w-0">
                <p className={cn("font-bold transition-colors truncate", task.completed ? "text-slate-400 dark:text-slate-600 line-through" : "text-slate-900 dark:text-white")}>{task.title}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{format(new Date(task.date), 'PPP')}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

const Login = ({ onLogin }: { onLogin: (user: User) => void }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const user = await res.json();
      onLogin(user);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-screen flex items-center justify-center p-6 transition-colors duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 transition-colors"
      >
        <div className="text-center mb-8">
          <img 
            src="https://7sbuvzfixakzf4rt.public.blob.vercel-storage.com/studenthub.png" 
            alt="StudentHub Logo" 
            className="w-48 h-48 md:w-64 md:h-64 mx-auto -mb-4 object-contain"
            referrerPolicy="no-referrer"
          />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Welcome to <span className="text-blue-600">StudentHub</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Your gateway to the Zimbabwe Heritage-Based Curriculum (2024-2030).</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
            <input
              type="email"
              required
              placeholder="you@student.com"
              className="w-full px-4 py-3 bg-blue-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-colors"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="animate-spin" size={20} />}
            Continue
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-8">
          By continuing, you agree to StudentHub's Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
};

const TutorChatbot = () => {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    { 
      role: 'assistant', 
      text: "Mhoro / Salibonani! I'm **StudenthubAI** 🔭, your StudentHub AI Tutor under the Zimbabwe Heritage-Based Curriculum (2024-2030).\n\nIf you find long textbook chapters exhausting, I'm here to make things simple. Ask me anything, or try one of the revision tools below!" 
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<LocalAttachedFile[]>([]);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  const quickPrompts = [
    { label: "Explain Unhu/Ubuntu principles", prompt: "Explain the main principles of Unhu/Ubuntu in Grade 7 Heritage Studies." },
    { label: "Simplify Photosynthesis 🌿", prompt: "Explain photosynthesis simply with a direct, clear analogy." },
    { label: "O-Level Ag Crop stages 🌾", prompt: "What are the key stages of maize production in O-Level Agriculture?" },
    { label: "Give me a quick STEM quiz! 🧠", prompt: "Give me a fun multiple-choice question on computer hardware or Combined Science." }
  ];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMessage = { role: 'user' as const, text: textToSend };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [...messages, userMessage],
          supportingDocuments: attachedFiles.map(f => ({ name: f.name, content: f.content, category: f.category || 'General' }))
        })
      });
      const data = await res.json();
      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', text: `Sorry, I hit a snag: ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: data.text }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', text: "I'm having trouble connecting right now. Please try again in a bit!" }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/35 rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-400">
          <Telescope size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white transition-colors flex items-center gap-2">
            Ask StudenthubAI <Sparkles className="text-amber-500 fill-amber-500 animate-pulse" size={18} />
          </h1>
          <p className="text-slate-500 dark:text-slate-400">Your lightning-fast companion for study summaries, explanations, and quick quizzes.</p>
        </div>
      </header>

      <LocalDocumentUploader
        attachedFiles={attachedFiles}
        onAttach={(file) => setAttachedFiles(prev => [...prev, file])}
        onRemove={(id) => setAttachedFiles(prev => prev.filter(f => f.id !== id))}
        onUpdateCategory={(id, category) => setAttachedFiles(prev => prev.map(f => f.id === id ? { ...f, category } : f))}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Side Info / Quick Chips */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 animate-fadeIn">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles size={16} className="text-blue-500" /> Quick Revision
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Skip deep reading. Tap a prompt below to quickly master key topics or start an instant knowledge test.
            </p>
            <div className="flex flex-col gap-2">
              {quickPrompts.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(item.prompt)}
                  className="w-full text-left text-xs bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 p-3 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-900 transition-all font-medium cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chat Interface */}
        <div className="lg:col-span-3 flex flex-col h-[550px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    "flex items-start gap-4",
                    message.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm text-sm",
                    message.role === 'user' 
                      ? "bg-blue-600 text-white font-bold" 
                      : "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                  )}>
                    {message.role === 'user' ? "ME" : <Telescope size={18} className="text-amber-600 dark:text-amber-400" />}
                  </div>

                  {/* Bubble */}
                  <div className={cn(
                    "max-w-[80%] p-4 rounded-2xl relative shadow-xs text-sm leading-relaxed",
                    message.role === 'user' 
                      ? "bg-blue-600 text-white rounded-tr-none" 
                      : "bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-800 rounded-tl-none"
                  )}>
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      <Markdown>{message.text}</Markdown>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {loading && (
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-sm">
                  <Telescope size={18} className="text-amber-600 dark:text-amber-400 animate-pulse" />
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-800 flex items-center gap-1">
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex gap-2">
            <input
              type="text"
              placeholder="Ask StudenthubAI to summarize, explain, or test you..."
              className="flex-1 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white text-sm"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center shrink-0 group cursor-pointer"
            >
              <Send size={18} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};


// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('studenthub_theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallBanner(false);
    }
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('studenthub_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse saved user", e);
        localStorage.removeItem('studenthub_user');
      }
    }
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('studenthub_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('studenthub_theme', 'light');
    }
  }, [darkMode]);

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('studenthub_user', JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('studenthub_user');
  };

  return (
    <Router>
      <div className="min-h-screen bg-blue-50 dark:bg-slate-950 flex transition-colors duration-300">
        <AnimatePresence>
          {showInstallBanner && (
            <motion.div
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-2xl border border-blue-100 dark:border-slate-800 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shrink-0">
                  <Download size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Install StudentHub</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Add to your home screen for quick access.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowInstallBanner(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Later
                </button>
                <button
                  onClick={handleInstallClick}
                  className="px-4 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 dark:shadow-none"
                >
                  Install
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!user ? (
          <Login onLogin={handleLogin} />
        ) : (
          <>
            <Sidebar 
              user={user} 
              onLogout={handleLogout} 
              darkMode={darkMode} 
              onToggleTheme={() => setDarkMode(!darkMode)} 
            />
            <main className="flex-1 lg:ml-64 p-6 lg:p-10">
              <div className="max-w-6xl mx-auto">
                <div className="hidden lg:flex justify-end mb-8">
                  <button 
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold hover:text-red-600 hover:border-red-200 dark:hover:border-red-900 transition-all shadow-sm"
                  >
                    <LogOut size={16} />
                    Logout
                  </button>
                </div>
                <Routes>
                  <Route path="/" element={<Dashboard user={user} onLogout={handleLogout} />} />
                  <Route path="/library" element={<Library />} />
                  <Route path="/notes" element={<Notes />} />
                  <Route path="/flashcards" element={<Flashcards user={user} />} />
                  <Route path="/planner" element={<Planner user={user} />} />
                  <Route path="/chatbot" element={<TutorChatbot />} />
                </Routes>

              </div>
            </main>
          </>
        )}
      </div>
    </Router>
  );
}
