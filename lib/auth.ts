import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "./prisma";
import bcrypt from "bcryptjs";
import { verifyMfaToken } from "@/lib/mfa";

// ───────────────────────────────────────────────────────────────────────────
// BCRYPT COST
// ───────────────────────────────────────────────────────────────────────────
// bcryptjs is a PURE-JS implementation — at the previous cost 12 a single
// compare took 1–2.5 seconds, dominating login latency. Cost 10 is the OWASP
// baseline and ~4x faster. Existing cost-12 hashes still verify fine (bcrypt
// reads the cost from the salt prefix), and every successful login rehashes
// legacy hashes at the current cost (see the fire-and-forget updates below).
const BCRYPT_COST = 10;

/** True when a stored hash uses a HIGHER cost than the current standard. */
function needsRehash(hash: string): boolean {
  // bcrypt modular-crypt format: $2a$12$… / $2b$… / $2y$…
  const m = /^\$2[aby]\$(\d+)\$/.exec(hash);
  return !m || Number(m[1]) > BCRYPT_COST;
}

// ───────────────────────────────────────────────────────────────────────────
// MFA / 2FA (Roadmap item 13) — two-step login flow
// ───────────────────────────────────────────────────────────────────────────
// Step 1 (credentials provider "credentials"): user submits email + password.
//   - If password is correct AND user.twoFactorEnabled === true → return a
//     special user object with `role: "MFA_PENDING"`. The JWT callback flags
//     this with `token.mfaPending = true`; the session callback exposes it
//     as `session.mfaPending`. The LoginClient checks this after signIn and
//     redirects to /login/mfa?userId=...
//   - If password is correct AND MFA not enabled → return user (normal flow).
//
// Step 2 (credentials provider "credentials-mfa"): /login/mfa form submits
//   userId + token. This provider looks up the user, verifies the TOTP token
//   against user.twoFactorSecret, and returns the user object on success.
//   Backup codes are also accepted (one-time use, removed from the array).
//
// NOTE: The middleware (middleware.ts) treats "MFA_PENDING" as neither ADMIN
// nor MEMBER — it lets the request through to /login/mfa (a public page).
// ───────────────────────────────────────────────────────────────────────────

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email or Member ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // PERFORMANCE: Use Promise.all to check both admin and member tables
        // in parallel instead of sequentially. bcrypt.compare is the slow part
        // (~100-250ms at cost 10), so parallelizing saves that full duration
        // when the user is a member (not an admin).
        //
        // We fetch both rows up-front, then decide which password to compare
        // based on which row exists.
        const [adminUser, memberAccount] = await Promise.all([
          prisma.user.findUnique({
            where: { email: credentials.email },
            select: {
              id: true,
              email: true,
              password: true,
              role: true,
              isActive: true,
              twoFactorEnabled: true,
              twoFactorSecret: true,
            },
          }),
          prisma.memberAccount.findUnique({
            where: { username: credentials.email },
            select: {
              id: true,
              memberId: true,
              username: true,
              passwordHash: true,
              isActive: true,
              member: {
                select: { id: true, fullName: true, email: true, status: true },
              },
            },
          }),
        ]);

        // 1. Try admin login first (admins take priority)
        if (adminUser) {
          if (adminUser.isActive === false) return null;
          const passwordMatch = await bcrypt.compare(credentials.password, adminUser.password);
          if (passwordMatch) {
            // MFA enforcement — if enabled, return an MFA-pending user object.
            if (adminUser.twoFactorEnabled && adminUser.twoFactorSecret) {
              return {
                id: adminUser.id,
                email: adminUser.email,
                role: "MFA_PENDING",
              };
            }
            // Fire-and-forget lastLogin update (+ transparent rehash of legacy
            // cost-12 hashes at the current cost) — never blocks the response.
            void (async () => {
              try {
                const data: { lastLogin: Date; password?: string } = {
                  lastLogin: new Date(),
                };
                if (needsRehash(adminUser.password)) {
                  data.password = await bcrypt.hash(credentials.password, BCRYPT_COST);
                }
                await prisma.user.update({ where: { id: adminUser.id }, data });
              } catch {
                // Best-effort only — a failure here must never fail the login.
              }
            })();
            return { id: adminUser.id, email: adminUser.email, role: adminUser.role };
          }
        }

        // 2. Try member login (only if admin login didn't match)
        if (memberAccount && memberAccount.isActive) {
          // Skip member bcrypt if the member's account is suspended
          if (memberAccount.member.status !== "ACTIVE") return null;
          const passwordMatch = await bcrypt.compare(credentials.password, memberAccount.passwordHash);
          if (passwordMatch) {
            // Fire-and-forget transparent rehash of legacy cost-12 hashes.
            if (needsRehash(memberAccount.passwordHash)) {
              void (async () => {
                try {
                  const passwordHash = await bcrypt.hash(credentials.password, BCRYPT_COST);
                  await prisma.memberAccount.update({
                    where: { id: memberAccount.id },
                    data: { passwordHash },
                  });
                } catch {
                  // Best-effort only — a failure here must never fail the login.
                }
              })();
            }
            return {
              id: memberAccount.memberId,
              email: memberAccount.member.email || memberAccount.username,
              role: "MEMBER",
              name: memberAccount.member.fullName,
            };
          }
        }

        return null;
      },
    }),
    // Step 2 provider — accepts userId + TOTP token (or backup code).
    CredentialsProvider({
      id: "credentials-mfa",
      name: "MFA Verification",
      credentials: {
        userId: { label: "User ID", type: "text" },
        mfaToken: { label: "MFA Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.userId || !credentials?.mfaToken) return null;
        const user = await prisma.user.findUnique({
          where: { id: credentials.userId },
        });
        if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) return null;

        // Try TOTP token first (6-digit code).
        const tokenValid = verifyMfaToken(user.twoFactorSecret, credentials.mfaToken);

        // If TOTP fails, try backup codes (8-char alphanumeric).
        let usedBackupCode = false;
        if (!tokenValid && user.twoFactorBackupCodes && user.twoFactorBackupCodes.length > 0) {
          const idx = user.twoFactorBackupCodes.indexOf(credentials.mfaToken);
          if (idx >= 0) {
            usedBackupCode = true;
            const remaining = [...user.twoFactorBackupCodes];
            remaining.splice(idx, 1);
            await prisma.user.update({
              where: { id: user.id },
              data: { twoFactorBackupCodes: remaining },
            });
          }
        }

        if (!tokenValid && !usedBackupCode) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastMfaAt: new Date(), lastLogin: new Date() },
        });
        return { id: user.id, email: user.email, role: user.role };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
        // Flag MFA-pending sessions so the session callback can expose it.
        if (user.role === "MFA_PENDING") {
          token.mfaPending = true;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
      }
      // Expose the mfaPending flag so the LoginClient can detect step-1-only
      // sessions and redirect to /login/mfa for step 2.
      if (token.mfaPending) {
        session.mfaPending = true;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
