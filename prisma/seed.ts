import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding payment gateways...')

  const gateways = [
    {
      name: 'stripe',
      displayName: 'Stripe',
      feePercentage: 2.9,
      feeFixed: 0.30,
      isActive: true,
    },
    {
      name: 'paypal',
      displayName: 'PayPal',
      feePercentage: 2.99,
      feeFixed: 0.49,
      isActive: true,
    },
    {
      name: 'square',
      displayName: 'Square',
      feePercentage: 2.6,
      feeFixed: 0.10,
      isActive: true,
    },
    {
      name: 'authorize_net',
      displayName: 'Authorize.Net',
      feePercentage: 2.9,
      feeFixed: 0.30,
      isActive: true,
    },
    {
      name: 'braintree',
      displayName: 'Braintree',
      feePercentage: 2.9,
      feeFixed: 0.30,
      isActive: true,
    },
    {
      name: 'shopify_payments',
      displayName: 'Shopify Payments',
      feePercentage: 2.9,
      feeFixed: 0.30,
      isActive: true,
    },
  ]

  for (const gateway of gateways) {
    await prisma.paymentGateway.upsert({
      where: { name: gateway.name },
      update: gateway,
      create: gateway,
    })
    console.log(`✓ ${gateway.displayName}`)
  }

  console.log('Seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
