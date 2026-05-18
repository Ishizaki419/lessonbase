// LIFF SDK グローバル型定義（全ページで共通）
declare global {
  interface Window {
    liff: {
      init: (opts: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<{ userId: string; displayName: string }>;
      getIDToken: () => string | null;
      closeWindow: () => void;
    };
  }
}

export {};
