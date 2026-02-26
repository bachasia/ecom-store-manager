import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const gatewaySchema = z.object({
  name: z.string().min(1, "Gateway name is required"),
  displayName: z.string().min(1, "Display name is required"),
  matchKeywords: z.string().optional(),
  feePercentage: z.number().min(0).max(100),
  feeFixed: z.number().min(0),
  isActive: z.boolean().default(true),
})

// GET /api/settings/gateways - List all payment gateways
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const gateways = await prisma.paymentGateway.findMany({
      orderBy: {
        name: 'asc'
      }
    })

    return NextResponse.json({ gateways })
  } catch (error) {
    console.error("Get gateways error:", error)
    return NextResponse.json(
      { error: "An error occurred while fetching payment gateways" },
      { status: 500 }
    )
  }
}

// POST /api/settings/gateways - Create new payment gateway
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validatedData = gatewaySchema.parse(body)

    // Check if gateway name already exists
    const existing = await prisma.paymentGateway.findUnique({
      where: { name: validatedData.name }
    })

    if (existing) {
      return NextResponse.json(
        { error: "Gateway with this name already exists" },
        { status: 400 }
      )
    }

    const gateway = await prisma.paymentGateway.create({
      data: validatedData
    })

    return NextResponse.json({ gateway }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      )
    }

    console.error("Create gateway error:", error)
    return NextResponse.json(
      { error: "An error occurred while creating payment gateway" },
      { status: 500 }
    )
  }
}
