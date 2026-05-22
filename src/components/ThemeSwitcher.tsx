import { useState } from "react";
import { Palette, Moon, Sun, Check, X } from "lucide-react";
import { useTheme } from "@/theme/ThemeProvider";

export function ThemeSwitcher() {
  const { palette, mode, setPalette, toggleMode, palettes } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open theme settings"
        className="rounded-lg p-2 hover:bg-surface-hover transition-all hover:scale-105"
      >
        <Palette className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in-up"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl glass-strong border border-border/60 shadow-elegant p-6"
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-serif italic gradient-text">Appearance</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 hover:bg-surface-hover transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Tuned for low eye strain -- saved automatically.
            </p>

            {/* Mode toggle */}
            <div className="mb-5">
              <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground mb-2">
                Mode
              </p>
              <div className="grid grid-cols-2 gap-2">
                <ModeBtn
                  active={mode === "dark"}
                  onClick={() => mode !== "dark" && toggleMode()}
                  icon={<Moon className="h-4 w-4" />}
                  label="Dark"
                />
                <ModeBtn
                  active={mode === "light"}
                  onClick={() => mode !== "light" && toggleMode()}
                  icon={<Sun className="h-4 w-4" />}
                  label="Light"
                />
              </div>
            </div>

            {/* Palettes */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground mb-2">
                Color palette
              </p>
              <div className="grid grid-cols-1 gap-2 max-h-[40vh] overflow-y-auto scrollbar-thin pr-1">
                {palettes.map((p) => {
                  const active = p.id === palette;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPalette(p.id)}
                      className={`group flex items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                        active
                          ? "border-primary/50 bg-primary/10 shadow-glow"
                          : "border-border/50 hover:border-primary/30 hover:bg-surface-hover"
                      }`}
                    >
                      <div className="flex -space-x-2">
                        {p.swatch.map((c, i) => (
                          <span
                            key={i}
                            className="h-7 w-7 rounded-full border-2 border-card shadow-sm"
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{p.description}</p>
                      </div>
                      {active && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full gradient-primary">
                          <Check className="h-3.5 w-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="mt-5 text-[10px] font-mono text-muted-foreground text-center">
              respects system preferences - WCAG-tuned contrast
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function ModeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-all ${
        active
          ? "border-primary/50 gradient-primary text-primary-foreground shadow-glow"
          : "border-border/50 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
