/**
 * NexaSidebar — WhatsApp 2026 glass chat list with floating dock.
 *
 * Drop-in replacement for ChatSidebar: same props, new visual design.
 * Connects to real Matrix data via useMesh() hook.
 * All interactive elements are functional (search, filter, chat selection,
 * new chat creation, DM search, room joining).
 */
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import {
  Search, Plus, MessageSquare, Phone, Users, Sparkles, Radio,
  Lock, Hash, Settings, Bell, BellOff, Archive, ChevronDown,
  UserPlus, Bot, Newspaper, Music, ShoppingBag, Film, Calendar,
  HelpCircle, Wallet, Zap, X,
} from "lucide-react";
import { Chat, Story, StoryItem, UserProfile, ChatFolder } from "@/data/mockData";
import { CreateChatDialog } from "@/components/CreateChatDialog";
import { useMesh } from "@/lib/MeshProvider";
import { mxcToUrl, getInitials } from "@/lib/meshClient";

// Lazy-load feature pages (same as ChatSidebar)
const ContactsPage = lazy(() => import("@/components/ContactsPage").then(m => ({ default: m.ContactsPage })));
const SchedulerPage = lazy(() => import("@/components/SchedulerPage").then(m => ({ default: m.SchedulerPage })));
const AutoReplyPage = lazy(() => import("@/components/AutoReplyPage").then(m => ({ default: m.AutoReplyPage })));
const WalletPage = lazy(() => import("@/components/WalletPage").then(m => ({ default: m.WalletPage })));
const FeedPage = lazy(() => import("@/components/FeedPage").then(m => ({ default: m.FeedPage })));
const BotApiPage = lazy(() => import("@/components/BotApiPage").then(m => ({ default: m.BotApiPage })));
const HelpPage = lazy(() => import("@/components/HelpPage").then(m => ({ default: m.HelpPage })));
const NotificationsPage = lazy(() => import("@/components/NotificationsPage").then(m => ({ default: m.NotificationsPage })));
const VideoPage = lazy(() => import("@/components/VideoPage").then(m => ({ default: m.VideoPage })));
const MusicPage = lazy(() => import("@/components/MusicPage").then(m => ({ default: m.MusicPage })));
const MarketplacePage = lazy(() => import("@/components/MarketplacePage").then(m => ({ default: m.MarketplacePage })));

export interface SearchResult {
  type: "user" | "room";
  id: string;
  name: string;
  avatar: string;
  members?: number;
}

interface NexaSidebarProps {
  chats: Chat[];
  stories: Story[];
  profile: UserProfile;
  folders: ChatFolder[];
  selectedChatId: string | null;
  onSelectChat: (id: string) => void;
  onCreateChat: (chat: Chat) => void;
  onAddStory: (items: StoryItem[]) => void;
  onOpenSettings: () => void;
  onFoldersChange: (folders: ChatFolder[]) => void;
  onSearch?: (query: string) => Promise<SearchResult[]>;
  onStartDm?: (userId: string) => void;
  onJoinRoom?: (roomId: string) => void;
}

type FilterType = "all" | "dm" | "group" | "unread" | "favorites";
type DockTab = "chats" | "calls" | "updates" | "hubs" | "ai";

const filters: { id: FilterType; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "dm", label: "Личные" },
  { id: "group", label: "Группы" },
  { id: "unread", label: "Непрочитанные" },
  { id: "favorites", label: "Избранные" },
];

const dockTabs: { id: DockTab; icon: typeof MessageSquare; label: string }[] = [
  { id: "chats", icon: MessageSquare, label: "Чаты" },
  { id: "calls", icon: Phone, label: "Звонки" },
  { id: "updates", icon: Radio, label: "Новости" },
  { id: "hubs", icon: Users, label: "Хабы" },
  { id: "ai", icon: Sparkles, label: "AI" },
];

