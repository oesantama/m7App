import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');

export const pdfParse = async (dataBuffer: Buffer, options?: any): Promise<any> => {
    const { PDFParse } = pdfParseModule;
    if (PDFParse) {
        const opts = options || {};
        opts.data = dataBuffer;
        const p = new PDFParse(opts);
        const doc = await p.load();
        
        if (opts.pagerender) {
            const textPages: string[] = [];
            for (let i = 1; i <= doc.numPages; i++) {
                const pageData = await doc.getPage(i);
                const text = await opts.pagerender(pageData);
                textPages.push(text);
            }
            return {
                text: textPages.join('\n\n'),
                numpages: doc.numPages,
                numrender: doc.numPages,
                info: await p.getInfo(),
                metadata: null,
                version: '1.10.100'
            };
        }
        
        const res = await p.getText();
        return {
            text: res.text || '',
            numpages: doc.numPages,
            numrender: doc.numPages,
            info: await p.getInfo(),
            metadata: null,
            version: '1.10.100'
        };
    } else {
        return pdfParseModule(dataBuffer, options);
    }
};
