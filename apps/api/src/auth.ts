import { createClient } from "@supabase/supabase-js";

export type AuthMode = "local-dev" | "demo" | "external";
export type AuthVerifier = (authorization?: string) => Promise<string> | string;

export interface AuthConfiguration {
  mode: AuthMode;
  verifier: AuthVerifier;
}

export function createAuthConfiguration(env: NodeJS.ProcessEnv): AuthConfiguration {
  if (env.AUTH_MODE === "demo") {
    return {
      mode: "demo",
      verifier: () => {
        throw new Error("Demo sessions are resolved from request headers");
      }
    };
  }

  if (env.AUTH_MODE !== "external") {
    const userId = env.DEV_USER_ID?.trim() || "local-dev-user";

    return {
      mode: "local-dev",
      verifier: () => userId
    };
  }

  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required when AUTH_MODE=external");
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return {
    mode: "external",
    verifier: async (authorization) => {
      const token = parseBearerToken(authorization);

      if (!token) throw new Error("Authentication required");

      const { data, error } = await client.auth.getUser(token);

      if (error || !data.user) throw new Error("Authentication required");

      return data.user.id;
    }
  };
}

function parseBearerToken(authorization?: string) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}
