import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "./prisma";
import bcrypt from "bcryptjs";
import { verifyMfaToken } from "@/lib/mfa";

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

        // 1. Check if the user is an Admin (by email)
        const adminUser = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (adminUser) {
          if (adminUser.isActive === false) return null;
          const passwordMatch = await bcrypt.compare(credentials.password, adminUser.password);
          if (passwordMatch) {
            // MFA enforcement — if enabled, return an MFA-pending user object.
            // The LoginClient will detect this and redirect to /login/mfa.
            if (adminUser.twoFactorEnabled && adminUser.twoFactorSecret) {
              return {
                id: adminUser.id,
                email: adminUser.email,
                role: "MFA_PENDING",
              };
            }
            prisma.user
              .update({
                where: { id: adminUser.id },
                data: { lastLogin: new Date() },
              })
              .catch(() => {});
            return { id: adminUser.id, email: adminUser.email, role: adminUser.role };
          }
        }

        // 2. Check if the user is a Member (by Member ID / Username)
        const memberAccount = await prisma.memberAccount.findUnique({
          where: { username: credentials.email },
          include: { member: true },
        });

        if (memberAccount && memberAccount.isActive) {
          const passwordMatch = await bcrypt.compare(credentials.password, memberAccount.passwordHash);
          if (passwordMatch) {
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
