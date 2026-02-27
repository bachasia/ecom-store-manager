import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const alertSettingsSchema = z.object({
  roasThreshold: z.number().min(0).max(1000),
})

const ROAS_THRESHOLD_KEY = "roas_threshold"

// GET /api/settings/alerts
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const setting = await prisma.appSetting.findUnique({
      where: { key: `${ROAS_THRESHOLD_KEY}:${session.user.id}` },
    })

    return NextResponse.json({
      roasThreshold: setting ? parseFloat(setting.value) : 1.0,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch alert settings" },
      { status: 500 }
    )
  }
}

// PUT /api/settings/alerts
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validated = alertSettingsSchema.parse(body)

    const key = `${ROAS_THRESHOLD_KEY}:${session.user.id}`

    await prisma.appSetting.upsert({
      where: { key },
      create: {
        key,
        value: String(validated.roasThreshold),
        description: "ROAS threshold for low ROAS alerts",
      },
      update: {
        value: String(validated.roasThreshold),
      },
    })

    return NextResponse.json({
      success: true,
      roasThreshold: validated.roasThreshold,
    })
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || "Failed to update alert settings" },
      { status: 500 }
    )
  }
}
