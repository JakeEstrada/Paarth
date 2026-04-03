import { useState } from 'react';
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  SwapHoriz as MoveIcon,
  AddTask as AddTaskIcon,
  Archive as ArchiveIcon,
} from '@mui/icons-material';

function JobContextMenu({ anchorEl, open, onClose, onMoveStage, onAddTask, onArchive, job }) {
  const handleMoveStage = () => {
    onMoveStage();
    onClose();
  };

  const handleAddTask = () => {
    onAddTask();
    onClose();
  };

  const handleArchive = () => {
    if (onArchive) onArchive();
    onClose();
  };

  const canArchive =
    job && onArchive && !job.isArchived && !job.isDeadEstimate;

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'right',
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
    >
      <MenuItem onClick={handleMoveStage}>
        <ListItemIcon>
          <MoveIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Move to Stage</ListItemText>
      </MenuItem>
      <MenuItem onClick={handleAddTask}>
        <ListItemIcon>
          <AddTaskIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Add Change Order / Task</ListItemText>
      </MenuItem>
      {canArchive && (
        <>
          <Divider />
          <MenuItem onClick={handleArchive}>
            <ListItemIcon>
              <ArchiveIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Archive job</ListItemText>
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

export default JobContextMenu;

