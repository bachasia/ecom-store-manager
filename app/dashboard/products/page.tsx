"use client"

import { Fragment, useState, useEffect, useRef } from "react"
import { Package, Search, Upload, Edit2, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"
import Papa from "papaparse"
import { useTranslations } from "next-intl"
import { createPortal } from "react-dom"
import StoreSelect from "@/components/ui/store-select"

// ── Types ────────────────────────────────────────────────────────────────────

interface ProductVariant {
  id: string
  externalId: string
  sku: string
  variantName: string | null
  baseCost: number
  price: number
  imageUrl: string | null
  isActive: boolean
  _count: { orderItems: number }
}

interface ProductGroup {
  id: string
  storeId: string
  parentExternalId: string | null
  name: string
  imageUrl: string | null
  isActive: boolean
  store: { id: string; name: string; platform: string }
  priceMin: number
  priceMax: number
  totalOrderItems: number
  variants: ProductVariant[]
  // Simple product fields (khi chỉ có 1 variant không tên)
  sku: string | null
  variantName: string | null
  baseCost: number
  price: number
}

interface Store {
  id: string
  name: string
  platform: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: string }) {
  const isShopbase = platform === "shopbase"
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
      isShopbase
        ? "bg-blue-50 text-blue-700 border border-blue-100"
        : "bg-purple-50 text-purple-700 border border-purple-100"
    }`}>
      <img
        src={isShopbase ? "/platform/shopbase-logo32.png" : "/platform/woocommerce-logo32.png"}
        alt={platform}
        className="w-3 h-3"
      />
      {isShopbase ? "ShopBase" : "WooCommerce"}
    </span>
  )
}

function ProductImage({ src, name, size = "md" }: { src: string | null; name: string; size?: "sm" | "md" }) {
  const cls = "w-12"
  const [showPreview, setShowPreview] = useState(false)
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent) => {
    setPreviewPos({
      x: e.clientX + 16,
      y: e.clientY,
    })
  }

  if (src) {
    return (
      <>
        <img
          src={src}
          alt={name}
          className={`${cls} aspect-square rounded-lg object-cover border border-gray-100 shrink-0`}
          onError={(e) => { e.currentTarget.style.display = "none" }}
          onMouseEnter={() => setShowPreview(true)}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setShowPreview(false)}
        />
        {showPreview && typeof window !== "undefined" && createPortal(
          <div
            className="pointer-events-none fixed z-[9999] rounded-xl border border-gray-200 bg-white p-2 shadow-2xl overflow-hidden"
            style={{
              left: `${previewPos.x}px`,
              top: `${previewPos.y}px`,
              transform: "translateY(-50%)",
            }}
          >
            <img
              src={src}
              alt={name}
              className="block max-w-[300px] max-h-[300px] rounded-lg object-contain bg-white"
            />
          </div>,
          document.body
        )}
      </>
    )
  }
  return (
    <div className={`${cls} aspect-square rounded-lg bg-gray-100 flex items-center justify-center shrink-0`}>
      <Package className={size === "sm" ? "w-3.5 h-3.5 text-gray-300" : "w-5 h-5 text-gray-300"} />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const t = useTranslations("products")
  const tCommon = useTranslations("common")
  const tDashboard = useTranslations("dashboard")

  const [products, setProducts] = useState<ProductGroup[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState("")
  const [selectedPlatform, setSelectedPlatform] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [editingVariant, setEditingVariant] = useState<{ id: string; name: string; sku: string; baseCost: number } | null>(null)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const fetchAbortRef = useRef<AbortController | null>(null)

  useEffect(() => { fetchStores() }, [])
  useEffect(() => { fetchProducts() }, [selectedStore, selectedPlatform, search, pagination.page])

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput)
    }, 350)
    return () => clearTimeout(id)
  }, [searchInput])

  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort()
    }
  }, [])

  const fetchStores = async () => {
    try {
      const res = await fetch("/api/stores")
      const data = await res.json()
      if (res.ok) setStores(data.stores)
    } catch (e) { console.error(e) }
  }

  const fetchProducts = async () => {
    fetchAbortRef.current?.abort()
    const abortController = new AbortController()
    fetchAbortRef.current = abortController

    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(selectedStore && { storeId: selectedStore }),
        ...(selectedPlatform && !selectedStore && { platform: selectedPlatform }),
        ...(search && { search }),
      })
      const res = await fetch(`/api/products?${params}`, { signal: abortController.signal })
      const data = await res.json()
      if (res.ok) {
        setProducts(data.products)
        setPagination(data.pagination)
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error(e)
    } finally {
      if (fetchAbortRef.current === abortController) {
        setLoading(false)
      }
    }
  }

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSaveCOGS = async (productId: string, newBaseCost: number) => {
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseCost: newBaseCost }),
      })
      if (res.ok) {
        setEditingVariant(null)
        fetchProducts()
      } else {
        const data = await res.json()
        alert(`❌ ${data.error}`)
      }
    } catch (e) { alert(t("error")) }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value)

  const formatPriceRange = (min: number, max: number) =>
    min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`

  const calcMargin = (price: number, cost: number) =>
    price === 0 ? 0 : ((price - cost) / price) * 100

  const marginClass = (m: number) =>
    m >= 30 ? "text-green-600" : m >= 15 ? "text-orange-600" : "text-red-600"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">{t("title")}</h2>
          <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => setShowBulkUpload(true)}
          className="inline-flex items-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all duration-200"
        >
          <Upload className="w-5 h-5 mr-2" />
          Bulk Update COGS
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={t("searchPlaceholder")}
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setPagination(p => ({ ...p, page: 1 })) }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
              />
            </div>
          {stores.length > 0 && (
            <StoreSelect
              value={selectedStore}
              onChange={(v) => { setSelectedStore(v); setSelectedPlatform(""); setPagination(p => ({ ...p, page: 1 })) }}
              placeholder={tDashboard("allStores")}
              options={stores.map(s => ({ value: s.id, label: s.name, platform: s.platform }))}
              className="w-56"
            />
          )}
          <button onClick={fetchProducts} className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {!selectedStore && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">{t("platformLabel")}</span>
            {(["", "shopbase", "woocommerce"] as const).map((p) => (
              <button
                key={p}
                onClick={() => { setSelectedPlatform(p); setPagination(prev => ({ ...prev, page: 1 })) }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  selectedPlatform === p
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {p === "" && t("allPlatforms")}
                {p === "shopbase" && <><img src="/platform/shopbase-logo32.png" className="w-3 h-3" />ShopBase</>}
                {p === "woocommerce" && <><img src="/platform/woocommerce-logo32.png" className="w-3 h-3" />WooCommerce</>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            <p className="mt-2 text-sm text-gray-600">{tCommon("loading")}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">{t("notFound")}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-8 px-3 py-3" />
                    <th className="w-20 px-3 py-3" />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("product")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("store")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platform</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t("price")}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t("cogs")}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Margin</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t("sold")}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {products.map((group) => {
                    const hasVariants = group.variants.length > 1 || (group.variants.length === 1 && group.variants[0].variantName !== null)
                    const isExpanded = expandedRows.has(group.id)
                    const margin = calcMargin(group.price, group.baseCost)

                    return (
                      <Fragment key={group.id}>
                        {/* ── Parent row ── */}
                        <tr
                          key={group.id}
                          className={`transition-colors ${hasVariants ? "cursor-pointer hover:bg-indigo-50/40" : "hover:bg-gray-50"} ${isExpanded ? "bg-indigo-50/30" : ""}`}
                          onClick={() => hasVariants && toggleRow(group.id)}
                        >
                          {/* Expand toggle */}
                          <td className="px-3 py-3 text-center">
                            {hasVariants ? (
                              <span className="text-gray-400">
                                {isExpanded
                                  ? <ChevronDown className="w-4 h-4 inline" />
                                  : <ChevronRight className="w-4 h-4 inline" />}
                              </span>
                            ) : null}
                          </td>

                          {/* Image */}
                          <td className="w-20 min-w-[5rem] px-3 py-3">
                            <ProductImage src={group.imageUrl} name={group.name} />
                          </td>

                          {/* Name */}
                          <td className="px-4 py-3">
                            <div className="text-sm font-semibold text-gray-900">{group.name}</div>
                            {hasVariants && (
                              <div className="text-xs text-indigo-500 font-medium mt-0.5">
                                {group.variants.length} variants
                              </div>
                            )}
                            {!hasVariants && group.variantName && (
                              <div className="text-xs text-gray-500">{group.variantName}</div>
                            )}
                          </td>

                          {/* SKU */}
                          <td className="px-4 py-3">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-mono text-gray-600">
                                {hasVariants ? `${group.variants.length} SKUs` : group.sku}
                              </span>
                              {!hasVariants && group.store.platform === "shopbase" && group.variants[0]?.externalId && (
                                <span className="block text-[11px] font-mono text-gray-400">
                                  variant_id: {group.variants[0].externalId}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Store */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-gray-600">{group.store.name}</span>
                          </td>

                          {/* Platform */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <PlatformBadge platform={group.store.platform} />
                          </td>

                          {/* Price */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900">
                              {hasVariants
                                ? formatPriceRange(group.priceMin, group.priceMax)
                                : formatCurrency(group.price)}
                            </span>
                          </td>

                          {/* COGS */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {hasVariants ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (
                              <span className="text-sm font-medium text-gray-900">
                                {formatCurrency(group.baseCost)}
                              </span>
                            )}
                          </td>

                          {/* Margin */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {hasVariants ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (
                              <span className={`text-sm font-medium ${marginClass(margin)}`}>
                                {margin.toFixed(1)}%
                              </span>
                            )}
                          </td>

                          {/* Sold */}
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm text-gray-600">{group.totalOrderItems}</span>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            {!hasVariants && (
                              <button
                                onClick={() => setEditingVariant({
                                  id: group.variants[0]?.id ?? group.id,
                                  name: group.name,
                                  sku: group.sku ?? "",
                                  baseCost: group.baseCost,
                                })}
                                className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700"
                              >
                                <Edit2 className="w-4 h-4 mr-1" />
                                {t("edit")}
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* ── Variant rows (expanded) ── */}
                        {hasVariants && isExpanded && group.variants.map((v) => {
                          const vMargin = calcMargin(v.price, v.baseCost)
                          return (
                            <tr key={v.id} className="bg-gray-50/70 border-l-4 border-indigo-200 hover:bg-indigo-50/30 transition-colors">
                              <td className="px-3 py-2.5" />
                              {/* Variant image */}
                              <td className="w-20 min-w-[5rem] px-3 py-2.5">
                                <ProductImage src={v.imageUrl} name={v.variantName ?? group.name} size="sm" />
                              </td>
                              {/* Variant name */}
                              <td className="px-4 py-2.5 pl-8">
                                <span className="text-sm text-gray-700">{v.variantName ?? "—"}</span>
                              </td>
                              {/* SKU */}
                              <td className="px-4 py-2.5">
                                <div className="space-y-0.5">
                                  <span className="block text-xs font-mono text-gray-500">{v.sku}</span>
                                  {group.store.platform === "shopbase" && (
                                    <span className="block text-[11px] font-mono text-gray-400">
                                      variant_id: {v.externalId}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {/* Store & Platform — empty để không lặp lại */}
                              <td className="px-4 py-2.5" />
                              <td className="px-4 py-2.5" />
                              {/* Price */}
                              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                <span className="text-sm text-gray-700">{formatCurrency(v.price)}</span>
                              </td>
                              {/* COGS */}
                              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                <span className="text-sm text-gray-700">{formatCurrency(v.baseCost)}</span>
                              </td>
                              {/* Margin */}
                              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                <span className={`text-sm font-medium ${marginClass(vMargin)}`}>
                                  {vMargin.toFixed(1)}%
                                </span>
                              </td>
                              {/* Sold */}
                              <td className="px-4 py-2.5 text-center">
                                <span className="text-xs text-gray-500">{v._count.orderItems}</span>
                              </td>
                              {/* Edit COGS */}
                              <td className="px-4 py-2.5 text-right">
                                <button
                                  onClick={() => setEditingVariant({
                                    id: v.id,
                                    name: `${group.name} — ${v.variantName}`,
                                    sku: v.sku,
                                    baseCost: v.baseCost,
                                  })}
                                  className="inline-flex items-center text-xs font-medium text-indigo-500 hover:text-indigo-700"
                                >
                                  <Edit2 className="w-3.5 h-3.5 mr-1" />
                                  {t("edit")}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  {t("showing", { count: products.length, total: pagination.total })}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                    disabled={pagination.page === 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {t("previous")}
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                    disabled={pagination.page === pagination.totalPages}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {t("next")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit COGS Modal */}
      {editingVariant && (
        <EditCOGSModal
          product={editingVariant}
          onClose={() => setEditingVariant(null)}
          onSave={handleSaveCOGS}
        />
      )}

      {/* Bulk Upload Modal */}
      {showBulkUpload && (
        <BulkUploadModal
          stores={stores}
          onClose={() => setShowBulkUpload(false)}
          onSuccess={() => { setShowBulkUpload(false); fetchProducts() }}
        />
      )}
    </div>
  )
}

// ── Edit COGS Modal ───────────────────────────────────────────────────────────

function EditCOGSModal({
  product,
  onClose,
  onSave,
}: {
  product: { id: string; name: string; sku: string; baseCost: number }
  onClose: () => void
  onSave: (id: string, cost: number) => void
}) {
  const t = useTranslations("products")
  const [baseCost, setBaseCost] = useState(product.baseCost.toString())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(baseCost)
    if (isNaN(val) || val < 0) { alert(t("invalidCogs")); return }
    onSave(product.id, val)
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-xl font-bold text-gray-900">{t("editCogs")}</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("product")}</label>
            <p className="text-sm font-medium text-gray-900">{product.name}</p>
            <p className="text-xs text-gray-500">SKU: {product.sku}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t("cogsLabel")}</label>
            <input
              type="number" step="0.01" min="0"
              value={baseCost}
              onChange={(e) => setBaseCost(e.target.value)}
              className="block w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
              placeholder="0.00" autoFocus
            />
          </div>
          <div className="flex items-center space-x-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              {t("cancel")}
            </button>
            <button type="submit" className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all duration-200">
              {t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Bulk Upload Modal ─────────────────────────────────────────────────────────

function BulkUploadModal({ stores, onClose, onSuccess }: {
  stores: Store[]
  onClose: () => void
  onSuccess: () => void
}) {
  const t = useTranslations("products")
  const [selectedStore, setSelectedStore] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleUpload = async () => {
    if (!selectedStore || !file) { alert(t("uploadError")); return }
    setUploading(true)
    try {
      const text = await file.text()
      const parsed = Papa.parse(text, { header: true })
      const products = (parsed.data as any[])
        .filter(r => r.sku && r.baseCost)
        .map(r => ({ sku: r.sku.trim(), baseCost: parseFloat(r.baseCost) }))

      if (products.length === 0) { alert(t("noValidData")); setUploading(false); return }

      const res = await fetch("/api/products/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore, products }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult(data)
        if (data.stats.updated > 0) setTimeout(() => onSuccess(), 2000)
      } else {
        alert(`❌ ${data.error}`)
      }
    } catch (e) { alert(t("uploadFailed")) }
    finally { setUploading(false) }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-xl font-bold text-gray-900">Bulk Update COGS</h3>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">{t("selectStore")}</label>
            <StoreSelect
              value={selectedStore}
              onChange={setSelectedStore}
              placeholder={t("selectStorePlaceholder")}
              options={stores.map(s => ({ value: s.id, label: s.name, platform: s.platform }))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">{t("uploadCsv")}</label>
            <input
              type="file" accept=".csv"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null) }}
              className="block w-full text-sm text-gray-900 border border-gray-200 rounded-xl cursor-pointer focus:outline-none file:mr-4 file:py-2.5 file:px-4 file:rounded-l-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {file && <p className="mt-2 text-sm text-gray-600">Selected: <span className="font-medium">{file.name}</span></p>}
          </div>
          <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4">
            <p className="text-sm font-semibold text-gray-900 mb-2">Format CSV:</p>
            <pre className="text-xs text-gray-600 font-mono">{"sku,baseCost\nSKU-001,15.50\nSKU-002,22.00"}</pre>
          </div>
          {result && (
            <div className={`rounded-xl border p-4 ${result.stats.updated > 0 ? "bg-green-50 border-green-100" : "bg-orange-50 border-orange-100"}`}>
              <p className="text-sm font-semibold text-gray-900 mb-2">✓ {result.message}</p>
              <div className="text-xs text-gray-600 space-y-1">
                <p>{t("total")} {result.stats.total}</p>
                <p>{t("updated")} {result.stats.updated}</p>
                <p>{t("notFoundCount")} {result.stats.notFound}</p>
                <p>{t("errors")} {result.stats.errors}</p>
              </div>
            </div>
          )}
          <div className="flex items-center space-x-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              {t("close")}
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !selectedStore || !file}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {uploading ? t("uploading") : t("upload")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
