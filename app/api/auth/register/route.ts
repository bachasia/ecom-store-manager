import { NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { Prisma, SystemRole } from "@prisma/client"
import { z } from "zod"

const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password, name } = registerSchema.parse(body)

    // Hash password
    const hashedPassword = await hash(password, 12)

    const result = await prisma.$transaction(
      async (tx) => {
        const userCount = await tx.user.count()

        if (userCount > 0) {
          const registrationSetting = await tx.appSetting.findUnique({
            where: { key: "allow_registration" },
          })

          if (registrationSetting?.value !== "true") {
            return {
              error: "Registration is currently disabled. Please contact the administrator.",
              status: 403,
            }
          }
        }

        const existingUser = await tx.user.findUnique({
          where: { email },
        })

        if (existingUser) {
          return {
            error: "Email already in use",
            status: 400,
          }
        }

        const isFirstUser = userCount === 0

        const user = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            name: name || null,
            systemRole: isFirstUser ? SystemRole.SUPER_ADMIN : SystemRole.USER,
          },
        })

        return { user }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    )

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(
      {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
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

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "Email already in use" },
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
