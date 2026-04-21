
import * as XLSX from 'xlsx';

/**
 * Export data to an Excel file (.xlsx)
 * @param data Array of objects representing the rows
 * @param fileName Name of the file to save (without extension)
 * @param sheetName Name of the sheet inside the workbook
 */
export const exportToExcel = (data: any[], fileName: string, sheetName: string = 'Sheet1') => {
    if (!data || data.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Generate buffer
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

/**
 * Formats headers for human-readable names if needed
 * @param data Array of objects
 * @param mapping Key-Value mapping for header transformation
 */
export const exportToExcelWithMapping = (data: any[], fileName: string, mapping: Record<string, string>, sheetName: string = 'Sheet1') => {
    if (!data || data.length === 0) return;

    const mappedData = data.map(item => {
        const newItem: any = {};
        Object.entries(mapping).forEach(([key, label]) => {
            if (item[key] !== undefined) {
                newItem[label] = item[key];
            }
        });
        return newItem;
    });

    exportToExcel(mappedData, fileName, sheetName);
};
