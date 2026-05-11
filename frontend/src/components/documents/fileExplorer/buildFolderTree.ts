import { ROOT_TREE_ID } from './constants';

/**
 * @param {Array<{ _id: unknown, name?: string, parentId?: unknown }>} folders
 * @returns {{ id: string, name: string, record: object | null, children: Array }[]}
 */
export function buildArboristFolderData(folders) {
  const byParent = new Map();
  for (const f of folders) {
    const pid = f.parentId ? String(f.parentId) : 'ROOT';
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(f);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  }

  function build(parentKey) {
    const list = byParent.get(parentKey) || [];
    return list.map((folder) => {
      const id = String(folder._id);
      const children = build(id);
      return {
        id,
        name: folder.name || 'Untitled',
        record: folder,
        children,
      };
    });
  }

  const rootChildren = build('ROOT');
  return [
    {
      id: ROOT_TREE_ID,
      name: 'Root',
      record: null,
      children: rootChildren,
    },
  ];
}
