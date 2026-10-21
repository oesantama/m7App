import { API_URL, fetchJson } from './client';

export const adminApi = {
  getAdminTables: () => fetchJson(`${API_URL}/admin/tables`, { method: 'POST' }),
  getAdminSchema: (tableName: string) => fetchJson(`${API_URL}/admin/schema`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableName })
  }),
  getAdminData: (params: {
    tableName: string,
    page?: number,
    limit?: number,
    search?: string,
    sortBy?: string,
    sortOrder?: string,
    conditions?: any[]
  }) => fetchJson(`${API_URL}/admin/data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  }),
  executeAdminSql: (query: string) => fetchJson(`${API_URL}/admin/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  }),
  saveAdminRecord: (tableName: string, data: any, isUpdate: boolean = false) => fetchJson(`${API_URL}/admin/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableName, data, isUpdate })
  }),
  deleteAdminRecord: (tableName: string, id: any) => fetchJson(`${API_URL}/admin/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableName, id })
  }),
  bulkDeleteAdminRecords: (tableName: string, ids: any[]) => fetchJson(`${API_URL}/admin/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableName, ids })
  }),
  runAdminCron: (cronName: string) => fetchJson(`${API_URL}/admin/cron/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cronName })
  }),
  getCronLogs: () => fetchJson(`${API_URL}/admin/cron/logs`),
  getAdminPendingDriveCount: () => fetchJson(`${API_URL}/admin/cron/pending-drive`),
};
