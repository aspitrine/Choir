import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Input } from '@/shared/ui/primitives/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/primitives/table'
import { TablePager } from '@/shared/ui/table-pager'
import { songQueries } from '@/features/songs/ui/queries'
import { useSearchPaging } from '@/shared/ui/hooks/use-search-paging'

export function AddSongTable({
  excludeSongIds,
  onAdd,
}: {
  excludeSongIds: Set<string>
  onAdd: (songId: string) => Promise<void>
}) {
  const { searchInput, setSearchInput, params, setPage } = useSearchPaging()
  const page = params.page
  const { data: result } = useQuery(songQueries.list(params))
  const [addingId, setAddingId] = useState<string | null>(null)

  const rows = (result?.rows ?? []).filter((s) => !excludeSongIds.has(s.id))
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 1)))

  return (
    <div className="space-y-3">
      <Input
        value={searchInput}
        placeholder="Rechercher un titre ou compositeur…"
        onChange={(e) => setSearchInput(e.target.value)}
        autoFocus
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Titre</TableHead>
            <TableHead>Compositeur</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((song) => (
            <TableRow
              key={song.id}
              className="cursor-pointer"
              onClick={async () => {
                setAddingId(song.id)
                await onAdd(song.id)
                setAddingId(null)
              }}
            >
              <TableCell className="font-medium">
                {song.title}
                {addingId === song.id ? (
                  <span className="ml-2 text-xs text-muted-foreground">ajout…</span>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground">{song.composer}</TableCell>
            </TableRow>
          ))}
          {result && rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground">
                Aucun résultat
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      <TablePager page={page} totalPages={totalPages} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
    </div>
  )
}
