/// <reference types="vite/client" />

// Declaring our variables gives them types and autocomplete on import.meta.env.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
