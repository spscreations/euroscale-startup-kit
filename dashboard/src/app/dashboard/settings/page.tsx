"use client";

import { useCallback, useState } from "react";
import {
  User, Bell, CreditCard, Shield, ChevronRight, Check,
  Pencil, Key, X, Mail, Globe, Sparkles, BadgeCheck,
  ArrowUpRight, ExternalLink, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import ApiKeys from "@/components/ApiKeys";
import toast from "react-hot-toast";

interface NPref { id: string; label: string; desc: string; en: boolean;
  icon: React.ComponentType<{ size: number; className?: string }>; }
interface BPlan { name: string; price: string; period: string;
  status: "active" | "past_due" | "canceled";
  features: string[]; usagePct: number; usageLbl: string; }

function mkN(): NPref[] { return [
  {id:"billing",label:"Billing alerts",desc:"Invoices, payment failures, and plan changes",en:true,icon:CreditCard},
  {id:"usage",label:"Usage thresholds",desc:"When database storage or connections near limits",en:true,icon:Zap},
  {id:"backups",label:"Backup notifications",desc:"Daily backup success or failure reports",en:true,icon:Shield},
  {id:"security",label:"Security alerts",desc:"New login from unrecognized device or location",en:false,icon:Shield},
  {id:"product",label:"Product updates",desc:"New features, maintenance windows, and changelog",en:false,icon:Sparkles},
]; }

function mkB(): BPlan { return {
  name:"Scale", price:"9", period:"per month", status:"active",
  features:["Up to 10 databases","5 GB storage per database","Daily automated backups","99.95% SLA","Priority email support","Team members (up to 5)"],
  usagePct:45, usageLbl:"5 of 10 databases used",
}; }

function SC({icon:Icon,title,desc,children}:{icon:React.ComponentType<{size:number;className?:string}>;title:string;desc?:string;children:React.ReactNode}) {
  return (<div className="glass-card animate-slide-up overflow-hidden"><div className="border-b border-glass-border px-6 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/15"><Icon size={18} className="text-purple-400"/></div><div><h2 className="text-base font-semibold text-text-primary">{title}</h2>{desc && <p className="text-xs text-text-muted">{desc}</p>}</div></div></div><div className="p-6">{children}</div></div>);
}

function Tgl({en,on,id}:{en:boolean;on:(v:boolean)=>void;id:string}) {
  return (<button id={id} role="switch" aria-checked={en} onClick={()=>on(!en)} className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",en?"bg-purple-500":"bg-navy-600")}><span className={cn("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-all duration-200",en?"translate-x-4":"translate-x-0")}/></button>);
}

export default function SettingsPage() {
  const { session } = useAuth();
  const [en, setEn] = useState(false);
  const [nm, setNm] = useState(session?.name ?? "User");
  const [sv, setSv] = useState(false);
  const [p, setP] = useState(mkN);
  const h = useCallback(async () => { if (!nm.trim()) return; setSv(true); await new Promise(r => setTimeout(r, 600)); setSv(false); setEn(false); toast.success("Profile name updated"); }, [nm]);
  const tg = useCallback((id: string) => { setP(pr => pr.map(x => x.id === id ? { ...x, en: !x.en } : x)); toast.success("Notification preference updated"); }, []);
  const b = mkB();
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-8">
      <div className="mb-2"><h1 className="text-xl font-bold text-text-primary">Settings</h1><p className="mt-1 text-sm text-text-muted">Manage your account, API keys, and billing</p></div>
      
      <SC icon={User} title="Profile">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 text-lg font-bold text-white">{session?.name?.charAt(0)?.toUpperCase() ?? nm.charAt(0).toUpperCase() ?? "?"}</div>
          <div className="flex-1 min-w-0">
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">Name</label>
              {en ? (
                <div className="flex items-center gap-2">
                  <input type="text" value={nm} onChange={e => setNm(e.target.value)} className="flex-1 rounded-lg border border-glass-border bg-navy-700/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 outline-none transition-colors focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20" autoFocus onKeyDown={e => e.key === "Enter" && h()} />
                  <button onClick={h} disabled={sv || !nm.trim()} className={cn("rounded-lg p-2 transition-colors", sv || !nm.trim() ? "text-text-muted cursor-not-allowed" : "text-green-400 hover:bg-green-500/10")}>{sv ? <span className="block h-4 w-4 animate-spin rounded-full border-2 border-green-400/30 border-t-green-400" /> : <Check size={16} />}</button>
                  <button onClick={() => { setEn(false); setNm(session?.name ?? "User"); }} className="rounded-lg p-2 text-text-muted transition-colors hover:bg-navy-700 hover:text-text-primary"><X size={16} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2"><span className="text-sm font-medium text-text-primary">{session?.name ?? nm}</span><button onClick={() => setEn(true)} className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-navy-700 hover:text-purple-400" title="Edit name"><Pencil size={14} /></button></div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">Email</label>
              <div className="flex items-center gap-2"><span className="text-sm text-text-secondary">{session?.email ?? "user@example.com"}</span><BadgeCheck size={14} className="text-green-400" /></div>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-navy-800/40 p-3">
          <div><p className="text-xs font-medium uppercase tracking-wider text-text-muted">Member since</p><p className="mt-0.5 text-sm text-text-secondary">June 2026</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wider text-text-muted">Account ID</p><p className="mt-0.5 font-mono text-xs text-text-muted">{session?.id ? "usr_" + session.id.slice(0, 8) : "usr_abc12345"}</p></div>
        </div>
      </SC>

      <SC icon={Key} title="API Keys" desc="Manage programmatic access to the EuroScale API"><ApiKeys /></SC>

      <SC icon={Bell} title="Notifications" desc="Choose what you get notified about">
        <div className="space-y-1">
          {p.map(x => (
            <div key={x.id} className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-navy-800/40">
              <div className="flex items-center gap-3 min-w-0"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-700 text-text-muted"><x.icon size={15} /></div><div className="min-w-0"><p className="text-sm font-medium text-text-primary">{x.label}</p><p className="text-xs text-text-muted truncate">{x.desc}</p></div></div>
              <Tgl en={x.en} on={() => tg(x.id)} id={"pref-" + x.id} />
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-dashed border-glass-border p-4 text-center"><Mail size={20} className="mx-auto mb-2 text-text-muted/60" /><p className="text-sm text-text-muted">Notifications are sent to {session?.email ?? "your account email"}</p><p className="mt-1 text-xs text-text-muted/60">You can manage email frequency in notification settings</p></div>
      </SC>

      <SC icon={CreditCard} title="Billing" desc="Your current plan and usage">
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div><div className="flex items-center gap-2"><h3 className="text-lg font-bold gradient-text">{b.name}</h3><span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-green-400">Active</span></div><p className="mt-1 text-sm text-text-muted">{b.price} <span className="text-xs">{b.period}</span></p></div>
            <button className="flex items-center gap-1 rounded-lg border border-glass-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-purple-500/30 hover:text-purple-400">Change Plan<ChevronRight size={14} /></button>
          </div>
        </div>
        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between text-xs"><span className="text-text-muted">{b.usageLbl}</span><span className="text-text-secondary font-medium">{b.usagePct}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-navy-700"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-500" style={{ width: b.usagePct + "%" }} /></div>
        </div>
        <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">{b.features.map(f => (<div key={f} className="flex items-center gap-2 text-sm text-text-secondary"><Check size={14} className="text-green-400 shrink-0" />{f}</div>))}</div>
        <div className="flex flex-wrap gap-3 border-t border-glass-border pt-4">
          <button className="flex items-center gap-2 rounded-lg border border-glass-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-purple-500/30 hover:text-purple-400"><CreditCard size={15} />Payment Methods<ExternalLink size={13} /></button>
          <button className="flex items-center gap-2 rounded-lg border border-glass-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-purple-500/30 hover:text-purple-400"><ArrowUpRight size={15} />View Invoices</button>
          <button className="flex items-center gap-2 rounded-lg border border-glass-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-purple-500/30 hover:text-purple-400"><Globe size={15} />Manage Tax Info</button>
        </div>
      </SC>

      <p className="text-center text-xs text-text-muted/50">EuroScale &mdash; European Database Platform &middot; Version 0.1.0</p>
    </div>
  );
}
