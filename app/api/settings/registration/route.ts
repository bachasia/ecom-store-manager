import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"

const SETTING_KEY = "allow_registration"

// GET /api/settings/registration
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const setting = await prisma.appSetting.findUnique({
      where: { key: SETTING_KEY }
    })

    // Mặc định: tắt (false) nếu chưa có setting
    const allowed = setting?.value === "true"
    return NextResponse.json({ allowRegistration: allowed })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT /api/settings/registration
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { allowRegistration } = await req.json()
    if (typeof allowRegistration !== "boolean") {
      return NextResponse.json({ error: "allowRegistration must be boolean" }, { status: 400 })
    }

    await prisma.appSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: String(allowRegistration) },
      create: {
        key: SETTING_KEY,
        value: String(allowRegistration),
        description: "Allow new users to self-register. When disabled, only existing users can log in.",
      },
    })

    return NextResponse.json({
      success: true,
      allowRegistration,
      message: allowRegistration ? "Registration is now open" : "Registration is now closed",
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
