import { useCallback, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { API_URL } from './constants';

export function useDocumentsApi() {
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get(`${API_URL}/files/documents/tree`);
      setFolders(Array.isArray(data?.folders) ? data.folders : []);
      setFiles(Array.isArray(data?.files) ? data.files : []);
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.error || 'Failed to load documents');
      setFolders([]);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const createFolder = useCallback(async (name, parentId) => {
    await axios.post(`${API_URL}/files/documents/folders`, { name, parentId });
    toast.success('Folder created');
    await refresh();
  }, [refresh]);

  const renameFolder = useCallback(async (folderId, name) => {
    await axios.patch(`${API_URL}/files/documents/folders/${folderId}`, { name });
    toast.success('Folder renamed');
    await refresh();
  }, [refresh]);

  const deleteFolderRecursive = useCallback(async (folderId) => {
    await axios.delete(`${API_URL}/files/documents/folders/${folderId}?recursive=true`);
    toast.success('Folder deleted');
    await refresh();
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
    await refresh();
  }, [refresh]);

  const moveFile = useCallback(async (fileId, folderId) => {
    await axios.patch(`${API_URL}/files/${fileId}`, { folderId: folderId || null });
    toast.success('Moved');
    await refresh();
  }, [refresh]);

  const renameFile = useCallback(async (fileId, originalName) => {
    await axios.patch(`${API_URL}/files/${fileId}`, { originalName });
    toast.success('File renamed');
    await refresh();
  }, [refresh]);

  const deleteFile = useCallback(async (fileId) => {
    await axios.delete(`${API_URL}/files/${fileId}`);
    toast.success('File deleted');
    await refresh();
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
