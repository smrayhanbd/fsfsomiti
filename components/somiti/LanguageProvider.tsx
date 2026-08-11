"use client"

/**
 * LanguageProvider — minimal EN/BN i18n for Somiti MS.
 *
 * Default language is English. A toggle switches to Bengali (বাংলা) which
 * also swaps the document font to Hind Siliguri. Strings are NOT rendered
 * side-by-side; only the active language is shown.
 *
 * Usage:
 *   const { lang, setLang, t } = useLanguage()
 *   t("members")        // "Members" | "সদস্য"
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react"

export type Lang = "en" | "bn"

type Dict = Record<string, { en: string; bn: string }>

/** Shared dictionary covering navigation + flagship screens. */
const DICTIONARY: Dict = {
  // ---- Brand / chrome ----
  appName: { en: "Somiti MS", bn: "সমিতি এমএস" },
  appTagline: { en: "Management System", bn: "ম্যানেজমেন্ট সিস্টেম" },
  search: { en: "Search members, ID, transactions…", bn: "সদস্য, আইডি, লেনদেন খুঁজুন…" },
  notifications: { en: "Notifications", bn: "বিজ্ঞপ্তি" },
  logout: { en: "Exit / Logout", bn: "প্রস্থান / লগআউট" },
  profile: { en: "Profile", bn: "প্রোফাইল" },
  settings: { en: "Settings", bn: "সেটিংস" },

  // ---- Nav groups ----
  nav_overview: { en: "Overview", bn: "ওভারভিউ" },
  nav_members: { en: "Member Management", bn: "সদস্য ব্যবস্থাপনা" },
  nav_transactions: { en: "Transactions", bn: "লেনদেন" },
  nav_finance: { en: "Finance & Accounting", bn: "অর্থ ও হিসাব" },
  nav_operations: { en: "Operations & Management", bn: "পরিচালনা ও ব্যবস্থাপনা" },
  nav_system: { en: "System & Settings", bn: "সিস্টেম ও সেটিংস" },

  // ---- Nav items ----
  dashboard: { en: "Dashboard", bn: "ড্যাশবোর্ড" },
  memberPanel: { en: "Member Panel", bn: "সদস্য প্যানেল" },
  pendingApprovals: { en: "Pending Approvals", bn: "অপেক্ষমাণ অনুমোদন" },
  trustScore: { en: "Trust Score & Badges", bn: "ট্রাস্ট স্কোর ও ব্যাজ" },
  depositTransactions: { en: "Deposit Transactions", bn: "জমা লেনদেন" },
  withdrawalTransactions: { en: "Withdrawal Transactions", bn: "উত্তোলন লেনদেন" },
  incomeDistribution: { en: "Income Distribution", bn: "লাভ বণ্টন" },
  chargeManagement: { en: "Charge Management", bn: "চার্জ ব্যবস্থাপনা" },
  feesSetup: { en: "Fees & Charge Setup", bn: "ফি ও চার্জ সেটআপ" },
  membersDueList: { en: "Members Due List", bn: "সদস্য বকেয়া তালিকা" },
  transactionApprovals: { en: "Transaction Approvals", bn: "লেনদেন অনুমোদন" },
  cashClosing: { en: "Cash Closing", bn: "নগদ বন্ধ" },
  transactionHistory: { en: "Transaction History", bn: "লেনদেনের ইতিহাস" },
  loanManagement: { en: "Loan Management", bn: "ঋণ ব্যবস্থাপনা" },
  chartOfAccounts: { en: "Chart of Accounts", bn: "হিসাব তালিকা" },
  voucherEntry: { en: "Voucher Entry", bn: "ভাউচার এন্ট্রি" },
  financialStatements: { en: "Financial Statements", bn: "আর্থিক বিবরণী" },
  reports: { en: "Reports", bn: "রিপোর্ট" },
  meetingManagement: { en: "Meeting Management", bn: "সভা ব্যবস্থাপনা" },
  projectManagement: { en: "Project Management", bn: "প্রকল্প ব্যবস্থাপনা" },
  investmentManagement: { en: "Investment Management", bn: "বিনিয়োগ ব্যবস্থাপনা" },
  taskManagement: { en: "Task Management", bn: "কাজ ব্যবস্থাপনা" },
  specialWishes: { en: "Special Wishes", bn: "বিশেষ শুভেচ্ছা" },
  userControl: { en: "User Control", bn: "ইউজার নিয়ন্ত্রণ" },
  somitiSettings: { en: "Somiti Settings", bn: "সমিতি সেটিংস" },
  cloudBackup: { en: "Cloud Backup", bn: "ক্লাউড ব্যাকআপ" },

  // ---- Dashboard ----
  dashboardOverview: { en: "Dashboard Overview", bn: "ড্যাশবোর্ড ওভারভিউ" },
  welcomeBack: { en: "Welcome back! Here is what is happening in your foundation today.", bn: "স্বাগতম! আজ আপনার ফাউন্ডেশনে যা হচ্ছে।" },
  addNewMember: { en: "Add New Member", bn: "নতুন সদস্য যোগ করুন" },
  financialOverview: { en: "Financial Overview", bn: "আর্থিক সারসংক্ষেপ" },
  cashInvestments: { en: "Cash & Investments", bn: "নগদ ও বিনিয়োগ" },
  duesPayments: { en: "Dues & Payments", bn: "বকেয়া ও পরিশোধ" },
  operations: { en: "Operations", bn: "পরিচালনা" },
  totalBalance: { en: "Total Balance", bn: "মোট ব্যালেন্স" },
  totalDeposit: { en: "Total Deposit", bn: "মোট জমা" },
  totalIncome: { en: "Total Income", bn: "মোট আয়" },
  totalExpense: { en: "Total Expense", bn: "মোট ব্যয়" },
  bankBalance: { en: "Bank Balance", bn: "ব্যাংক ব্যালেন্স" },
  cashInHand: { en: "Cash in Hand", bn: "হাতে নগদ" },
  fundInInvestment: { en: "Fund in Investment", bn: "বিনিয়োগে তহবিল" },
  paidToMembers: { en: "Paid to Members", bn: "সদস্যদের প্রদান" },
  totalDue: { en: "Total Due", bn: "মোট বকেয়া" },
  extraDue: { en: "Extra Due", bn: "অতিরিক্ত বকেয়া" },
  fineAmountDue: { en: "Fine Amount Due", bn: "জরিমানা বকেয়া" },
  activeMembers: { en: "Active Members", bn: "সক্রিয় সদস্য" },
  specialWishesCount: { en: "Special Wishes", bn: "বিশেষ শুভেচ্ছা" },
  savingsGrowth: { en: "Savings Growth", bn: "সঞ্চয় বৃদ্ধি" },
  collectionTrend: { en: "Collection Trend", bn: "সংগ্রহের ধারা" },
  loanRecovery: { en: "Loan Recovery", bn: "ঋণ আদায়" },
  viewAll: { en: "View All", bn: "সব দেখুন" },
  quickActions: { en: "Quick Actions", bn: "দ্রুত কাজ" },
  reviewNow: { en: "Review Now", bn: "এখনই পর্যালোচনা" },

  // ---- Members ----
  membersTitle: { en: "Members", bn: "সদস্য" },
  membersSubtitle: { en: "Manage your foundation members, KYC, and finances.", bn: "আপনার ফাউন্ডেশনের সদস্য, কেওয়াইসি ও অর্থ ব্যবস্থাপনা করুন।" },

  // ---- Login ----
  signIn: { en: "Sign In", bn: "সাইন ইন" },
  backToHome: { en: "Back to Home", bn: "হোমে ফিরুন" },

  // ---- Member Profile ----
  myProfile: { en: "My Profile", bn: "আমার প্রোফাইল" },
  profileSubtitle: { en: "Your registration details, verification status, and trust standing.", bn: "আপনার নিবন্ধন তথ্য, যাচাই অবস্থা ও ট্রাস্ট স্ট্যাটাস।" },
  memberSince: { en: "Member since", bn: "সদস্য হয়েছেন" },
  kycVerified: { en: "KYC Verified", bn: "কেওয়াইসি যাচিত" },
  editInfo: { en: "Edit Info", bn: "তথ্য সম্পাদনা" },
  changePhoto: { en: "Change Photo", bn: "ছবি পরিবর্তন" },
  downloadStatement: { en: "Statement", bn: "বিবৃতি" },
  trustScoreLabel: { en: "Trust Score", bn: "ট্রাস্ট স্কোর" },
  profileCompletion: { en: "Profile Completion", bn: "প্রোফাইল সম্পূর্ণতা" },
  membershipTenure: { en: "Membership Tenure", bn: "সদস্যপদ মেয়াদ" },
  personalInfo: { en: "Personal Information", bn: "ব্যক্তিগত তথ্য" },
  contactEmergency: { en: "Contact & Emergency", bn: "যোগাযোগ ও জরুরি" },
  residence: { en: "Residence", bn: "বাসস্থান" },
  currentAddress: { en: "Current Address", bn: "বর্তমান ঠিকানা" },
  permanentAddress: { en: "Permanent Address", bn: "স্থায়ী ঠিকানা" },
  bankDetails: { en: "Bank Details", bn: "ব্যাংক তথ্য" },
  verificationDocs: { en: "Verification & Documents", bn: "যাচাই ও দলিল" },
  scoreBreakdown: { en: "Trust Score Breakdown", bn: "ট্রাস্ট স্কোর বিভাজন" },
  activityTimeline: { en: "Recent Activity", bn: "সাম্প্রতিক কার্যকলাপ" },
  nominees: { en: "Registered Nominees", bn: "নিবন্ধিত নমিনি" },
  // ---- Profile field labels ----
  dob: { en: "Date of Birth", bn: "জন্ম তারিখ" },
  gender: { en: "Gender", bn: "লিঙ্গ" },
  maritalStatus: { en: "Marital Status", bn: "বৈবাহিক অবস্থা" },
  marriageDate: { en: "Marriage Date", bn: "বিবাহ তারিখ" },
  religion: { en: "Religion", bn: "ধর্ম" },
  nationality: { en: "Nationality", bn: "জাতীয়তা" },
  bloodGroup: { en: "Blood Group", bn: "রক্তের গ্রুপ" },
  profession: { en: "Profession", bn: "পেশা" },
  fathersName: { en: "Father's Name", bn: "পিতার নাম" },
  mothersName: { en: "Mother's Name", bn: "মাতার নাম" },
  spouseName: { en: "Spouse Name", bn: "স্বামী/স্ত্রীর নাম" },
  phone: { en: "Phone Number", bn: "ফোন নম্বর" },
  email: { en: "Email Address", bn: "ইমেইল ঠিকানা" },
  emergencyContact: { en: "Emergency Contact", bn: "জরুরি যোগাযোগ" },
  emergencyPerson: { en: "Emergency Person", bn: "জরুরি ব্যক্তি" },
  accountName: { en: "Account Name", bn: "হিসাবের নাম" },
  accountNumber: { en: "Account Number", bn: "হিসাব নম্বর" },
  bankName: { en: "Bank Name", bn: "ব্যাংকের নাম" },
  branch: { en: "Branch", bn: "শাখা" },
  routingNumber: { en: "Routing Number", bn: "রাউটিং নম্বর" },
  notProvided: { en: "Not provided", bn: "প্রদান করা হয়নি" },
  sharePercent: { en: "Share", bn: "অংশ" },
  viewIdDoc: { en: "View ID Doc", bn: "আইডি দলিল দেখুন" },
}

