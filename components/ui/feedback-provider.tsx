"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"

type ToastType = "success" | "error" | "info"

type ToastItem = {
  id: number
  type: ToastType
  message: string
}

type ConfirmOptions = {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  tone?: "danger" | "primary"
}

type ConfirmState = ConfirmOptions & {
  open: boolean
  resolve: (value: boolean) => void
}

type FeedbackContextValue = {
  toast: (type: ToastType, message: string) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const toastIdRef = useRef(1)

  const toast = useCallback((type: ToastType, message: string) => {
    const id = toastIdRef.current++
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2800)
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ open: true, resolve, ...options })
    })
  }, [])

  const value = useMemo<FeedbackContextValue>(
    () => ({
      toast,
      success: (message: string) => toast("success", message),
      error: (message: string) => toast("error", message),
      info: (message: string) => toast("info", message),
      confirm,
    }),
    [toast, confirm]
  )

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="fixed right-4 top-4 z-[100] space-y-2">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${
              item.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : item.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-blue-200 bg-blue-50 text-blue-700"
            }`}
          >
            {item.message}
          </div>
        ))}
      </div>

      {confirmState?.open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h4 className="text-base font-semibold text-gray-900">{confirmState.title ?? "Confirm"}</h4>
            <p className="mt-2 text-sm text-gray-600">{confirmState.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  confirmState.resolve(false)
                  setConfirmState(null)
                }}
                className="h-[36px] px-3 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                {confirmState.cancelText ?? "Cancel"}
              </button>
              <button
                onClick={() => {
                  confirmState.resolve(true)
                  setConfirmState(null)
                }}
                className={`h-[36px] px-3 rounded-lg text-sm font-medium text-white transition-all ${
                  confirmState.tone === "danger"
                    ? "bg-gradient-to-r from-red-600 to-red-500 hover:shadow-md"
                    : "bg-gradient-to-r from-indigo-600 to-indigo-500 hover:shadow-md"
                }`}
              >
                {confirmState.confirmText ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  )
}

export function useNotifier() {
  const context = useContext(FeedbackContext)
  if (!context) {
    throw new Error("useNotifier must be used within FeedbackProvider")
  }
  return context
}
