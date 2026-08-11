import pool from '../config/database.js';

async function main() {
    const idMap = new Map<string, number>();
    const docNameMap = new Map<number, string>();

    const registerVariation = (variant: string, pedidoId: number, originalDoc: string) => {
        if (!variant) return;
        const cleanStr = String(variant).trim();
        if (!cleanStr) return;
        docNameMap.set(pedidoId, originalDoc);
        idMap.set(cleanStr.toUpperCase(), pedidoId);
        const alphaClean = cleanStr.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (alphaClean) idMap.set(alphaClean, pedidoId);
        const digitsOnly = cleanStr.replace(/\D/g, '');
        if (digitsOnly && digitsOnly.length >= 3) {
            idMap.set(digitsOnly, pedidoId);
            const noLeadingZeros = digitsOnly.replace(/^0+/, '');
            if (noLeadingZeros && noLeadingZeros.length >= 3) {
                idMap.set(noLeadingZeros, pedidoId);
            }
        }
    };

    registerVariation("FP1739", 142, "FP1739");

    console.log("idMap keys:", Array.from(idMap.keys()));

    const tessTextPage3 = `- PERRYLLANTAS S.A.S DOCUMENTO DESPACHO OFICINA PRINCIPAL: grupointer CR 25 1 ASUR 155 OF 255 No. PLFE 1738 PBX:504 4446646 NIT: 901961974-1 MEDELLÍN - COLOMBIA VENDIDO A: HECTOR JOSE MORENO MORENO FECHA FACTURA 22 07 2026 NIT: 6769013-9 TELÉFONO: 3102426824`;

    const matchTextAgainstMap = (text: string): number[] => {
        if (!text || text.length < 3) return [];
        const pageMatches = new Set<number>();
        const cleanTextUpper = text.toUpperCase();
        const cleanTextAlpha = cleanTextUpper.replace(/[^A-Z0-9]/g, '');

        const digitSequences = text.match(/\d{3,12}/g) || [];
        for (const seq of digitSequences) {
            const pid = idMap.get(seq) || idMap.get(seq.replace(/^0+/, ''));
            if (pid) pageMatches.add(pid);
        }

        const sanitizedText = cleanTextUpper
            .replace(/\b([A-Z]*)([0-9OILSBG|\s-]{3,15})([A-Z]*)\b/gi, (match) => {
                return match
                    .replace(/[O]/gi, '0')
                    .replace(/[IL|]/gi, '1')
                    .replace(/[S]/gi, '5')
                    .replace(/[B]/gi, '8')
                    .replace(/[G]/gi, '6')
                    .replace(/[\s-]/g, '');
            });

        const sanitizedDigits = sanitizedText.match(/\d{3,12}/g) || [];
        for (const seq of sanitizedDigits) {
            const pid = idMap.get(seq) || idMap.get(seq.replace(/^0+/, ''));
            if (pid) pageMatches.add(pid);
        }

        const sanitizedAlpha = sanitizedText.replace(/[^A-Z0-9]/g, '');
        for (const [key, pid] of idMap.entries()) {
            if (key.length >= 3 && (cleanTextAlpha.includes(key) || sanitizedAlpha.includes(key))) {
                pageMatches.add(pid);
            }
        }

        if (pageMatches.size === 0) {
            const allExtractedDigits = Array.from(new Set([...digitSequences, ...sanitizedDigits])).filter(s => s.length >= 4);
            for (const seq of allExtractedDigits) {
                for (const [key, pid] of idMap.entries()) {
                    if (/^\d+$/.test(key) && key.length === seq.length && key.length >= 4) {
                        let diffs = 0;
                        for (let i = 0; i < key.length; i++) {
                            if (key[i] !== seq[i]) diffs++;
                            if (diffs > 1) break;
                        }
                        if (diffs === 1) {
                            pageMatches.add(pid);
                            break;
                        }
                    }
                }
                if (pageMatches.size > 0) break;
            }
        }

        return Array.from(pageMatches);
    };

    const matches = matchTextAgainstMap(tessTextPage3);
    console.log("Matched PIDs for Page 3 text:", matches);
}

main().catch(console.error);