interface LanguageContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  toggle: () => void
  /** Translate a dictionary key; falls back to the key itself. */
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en")

  // Persist choice + sync <html lang> so the font swap (Hind Siliguri) applies.
  // Read once on mount after hydration (SSR renders "en" to avoid hydration
  // mismatch). The setState is deferred via queueMicrotask to satisfy the
  // react-hooks/set-state-in-effect rule.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("somiti-lang") as Lang | null) : null
    if (saved === "en" || saved === "bn") {
      queueMicrotask(() => setLangState(saved))
    }
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    document.documentElement.lang = lang
    try { localStorage.setItem("somiti-lang", lang) } catch { /* ignore */ }
  }, [lang])

  const value = useMemo<LanguageContextValue>(() => ({
    lang,
    setLang: setLangState,
    toggle: () => setLangState((p) => (p === "en" ? "bn" : "en")),
    t: (key: string) => {
      const entry = DICTIONARY[key]
      return entry ? entry[lang] : key
    },
  }), [lang])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    // Safe default for components rendered outside the provider (e.g. static pages).
    return {
      lang: "en" as Lang,
      setLang: () => {},
      toggle: () => {},
      t: (key: string) => {
        const entry = DICTIONARY[key]
        return entry ? entry.en : key
      },
    } satisfies LanguageContextValue
  }
  return ctx
}
