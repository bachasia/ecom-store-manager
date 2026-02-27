"use client"

import CustomSelect from "@/components/ui/custom-select"

export type DatePreset = 'today' | 'yesterday' | 'mtd' | 'last7' | 'last30' | 'lastMonth' | 'lastYear' | 'allTime' | 'custom'

interface DateRangeSelectProps {
  value: DatePreset
  onChange: (value: DatePreset) => void
  options: Array<{ value: DatePreset; label: string }>
  className?: string
}

export default function DateRangeSelect({ value, onChange, options, className = "" }: DateRangeSelectProps) {
  return (
    <CustomSelect
      value={value}
      onChange={(v) => onChange(v as DatePreset)}
      options={options}
      className={className}
    />
  )
}
