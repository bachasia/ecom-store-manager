"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"

interface PaymentGateway {
  id: string
  name: string
  displayName: string
  matchKeywords?: string | null
  feePercentage: number
  feeFixed: number
  isActive: boolean
}

export default function SettingsPage() {
  const t = useTranslations('settings')
  const [gateways, setGateways] = useState<PaymentGateway[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    matchKeywords: "",
    feePercentage: 0,
    feeFixed: 0,
  })

  useEffect(() => {
    fetchGateways()
  }, [])

  const fetchGateways = async () => {
    try {
      const response = await fetch("/api/settings/gateways")
      const data = await response.json()
      if (response.ok) {
        setGateways(data.gateways)
      }
    } catch (error) {
      console.error("Error fetching gateways:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (gateway: PaymentGateway) => {
    setEditingId(gateway.id)
    setEditForm({
      matchKeywords: gateway.matchKeywords || "",
      feePercentage: gateway.feePercentage,
      feeFixed: gateway.feeFixed,
    })
  }

  const handleSave = async (id: string) => {
    try {
      const response = await fetch(`/api/settings/gateways/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editForm),
      })

      if (response.ok) {
        fetchGateways()
        setEditingId(null)
      } else {
        alert(t('updateError'))
      }
    } catch (error) {
      console.error("Error updating gateway:", error)
      alert(t('updateError'))
    }
  }

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/settings/gateways/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: !isActive }),
      })

      if (response.ok) {
        fetchGateways()
      }
    } catch (error) {
      console.error("Error toggling gateway:", error)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-500">{t('loading')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">{t('title')}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {t('subtitle')}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">{t('paymentGateways')}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {t('gatewayDesc')}
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          {gateways.map((gateway) => (
            <div key={gateway.id} className="px-6 py-5 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h4 className="text-base font-semibold text-gray-900">{gateway.displayName}</h4>
                      <button
                        onClick={() => handleToggleActive(gateway.id, gateway.isActive)}
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${
                          gateway.isActive
                            ? "bg-green-50 text-green-700 border border-green-100"
                            : "bg-gray-50 text-gray-600 border border-gray-200"
                        }`}
                      >
                        {gateway.isActive ? "Active" : "Inactive"}
                      </button>
                    </div>

                    {editingId === gateway.id ? (
                      <div className="mt-3 flex items-center space-x-4">
                        <div className="flex items-center space-x-2 min-w-[280px]">
                          <label className="text-sm text-gray-600">Aliases</label>
                          <input
                            type="text"
                            value={editForm.matchKeywords}
                            onChange={(e) => setEditForm({ ...editForm, matchKeywords: e.target.value })}
                            placeholder="paypal,paypal-express"
                            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <label className="text-sm text-gray-600">{t('feePercent')}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.feePercentage}
                            onChange={(e) => setEditForm({ ...editForm, feePercentage: parseFloat(e.target.value) })}
                            className="w-20 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <label className="text-sm text-gray-600">{t('feeFixed')}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.feeFixed}
                            onChange={(e) => setEditForm({ ...editForm, feeFixed: parseFloat(e.target.value) })}
                            className="w-20 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleSave(gateway.id)}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:shadow-md transition-all"
                          >
                            {t('save')}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                          >
                            {t('cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center space-x-4">
                        <span className="text-sm text-gray-600">
                          {t('fee')}: <span className="font-semibold text-gray-900">{gateway.feePercentage}%</span> + 
                          <span className="font-semibold text-gray-900"> ${Number(gateway.feeFixed).toFixed(2)}</span>
                        </span>
                        {gateway.matchKeywords && (
                          <span className="text-xs text-gray-500">Aliases: {gateway.matchKeywords}</span>
                        )}
                        <button
                          onClick={() => handleEdit(gateway)}
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          {t('edit')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gradient-to-br from-indigo-50 to-indigo-50/50 rounded-2xl border border-indigo-100 p-6">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">{t('feeCalculation')}</h4>
            <p className="mt-1 text-sm text-gray-600">
              {t('feeFormula')}
            </p>
            <p className="mt-2 text-sm text-gray-600">
              {t('feeExample')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
