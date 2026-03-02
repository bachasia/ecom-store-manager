"use client"

import { useEffect, useState } from "react"
import { SYSTEM_ROLE, type SystemRole } from "@/lib/roles"
import { Shield, Trash2, ChevronDown, UserPlus, X, Eye, EyeOff, RefreshCw, Copy, Check } from "lucide-react"

interface User {
  id: string
  email: string
  name: string | null
  systemRole: SystemRole
  createdAt: string
  storeCount: number
}

const ROLE_LABELS: Record<SystemRole, string> = {
  SUPER_ADMIN: "Super Admin",
  USER: "User",
}

const ROLE_COLORS: Record<SystemRole, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800",
  USER: "bg-gray-100 text-gray-700",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHARSET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&"

function generatePassword(length = 12): string {
  // Guarantee at least one of each: lowercase, uppercase, digit, symbol
  const lower   = "abcdefghijkmnpqrstuvwxyz"
  const upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const digits  = "23456789"
  const symbols = "!@#$%&"
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  const required = [pick(lower), pick(upper), pick(digits), pick(symbols)]
  const rest = Array.from({ length: length - required.length }, () =>
    pick(CHARSET)
  )
  return [...required, ...rest].sort(() => Math.random() - 0.5).join("")
}

// ── Add User Modal ────────────────────────────────────────────────────────────

interface AddUserModalProps {
  onClose: () => void
  onSuccess: () => void
}

function AddUserModal({ onClose, onSuccess }: AddUserModalProps) {
  const [form, setForm] = useState<{ name: string; email: string; password: string; systemRole: SystemRole }>({
    name: "", email: "", password: "", systemRole: SYSTEM_ROLE.USER,
  })
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [showPass, setShowPass] = useState(false)
  const [copied, setCopied]     = useState(false)

  function handleGenerate() {
    const pwd = generatePassword(12)
    setForm(f => ({ ...f, password: pwd }))
    setShowPass(true) // show so the user can see the generated value
    setCopied(false)
  }

  async function handleCopy() {
    if (!form.password) return
    try {
      await navigator.clipboard.writeText(form.password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available — silently ignore
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Failed to create user")
        return
      }
      onSuccess()
      onClose()
    } catch {
      setError("An error occurred")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Add New User</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Full name"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="user@example.com"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">
                Password <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Generate
              </button>
            </div>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min. 6 characters"
                className={`w-full px-3 py-2.5 pr-20 rounded-xl border border-gray-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition ${form.password ? "font-mono" : ""}`}
              />
              {/* Show/hide toggle */}
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                className="absolute right-9 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              {/* Copy button */}
              <button
                type="button"
                onClick={handleCopy}
                disabled={!form.password}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition-colors disabled:opacity-30"
                tabIndex={-1}
                title="Copy password"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            {form.password && (
              <PasswordStrength password={form.password} />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">System Role</label>
            <select
              value={form.systemRole}
              onChange={(e) => setForm(f => ({ ...f, systemRole: e.target.value as SystemRole }))}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition bg-white"
            >
              {Object.values(SYSTEM_ROLE).map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white hover:shadow-md disabled:opacity-60 transition-all"
            >
              {saving ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Password strength indicator ───────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ]
  const score = checks.filter(Boolean).length  // 0-4

  const bar = score <= 1 ? { w: "w-1/4", color: "bg-red-400",    label: "Weak" }
            : score === 2 ? { w: "w-2/4", color: "bg-orange-400", label: "Fair" }
            : score === 3 ? { w: "w-3/4", color: "bg-yellow-400", label: "Good" }
            :               { w: "w-full", color: "bg-green-500",  label: "Strong" }

  return (
    <div className="mt-2 space-y-1">
      <div className="h-1 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${bar.w} ${bar.color}`} />
      </div>
      <p className={`text-xs font-medium ${
        score <= 1 ? "text-red-500" : score === 2 ? "text-orange-500" : score === 3 ? "text-yellow-600" : "text-green-600"
      }`}>{bar.label}</p>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  async function fetchUsers() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/users")
      if (!res.ok) throw new Error("Failed to load users")
      const data = await res.json()
      setUsers(data.users)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  async function handleRoleChange(userId: string, newRole: SystemRole) {
    setUpdating(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemRole: newRole }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || "Failed to update role")
        return
      }
      await fetchUsers()
    } finally {
      setUpdating(null)
    }
  }

  async function handleDelete(userId: string, email: string) {
    if (!confirm(`Delete user "${email}"? This action cannot be undone.`)) return
    setDeleting(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || "Failed to delete user")
        return
      }
      await fetchUsers()
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
        {error}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {users.length} user{users.length !== 1 ? "s" : ""} in the system
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all"
        >
          <UserPlus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 font-medium text-gray-600">User</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">System Role</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Stores</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Joined</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="font-medium text-gray-900">{user.name || "—"}</div>
                  <div className="text-gray-500 text-xs mt-0.5">{user.email}</div>
                </td>
                <td className="px-5 py-3.5">
                  <div className="relative inline-block">
                    <select
                      value={user.systemRole}
                      disabled={!!updating}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as SystemRole)}
                      className={`appearance-none pr-7 pl-2.5 py-1 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 ${ROLE_COLORS[user.systemRole]}`}
                    >
                      {Object.values(SYSTEM_ROLE).map((role) => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none opacity-60" />
                  </div>
                </td>
                <td className="px-5 py-3.5 text-gray-600">{user.storeCount}</td>
                <td className="px-5 py-3.5 text-gray-500 text-xs">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    onClick={() => handleDelete(user.id, user.email)}
                    disabled={!!deleting}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                    title="Delete user"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="text-center py-12 text-gray-400">No users found</div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onSuccess={fetchUsers}
        />
      )}
    </div>
  )
}
