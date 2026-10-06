"use client";

import { LucideIcon, Bot, LogOut } from "lucide-react";

interface NavLinkItem {
  icon: LucideIcon;
  label: string;
  badge?: number;
}

interface SidebarProps {
  navLinks: NavLinkItem[];
  activeNav: string;
  setActiveNav: (label: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ navLinks, activeNav, setActiveNav, isOpen = false, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 z-40 lg:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 flex-shrink-0 flex flex-col h-full overflow-hidden bg-slate-800 transition-transform duration-300 ease-in-out lg:static lg:w-60 lg:translate-x-0 ${
        isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      }`}>
      
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700/40 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500">
              <Bot size={15} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">
              Segretar<span className="text-blue-400">IA</span> <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 ml-1">Dental</span>
            </span>
          </div>
          <p className="text-[11px] mt-1.5 font-medium tracking-wide uppercase text-slate-400">
            Studio Dentistico Smart AI
          </p>
        </div>
        {onClose && (
          <button 
            onClick={onClose} 
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50"
            aria-label="Chiudi menu"
          >
            ✕
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2 text-slate-500">
          Menu Principale
        </p>
        
        {navLinks.map(({ icon: Icon, label, badge }) => {
          const active = activeNav === label;
          return (
            <button
              key={label}
              onClick={() => {
                setActiveNav(label);
                if (onClose) onClose();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-left
                ${active 
                  ? "bg-blue-600 text-white" 
                  : "bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1 leading-tight text-[13px]">{label}</span>
              
              {badge != null && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${active ? "bg-white/20 text-white" : "bg-blue-500 text-white"}`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="px-4 py-4 border-t border-slate-700/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 bg-blue-500">
            CR
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">Dott. Giovanni Scognamiglio</p>
            <p className="text-[11px] text-slate-400 truncate">Direttore Sanitario</p>
          </div>
          <button
            className="p-1.5 rounded-lg text-slate-500 hover:bg-white/10 hover:text-slate-300 transition-colors"
            title="Logout"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>


    </aside>
    </>
  );
}