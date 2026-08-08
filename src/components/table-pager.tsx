import { Button } from '@/components/ui/button'

export function TablePager({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
}) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        Page {page} / {totalPages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={onPrev}>
          Précédent
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={onNext}>
          Suivant
        </Button>
      </div>
    </div>
  )
}
