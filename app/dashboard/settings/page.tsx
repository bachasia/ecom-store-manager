"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import CustomSelect from "@/components/ui/custom-select"
import { useNotifier } from "@/components/ui/feedback-provider"

interface PaymentGateway {
  id: string
  name: string
  displayName: string
  matchKeywords?: string | null
  feePercentage: number
  feeFixed: number
  isActive: boolean
}

interface AlertSettings {
  roasThreshold: number
}

export default function SettingsPage() {
  const t = useTranslations('settings')
  const { success: notifySuccess, error: notifyError, confirm } = useNotifier()
  const [gateways, setGateways] = useState<PaymentGateway[]>([])
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([])
  const [selectedStoreByGateway, setSelectedStoreByGateway] = useState<Record<string, string>>( {})
  const [applyingGatewayId, setApplyingGatewayId] = useState<string | null>(null)
  const [initializingGateways, setInitializingGateways] = useState(false)
  const [creatingGateway, setCreatingGateway] = useState(false)
  const [showCreateGatewayForm, setShowCreateGatewayForm] = useState(false)
  const [timezone, setTimezone] = useState('UTC')
  const [timezoneMessage, setTimezoneMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    matchKeywords: "",
    feePercentage: 0,
    feeFixed: 0,
  })
  const [createForm, setCreateForm] = useState({
    name: "",
    displayName: "",
    matchKeywords: "",
    feePercentage: 0,
    feeFixed: 0,
    isActive: true,
  })

  const [roasThreshold, setRoasThreshold] = useState<number>(1.0)
  const [roasThresholdMessage, setRoasThresholdMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [savingRoas, setSavingRoas] = useState(false)

  const [allowRegistration, setAllowRegistration] = useState(false)
  const [savingRegistration, setSavingRegistration] = useState(false)
  const [registrationMessage, setRegistrationMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchTimezone()
    fetchGateways()
    fetchStores()
    fetchAlertSettings()
    fetchRegistrationSetting()
  }, [])

  const fetchRegistrationSetting = async () => {
    try {
      const res = await fetch('/api/settings/registration')
      const data = await res.json()
      if (res.ok) setAllowRegistration(data.allowRegistration)
    } catch (error) {
      console.error('Error fetching registration setting:', error)
    }
  }

  const saveRegistrationSetting = async (value: boolean) => {
    try {
      setSavingRegistration(true)
      setRegistrationMessage(null)
      const res = await fetch('/api/settings/registration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowRegistration: value }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRegistrationMessage({ type: 'error', text: data.error || t('errorGeneric') })
      } else {
        setAllowRegistration(value)
        setRegistrationMessage({ type: 'success', text: data.message })
      }
    } catch (error) {
      console.error('Error saving registration setting:', error)
      setRegistrationMessage({ type: 'error', text: t('errorSavingSetting') })
    } finally {
      setSavingRegistration(false)
    }
  }

  const fetchAlertSettings = async () => {
    try {
      const response = await fetch('/api/settings/alerts')
      const data = await response.json()
      if (response.ok && data.roasThreshold !== undefined) {
        setRoasThreshold(Number(data.roasThreshold))
      }
    } catch (error) {
      console.error('Error fetching alert settings:', error)
    }
  }

  const saveAlertSettings = async () => {
    try {
      setSavingRoas(true)
      setRoasThresholdMessage(null)
      const response = await fetch('/api/settings/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roasThreshold }),
      })
      if (!response.ok) {
        setRoasThresholdMessage({ type: 'error', text: t('updateError') })
      } else {
        setRoasThresholdMessage({ type: 'success', text: t('roasThresholdSaved') })
      }
    } catch (error) {
      console.error('Error saving alert settings:', error)
      setRoasThresholdMessage({ type: 'error', text: t('updateError') })
    } finally {
      setSavingRoas(false)
    }
  }

  const fetchStores = async () => {
    try {
      const response = await fetch('/api/stores')
      const data = await response.json()
      if (response.ok) {
        setStores((data.stores || []).map((s: any) => ({ id: s.id, name: s.name })))
      }
    } catch (error) {
      console.error('Error fetching stores for apply action:', error)
    }
  }

  const fetchTimezone = async () => {
    try {
      const response = await fetch('/api/settings/timezone')
      const data = await response.json()
      if (response.ok && data.timezone) {
        setTimezone(data.timezone)
      }
    } catch (error) {
      console.error('Error fetching timezone:', error)
    }
  }

  const saveTimezone = async () => {
    try {
      setTimezoneMessage(null)
      const response = await fetch('/api/settings/timezone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone })
      })
      if (!response.ok) {
        setTimezoneMessage({ type: 'error', text: t('updateError') })
        notifyError(t('updateError'))
      } else {
        setTimezoneMessage({ type: 'success', text: t('timezoneSaved') })
        notifySuccess(t('timezoneSaved'))
      }
    } catch (error) {
      console.error('Error saving timezone:', error)
      setTimezoneMessage({ type: 'error', text: t('updateError') })
      notifyError(t('updateError'))
    }
  }

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

  const handleCreateGateway = async () => {
    try {
      setCreatingGateway(true)
      const response = await fetch('/api/settings/gateways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      })
      const data = await response.json()
      if (!response.ok) {
        notifyError(data.error || t('updateError'))
        return
      }

      setCreateForm({
        name: '',
        displayName: '',
        matchKeywords: '',
        feePercentage: 0,
        feeFixed: 0,
        isActive: true,
      })
      setShowCreateGatewayForm(false)
      await fetchGateways()
      notifySuccess(t('gatewayCreated'))
    } catch (error) {
      console.error('Error creating gateway:', error)
      notifyError(t('updateError'))
    } finally {
      setCreatingGateway(false)
    }
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
        notifySuccess(t('timezoneSaved'))
      } else {
        notifyError(t('updateError'))
      }
    } catch (error) {
      console.error("Error updating gateway:", error)
      notifyError(t('updateError'))
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

  const handleDeleteGateway = async (gateway: PaymentGateway) => {
    const ok = await confirm({
      title: t('delete'),
      message: `${t('confirmDeleteGateway')} ${gateway.displayName}`,
      confirmText: t('delete'),
      cancelText: t('cancel'),
      tone: 'danger',
    })
    if (!ok) return

    try {
      const response = await fetch(`/api/settings/gateways/${gateway.id}`, {
        method: 'DELETE',
      })
      const data = await response.json()
      if (!response.ok) {
        notifyError(data.error || t('updateError'))
        return
      }

      await fetchGateways()
      notifySuccess(t('gatewayDeleted'))
    } catch (error) {
      console.error('Error deleting gateway:', error)
      notifyError(t('updateError'))
    }
  }

  const handleApplyGateway = async (gatewayId: string) => {
    try {
      setApplyingGatewayId(gatewayId)
      const storeId = selectedStoreByGateway[gatewayId] || ''

      const response = await fetch(`/api/settings/gateways/${gatewayId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: storeId || undefined }),
      })

      const data = await response.json()
      if (!response.ok) {
        notifyError(data.error || t('updateError'))
        return
      }

      notifySuccess(data.message || t('timezoneSaved'))
    } catch (error) {
      console.error('Error applying gateway mapping:', error)
      notifyError(t('updateError'))
    } finally {
      setApplyingGatewayId(null)
    }
  }

  const handleInitializeGateways = async () => {
    try {
      setInitializingGateways(true)
      const response = await fetch('/api/settings/gateways/initialize', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        notifyError(data.error || t('updateError'))
        return
      }

      if (Array.isArray(data.gateways)) {
        setGateways(data.gateways)
      } else {
        fetchGateways()
      }
    } catch (error) {
      console.error('Error initializing gateways:', error)
      notifyError(t('updateError'))
    } finally {
      setInitializingGateways(false)
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
        <div className="px-6 py-5">
          <h3 className="text-lg font-semibold text-gray-900">{t('defaultTimezone')}</h3>
          <p className="mt-1 text-sm text-gray-500">{t('timezoneDesc')}</p>
          <div className="mt-3 flex items-center gap-2">
            <CustomSelect
              value={timezone}
              onChange={setTimezone}
              className="w-64"
              searchable
              searchPlaceholder={t('searchTimezone')}
              options={Intl.supportedValuesOf('timeZone').map((tz) => ({ value: tz, label: tz }))}
            />
            <button
              onClick={saveTimezone}
              className="h-[42px] px-4 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:shadow-md transition-all"
            >
              {t('save')}
            </button>
          </div>
          {timezoneMessage && (
            <p className={`mt-2 text-sm ${timezoneMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {timezoneMessage.text}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{t('paymentGateways')}</h3>
              <p className="mt-1 text-sm text-gray-500">{t('gatewayDesc')}</p>
            </div>
            <button
              onClick={() => setShowCreateGatewayForm((v) => !v)}
              className="h-[38px] px-4 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:shadow-md transition-all"
            >
              {t('addGateway')}
            </button>
          </div>

          {showCreateGatewayForm && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value.trim().toLowerCase().replace(/\s+/g, '_') }))}
                  placeholder={t('gatewayNamePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
                <input
                  type="text"
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm((s) => ({ ...s, displayName: e.target.value }))}
                  placeholder={t('displayNamePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
                <input
                  type="text"
                  value={createForm.matchKeywords}
                  onChange={(e) => setCreateForm((s) => ({ ...s, matchKeywords: e.target.value }))}
                  placeholder={t('aliasesPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={createForm.feePercentage}
                    onChange={(e) => setCreateForm((s) => ({ ...s, feePercentage: Number(e.target.value) || 0 }))}
                    placeholder="2.9"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={createForm.feeFixed}
                    onChange={(e) => setCreateForm((s) => ({ ...s, feeFixed: Number(e.target.value) || 0 }))}
                    placeholder="0.30"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleCreateGateway}
                  disabled={creatingGateway}
                  className="h-[36px] px-3 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:shadow-md transition-all disabled:opacity-60"
                >
                  {creatingGateway ? t('creating') : t('createGateway')}
                </button>
                <button
                  onClick={() => setShowCreateGatewayForm(false)}
                  className="h-[36px] px-3 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="divide-y divide-gray-100">
          {gateways.length === 0 ? (
            <div className="px-6 py-8">
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
                <p className="text-sm font-medium text-gray-900">{t('noPaymentGateways')}</p>
                <p className="mt-1 text-xs text-gray-500">{t('noPaymentGatewaysDesc')}</p>
                <button
                  onClick={handleInitializeGateways}
                  disabled={initializingGateways}
                  className="mt-4 h-[38px] px-4 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:shadow-md transition-all disabled:opacity-60"
                >
                  {initializingGateways ? t('initializing') : t('initializeDefaultGateways')}
                </button>
              </div>
            </div>
          ) : gateways.map((gateway) => (
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
                        {gateway.isActive ? t('active') : t('inactive')}
                      </button>
                    </div>

                    {editingId === gateway.id ? (
                      <div className="mt-3 flex items-center space-x-4">
                        <div className="flex items-center space-x-2 min-w-[280px]">
                          <label className="text-sm text-gray-600">{t('aliases')}</label>
                          <input
                            type="text"
                            value={editForm.matchKeywords}
                            onChange={(e) => setEditForm({ ...editForm, matchKeywords: e.target.value })}
                            placeholder={t('aliasesPlaceholder')}
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
                          {t('fee')} <span className="font-semibold text-gray-900">{gateway.feePercentage}%</span> + 
                          <span className="font-semibold text-gray-900"> ${Number(gateway.feeFixed).toFixed(2)}</span>
                        </span>
                        {gateway.matchKeywords && (
                          <span className="text-xs text-gray-500">{t('aliases')}: {gateway.matchKeywords}</span>
                        )}
                        <button
                          onClick={() => handleEdit(gateway)}
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          {t('edit')}
                        </button>
                        <button
                          onClick={() => handleDeleteGateway(gateway)}
                          className="text-sm font-medium text-red-600 hover:text-red-700"
                        >
                          {t('delete')}
                        </button>
                      </div>
                    )}

                    {/* Apply alias mapping to historical orders */}
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <select
                        value={selectedStoreByGateway[gateway.id] || ''}
                        onChange={(e) => setSelectedStoreByGateway((prev) => ({ ...prev, [gateway.id]: e.target.value }))}
                        className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs bg-white text-gray-700"
                      >
                        <option value="">{t('allStores')}</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleApplyGateway(gateway.id)}
                        disabled={applyingGatewayId === gateway.id}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {applyingGatewayId === gateway.id ? t('applying') : t('applyToOrders')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alert Settings */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">{t('alertSettings')}</h3>
          <p className="mt-1 text-sm text-gray-500">{t('alertSettingsDesc')}</p>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
              {t('roasThreshold')}
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={roasThreshold}
              onChange={(e) => setRoasThreshold(parseFloat(e.target.value) || 0)}
              className="w-24 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
            />
            <button
              onClick={saveAlertSettings}
              disabled={savingRoas}
              className="h-[38px] px-4 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:shadow-md transition-all disabled:opacity-60"
            >
              {savingRoas ? t('loading') : t('save')}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">{t('roasThresholdHint')}</p>
          {roasThresholdMessage && (
            <p className={`mt-2 text-sm ${roasThresholdMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {roasThresholdMessage.text}
            </p>
          )}
        </div>
      </div>

      {/* Admin Settings */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">{t('admin')}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {t('adminDesc')}
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{t('allowRegistration')}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('allowRegistrationDesc')}
              </p>
            </div>
            <button
              onClick={() => saveRegistrationSetting(!allowRegistration)}
              disabled={savingRegistration}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                allowRegistration ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  allowRegistration ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {registrationMessage && (
            <p className={`text-sm ${registrationMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {registrationMessage.text}
            </p>
          )}
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
