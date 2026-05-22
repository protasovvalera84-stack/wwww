import { useState } from "react";
import { X, Search, UserPlus, Check, Link, Copy, CheckCheck, Lock } from "lucide-react";
import { Contact, Chat } from "@/data/mockData";

interface InviteMembersDialogProps {
  open: boolean;
  chat: Chat;
  contacts: Contact[];
  onClose: () => void;
  onInvite: (chatId: string, contactIds: string[]) => void;
}

export function InviteMembersDialog({ open, chat, contacts, onClose, onInvite }: InviteMembersDialogProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linkCopied, setLinkCopied] = useState(false);
  const [tab, setTab] = useState<"contacts" | "link">("contacts");

  if (!open) return null;

  const isChannel = chat.type === "channel";
  const existingIds = new Set(chat.memberIds || []);

  const available = contacts.filter((c) => !existingIds.has(c.id));
  const filtered = available.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleContact = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleInvite = () => {
    if (selected.size === 0) return;
    onInvite(chat.id, Array.from(selected));
    setSelected(new Set());
    setSearch("");
    onClose();
  };

  const inviteLink = `nexalink://invite/${chat.id}/${btoa(chat.name).slice(0, 12)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = inviteLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleClose = () => {
    setSelected(new Set());
    setSearch("");
    setLinkCopied(false);
    setTab("contacts");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in-up" onClick={handleClose}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-3xl glass-strong border border-border/60 shadow-elegant p-6 max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-serif italic gradient-text">
            {isChannel ? "Invite Subscribers" : "Add Members"}
          </h2>
          <button onClick={handleClose} className="rounded-lg p-1.5 hover:bg-surface-hover transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {isChannel
            ? `Invite friends to subscribe to ${chat.name}`
            : `Add friends to ${chat.name}`
          }
        </p>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-4">
          <button
            onClick={() => setTab("contacts")}
            className={`flex-1 rounded-xl py-2 text-xs font-medium transition-all ${
              tab === "contacts"
                ? "gradient-primary text-primary-foreground shadow-glow"
                : "text-muted-foreground hover:bg-surface-hover"
            }`}
          >
            <UserPlus className="h-3.5 w-3.5 inline mr-1.5" />
            Contacts
          </button>
          <button
            onClick={() => setTab("link")}
            className={`flex-1 rounded-xl py-2 text-xs font-medium transition-all ${
              tab === "link"
                ? "gradient-primary text-primary-foreground shadow-glow"
                : "text-muted-foreground hover:bg-surface-hover"
            }`}
          >
            <Link className="h-3.5 w-3.5 inline mr-1.5" />
            Invite Link
          </button>
        </div>

        {tab === "contacts" ? (
          <>
            {/* Search */}
            <div className="flex items-center gap-2.5 rounded-2xl glass border border-border/50 px-4 py-2.5 mb-3 transition-all focus-within:border-primary/50 focus-within:shadow-glow">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>

            {/* Selected chips */}
            {selected.size > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {Array.from(selected).map((id) => {
                  const c = contacts.find((x) => x.id === id);
                  if (!c) return null;
                  return (
                    <button
                      key={id}
                      onClick={() => toggleContact(id)}
                      className="flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/30 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors"
                    >
                      {c.name.split(" ")[0]}
                      <X className="h-3 w-3" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Contact list */}
            <div className="flex-1 overflow-y-auto scrollbar-thin -mx-1 px-1 min-h-0">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <UserPlus className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {available.length === 0 ? "All contacts are already members" : "No contacts found"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((contact) => {
                    const isSelected = selected.has(contact.id);
                    return (
                      <button
                        key={contact.id}
                        onClick={() => toggleContact(contact.id)}
                        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all ${
                          isSelected
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-surface-hover border border-transparent"
                        }`}
                      >
                        <div className="relative flex-shrink-0">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-secondary to-muted text-xs font-bold text-foreground border border-border">
                            {contact.avatar}
                          </div>
                          {contact.online && (
                            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-online" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{contact.name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{contact.peerId}</p>
                        </div>
                        <div className={`flex h-6 w-6 items-center justify-center rounded-full transition-all ${
                          isSelected
                            ? "gradient-primary shadow-glow"
                            : "border border-border/60"
                        }`}>
                          {isSelected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Invite button */}
            {selected.size > 0 && (
              <button
                onClick={handleInvite}
                className="mt-3 w-full rounded-2xl py-3 text-sm font-semibold gradient-primary text-primary-foreground shadow-glow hover:scale-[1.02] transition-all"
              >
                {isChannel
                  ? `Invite ${selected.size} to subscribe`
                  : `Add ${selected.size} member${selected.size > 1 ? "s" : ""}`
                }
              </button>
            )}
          </>
        ) : (
          /* Invite Link tab */
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {isChannel
                ? "Share this link so anyone can subscribe to your channel"
                : "Share this link to invite people to your group"
              }
            </p>

            {/* Link display */}
            <div className="flex items-center gap-2 rounded-2xl glass border border-border/50 px-4 py-3">
              <Link className="h-4 w-4 text-primary flex-shrink-0" />
              <p className="flex-1 text-sm text-foreground font-mono truncate">{inviteLink}</p>
              <button
                onClick={copyLink}
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                  linkCopied
                    ? "bg-online/20 text-online"
                    : "hover:bg-surface-hover text-muted-foreground hover:text-primary"
                }`}
              >
                {linkCopied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            {linkCopied && (
              <p className="text-xs text-online text-center font-medium animate-fade-in-up">
                Link copied to clipboard!
              </p>
            )}

            {/* Share buttons */}
            <button
              onClick={copyLink}
              className="w-full rounded-2xl py-3 text-sm font-semibold gradient-primary text-primary-foreground shadow-glow hover:scale-[1.02] transition-all"
            >
              {linkCopied ? "Copied!" : "Copy Invite Link"}
            </button>

            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/10">
              <Lock className="h-4 w-4 text-primary flex-shrink-0" />
              <p className="text-[11px] text-muted-foreground">
                Link is encrypted and expires in 7 days
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
