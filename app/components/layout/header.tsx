import { Search, Plus, Bell, ChevronDown } from "lucide-react";

export default function Header() {
  return (
    <header className="flex-shrink-0 bg-white flex items-center gap-3 px-6 py-3 border-b border-slate-200">
      
      {/* Search Input Group */}
      <div className="flex items-center gap-2.5 flex-1 max-w-xs rounded-xl px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 focus-within:border-blue-500 transition-colors">
        <Search size={14} className="text-slate-400 flex-shrink-0" />
        <input
          type="text"
          className="bg-transparent outline-none flex-1 text-sm text-slate-900 placeholder-slate-400"
          placeholder="Search clients, tasks, events…"
        />
      </div>

      {/* Right Actions & Status Elements */}
      <div className="flex items-center gap-2 ml-auto">
        
        {/* Primary Action Button */}
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors">
          <Plus size={14} /> New Task
        </button>
        
        {/* Secondary Action Button */}
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors">
          <Plus size={14} /> Request Quote
        </button>

        {/* AI Agent Status Pill */}
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          AI Agent: Active
        </div>

        {/* Notification Bell Badge */}
        <button className="relative p-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors">
          <Bell size={17} />
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full text-white text-[10px] flex items-center justify-center font-bold bg-blue-600">
            5
          </span>
        </button>

        {/* User Profile Dropdown Triggers */}
        <button className="flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white bg-blue-600">
            CR
          </div>
          <ChevronDown size={13} />
        </button>
        
      </div>
    </header>
  );
}