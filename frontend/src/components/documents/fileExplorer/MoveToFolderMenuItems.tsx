import { useCallback, useMemo, useRef, useState } from 'react';
import { Menu, MenuItem, Typography } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

type FolderRecord = { _id: unknown; name?: string; parentId?: unknown };
type MoveRow = { kind: 'file' | 'folder'; entityId: string; name?: string };
type Destination = { id: string; path: string };

function parentFolderKey(folder: FolderRecord | null | undefined): string | null {
  if (!folder?.parentId) return null;
  const p = folder.parentId;
  return typeof p === 'object' && p !== null && '_id' in p
    ? String((p as { _id: unknown })._id)
    : String(p);
}

export function getFolderDescendantIds(folderId: string, folders: FolderRecord[]): Set<string> {
  const childByParent = new Map<string, string[]>();
  for (const f of folders) {
    const pid = parentFolderKey(f) || '';
    if (!childByParent.has(pid)) childByParent.set(pid, []);
    childByParent.get(pid)!.push(String(f._id));
  }
  const visited = new Set<string>([String(folderId)]);
  const queue = [String(folderId)];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const child of childByParent.get(cur) || []) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push(child);
      }
    }
  }
  return visited;
}

function buildMoveDestinations(
  row: MoveRow,
  folders: FolderRecord[],
  folderPathById: Map<string, string>
): Destination[] {
  const excluded = new Set<string>();
  if (row.kind === 'folder') {
    getFolderDescendantIds(row.entityId, folders).forEach((id) => excluded.add(id));
  }

  const destinations: Destination[] = [{ id: '', path: 'Root' }];
  for (const folder of folders) {
    const id = String(folder._id);
    if (excluded.has(id)) continue;
    destinations.push({
      id,
      path: folderPathById.get(id) || folder.name || 'Folder',
    });
  }

  destinations.sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { sensitivity: 'base' })
  );
  return destinations;
}

type Props = {
  row: MoveRow;
  folders: FolderRecord[];
  folderPathById: Map<string, string>;
  contextMenuOpen: boolean;
  onMove: (destinationFolderId: string | null) => void | Promise<void>;
  onCloseParent: () => void;
};

export default function MoveToFolderMenuItems({
  row,
  folders,
  folderPathById,
  contextMenuOpen,
  onMove,
  onCloseParent,
}: Props) {
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submenuAnchor, setSubmenuAnchor] = useState<HTMLElement | null>(null);
  const [submenuOpen, setSubmenuOpen] = useState(false);

  const destinations = useMemo(
    () => buildMoveDestinations(row, folders, folderPathById),
    [row, folders, folderPathById]
  );

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openSubmenu = useCallback(
    (anchor: HTMLElement) => {
      clearCloseTimer();
      setSubmenuAnchor(anchor);
      setSubmenuOpen(true);
    },
    [clearCloseTimer]
  );

  const scheduleCloseSubmenu = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      setSubmenuOpen(false);
      setSubmenuAnchor(null);
    }, 200);
  }, [clearCloseTimer]);

  const handlePick = useCallback(
    async (destinationId: string) => {
      clearCloseTimer();
      setSubmenuOpen(false);
      setSubmenuAnchor(null);
      await onMove(destinationId || null);
      onCloseParent();
    },
    [clearCloseTimer, onMove, onCloseParent]
  );

  const submenuVisible = contextMenuOpen && submenuOpen && Boolean(submenuAnchor);

  return (
    <>
      <MenuItem
        onMouseEnter={(e) => openSubmenu(e.currentTarget)}
        onMouseLeave={scheduleCloseSubmenu}
        sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, minWidth: 180 }}
      >
        Move to
        <ChevronRightIcon fontSize="small" sx={{ color: 'text.secondary' }} />
      </MenuItem>
      <Menu
        anchorEl={submenuAnchor}
        open={submenuVisible}
        onClose={() => {
          clearCloseTimer();
          setSubmenuOpen(false);
          setSubmenuAnchor(null);
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        disableAutoFocus
        disableEnforceFocus
        slotProps={{
          paper: {
            onMouseEnter: clearCloseTimer,
            onMouseLeave: scheduleCloseSubmenu,
            sx: { maxHeight: 400, minWidth: 240, maxWidth: 420 },
          },
        }}
      >
        {destinations.map((dest) => (
          <MenuItem
            key={dest.id || 'root'}
            dense
            onClick={() => handlePick(dest.id)}
            title={dest.path}
          >
            <Typography variant="body2" noWrap sx={{ width: '100%' }}>
              {dest.path}
            </Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
