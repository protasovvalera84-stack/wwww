/**
 * NexaLink Landing Page — WhatsApp 2026 aesthetic
 *
 * Shown to unauthenticated visitors. Presents the product,
 * explains the relay model, and routes to registration/login.
 */
import { Sparkles, Shield, Zap, Timer, Lock, Smartphone, Globe, MessageSquare } from "lucide-react";

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

const waveform = [8, 16, 10, 22, 14, 24, 12, 20, 8, 18, 22, 12, 18, 8, 24, 16, 10];

const features = [
  {
    icon: Timer,
    label: "01",
    title: "Сервер — только почтовик",
    body: "Сообщения удаляются через 6 часов, медиа через 24 ч. Всё зашифровано на устройстве до загрузки. Сервер никогда не видит ваш контент.",
  },
  {
    icon: Lock,
    label: "02",
    title: "AES-256 + Signal E2EE",
    body: "Каждый файл шифруется уникальным ключом на клиенте. Ключ передаётся только внутри E2EE-сообщения. SQLCipher на Android и DPAPI на Windows.",
  },
  {
    icon: Zap,
    label: "03",
    title: "Нативные приложения",
    body: "Android (Kotlin), Linux (GTK4), Windows (C# WPF) — установка в один клик прямо с вашего сервера. Никаких сторонних магазинов.",
  },
];

const stats = [
  { k: "E2EE", v: "Signal protocol" },
  { k: "AES-256", v: "Медиа шифрование" },
  { k: "Relay", v: "Zero storage" },
];

