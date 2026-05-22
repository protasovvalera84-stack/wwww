/**
 * NexaConversation — WhatsApp 2026 conversation view.
 *
 * Drop-in replacement for ChatView: same props, new visual design.
 * Renders WhatsApp-style message bubbles (green for own, glass for others),
 * fully connected to Matrix via useMesh() + onSendMessage callback.
 *
 * Features: text/media messages, reply, reactions, voice indicator,
 * smart replies, emoji & GIF pickers, file upload, scroll-to-bottom.
 */
import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import {
  Phone, Video, MoreVertical, Paperclip, Smile, Send, Lock, Timer,
  Mic, ArrowLeft, Play, Download, Forward, Copy, Trash2, Check,
  ChevronDown, X, Image, Film, FileText, Search,
} from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { Chat, Message, MediaAttachment, Topic } from "@/data/mockData";
import { useMesh } from "@/lib/MeshProvider";
import { mxcToUrl, mxcToThumbnail, getInitials, downloadMedia } from "@/lib/meshClient";
import { uploadMedia } from "@/lib/meshClient";
import { EmojiPicker } from "@/components/EmojiPicker";
import { GifPicker } from "@/components/GifPicker";

const GroupCallScreen = lazy(() => import("@/components/GroupCallScreen").then(m => ({ default: m.GroupCallScreen })));
const AiAssistant = lazy(() => import("@/components/AiAssistant").then(m => ({ default: m.AiAssistant })));

interface NexaConversationProps {
  chat: Chat;
  onSendMessage: (chatId: string, text: string, media?: MediaAttachment[], topicId?: string | null) => void;
  onBack: () => void;
  onCall?: (type: "audio" | "video") => void;
  onCreateTopic?: (chatId: string, name: string, icon: string) => void;
  onDeleteTopic?: (chatId: string, topicId: string) => void;
  onSettingsClick?: () => void;
  onDmSettingsClick?: () => void;
}

const waveformHeights = [8, 16, 10, 22, 14, 24, 12, 20, 8, 18, 22, 12, 18, 8, 24, 16, 10];

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

/** WhatsApp-style smart replies based on last message */
function getSmartReplies(lastMsg?: Message): string[] {
  if (!lastMsg) return [];
  const text = lastMsg.text.toLowerCase();
  if (text.includes("?")) return ["Да", "Нет", "Не знаю", "Подожди"];
  if (text.includes("спасибо") || text.includes("thanks")) return ["Не за что!", "Пожалуйста 😊", "Всегда рад!"];
  if (text.includes("привет") || text.includes("hello") || text.includes("hi")) return ["Привет! 👋", "Привет, как дела?", "Здарова!"];
  if (text.includes("пока") || text.includes("bye")) return ["Пока! 👋", "До свидания!", "До скорого!"];
  return ["👍", "Ок", "Понял", "Посмотрю"];
}

