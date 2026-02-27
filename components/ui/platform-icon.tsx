import Image from "next/image"

const PLATFORM_ICONS: Record<string, string> = {
  shopbase: "/platform/shopbase-logo32.png",
  woocommerce: "/platform/woocommerce-logo32.png",
}

interface PlatformIconProps {
  platform: string
  size?: number
  className?: string
}

export default function PlatformIcon({ platform, size = 16, className = "" }: PlatformIconProps) {
  const src = PLATFORM_ICONS[platform]
  if (!src) return null
  return (
    <Image
      src={src}
      alt={platform}
      width={size}
      height={size}
      className={`inline-block rounded-sm shrink-0 ${className}`}
    />
  )
}
