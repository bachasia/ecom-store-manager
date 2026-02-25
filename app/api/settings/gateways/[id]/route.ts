import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateGatewaySchema = z.object({
  displayName: z.string().min(1).optional(),
  feePercentage: z.number().min(0).max(100).optional(),
  feeFixed: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
})

// GET /api/settings/gateways/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const gateway = await prisma.paymentGateway.findUnique({
      where: { id: id }
    })

    if (!gateway) {
      return NextResponse.json({ error: "Gateway not found" }, { status: 404 })
    }

    return NextResponse.json({ gateway })
  } catch (error) {
    console.error("Get gateway error:", error)
    return NextResponse.json(
      { error: "An error occurred" },
      { status: 500 }
    )
  }
}

// PUT /api/settings/gateways/[id]
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validatedData = updateGatewaySchema.parse(body)

    const gateway = await prisma.paymentGateway.update({
      where: { id: id },
      data: validatedData
    })

    return NextResponse.json({ gateway })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      )
    }

    console.error("Update gateway error:", error)
    return NextResponse.json(
      { error: "An error occurred while updating gateway" },
      { status: 500 }
    )
  }
}

// DELETE /api/settings/gateways/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await prisma.paymentGateway.delete({
      where: { id: id }
    })

    return NextResponse.json({ message: "Gateway deleted successfully" })
  } catch (error) {
    console.error("Delete gateway error:", error)
    return NextResponse.json(
      { error: "An error occurred while deleting gateway" },
      { status: 500 }
    )
  }
}
