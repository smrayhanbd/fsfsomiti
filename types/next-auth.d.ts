import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
    } & DefaultSession["user"]
    /** Set during the MFA-pending step (step 1 complete, step 2 pending). */
    mfaPending?: boolean
  }

  interface User {
    id: string
    role: string
  }
}