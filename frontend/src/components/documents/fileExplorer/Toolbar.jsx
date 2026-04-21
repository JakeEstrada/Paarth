import {
  Box,
  Button,
  Stack,
  TextField,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import UploadFile from '@mui/icons-material/UploadFile';
import CreateNewFolder from '@mui/icons-material/CreateNewFolder';
import DriveFileRenameOutline from '@mui/icons-material/DriveFileRenameOutline';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Refresh from '@mui/icons-material/Refresh';
import Search from '@mui/icons-material/Search';

/**
 * @param {{
 *   searchTerm: string,
 *   onSearchChange: (v: string) => void,
 *   onUploadClick: () => void,
 *   onNewFolder: () => void,
 *   onRename: () => void,
 *   onDelete: () => void,
 *   onRefresh: () => void,
 *   uploading: boolean,
 *   renameDisabled: boolean,
 *   deleteDisabled: boolean,
 * }} props
 */
export default function Toolbar({
  searchTerm,
  onSearchChange,
  onUploadClick,
  onNewFolder,
  onRename,
  onDelete,
  onRefresh,
  uploading,
  renameDisabled,
  deleteDisabled,
}) {
  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Tooltip title="Upload into the open folder">
            <span>
              <Button
                variant="contained"
                startIcon={<UploadFile />}
                onClick={onUploadClick}
                disabled={uploading}
                sx={{ textTransform: 'none' }}
              >
                {uploading ? 'Uploading…' : 'Upload'}
              </Button>
            </span>
          </Tooltip>
          <Button variant="outlined" startIcon={<CreateNewFolder />} onClick={onNewFolder} sx={{ textTransform: 'none' }}>
            New folder
          </Button>
          <Button variant="outlined" startIcon={<DriveFileRenameOutline />} onClick={onRename} disabled={renameDisabled} sx={{ textTransform: 'none' }}>
            Rename
          </Button>
          <Button variant="outlined" color="error" startIcon={<DeleteOutline />} onClick={onDelete} disabled={deleteDisabled} sx={{ textTransform: 'none' }}>
            Delete
          </Button>
          <Button variant="text" startIcon={<Refresh />} onClick={onRefresh} sx={{ textTransform: 'none' }}>
            Refresh
          </Button>
        </Stack>
        <Box sx={{ width: { xs: '100%', sm: 320 } }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search in this folder…"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </Stack>
    </Stack>
  );
}
