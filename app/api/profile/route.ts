import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { hash, compare } from "bcryptjs"

// GET /api/profile — return current user's public fields
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, createdAt: true, systemRole: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  return NextResponse.json({ user })
}

// PUT /api/profile — update name, email, and/or password
// Body: { name?, email?, currentPassword?, newPassword? }
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { name, email, currentPassword, newPassword } = body

  // Basic validation
  if (name !== undefined && typeof name === "string" && name.trim().length < 2) {
    return NextResponse.json({ error: "nameTooShort" }, { status: 400 })
  }
  if (email !== undefined) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(email)) {
      return NextResponse.json({ error: "emailInvalid" }, { status: 400 })
    }
  }
  if (newPassword !== undefined && newPassword.length < 6) {
    return NextResponse.json({ error: "passwordTooShort" }, { status: 400 })
  }

  // Fetch current user from DB
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, password: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // If changing password, verify currentPassword first
  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json({ error: "currentPasswordRequired" }, { status: 400 })
    }
    const valid = await compare(currentPassword, user.password)
    if (!valid) {
      return NextResponse.json({ error: "currentPasswordWrong" }, { status: 400 })
    }
  }

  // If changing email, check it's not already taken by another user
  if (email && email !== user.email) {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (existing && existing.id !== session.user.id) {
      return NextResponse.json({ error: "emailInUse" }, { status: 400 })
    }
  }

  // Build update payload
  const data: Record<string, unknown> = {}
  if (name    !== undefined) data.name  = name.trim() || null
  if (email   !== undefined) data.email = email.trim()
  if (newPassword)           data.password = await hash(newPassword, 10)

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "noChanges" }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { id: true, name: true, email: true },
  })

  return NextResponse.json({ success: true, user: updated })
}
