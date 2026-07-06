import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe NextAuth config: no adapter, no Prisma, no Node-only imports.
 * Shared between the full server config (lib/auth.ts) and the proxy (src/proxy.ts).
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role ?? "BUYER";
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
