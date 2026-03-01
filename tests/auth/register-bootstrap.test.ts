import test from "node:test"
import assert from "node:assert/strict"

import { PrismaClient, SystemRole } from "@prisma/client"

const testDatabaseUrl = process.env.BOOTSTRAP_TEST_DATABASE_URL

if (!testDatabaseUrl) {
  test("bootstrap registration test skipped without BOOTSTRAP_TEST_DATABASE_URL", (t) => {
    t.skip("Set BOOTSTRAP_TEST_DATABASE_URL to run bootstrap registration integration test")
  })
} else {
  test("first registered user becomes SUPER_ADMIN even without allow_registration setting", async () => {
    process.env.DATABASE_URL = testDatabaseUrl

    const { POST } = await import("@/app/api/auth/register/route")
    const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } })

    try {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "Session", "Account", "StoreUser", "Store", "User", "AppSetting" RESTART IDENTITY CASCADE')

      const response = await POST(
        new Request("http://localhost:3000/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Bootstrap Admin",
            email: "bootstrap@example.com",
            password: "secret123",
          }),
        })
      )

      assert.equal(response.status, 201)

      const createdUser = await prisma.user.findUnique({
        where: { email: "bootstrap@example.com" },
      })

      assert.ok(createdUser)
      assert.equal(createdUser?.systemRole, SystemRole.SUPER_ADMIN)
    } finally {
      await prisma.$disconnect()
    }
  })
}