export function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">

      {/* ── Ambient backdrop ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 10%, hsl(142 78% 52% / 0.10) 0%, transparent 60%)," +
            "radial-gradient(50% 40% at 80% 90%, hsl(196 90% 58% / 0.07) 0%, transparent 60%)",
        }}
      />
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.022]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      {/* ── Navigation ── */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="relative size-9 rounded-2xl gradient-primary grid place-items-center shadow-glow">
            <MessageSquare className="size-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-extrabold tracking-tight">
            Nexa<span className="text-primary">Link</span>
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          {["Безопасность", "Приложения", "Сервер", "Про нас"].map((item) => (
            <a key={item} href="#" className="hover:text-foreground transition-colors duration-200">
              {item}
            </a>
          ))}
        </nav>

        <button
          onClick={onSignIn}
          className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border border-border/50 bg-card/40 hover:bg-card/80 hover:border-primary/40 transition-all duration-200"
        >
          Войти
          <span className="size-1.5 bg-primary rounded-full dot-pulse" />
        </button>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-12 pb-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* Text side */}
          <div className="space-y-8 animate-fade-up">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/40 border border-border/50 text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
              <Sparkles className="size-3 text-primary" />
              Relay · E2EE · Self-hosted
            </div>

            {/* Headline */}
            <h1 className="text-[clamp(2.8rem,7vw,5.5rem)] font-extrabold tracking-[-0.04em] leading-[0.95]">
              Мессенджер,
              <br />
              где сервер{" "}
              <span className="italic font-serif text-primary">ничего</span>
              <br />
              не хранит.
            </h1>

            {/* Description */}
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
              NexaLink — самохостимый мессенджер с моделью WhatsApp: сообщения
              живут на сервере только до доставки. Медиа шифруется AES-256 до
              загрузки. Сервер видит только зашифрованные блобы.
            </p>

            {/* Relay model badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
              <Timer className="size-3 text-primary" />
              <span className="text-[11px] font-mono text-primary">
                Relay model · сообщения удалятся через 6ч · медиа через 24ч
              </span>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onGetStarted}
                className="px-6 py-3 rounded-2xl text-sm font-bold gradient-primary text-primary-foreground transition-all duration-200 hover:scale-[1.02] shadow-glow"
                style={{ boxShadow: "0 12px 30px -8px hsl(142 78% 52% / 0.45)" }}
              >
                Создать аккаунт →
              </button>
              <button
                onClick={onSignIn}
                className="px-6 py-3 rounded-2xl text-sm font-medium bg-card/40 border border-border/50 hover:bg-card/80 hover:border-primary/30 transition-all duration-200"
              >
                Войти
              </button>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-8 pt-4 border-t border-border/30">
              {stats.map((s) => (
                <div key={s.k}>
                  <div className="text-xl font-extrabold tracking-tight gradient-text">{s.k}</div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground mt-0.5">
                    {s.v}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Phone mockup side */}
          <div className="relative flex justify-center lg:justify-end">
            <div
              className="relative w-[300px] bg-card rounded-[44px] ring-1 ring-white/10 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col animate-fade-up"
              style={{ animationDelay: "150ms", minHeight: "560px" }}
            >
              {/* Notch */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 h-6 w-28 rounded-full bg-black/80" />

              {/* Mesh bg */}
              <div className="absolute inset-0 mesh-bg pointer-events-none" />

              {/* Status bar */}
              <div className="relative h-11 w-full flex items-center justify-between px-6 text-[11px] font-medium opacity-60">
                <span>9:41</span>
                <div className="flex gap-2"><span>•••</span><span>100%</span></div>
              </div>

              {/* Chat header */}
              <div className="relative px-4 pb-3 flex items-center gap-3 border-b border-white/5 z-10">
                <div className="size-8 rounded-xl gradient-primary grid place-items-center text-[10px] font-bold text-primary-foreground">
                  AR
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[13px] font-bold leading-tight">Alex Rivera</h2>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-primary">Online</p>
                </div>
                <Shield className="size-3.5 text-primary opacity-60" />
              </div>

              {/* E2EE banner */}
              <div className="relative z-10 flex items-center justify-center gap-1.5 py-1.5 bg-primary/5 border-b border-border/30">
                <Lock className="size-2.5 text-primary" />
                <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-primary">
                  relay · e2ee · ничего на сервере
                </span>
                <Timer className="size-2.5 text-primary" />
              </div>

              {/* Messages */}
              <div className="relative flex-1 px-4 py-4 space-y-4 overflow-hidden">
                {/* Incoming */}
                <div className="max-w-[80%] space-y-1">
                  <div className="p-3 glass rounded-2xl rounded-tl-sm border border-white/8">
                    <p className="text-[13px] leading-relaxed">
                      Посмотри на задержку — стало намного плавнее 🔥
                    </p>
                  </div>
                  <span className="text-[9px] font-mono opacity-40 px-1">12:44</span>
                </div>

                {/* Outgoing */}
                <div className="max-w-[80%] ml-auto space-y-1 flex flex-col items-end">
                  <div
                    className="p-3 rounded-2xl rounded-tr-sm text-primary-foreground font-medium"
                    style={{
                      background: "var(--gradient-bubble-own)",
                      boxShadow: "0 8px 20px -4px hsl(142 78% 40% / 0.4)",
                    }}
                  >
                    <p className="text-[13px] leading-relaxed">
                      Да! Easing curve 0.8s Expo ✨
                    </p>
                  </div>
                  <span className="text-[9px] font-mono opacity-40 px-1 flex items-center gap-1">
                    12:46 <span className="text-primary">✓✓</span>
                  </span>
                </div>

                {/* Voice message */}
                <div className="max-w-[85%] space-y-1">
                  <div className="p-2.5 pr-3 glass rounded-2xl rounded-tl-sm border border-white/8 flex items-center gap-2">
                    <button className="size-8 bg-primary/20 rounded-full grid place-items-center shrink-0">
                      <span className="text-primary text-xs">▶</span>
                    </button>
                    <div className="flex-1 h-6 flex items-center gap-[2px]">
                      {waveform.map((h, i) => (
                        <span
                          key={i}
                          className="waveform-bar w-[2px] rounded-full"
                          style={{
                            height: `${h}px`,
                            background: i < 6 ? "hsl(142 78% 52%)" : "rgba(255,255,255,0.2)",
                            animationDelay: `${i * 60}ms`,
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[9px] font-mono opacity-50">0:32</span>
                  </div>
                  <span className="text-[9px] font-mono opacity-40 px-1">12:48</span>
                </div>

                {/* Short incoming */}
                <div className="max-w-[80%] space-y-1">
                  <div className="p-3 glass rounded-2xl rounded-tl-sm border border-white/8">
                    <p className="text-[13px] leading-relaxed">Супер! Отправь ссылку 🚀</p>
                  </div>
                  <span className="text-[9px] font-mono opacity-40 px-1">12:50</span>
                </div>
              </div>

              {/* Composer */}
              <div className="relative px-3 py-3 bg-card/70 backdrop-blur-xl border-t border-white/5 flex items-center gap-2">
                <div className="flex-1 bg-white/5 border border-white/8 rounded-full py-2 px-4 text-[11px] text-muted-foreground">
                  Сообщение…
                </div>
                <button
                  className="size-8 shrink-0 rounded-full grid place-items-center gradient-primary text-primary-foreground"
                  style={{ boxShadow: "0 6px 16px -4px hsl(142 78% 40% / 0.5)" }}
                >
                  <span className="text-xs">➤</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature pillars ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-4">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.label}
                className="p-6 glass rounded-3xl hover:bg-white/[0.06] transition-all duration-300 group"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="size-9 rounded-xl bg-primary/15 border border-primary/20 grid place-items-center group-hover:bg-primary/20 transition-colors">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <span className="text-[10px] font-mono text-primary tracking-[0.15em] uppercase">
                    {f.label} —
                  </span>
                </div>
                <h3 className="text-base font-bold tracking-tight mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Platforms ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="glass rounded-3xl p-8 text-center">
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-primary mb-3">
            Нативные приложения
          </p>
          <h2 className="text-2xl font-extrabold tracking-tight mb-6">
            Скачивается прямо с вашего сервера
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            {[
              { icon: Smartphone, label: "Android", sub: "Kotlin APK" },
              { icon: Globe, label: "Linux", sub: "GTK4 Binary" },
              { icon: Globe, label: "Windows", sub: "C# WPF EXE" },
              { icon: Globe, label: "iOS / Web", sub: "PWA" },
            ].map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.label}
                  className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-card/60 border border-border/40 hover:border-primary/30 hover:bg-card/80 transition-all duration-200"
                >
                  <div className="size-8 rounded-xl bg-primary/15 grid place-items-center">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold">{p.label}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{p.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Footer CTA ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-20 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight mb-4">
          Готовы запустить свой{" "}
          <span className="italic font-serif text-primary">мессенджер</span>?
        </h2>
        <p className="text-sm text-muted-foreground mb-8 max-w-lg mx-auto">
          Один скрипт — Docker, nginx, SSL, Coturn, нативные приложения. Всё готово за 5 минут.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={onGetStarted}
            className="px-8 py-3.5 rounded-2xl text-sm font-bold gradient-primary text-primary-foreground shadow-glow hover:scale-[1.02] transition-all duration-200"
            style={{ boxShadow: "0 12px 30px -8px hsl(142 78% 40% / 0.45)" }}
          >
            Зарегистрироваться →
          </button>
          <button
            onClick={onSignIn}
            className="px-8 py-3.5 rounded-2xl text-sm font-medium bg-card/40 border border-border/50 hover:bg-card/80 hover:border-primary/30 transition-all duration-200"
          >
            Уже есть аккаунт
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-border/30">
        <div className="mx-auto max-w-7xl px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-[0.12em]">
            NexaLink — Self-hosted · E2EE · Relay model
          </span>
          <span className="flex items-center gap-2">
            Сделано с <span className="size-1.5 bg-primary rounded-full dot-pulse" /> заботой о приватности
          </span>
        </div>
      </footer>
    </div>
  );
}
