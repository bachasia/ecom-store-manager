import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const timezoneSchema = z.object({
  timezone: z.string().min(1),
})

const TIMEZONE_KEY = "default_timezone"

// GET /api/settings/timezone
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const setting = await prisma.appSetting.findUnique({
      where: { key: `${TIMEZONE_KEY}:${session.user.id}` }
    })

    return NextResponse.json({ timezone: setting?.value || "UTC" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch timezone" }, { status: 500 })
  }
}

// PUT /api/settings/timezone
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validated = timezoneSchema.parse(body)

    const key = `${TIMEZONE_KEY}:${session.user.id}`

    await prisma.appSetting.upsert({
      where: { key },
      create: {
        key,
        value: validated.timezone,
        description: "Default timezone for dashboard date presets",
      },
      update: {
        value: validated.timezone,
      }
    })

    return NextResponse.json({ success: true, timezone: validated.timezone })
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 })
    }
    return NextResponse.json({ error: error.message || "Failed to update timezone" }, { status: 500 })
  }
}
