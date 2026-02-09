import { useState } from 'react';
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  SwapHoriz as MoveIcon,
  AddTask as AddTaskIcon,
} from '@mui/icons-material';

function JobContextMenu({ anchorEl, open, onClose, onMoveStage, onAddTask, job }) {
  const handleMoveStage = () => {
    onMoveStage();
    onClose();
  };

  const handleAddTask = () => {
    onAddTask();
    onClose();
  };

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
    </Menu>
  );
}

export default JobContextMenu;

