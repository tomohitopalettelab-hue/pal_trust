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

export const THEMES: Record<string, ThemeDefinition> = {
  // 1. 標準：ストリート・インパクト
  standard: {
    id: "standard",
    name: "PAL-TRUST 標準",
    bg: "bg-[#F4F4F4]",
    card: "bg-white border-4 border-black shadow-[12px_12px_0px_#000] rounded-[3rem]",
    accentBg: "bg-[#F9C11C]",
    accentText: "text-[#F9C11C]",
    text: "text-black font-black italic",
    input: "bg-[#F8F8F8] border-3 border-black rounded-2xl p-5 font-bold outline-none",
    button: "bg-[#F9C11C] border-4 border-black rounded-2xl font-black shadow-[8px_8px_0px_#000] active:scale-95 transition-all",
    subButton: "bg-white border-3 border-black rounded-2xl font-black shadow-[6px_6px_0px_#000] active:scale-95 transition-all",
  },
  // 2. シンプル：清潔感・ミニマル
  minimal: {
    id: "minimal",
    name: "シンプル",
    bg: "bg-[#FFFFFF]",
    card: "bg-white border border-gray-200 shadow-sm rounded-3xl",
    accentBg: "bg-black",
    accentText: "text-gray-900",
    text: "text-gray-900 font-medium",
    input: "bg-gray-50 border border-gray-200 rounded-xl p-5 outline-none focus:border-black",
    button: "bg-black text-white rounded-xl font-bold py-4 active:opacity-80 transition-all",
    subButton: "bg-white border border-gray-200 text-gray-600 rounded-xl font-bold py-4 active:bg-gray-50 transition-all",
  },
  // 3. フェミニン：上品・柔らかい・美容系
  feminine: {
    id: "feminine",
    name: "フェミニン",
    bg: "bg-[#FFF9F9]",
    card: "bg-white border border-[#FADADD] shadow-md rounded-[2.5rem]",
    accentBg: "bg-[#FADADD]",
    accentText: "text-[#D48A8E]",
    text: "text-[#5A4A4A] font-semibold",
    input: "bg-[#FFFBFB] border border-[#FADADD] rounded-full px-6 py-4 outline-none focus:ring-1 ring-[#FADADD]",
    button: "bg-[#FADADD] text-[#5A4A4A] rounded-full font-bold shadow-sm active:scale-[0.98] transition-all",
    subButton: "bg-white border border-[#FADADD] text-[#D48A8E] rounded-full font-bold active:bg-[#FFF9F9] transition-all",
  },
  // 4. ダーク：高級感・バー・夜の雰囲気
  dark: {
    id: "dark",
    name: "ダーク・ラグジュアリー",
    bg: "bg-[#121212]",
    card: "bg-[#1E1E1E] border border-[#333333] shadow-2xl rounded-3xl",
    accentBg: "bg-[#D4AF37]", // ゴールド
    accentText: "text-[#D4AF37]",
    text: "text-white font-bold",
    input: "bg-[#2A2A2A] border border-[#444444] text-white rounded-xl p-5 outline-none focus:border-[#D4AF37]",
    button: "bg-[#D4AF37] text-black rounded-xl font-black active:brightness-110 transition-all",
    subButton: "bg-transparent border border-[#444444] text-gray-400 rounded-xl font-bold active:bg-[#2A2A2A] transition-all",
  },
  // 5. ポップ：元気・子供・アミューズメント
  pop: {
    id: "pop",
    name: "ポップ",
    bg: "bg-[#E0F2FE]",
    card: "bg-white border-[6px] border-[#3B82F6] rounded-[2rem] shadow-none",
    accentBg: "bg-[#3B82F6]",
    accentText: "text-[#3B82F6]",
    text: "text-[#1E3A8A] font-black",
    input: "bg-[#F0F9FF] border-[3px] border-[#3B82F6] rounded-2xl p-4 font-black outline-none",
    button: "bg-[#3B82F6] text-white rounded-full font-black border-b-[6px] border-[#1D4ED8] active:border-b-0 active:translate-y-[2px] transition-all",
    subButton: "bg-[#93C5FD] text-white rounded-full font-black border-b-[4px] border-[#60A5FA] active:border-b-0 transition-all",
  }
};