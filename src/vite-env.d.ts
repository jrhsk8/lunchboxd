/// <reference types="vite/client" />

/**
 * The two env vars the client reads, named here so a typo at the read site is a
 * type error. Vite's own `ImportMetaEnv` is an index signature returning `any`,
 * which made `VITE_SUPABSE_URL` compile clean and fail as a missing backend.
 * Both are optional: a build without them renders the setup notice.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
