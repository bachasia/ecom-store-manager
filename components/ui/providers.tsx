"use client"

import { SessionProvider } from "next-auth/react"
import { FeedbackProvider } from "@/components/ui/feedback-provider"

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <FeedbackProvider>{children}</FeedbackProvider>
    </SessionProvider>
  )
}
