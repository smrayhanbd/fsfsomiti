/**
 * Client-safe SMS provider catalogue.
 *
 * Split from `lib/sms/providers.ts` so client components (the settings form)
 * can import the picker metadata WITHOUT dragging fetch-heavy gateway logic or
 * prisma into the browser bundle.
 */

export type SmsProvider = "bulksmsbd" | "sendmysms" | "sslwireless" | "twilio" | "custom"

export const SMS_PROVIDERS: { value: SmsProvider; label: string; description: string }[] = [
  { value: "bulksmsbd", label: "Bulk SMS BD", description: "Bangladesh bulk SMS gateway (bulksmsbd.net)." },
  { value: "sendmysms", label: "Send My SMS", description: "sendmysms.net gateway (GET API)." },
  { value: "sslwireless", label: "SSLWireless", description: "SMS+ by SSL Wireless (JSON API)." },
  { value: "twilio", label: "Twilio", description: "Global SMS via Twilio REST API." },
  { value: "custom", label: "Custom HTTP API", description: "Any HTTP-based SMS gateway with configurable params." },
]
