'use client'

import { cn } from '@/lib/utils'

interface BaseProps {
  label: string
  optional?: boolean
  className?: string
}

export function TextField({
  label,
  optional,
  className,
  ...props
}: BaseProps & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn('block', className)}>
      <span className="label-base">
        {label}
        {optional && <span className="font-normal normal-case text-text-muted"> (optional)</span>}
        {props.required && <span className="text-fail"> *</span>}
      </span>
      <input className="input-base" {...props} />
    </label>
  )
}

export function TextAreaField({
  label,
  optional,
  className,
  ...props
}: BaseProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={cn('block', className)}>
      <span className="label-base">
        {label}
        {optional && <span className="font-normal normal-case text-text-muted"> (optional)</span>}
      </span>
      <textarea className="input-base min-h-[88px] resize-y" {...props} />
    </label>
  )
}

export function SelectField({
  label,
  optional,
  className,
  options,
  placeholder,
  ...props
}: BaseProps & { options: readonly string[]; placeholder?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={cn('block', className)}>
      <span className="label-base">
        {label}
        {optional && <span className="font-normal normal-case text-text-muted"> (optional)</span>}
        {props.required && <span className="text-fail"> *</span>}
      </span>
      <select className="input-base" {...props}>
        <option value="">{placeholder ?? 'Select…'}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
