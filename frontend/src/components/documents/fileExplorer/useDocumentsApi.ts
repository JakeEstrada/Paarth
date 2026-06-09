import { useCallback, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  getDocumentsTreeCache,
  invalidateDocumentsTreeCache,
  setDocumentsTreeCache,
} from '../../../utils/fileListCache';
import { API_URL } from './constants';

export function useDocumentsApi() {
  const [folders, setFolders] = useState(() => getDocumentsTreeCache()?.folders ?? []);
  const [files, setFiles] = useState(() => getDocumentsTreeCache()?.files ?? []);
  const [loading, setLoading] = useState(() => !getDocumentsTreeCache());

  const refresh = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    const cached = getDocumentsTreeCache();
    if (cached && !force) {
      setFolders(cached.folders);
      setFiles(cached.files);
      setLoading(false);
    } else if (!cached) {
      setLoading(true);
    }

    try {
      const { data } = await axios.get(`${API_URL}/files/documents/tree`);
      const next = {
        folders: Array.isArray(data?.folders) ? data.folders : [],
        files: Array.isArray(data?.files) ? data.files : [],
      };
      setDocumentsTreeCache(next);
      setFolders(next.folders);
      setFiles(next.files);
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.error || 'Failed to load documents');
      if (!cached) {
        invalidateDocumentsTreeCache();
        setFolders([]);
        setFiles([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const createFolder = useCallback(async (name, parentId) => {
    await axios.post(`${API_URL}/files/documents/folders`, { name, parentId });
    toast.success('Folder created');
    await refresh({ force: true });
  }, [refresh]);

  const renameFolder = useCallback(async (folderId, name) => {
    await axios.patch(`${API_URL}/files/documents/folders/${folderId}`, { name });
    toast.success('Folder renamed');
    await refresh({ force: true });
  }, [refresh]);

  const deleteFolderRecursive = useCallback(async (folderId) => {
    await axios.delete(`${API_URL}/files/documents/folders/${folderId}?recursive=true`);
    toast.success('Folder deleted');
    await refresh({ force: true });
  }, [refresh]);

  const uploadDocument = useCallback(async (file, folderId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileType', 'other');
    if (folderId) formData.append('folderId', folderId);
    await axios.post(`${API_URL}/files/upload-document`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    toast.success('Upload complete');
    await refresh({ force: true });
  }, [refresh]);

  const moveFile = useCallback(async (fileId, folderId) => {
    await axios.patch(`${API_URL}/files/${fileId}`, { folderId: folderId || null });
    toast.success('Moved');
    await refresh({ force: true });
  }, [refresh]);

  const renameFile = useCallback(async (fileId, originalName) => {
    await axios.patch(`${API_URL}/files/${fileId}`, { originalName });
    toast.success('File renamed');
    await refresh({ force: true });
  }, [refresh]);

  const deleteFile = useCallback(async (fileId) => {
    await axios.delete(`${API_URL}/files/${fileId}`);
    toast.success('File deleted');
    await refresh({ force: true });
  }, [refresh]);

  return {
    folders,
    files,
    loading,
    refresh,
    createFolder,
    renameFolder,
    deleteFolderRecursive,
    uploadDocument,
    moveFile,
    renameFile,
    deleteFile,
  };
}
