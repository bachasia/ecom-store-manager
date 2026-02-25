"use client"

import { useState, useEffect } from "react"
import { Package, Search, Upload, Edit2, RefreshCw } from "lucide-react"
import Papa from "papaparse"
import { useTranslations } from "next-intl"
import StoreSelect from "@/components/ui/store-select"

interface Product {
  id: string
  storeId: string
  externalId: string
  name: string
  sku: string
  variantName: string | null
  baseCost: number
  platformCost: number | null
  price: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  store: {
    id: string
    name: string
  }
  _count: {
    orderItems: number
  }
}

interface Store {
  id: string
  name: string
  platform: string
}

export default function ProductsPage() {
  const t = useTranslations('products')
  const tCommon = useTranslations('common')
  const tDashboard = useTranslations('dashboard')
  const [products, setProducts] = useState<Product[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<string>("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  })

  useEffect(() => {
    fetchStores()
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [selectedStore, search, pagination.page])

  const fetchStores = async () => {
    try {
      const response = await fetch("/api/stores")
      const data = await response.json()
      if (response.ok) {
        setStores(data.stores)
      }
    } catch (error) {
      console.error("Error fetching stores:", error)
    }
  }

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(selectedStore && { storeId: selectedStore }),
        ...(search && { search })
      })

      const response = await fetch(`/api/products?${params}`)
      const data = await response.json()

      if (response.ok) {
        setProducts(data.products)
        setPagination(data.pagination)
      }
    } catch (error) {
      console.error("Error fetching products:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleEditCOGS = (product: Product) => {
    setEditingProduct(product)
  }

  const handleSaveCOGS = async (productId: string, newBaseCost: number) => {
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseCost: newBaseCost })
      })

      if (response.ok) {
        alert(t('updated'))
        setEditingProduct(null)
        fetchProducts()
      } else {
        const data = await response.json()
        alert(`❌ ${data.error}`)
      }
    } catch (error) {
      console.error("Error updating COGS:", error)
      alert(t('error'))
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  }

  const calculateMargin = (price: number, cost: number) => {
    if (price === 0) return 0
    return ((price - cost) / price) * 100
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">{t('title')}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t('subtitle')}
          </p>
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>
          
          {stores.length > 0 && (
            <StoreSelect
              value={selectedStore}
              onChange={setSelectedStore}
              placeholder={tDashboard('allStores')}
              options={stores.map((store) => ({
                value: store.id,
                label: store.name,
                platform: store.platform
              }))}
              className="w-64"
            />
          )}

          <button
            onClick={fetchProducts}
            className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="mt-2 text-sm text-gray-600">{tCommon('loading')}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">{t('notFound')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('product')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SKU
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('store')}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('price')}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('cogs')}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Margin
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('sold')}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {products.map((product) => {
                    const margin = calculateMargin(Number(product.price), Number(product.baseCost))
                    return (
                      <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {product.name}
                              </div>
                              {product.variantName && (
                                <div className="text-xs text-gray-500">
                                  {product.variantName}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-mono text-gray-900">
                            {product.sku}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-600">
                            {product.store.name}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm font-medium text-gray-900">
                            {formatCurrency(Number(product.price))}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm font-medium text-gray-900">
                            {formatCurrency(Number(product.baseCost))}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className={`text-sm font-medium ${
                            margin >= 30 ? 'text-green-600' :
                            margin >= 15 ? 'text-orange-600' :
                            'text-red-600'
                          }`}>
                            {margin.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="text-sm text-gray-600">
                            {product._count.orderItems}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => handleEditCOGS(product)}
                            className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700"
                          >
                            <Edit2 className="w-4 h-4 mr-1" />
                            {t('edit')}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  {t('showing', { count: products.length, total: pagination.total })}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                    disabled={pagination.page === 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('previous')}
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                    disabled={pagination.page === pagination.totalPages}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit COGS Modal */}
      {editingProduct && (
        <EditCOGSModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={handleSaveCOGS}
        />
      )}

      {/* Bulk Upload Modal */}
      {showBulkUpload && (
        <BulkUploadModal
          stores={stores}
          onClose={() => setShowBulkUpload(false)}
          onSuccess={() => {
            setShowBulkUpload(false)
            fetchProducts()
          }}
        />
      )}
    </div>
  )
}

// Edit COGS Modal Component
function EditCOGSModal({
  product,
  onClose,
  onSave
}: {
  product: Product
  onClose: () => void
  onSave: (productId: string, newBaseCost: number) => void
}) {
  const t = useTranslations('products')
  const [baseCost, setBaseCost] = useState(Number(product.baseCost).toString())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const newCost = parseFloat(baseCost)
    if (isNaN(newCost) || newCost < 0) {
      alert(t('invalidCogs'))
      return
    }
    onSave(product.id, newCost)
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-xl font-bold text-gray-900">{t('editCogs')}</h3>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('product')}
            </label>
            <p className="text-sm text-gray-900 font-medium">{product.name}</p>
            <p className="text-xs text-gray-500">SKU: {product.sku}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('cogsLabel')}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={baseCost}
              onChange={(e) => setBaseCost(e.target.value)}
              className="block w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
              placeholder="0.00"
              autoFocus
            />
          </div>

          <div className="flex items-center space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all duration-200"
            >
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Bulk Upload Modal Component
function BulkUploadModal({
  stores,
  onClose,
  onSuccess
}: {
  stores: Store[]
  onClose: () => void
  onSuccess: () => void
}) {
  const t = useTranslations('products')
  const [selectedStore, setSelectedStore] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setResult(null)
    }
  }

  const handleUpload = async () => {
    if (!selectedStore || !file) {
      alert(t('uploadError'))
      return
    }

    setUploading(true)

    try {
      const text = await file.text()
      const parsed = Papa.parse(text, { header: true })
      
      // Expected format: sku, baseCost
      const products = parsed.data
        .filter((row: any) => row.sku && row.baseCost)
        .map((row: any) => ({
          sku: row.sku.trim(),
          baseCost: parseFloat(row.baseCost)
        }))

      if (products.length === 0) {
        alert(t('noValidData'))
        setUploading(false)
        return
      }

      const response = await fetch("/api/products/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStore,
          products
        })
      })

      const data = await response.json()

      if (response.ok) {
        setResult(data)
        if (data.stats.updated > 0) {
          setTimeout(() => onSuccess(), 2000)
        }
      } else {
        alert(`❌ ${data.error}`)
      }
    } catch (error) {
      console.error("Upload error:", error)
      alert(t('uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-xl font-bold text-gray-900">Bulk Update COGS</h3>
        </div>
        
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              {t('selectStore')}
            </label>
            <StoreSelect
              value={selectedStore}
              onChange={setSelectedStore}
              placeholder={t('selectStorePlaceholder')}
              options={stores.map((store) => ({
                value: store.id,
                label: store.name,
                platform: store.platform
              }))}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              {t('uploadCsv')}
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-900 border border-gray-200 rounded-xl cursor-pointer focus:outline-none file:mr-4 file:py-2.5 file:px-4 file:rounded-l-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: <span className="font-medium">{file.name}</span>
              </p>
            )}
          </div>

          <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4">
            <p className="text-sm font-semibold text-gray-900 mb-2">
              Format CSV:
            </p>
            <pre className="text-xs text-gray-600 font-mono">
              sku,baseCost{'\n'}
              SKU-001,15.50{'\n'}
              SKU-002,22.00
            </pre>
          </div>

          {result && (
            <div className={`rounded-xl border p-4 ${
              result.stats.updated > 0 
                ? 'bg-green-50 border-green-100' 
                : 'bg-orange-50 border-orange-100'
            }`}>
              <p className="text-sm font-semibold text-gray-900 mb-2">
                ✓ {result.message}
              </p>
              <div className="text-xs text-gray-600 space-y-1">
                <p>{t('total')} {result.stats.total}</p>
                <p>{t('updated')} {result.stats.updated}</p>
                <p>{t('notFoundCount')} {result.stats.notFound}</p>
                <p>{t('errors')} {result.stats.errors}</p>
              </div>
              {result.notFoundSkus && result.notFoundSkus.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-700">{t('skuNotFound')}</p>
                  <p className="text-xs text-gray-600">{result.notFoundSkus.join(', ')}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('close')}
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !selectedStore || !file}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {uploading ? t('uploading') : t('upload')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
