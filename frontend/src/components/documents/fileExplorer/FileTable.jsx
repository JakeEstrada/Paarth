import { Box, IconButton, Typography } from '@mui/material';
import PictureAsPdf from '@mui/icons-material/PictureAsPdf';
import Description from '@mui/icons-material/Description';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import Folder from '@mui/icons-material/Folder';
import Download from '@mui/icons-material/Download';
import { DataGrid } from '@mui/x-data-grid';
import { format } from 'date-fns';
import { FILE_DRAG_MIME } from './constants';

function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
}

function typeIcon(row) {
  if (row.kind === 'folder') {
    return <Folder sx={{ fontSize: 20, color: 'warning.light' }} />;
  }
  const mt = row.mimetype || '';
  if (mt === 'application/pdf') return <PictureAsPdf sx={{ fontSize: 20, color: 'error.light' }} />;
  if (mt.startsWith('image/')) return <ImageOutlined sx={{ fontSize: 20, color: 'info.light' }} />;
  if (mt === 'text/plain') return <Description sx={{ fontSize: 20, color: 'primary.light' }} />;
  return <InsertDriveFileOutlined sx={{ fontSize: 20, color: 'text.secondary' }} />;
}

function typeLabel(row) {
  if (row.kind === 'folder') return 'Folder';
  const mt = row.mimetype || '';
  if (mt === 'application/pdf') return 'PDF';
  if (mt.startsWith('image/')) return 'Image';
  if (mt === 'text/plain') return 'Text';
  if (mt.includes('word')) return 'Document';
  if (mt.includes('sheet') || mt.includes('excel')) return 'Spreadsheet';
  if (mt) return mt.split('/').pop() || 'File';
  return 'File';
}

function NoRowsOverlay() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', py: 6, px: 2 }}>
      <InsertDriveFileOutlined sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
      <Typography variant="body2" color="text.secondary" align="center">
        This folder is empty. Upload a file or create a folder from the toolbar.
      </Typography>
    </Box>
  );
}

/**
 * @param {{
 *   rows: object[],
 *   loading: boolean,
 *   selectionModel: string[],
 *   onSelectionModelChange: (ids: string[]) => void,
 *   onOpenRow: (row: object) => void,
 *   onDownloadFile: (row: object) => void,
 *   onContextMenuRow: (event: MouseEvent, row: object) => void,
 *   onDropFileOnFolderRow: (fileId: string, folderId: string) => void,
 *   onFileDragStart: () => void,
 *   onFileDragEnd: () => void,
 *   onFolderRowDragEnter: (folderId: string) => void,
 *   activeDropFolderId: string | null,
 * }} props
 */
export default function FileTable({
  rows,
  loading,
  selectionModel,
  onSelectionModelChange,
  onOpenRow,
  onDownloadFile,
  onContextMenuRow,
  onDropFileOnFolderRow,
  onFileDragStart,
  onFileDragEnd,
  onFolderRowDragEnter,
  activeDropFolderId,
}) {
  const columns = [
    {
      field: 'name',
      headerName: 'Name',
      flex: 1.4,
      minWidth: 220,
      sortable: true,
      renderCell: (params) => (
        <Box
          component="span"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
            width: '100%',
          }}
          draggable={params.row.kind === 'file'}
          onDragStart={(e) => {
            if (params.row.kind !== 'file') return;
            e.dataTransfer.setData(FILE_DRAG_MIME, params.row.entityId);
            e.dataTransfer.effectAllowed = 'move';
            onFileDragStart();
          }}
          onDragEnd={() => onFileDragEnd()}
          onDragOver={(e) => {
            if (params.row.kind !== 'folder') return;
            if (![...e.dataTransfer.types].includes(FILE_DRAG_MIME)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDragEnter={(e) => {
            if (params.row.kind !== 'folder') return;
            if (![...e.dataTransfer.types].includes(FILE_DRAG_MIME)) return;
            e.preventDefault();
            onFolderRowDragEnter(params.row.entityId);
          }}
          onDrop={(e) => {
            if (params.row.kind !== 'folder') return;
            const fileId = e.dataTransfer.getData(FILE_DRAG_MIME);
            if (!fileId) return;
            e.preventDefault();
            onDropFileOnFolderRow(fileId, params.row.entityId);
            onFileDragEnd();
          }}
          title={params.row.kind === 'folder' ? 'Drop file here to move' : ''}
        >
          {typeIcon(params.row)}
          <Typography variant="body2" noWrap title={params.row.name}>
            {params.row.name}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'typeLabel',
      headerName: 'Type',
      width: 120,
      valueGetter: (_value, row) => typeLabel(row),
    },
    {
      field: 'sizeLabel',
      headerName: 'Size',
      width: 110,
      sortable: true,
    },
    {
      field: 'modifiedLabel',
      headerName: 'Modified',
      width: 168,
      sortable: true,
    },
    {
      field: 'actions',
      headerName: '',
      width: 72,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) =>
        params.row.kind === 'file' ? (
          <IconButton size="small" onClick={() => onDownloadFile(params.row)} aria-label="Download">
            <Download fontSize="small" />
          </IconButton>
        ) : null,
    },
  ];

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      loading={loading}
      getRowId={(row) => row.id}
      getRowClassName={(params) =>
        params.row.kind === 'folder' && activeDropFolderId === params.row.entityId ? 'drop-target-row' : ''
      }
      checkboxSelection
      disableRowSelectionOnClick
      rowSelectionModel={{ type: 'include', ids: new Set(selectionModel) }}
      onRowSelectionModelChange={(model) => onSelectionModelChange(model?.ids ? [...model.ids] : [])}
      onRowDoubleClick={(params) => {
        onOpenRow(params.row);
      }}
      onRowContextMenu={(params, event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenuRow(event, params.row);
      }}
      hideFooter
      slots={{ noRowsOverlay: NoRowsOverlay }}
      sx={{
        border: 'none',
        flex: 1,
        height: '100%',
        minHeight: 320,
        '& .MuiDataGrid-columnHeaders': { bgcolor: 'action.hover' },
        '& .drop-target-row': {
          bgcolor: 'action.selected',
          outline: '1px dashed',
          outlineColor: 'primary.main',
          outlineOffset: '-1px',
        },
        '& .MuiDataGrid-cell': {
          py: 0.75,
        },
      }}
    />
  );
}

export { formatBytes, typeLabel };
