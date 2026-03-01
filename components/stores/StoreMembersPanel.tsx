"use client"

import { useEffect, useState } from "react"
import { type StoreRole, type SystemRole } from "@/lib/roles"
import { UserPlus, Trash2, ChevronDown } from "lucide-react"

interface Member {
  id: string
  role: StoreRole
  roleLabel: string
  createdAt: string
  user: {
    id: string
    email: string
    name: string | null
    systemRole: SystemRole
  }
}

const ROLE_LABELS: Record<StoreRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  VIEWER: "Viewer",
  DATA_ENTRY: "Data Entry",
}

const ROLE_COLORS: Record<StoreRole, string> = {
  OWNER: "bg-blue-100 text-blue-800",
  MANAGER: "bg-green-100 text-green-800",
  VIEWER: "bg-gray-100 text-gray-700",
  DATA_ENTRY: "bg-orange-100 text-orange-800",
}

interface Props {
  storeId: string
  canManage: boolean // OWNER or SUPER_ADMIN
}

export default function StoreMembersPanel({ storeId, canManage }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addEmail, setAddEmail] = useState("")
  const [addRole, setAddRole] = useState<StoreRole>("VIEWER")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function fetchMembers() {
    setLoading(true)
    try {
      const res = await fetch(`/api/stores/${storeId}/members`)
      if (!res.ok) return
      const data = await res.json()
      setMembers(data.members)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMembers() }, [storeId])

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch(`/api/stores/${storeId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail, role: addRole }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error || "Failed to add member")
        return
      }
      setAddEmail("")
      setAddRole("VIEWER")
      setShowAdd(false)
      await fetchMembers()
    } finally {
      setAdding(false)
    }
  }

  async function handleRoleChange(userId: string, role: StoreRole) {
    const res = await fetch(`/api/stores/${storeId}/members/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error || "Failed to update role")
      return
    }
    await fetchMembers()
  }

  async function handleRemove(userId: string, email: string) {
    if (!confirm(`Remove "${email}" from this store?`)) return
    const res = await fetch(`/api/stores/${storeId}/members/${userId}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error || "Failed to remove member")
      return
    }
    await fetchMembers()
  }

  if (loading) {
    return <div className="text-sm text-gray-400 py-4">Loading members...</div>
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700">
          Members ({members.length})
        </h4>
        {canManage && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add member
          </button>
        )}
      </div>

      {/* Add member form */}
      {showAdd && canManage && (
        <form onSubmit={handleAddMember} className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-600 mb-1 block">Email</label>
              <input
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="user@example.com"
                required
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Role</label>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as StoreRole)}
                className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {(["MANAGER", "VIEWER", "DATA_ENTRY"] as StoreRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={adding}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </div>
          {addError && (
            <p className="text-red-600 text-xs mt-2">{addError}</p>
          )}
        </form>
      )}

      {/* Members list */}
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-900 truncate">
                {m.user.name || m.user.email}
              </div>
              {m.user.name && (
                <div className="text-xs text-gray-500 truncate">{m.user.email}</div>
              )}
            </div>
            <div className="flex items-center gap-2 ml-3 shrink-0">
              {canManage && m.role !== "OWNER" ? (
                <div className="relative">
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.user.id, e.target.value as StoreRole)}
                    className={`appearance-none pr-6 pl-2 py-0.5 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${ROLE_COLORS[m.role]}`}
                  >
                    {(["MANAGER", "VIEWER", "DATA_ENTRY"] as StoreRole[]).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none opacity-60" />
                </div>
              ) : (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[m.role]}`}>
                  {ROLE_LABELS[m.role]}
                </span>
              )}

              {canManage && m.role !== "OWNER" && (
                <button
                  onClick={() => handleRemove(m.user.id, m.user.email)}
                  className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Remove member"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-3">No members yet</p>
        )}
      </div>
    </div>
  )
}
