export type ThemeDefinition = {
  id: string;
  name: string;
  bg: string;
  card: string;
  accentBg: string;
  accentText: string;
  text: string;
  input: string;
  button: string;
  subButton: string;
};

// 全テーマ共通の「構造はCSS変数駆動」クラス文字列。
// 見た目の差分は ThemeProvider が注入する変数値（色・影・角丸・枠・字体）だけで決まる。
const SHARED = {
  bg: "bg-[var(--theme-bg)]",
  card: "bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius-lg)] shadow-[var(--theme-shadow)]",
  accentBg: "bg-[var(--theme-primary)]",
  accentText: "text-[var(--theme-primary)]",
  text: "text-[var(--theme-text)] font-black t-italic",
  input: "bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] p-5 font-bold outline-none",
  button: "bg-[var(--theme-primary)] text-[var(--theme-on-primary)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] font-black shadow-[var(--theme-shadow-accent)] active:scale-95 transition-all",
  subButton: "bg-[var(--theme-card-bg)] text-[var(--theme-text)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] font-black shadow-[var(--theme-shadow-md)] active:scale-95 transition-all",
};

const make = (id: string, name: string): ThemeDefinition => ({ id, name, ...SHARED });

export const THEMES: Record<string, ThemeDefinition> = {
  standard: make("standard", "標準（ブルータル）"),
  refined: make("refined", "リファインド"),
  minimal: make("minimal", "ミニマル"),
  soft: make("soft", "ソフト"),
  premium: make("premium", "プレミアム"),
  pop: make("pop", "ポップ（ブルー）"),
};
