"use client"

import { useEffect, useState } from "react"
import { SystemRole } from "@prisma/client"
import { Shield, Trash2, ChevronDown } from "lucide-react"

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

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
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
      <div className="mb-8 flex items-center gap-3">
        <Shield className="h-6 w-6 text-purple-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {users.length} user{users.length !== 1 ? "s" : ""} in the system
          </p>
        </div>
      </div>

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
                      className={`appearance-none pr-7 pl-2.5 py-1 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${ROLE_COLORS[user.systemRole]}`}
                    >
                      {Object.values(SystemRole).map((role) => (
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
    </div>
  )
}
