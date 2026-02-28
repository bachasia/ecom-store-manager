import { NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { SystemRole } from "@prisma/client"

const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
})

export async function POST(req: Request) {
  try {
    // Nếu chưa có user nào trong DB → cho phép đăng ký user đầu tiên (bootstrap)
    const userCount = await prisma.user.count()
    if (userCount === 0) {
      // Bỏ qua setting, tiếp tục tạo user đầu tiên
    } else {
      // Kiểm tra setting cho phép đăng ký không (mặc định: tắt)
      const registrationSetting = await prisma.appSetting.findUnique({
        where: { key: "allow_registration" }
      })
      if (registrationSetting?.value !== "true") {
        return NextResponse.json(
          { error: "Registration is currently disabled. Please contact the administrator." },
          { status: 403 }
        )
      }
    }

    const body = await req.json()
    const { email, password, name } = registerSchema.parse(body)

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 400 }
      )
    }

    // Hash password
    const hashedPassword = await hash(password, 12)

    // First user becomes SUPER_ADMIN, subsequent users are regular USER
    const isFirstUser = userCount === 0

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || null,
        systemRole: isFirstUser ? SystemRole.SUPER_ADMIN : SystemRole.USER,
      }
    })

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      )
    }

    console.error("Register error:", error)
    return NextResponse.json(
      { error: "An error occurred during registration" },
      { status: 500 }
    )
  }
}
