"use client"

import { FeedbackProvider } from "@/components/ui/feedback-provider"

export default function Providers({ children }: { children: React.ReactNode }) {
  return <FeedbackProvider>{children}</FeedbackProvider>
}
