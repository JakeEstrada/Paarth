import { useCallback, useState } from 'react';
import { Box, Typography } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { Tree } from 'react-arborist';
import { FILE_DRAG_MIME, ROOT_TREE_ID } from './constants';

function FolderTreeNode({ node, style, dragHandle, dropTargetId, setDropTargetId, onFileDroppedOnFolder }) {
  const isRoot = node.id === ROOT_TREE_ID;
  const targetFolderId = isRoot ? null : node.id;
  const highlighted = dropTargetId === node.id;
  const Icon = node.isOpen ? FolderOpenIcon : FolderIcon;

  return (
    <Box
      style={style}
      ref={dragHandle}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes(FILE_DRAG_MIME)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={(e) => {
        if (![...e.dataTransfer.types].includes(FILE_DRAG_MIME)) return;
        e.preventDefault();
        setDropTargetId(node.id);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setDropTargetId((cur) => (cur === node.id ? null : cur));
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const fileId = e.dataTransfer.getData(FILE_DRAG_MIME);
        setDropTargetId(null);
        if (!fileId) return;
        onFileDroppedOnFolder(fileId, targetFolderId);
      }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.5,
        borderRadius: 1,
        bgcolor: highlighted ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Icon sx={{ fontSize: 18, color: 'warning.light', flexShrink: 0 }} />
      <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
        {node.data.name}
      </Typography>
    </Box>
  );
}

/**
 * @param {{
 *   treeData: object[],
 *   selectedFolderId: string | null,
 *   onFolderSelect: (id: string | null) => void,
 *   onFileDroppedOnFolder: (fileId: string, folderId: string | null) => void,
 *   width?: number,
 *   height: number,
 * }} props
 */
export default function FolderTree({
  treeData,
  selectedFolderId,
  onFolderSelect,
  onFileDroppedOnFolder,
  width = 280,
  height,
}) {
  const [dropTargetId, setDropTargetId] = useState(null);

  const Node = useCallback(
    (props) => (
      <FolderTreeNode
        {...props}
        dropTargetId={dropTargetId}
        setDropTargetId={setDropTargetId}
        onFileDroppedOnFolder={onFileDroppedOnFolder}
      />
    ),
    [dropTargetId, onFileDroppedOnFolder]
  );

  return (
    <Tree
      data={treeData}
      width={width}
      height={height}
      indent={18}
      rowHeight={34}
      overscanCount={8}
      openByDefault={false}
      initialOpenState={{ [ROOT_TREE_ID]: true }}
      selection={selectedFolderId == null ? ROOT_TREE_ID : String(selectedFolderId)}
      disableDrag
      disableDrop
      onActivate={(node) => {
        if (node.id === ROOT_TREE_ID) onFolderSelect(null);
        else onFolderSelect(String(node.id));
      }}
    >
      {Node}
    </Tree>
  );
}
