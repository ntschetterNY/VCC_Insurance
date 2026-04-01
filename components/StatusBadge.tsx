interface StatusBadgeProps {
  status: string
}

const statusStyles: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  reviewing: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  reviewing: 'Reviewing',
  approved: 'Approved',
  rejected: 'Rejected',
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] ?? 'bg-gray-100 text-gray-800'
  const label = statusLabels[status] ?? status

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  )
}