export function NexaConversation({
  chat, onSendMessage, onBack, onCall, onSettingsClick, onDmSettingsClick,
}: NexaConversationProps) {
  const mesh = useMesh();
  const [input, setInput] = useState(() => {
    try { return localStorage.getItem(`nexalink-draft-${chat.id}`) || ""; } catch { return ""; }
  });
  const [pendingMedia, setPendingMedia] = useState<MediaAttachment[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [groupCallOpen, setGroupCallOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const virtuosoRef = useRef<{ scrollToIndex: (opts: { index: number | "LAST"; behavior?: ScrollBehavior }) => void }>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save draft
  useEffect(() => {
    localStorage.setItem(`nexalink-draft-${chat.id}`, input);
  }, [input, chat.id]);

  // Mark as read when viewing
  useEffect(() => {
    if (mesh.client && chat.id && chat.messages.length > 0) {
      const lastEvent = mesh.rooms.find(r => r.id === chat.id)?.lastEvent;
      if (lastEvent) {
        mesh.client.sendReadReceipt(lastEvent).catch(() => {});
      }
    }
  }, [chat.id, mesh.client, mesh.rooms, chat.messages.length]);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" });
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text && pendingMedia.length === 0) return;
    onSendMessage(chat.id, text, pendingMedia.length > 0 ? pendingMedia : undefined, null);
    setInput("");
    setPendingMedia([]);
    setReplyTo(null);
    setTimeout(scrollToBottom, 100);
  }, [input, pendingMedia, chat.id, onSendMessage, scrollToBottom]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = "";

    if (!mesh.session) return;
    setUploading(true);
    try {
      const results = await Promise.all(
        files.map(async (file) => {
          const encInfo = await uploadMedia(mesh.session!.accessToken, file);
          const type: MediaAttachment["type"] =
            file.type.startsWith("video/") ? "video" :
            file.type.startsWith("audio/") ? "audio" :
            file.type.startsWith("image/") ? "image" : "file";
          return {
            id: `media-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            type,
            name: file.name,
            url: encInfo.url,
            size: file.size,
            mimeType: file.type,
          } as MediaAttachment;
        }),
      );
      setPendingMedia((prev) => [...prev, ...results]);
    } catch (err) {
      console.error("Upload failed:", err);
    }
    setUploading(false);
  };

  const messages = chat.messages;
  const lastIncoming = messages.filter(m => !m.isOwn).at(-1);
  const smartReplies = getSmartReplies(lastIncoming);

  // Is there someone online in this chat?
  const isOnline = mesh.rooms
    .find(r => r.id === chat.id)
    ?.members?.some(m => m.presence === "online" && m.userId !== mesh.userId);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">

      {/* ── Ambient backdrop ── */}
      <div className="pointer-events-none absolute inset-0 mesh-bg opacity-50" />

      {/* ── Header ── */}
      <div className="chat-header relative z-10 flex items-center justify-between border-b border-border/30 px-4 py-2.5 glass-strong">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="size-8 grid place-items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-all md:hidden"
          >
            <ArrowLeft className="size-4" />
          </button>

          {/* Avatar */}
          <button
            onClick={onDmSettingsClick || onSettingsClick}
            className="relative shrink-0 hover:opacity-80 transition-opacity"
          >
            {chat.avatarUrl ? (
              <img
                src={mxcToUrl(chat.avatarUrl)}
                alt={chat.name}
                className="size-9 rounded-xl object-cover"
              />
            ) : (
              <div className="size-9 rounded-xl gradient-primary grid place-items-center text-[10px] font-bold text-primary-foreground">
                {getInitials(chat.name)}
              </div>
            )}
            {isOnline && chat.type === "dm" && (
              <div className="absolute -bottom-0.5 -right-0.5 size-2.5 bg-[hsl(var(--online))] border-2 border-background rounded-full" />
            )}
          </button>

          {/* Name + status */}
          <button
            onClick={onDmSettingsClick || onSettingsClick}
            className="text-left hover:opacity-80 transition-opacity"
          >
            <h2 className="text-sm font-bold leading-tight line-clamp-1">{chat.name}</h2>
            <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
              {isOnline ? (
                <span className="text-primary">● Online</span>
              ) : chat.type === "group" || chat.type === "channel" ? (
                `${chat.members?.length || 0} участников`
              ) : (
                "был(а) недавно"
              )}
            </p>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCall?.("audio")}
            className="size-8 grid place-items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-all"
            title="Аудиозвонок"
          >
            <Phone className="size-4" />
          </button>
          <button
            onClick={() => onCall?.("video")}
            className="size-8 grid place-items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-all"
            title="Видеозвонок"
          >
            <Video className="size-4" />
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="size-8 grid place-items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-all"
          >
            <MoreVertical className="size-4" />
          </button>
        </div>

        {/* Header dropdown menu */}
        {menuOpen && (
          <div
            className="absolute top-full right-4 mt-2 w-48 glass-strong border border-border/40 rounded-2xl shadow-elegant z-50 py-1 animate-scale-in"
            onMouseLeave={() => setMenuOpen(false)}
          >
            {[
              { icon: Search, label: "Поиск в чате" },
              { icon: Timer, label: "Исчезающие сообщения" },
              { icon: Image, label: "Медиа галерея", onClick: () => {} },
              { icon: Lock, label: "Настройки чата", onClick: onDmSettingsClick || onSettingsClick },
              { icon: GroupCallScreen ? Film : Film, label: "Групповой звонок", onClick: () => setGroupCallOpen(true) },
              { icon: Trash2, label: "Очистить историю" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => { item.onClick?.(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/[0.06] transition-colors text-left"
                >
                  <Icon className="size-3.5 text-muted-foreground" />
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── E2EE relay banner ── */}
      <div className="e2ee-banner relative z-10 flex items-center justify-center gap-2 py-1.5 bg-primary/5 border-b border-border/20">
        <Lock className="size-2.5 text-primary" />
        <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-primary">
          end-to-end encrypted · relay · messages deleted after delivery
        </span>
        <Timer className="size-2.5 text-primary" />
      </div>

      {/* ── Messages ── */}
      <div
        className="relative flex-1 overflow-hidden"
        onScroll={(e) => {
          const el = e.currentTarget;
          setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
        }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <div className="size-16 rounded-3xl bg-primary/10 border border-primary/20 grid place-items-center">
              <Lock className="size-7 text-primary" />
            </div>
            <p className="text-sm font-semibold">Начните разговор</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Сообщения зашифрованы E2EE и удалятся с сервера после доставки.
              Только вы и ваш собеседник можете их прочитать.
            </p>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            className="h-full"
            style={{ height: "100%" }}
            initialTopMostItemIndex={messages.length - 1}
            followOutput="smooth"
            itemContent={(_, msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onReply={() => setReplyTo(msg)}
              />
            )}
            components={{
              Header: () => <div className="h-4" />,
              Footer: () => <div className="h-4" />,
            }}
          />
        )}

        {/* Scroll-to-bottom button */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 size-9 glass-strong border border-border/40 rounded-full grid place-items-center shadow-elegant hover:scale-110 transition-all animate-scale-in"
          >
            <ChevronDown className="size-4 text-foreground/70" />
          </button>
        )}
      </div>

      {/* ── Smart replies ── */}
      {smartReplies.length > 0 && !input && (
        <div className="relative z-10 flex gap-2 overflow-x-auto no-scrollbar px-4 py-2 border-t border-border/20">
          {smartReplies.map((r) => (
            <button
              key={r}
              onClick={() => {
                setInput(r);
                inputRef.current?.focus();
              }}
              className="px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary rounded-full text-[11px] font-bold whitespace-nowrap hover:bg-primary/20 transition-all"
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* ── Reply preview ── */}
      {replyTo && (
        <div className="relative z-10 mx-4 mb-1 px-3 py-2 glass rounded-2xl border border-border/30 flex items-center gap-3">
          <div className="w-0.5 h-8 bg-primary rounded-full shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-primary">{replyTo.sender}</p>
            <p className="text-xs text-muted-foreground truncate">{replyTo.text}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* ── Pending media preview ── */}
      {pendingMedia.length > 0 && (
        <div className="relative z-10 mx-4 mb-1 flex gap-2 overflow-x-auto no-scrollbar">
          {pendingMedia.map((m, i) => (
            <div key={m.id} className="relative shrink-0 size-12 rounded-xl overflow-hidden glass border border-border/30">
              {m.type === "image" ? (
                <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center">
                  {m.type === "video" ? <Film className="size-5 text-muted-foreground" /> :
                   m.type === "audio" ? <Mic className="size-5 text-muted-foreground" /> :
                   <FileText className="size-5 text-muted-foreground" />}
                </div>
              )}
              <button
                onClick={() => setPendingMedia(prev => prev.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 size-4 bg-destructive/80 rounded-full grid place-items-center"
              >
                <X className="size-2.5 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Composer ── */}
      <div className="chat-input relative z-10 px-3 py-3 glass-strong border-t border-border/20">
        <div className="flex items-end gap-2">
          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="size-9 shrink-0 grid place-items-center rounded-full bg-white/[0.04] border border-border/30 text-muted-foreground hover:text-foreground hover:bg-white/[0.08] transition-all"
            title="Прикрепить файл"
          >
            {uploading ? (
              <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <Paperclip className="size-4" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Сообщение…"
              rows={1}
              className="w-full bg-white/[0.04] border border-border/30 rounded-2xl py-2.5 pl-4 pr-10 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/20 transition-all resize-none max-h-32 overflow-auto"
              style={{ minHeight: "40px" }}
            />
            {/* Emoji button inside input */}
            <button
              onClick={() => setEmojiOpen(!emojiOpen)}
              className="absolute right-2.5 bottom-2.5 text-muted-foreground/60 hover:text-foreground transition-colors"
              title="Эмодзи"
            >
              <Smile className="size-4" />
            </button>
          </div>

          {/* Send / Mic button */}
          {input.trim() || pendingMedia.length > 0 ? (
            <button
              onClick={handleSend}
              className="size-9 shrink-0 grid place-items-center rounded-full gradient-primary text-primary-foreground hover:scale-105 transition-all shadow-glow"
              style={{ boxShadow: "0 6px 16px -4px hsl(142 78% 40% / 0.5)" }}
              title="Отправить"
            >
              <Send className="size-4" />
            </button>
          ) : (
            <button
              className="size-9 shrink-0 grid place-items-center rounded-full bg-white/[0.04] border border-border/30 text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
              title="Голосовое сообщение"
            >
              <Mic className="size-4" />
            </button>
          )}
        </div>

        {/* GIF button row */}
        <div className="flex items-center gap-2 mt-1.5 px-1">
          <button
            onClick={() => setGifOpen(!gifOpen)}
            className="text-[10px] font-mono text-muted-foreground/50 hover:text-primary transition-colors px-2 py-0.5 rounded border border-transparent hover:border-primary/20"
          >
            GIF
          </button>
          <button
            onClick={() => setAiOpen(true)}
            className="text-[10px] font-mono text-muted-foreground/50 hover:text-primary transition-colors px-2 py-0.5 rounded border border-transparent hover:border-primary/20"
          >
            AI
          </button>
        </div>
      </div>

      {/* ── Emoji picker overlay ── */}
      {emojiOpen && (
        <div className="absolute bottom-20 right-4 z-40 animate-scale-in">
          <EmojiPicker
            onSelect={(emoji) => { setInput(prev => prev + emoji); setEmojiOpen(false); inputRef.current?.focus(); }}
            onClose={() => setEmojiOpen(false)}
          />
        </div>
      )}

      {/* ── GIF picker overlay ── */}
      {gifOpen && (
        <div className="absolute bottom-20 right-4 z-40 animate-scale-in">
          <GifPicker
            onSelect={(gif) => {
              onSendMessage(chat.id, "", [{ id: `gif-${Date.now()}`, type: "image", name: gif.title, url: gif.url, size: 0, mimeType: "image/gif" }]);
              setGifOpen(false);
            }}
            onClose={() => setGifOpen(false)}
          />
        </div>
      )}

      {/* ── AI Assistant overlay ── */}
      {aiOpen && (
        <div className="absolute inset-0 z-50 bg-background/90 backdrop-blur-xl animate-fade-in-up">
          <Suspense fallback={null}>
            <AiAssistant
              onClose={() => setAiOpen(false)}
              onInsertText={(t) => { setInput(prev => prev + t); setAiOpen(false); }}
            />
          </Suspense>
        </div>
      )}

      {/* ── Group call overlay ── */}
      {groupCallOpen && (
        <div className="absolute inset-0 z-50 animate-fade-in-up">
          <Suspense fallback={null}>
            <GroupCallScreen
              chat={chat}
              onEnd={() => setGroupCallOpen(false)}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

/** Individual message bubble — WhatsApp 2026 style */
function MessageBubble({ msg, onReply }: { msg: Message; onReply: () => void }) {
  const mesh = useMesh();
  const isOwn = msg.isOwn || msg.sender === mesh.userName;
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className={`flex px-4 py-1 group ${isOwn ? "justify-end" : "justify-start"}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className={`max-w-[80%] space-y-0.5 ${isOwn ? "items-end" : "items-start"} flex flex-col`}>

        {/* Sender name (for groups) */}
        {!isOwn && msg.sender && (
          <p className="text-[10px] font-bold text-primary px-1">{msg.sender}</p>
        )}

        {/* Bubble */}
        <div
          className={`relative message-bubble rounded-2xl px-3 py-2 ${
            isOwn
              ? "rounded-tr-sm text-primary-foreground"
              : "rounded-tl-sm glass border border-white/[0.08]"
          }`}
          style={isOwn ? {
            background: "var(--gradient-bubble-own)",
            boxShadow: "0 4px 12px -3px hsl(142 72% 40% / 0.35)",
          } : undefined}
        >
          {/* Reply preview */}
          {msg.replyTo && (
            <div className={`mb-2 pl-2 border-l-2 ${isOwn ? "border-white/40" : "border-primary/50"}`}>
              <p className={`text-[10px] font-bold ${isOwn ? "text-white/70" : "text-primary"}`}>
                {msg.replyTo.sender}
              </p>
              <p className={`text-[11px] truncate ${isOwn ? "text-white/60" : "text-muted-foreground"}`}>
                {msg.replyTo.text}
              </p>
            </div>
          )}

          {/* Media attachments */}
          {msg.media?.map((m) => (
            <MediaItem key={m.id} attachment={m} isOwn={isOwn} />
          ))}

          {/* Text */}
          {msg.text && (
            <p className={`text-[14px] leading-relaxed whitespace-pre-wrap break-words ${isOwn ? "text-primary-foreground" : "text-foreground"}`}>
              {msg.text}
            </p>
          )}

          {/* Timestamp + read receipt */}
          <div className={`flex items-center justify-end gap-1 mt-0.5 ${isOwn ? "text-white/50" : "text-muted-foreground/50"}`}>
            <span className="text-[9px] font-mono">{formatTime(msg.timestamp)}</span>
            {isOwn && (
              <span className={`text-[10px] ${msg.read ? "text-primary" : isOwn ? "text-white/50" : ""}`}>
                {msg.read ? "✓✓" : "✓"}
              </span>
            )}
          </div>
        </div>

        {/* Reactions */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div className="flex gap-1 flex-wrap px-1">
            {Object.entries(msg.reactions).map(([emoji, users]) => (
              <span
                key={emoji}
                className="text-[11px] px-1.5 py-0.5 rounded-full glass border border-white/10"
              >
                {emoji} {(users as string[]).length}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Quick action buttons (appear on hover) */}
      {showActions && (
        <div className={`self-end mb-2 flex items-center gap-0.5 ${isOwn ? "mr-2 order-first" : "ml-2"} animate-scale-in`}>
          <button
            onClick={onReply}
            className="size-6 glass border border-white/10 rounded-full grid place-items-center hover:border-primary/30 transition-all"
            title="Ответить"
          >
            <Forward className="size-2.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(msg.text)}
            className="size-6 glass border border-white/10 rounded-full grid place-items-center hover:border-primary/30 transition-all"
            title="Копировать"
          >
            <Copy className="size-2.5 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Renders a media attachment inside a bubble */
function MediaItem({ attachment, isOwn }: { attachment: MediaAttachment; isOwn: boolean }) {
  const url = attachment.url.startsWith("mxc://") ? mxcToUrl(attachment.url) : attachment.url;

  if (attachment.type === "image") {
    return (
      <img
        src={attachment.url.startsWith("mxc://") ? mxcToThumbnail(attachment.url, 320, 240) : attachment.url}
        alt={attachment.name}
        className="max-w-[240px] max-h-[240px] rounded-xl object-cover mb-1 cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => window.open(url, "_blank")}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }

  if (attachment.type === "video") {
    return (
      <video
        src={url}
        controls
        className="max-w-[240px] max-h-[200px] rounded-xl mb-1"
        preload="metadata"
      />
    );
  }

  if (attachment.type === "audio") {
    return (
      <div className="flex items-center gap-2 mb-1 min-w-[200px]">
        <button className={`size-8 rounded-full grid place-items-center shrink-0 ${isOwn ? "bg-white/20" : "bg-primary/20"}`}>
          <Play className="size-3 text-inherit" />
        </button>
        <div className="flex-1 h-6 flex items-center gap-[2px]">
          {waveformHeights.map((h, i) => (
            <span
              key={i}
              className="waveform-bar w-[2px] rounded-full"
              style={{
                height: `${h}px`,
                background: isOwn ? "rgba(255,255,255,0.6)" : "hsl(var(--primary))",
                animationDelay: `${i * 60}ms`,
              }}
            />
          ))}
        </div>
        <span className={`text-[9px] font-mono ${isOwn ? "text-white/60" : "text-muted-foreground"}`}>
          0:{Math.floor(attachment.size / 8000).toString().padStart(2, "0")}
        </span>
      </div>
    );
  }

  // Generic file
  return (
    <button
      onClick={() => downloadMedia(attachment)}
      className={`flex items-center gap-2 mb-1 px-3 py-2 rounded-xl ${isOwn ? "bg-white/15 hover:bg-white/25" : "bg-primary/10 hover:bg-primary/20"} transition-all`}
    >
      <FileText className="size-5 shrink-0" />
      <div className="text-left min-w-0">
        <p className="text-[12px] font-medium truncate max-w-[160px]">{attachment.name}</p>
        <p className="text-[10px] opacity-60">{formatFileSize(attachment.size)}</p>
      </div>
      <Download className="size-3.5 opacity-60 shrink-0" />
    </button>
  );
}