/** Gradient tint for avatar based on room name */
function avatarTint(name: string): string {
  const tints = [
    "from-emerald-400/40 to-teal-600/40",
    "from-sky-400/40 to-indigo-500/40",
    "from-violet-400/40 to-fuchsia-500/40",
    "from-amber-400/30 to-rose-500/30",
    "from-pink-400/30 to-purple-500/30",
    "from-cyan-400/40 to-emerald-400/40",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return tints[Math.abs(hash) % tints.length];
}

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "сейчас";
  if (mins < 60) return `${mins}м`;
  if (hours < 24) {
    return new Date(ts).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  }
  if (days < 7) return ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][new Date(ts).getDay()];
  return new Date(ts).toLocaleDateString("ru", { day: "2-digit", month: "2-digit" });
}

export function NexaSidebar({
  chats, profile, selectedChatId, onSelectChat, onCreateChat, onAddStory,
  onOpenSettings, onSearch, onStartDm, onJoinRoom, folders, onFoldersChange,
}: NexaSidebarProps) {
  const mesh = useMesh();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>("chats");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activePage, setActivePage] = useState<string>("");
  const [mutedChats] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem("nexalink-muted");
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch { return new Set(); }
  });

  // Hash-based page routing
  const pageFromHash = () => window.location.hash.replace("#", "");

  const openPage = useCallback((page: string) => {
    window.location.hash = page;
    setActivePage(page);
  }, []);

  const closePage = useCallback(() => {
    window.location.hash = "";
    setActivePage("");
  }, []);

  useEffect(() => {
    setActivePage(pageFromHash());
    const onHash = () => setActivePage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Live search via Matrix
  useEffect(() => {
    if (!search.trim() || !onSearch) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await onSearch(search);
        setSearchResults(r);
      } catch { /* ignore */ }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [search, onSearch]);

  // Filter & sort chats
  const filteredChats = chats
    .filter((c) => {
      if (search.trim()) {
        return c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.messages.at(-1)?.text.toLowerCase().includes(search.toLowerCase());
      }
      if (filter === "dm") return c.type === "dm";
      if (filter === "group") return c.type === "group" || c.type === "channel";
      if (filter === "unread") return (c.unread || 0) > 0;
      if (filter === "favorites") return c.pinned;
      return true;
    })
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const aTime = a.messages.at(-1)?.timestamp || 0;
      const bTime = b.messages.at(-1)?.timestamp || 0;
      return bTime - aTime;
    });

  const totalUnread = chats.reduce((s, c) => s + (c.unread || 0), 0);

  // ─── Render overlay pages (same as ChatSidebar) ───────────────────
  const renderPage = () => {
    if (!activePage) return null;
    const wrap = (child: React.ReactNode) => (
      <div className="absolute inset-0 z-30 bg-background overflow-y-auto animate-slide-in-right">
        <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-8 w-8 rounded-full gradient-primary animate-pulse" /></div>}>
          {child}
        </Suspense>
      </div>
    );
    if (activePage === "contacts") return wrap(<ContactsPage onClose={closePage} onStartDm={onStartDm || (() => {})} onJoinRoom={onJoinRoom || (() => {})} />);
    if (activePage === "scheduler") return wrap(<SchedulerPage />);
    if (activePage === "autoreply") return wrap(<AutoReplyPage />);
    if (activePage === "wallet") return wrap(<WalletPage />);
    if (activePage === "feed") return wrap(<FeedPage />);
    if (activePage === "bot-api") return wrap(<BotApiPage />);
    if (activePage === "help") return wrap(<HelpPage />);
    if (activePage === "notifications") return wrap(<NotificationsPage />);
    if (activePage === "video") return wrap(<VideoPage />);
    if (activePage === "music") return wrap(<MusicPage />);
    if (activePage === "marketplace") return wrap(<MarketplacePage />);
    return null;
  };

  return (
    <div className="relative flex flex-col h-full bg-background overflow-hidden">

      {/* ── Ambient backdrop ── */}
      <div className="pointer-events-none absolute inset-0 ambient-bg" />

      {/* ── Overlay pages ── */}
      {renderPage()}

      {/* ── Header ── */}
      <div className="relative z-10 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Profile avatar */}
            <button
              onClick={onOpenSettings}
              className="relative size-10 rounded-2xl overflow-hidden shrink-0 hover:ring-2 hover:ring-primary/40 transition-all"
              title="Настройки"
            >
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full gradient-primary grid place-items-center text-xs font-bold text-primary-foreground">
                  {profile.avatarInitials}
                </div>
              )}
              {/* Online dot */}
              <div className="absolute -bottom-0.5 -right-0.5 size-3 bg-[hsl(var(--online))] border-2 border-background rounded-full dot-pulse" />
            </button>

            <div>
              <h1 className="text-xl font-extrabold tracking-tight leading-tight">Сообщения</h1>
              <p className="text-[10px] font-mono text-muted-foreground">
                {mesh.syncing ? "синхронизация…" : `${chats.length} чатов`}
                {totalUnread > 0 && <span className="ml-1.5 text-primary font-bold">· {totalUnread} новых</span>}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => openPage("notifications")}
              className="relative size-9 rounded-xl bg-white/[0.04] border border-border/30 grid place-items-center hover:bg-white/[0.08] transition-all"
              title="Уведомления"
            >
              <Bell className="size-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => { setCreateOpen(true); }}
              className="size-9 rounded-xl gradient-primary text-primary-foreground grid place-items-center hover:scale-105 transition-all shadow-glow"
              title="Новый чат"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск или AI запрос…"
            className="w-full bg-white/[0.04] border border-border/30 rounded-2xl py-2.5 pl-10 pr-4 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/20 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all duration-200 ${
                filter === f.id
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : "bg-white/[0.04] border border-border/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chat list ── */}
      <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar px-3 pb-28 space-y-1">
        {/* Search results */}
        {search && searchResults.length > 0 && (
          <div className="mb-2">
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/60 px-2 py-1">
              Результаты поиска
            </p>
            {searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setSearch("");
                  if (r.type === "user") onStartDm?.(r.id);
                  else onJoinRoom?.(r.id);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-white/[0.06] transition-all"
              >
                <div className={`size-10 rounded-xl bg-gradient-to-br ${avatarTint(r.name)} grid place-items-center text-[11px] font-bold text-white/90 shrink-0`}>
                  {getInitials(r.name)}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {r.type === "user" ? "Пользователь" : `Группа · ${r.members || 0} участников`}
                  </p>
                </div>
                <UserPlus className="size-3.5 text-primary/60 shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Loading state */}
        {mesh.syncing && chats.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="size-10 rounded-2xl gradient-primary animate-pulse" />
            <p className="text-xs text-muted-foreground">Загрузка чатов…</p>
          </div>
        )}

        {/* Empty state */}
        {!mesh.syncing && filteredChats.length === 0 && !search && (
          <div className="flex flex-col items-center gap-4 py-16 text-center px-4">
            <div className="size-14 rounded-3xl bg-primary/10 border border-primary/20 grid place-items-center">
              <MessageSquare className="size-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold mb-1">Нет чатов</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Нажмите&nbsp;
                <span className="text-primary font-bold">+</span>
                &nbsp;чтобы начать переписку
              </p>
            </div>
            <button
              onClick={() => setCreateOpen(true)}
              className="mt-1 px-4 py-2 rounded-full text-xs font-bold gradient-primary text-primary-foreground shadow-glow hover:scale-105 transition-all"
            >
              Новый чат
            </button>
          </div>
        )}

        {/* Chat items */}
        {filteredChats.map((chat) => {
          const lastMsg = chat.messages.at(-1);
          const isSelected = selectedChatId === chat.id;
          const isMuted = mutedChats.has(chat.id);
          const unread = chat.unread || 0;
          const isOnline = mesh.rooms.find(r => r.id === chat.id)?.members?.some(m => m.presence === "online" && m.userId !== mesh.userId);
          const avatarUrl = chat.avatarUrl ? mxcToUrl(chat.avatarUrl) : null;

          return (
            <button
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-[20px] border transition-all duration-200 text-left group ${
                isSelected
                  ? "bg-primary/10 border-primary/20"
                  : "bg-white/[0.025] border-transparent hover:bg-white/[0.05] hover:border-border/20"
              }`}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={chat.name}
                    className="size-12 rounded-2xl object-cover"
                  />
                ) : (
                  <div className={`size-12 rounded-2xl bg-gradient-to-br ${avatarTint(chat.name)} grid place-items-center text-[11px] font-bold text-white/90`}>
                    {chat.type === "channel" ? <Hash className="size-4" /> : getInitials(chat.name)}
                  </div>
                )}
                {/* Online indicator */}
                {isOnline && chat.type === "dm" && (
                  <div className="absolute -bottom-0.5 -right-0.5 size-3.5 bg-[hsl(var(--online))] border-2 border-background rounded-full" />
                )}
                {/* Pinned */}
                {chat.pinned && (
                  <div className="absolute -top-1 -right-1 size-4 bg-primary/80 rounded-full grid place-items-center">
                    <span className="text-[8px] text-primary-foreground">📌</span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between mb-0.5">
                  <h3 className={`text-[14px] font-semibold truncate leading-tight ${isSelected ? "text-primary" : ""}`}>
                    {chat.type === "channel" && <span className="opacity-60 mr-0.5">#</span>}
                    {chat.name}
                  </h3>
                  {lastMsg && (
                    <span className={`text-[10px] font-mono shrink-0 ml-2 ${unread > 0 && !isMuted ? "text-primary font-bold" : "text-muted-foreground/50"}`}>
                      {formatTime(lastMsg.timestamp)}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <p className={`text-[12px] truncate leading-relaxed ${unread > 0 && !isMuted ? "text-foreground/80" : "text-muted-foreground/70"}`}>
                    {lastMsg ? (
                      <>
                        {lastMsg.sender !== "You" && chat.type !== "dm" && (
                          <span className="text-primary/80 mr-1 font-medium">
                            {lastMsg.sender.split(" ")[0]}:
                          </span>
                        )}
                        {lastMsg.text || (lastMsg.media?.length ? `📎 ${lastMsg.media[0].name}` : "…")}
                      </>
                    ) : (
                      <span className="italic opacity-50">Нет сообщений</span>
                    )}
                  </p>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {isMuted && <BellOff className="size-3 text-muted-foreground/40" />}
                    {unread > 0 && !isMuted && (
                      <div className="size-5 min-w-[20px] px-1 bg-primary rounded-full grid place-items-center text-[10px] font-black text-primary-foreground">
                        {unread > 99 ? "99+" : unread}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {/* Apps row */}
        <div className="mt-3 pt-3 border-t border-border/20">
          <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-muted-foreground/40 px-2 mb-2">
            Возможности
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { icon: Newspaper, label: "Лента", page: "feed" },
              { icon: Users, label: "Контакты", page: "contacts" },
              { icon: Bell, label: "Уведомл.", page: "notifications" },
              { icon: Calendar, label: "Расписание", page: "scheduler" },
              { icon: Bot, label: "Бот API", page: "bot-api" },
              { icon: Music, label: "Музыка", page: "music" },
              { icon: Film, label: "Видео", page: "video" },
              { icon: ShoppingBag, label: "Маркет", page: "marketplace" },
            ].map((app) => {
              const Icon = app.icon;
              return (
                <button
                  key={app.page}
                  onClick={() => openPage(app.page)}
                  className="flex flex-col items-center gap-1 py-2 rounded-xl bg-white/[0.03] border border-border/20 hover:bg-white/[0.07] hover:border-primary/20 transition-all"
                >
                  <Icon className="size-4 text-muted-foreground/70" />
                  <span className="text-[9px] font-medium text-muted-foreground/60 leading-none">{app.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Floating dock ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] z-20">
        <div className="glass border border-white/10 rounded-full px-2.5 py-2 flex items-center justify-around shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
          {dockTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = dockTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setDockTab(tab.id)}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-full transition-all duration-200 ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-foreground/35 hover:text-foreground/60"
                }`}
                title={tab.label}
              >
                <Icon className="size-4.5 w-[18px] h-[18px]" />
                <span className="text-[9px] font-medium">{tab.label}</span>
                {isActive && (
                  <span className="absolute -top-0.5 size-1.5 bg-primary rounded-full dot-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── New chat dialog ── */}
      <CreateChatDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateChat={onCreateChat}
        onStartDm={onStartDm}
        onJoinRoom={onJoinRoom}
      />
    </div>
  );
}
