import { parse } from 'csv-parse/sync';

export interface ExtractedMenuItem {
    name: string;
    price: number;
    category: string;
    desc?: string;
    isAvailable?: boolean;
    isActive?: boolean;
    dietaryTag?: string | null;
    sortOrder?: number;
}

/**
 * Parses OCR text into a list of menu items.
 * Look for patterns like "Item Name .... $10.00" or "Item Name 10"
 */
export function parseOCRText(text: string): ExtractedMenuItem[] {
    const lines = text.split('\n');
    const items: ExtractedMenuItem[] = [];
    
    // Improved Regex: Find anything that looks like a price (e.g. 10.00, $5, 120) 
    // and try to separate it from the item name.
    // This looks for a number at the end, optionally preceded by currency or space-separated.
    const priceWithOptionalCurrency = /([₹$]?\s*\d+(?:[.,]\d{2})?)\s*$/;

    lines.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed || trimmed.length < 3) return;

        // Clean common OCR noise like leading/trailing dots, dashes, or pipes
        trimmed = trimmed.replace(/^[|.\-\s*]+/, '').replace(/[|.\-\s*]+$/, '');

        const match = trimmed.match(priceWithOptionalCurrency);
        if (match) {
            const priceFullMatch = match[1];
            // Extract only numeric part for parsing
            const priceNumeric = priceFullMatch.replace(/[₹$\s,]/g, (match) => match === ',' ? '.' : '');
            const price = parseFloat(priceNumeric);
            
            // Item name is everything before the price
            let name = trimmed.substring(0, trimmed.length - priceFullMatch.length).trim();
            // Clean up name: remove trailing dots, dashes, and extra spaces
            name = name.replace(/[.\-_:]{2,}/g, ' ').replace(/\s{2,}/g, ' ').trim();
            
            if (name && name.length > 2 && !isNaN(price)) {
                items.push({
                    name,
                    price,
                    category: 'Uncategorized',
                });
            }
        }
    });

    return items;
}

/**
 * Parses CSV buffer into a list of menu items.
 * Expected columns: category, name, price, desc, dietaryTag, isAvailable, isActive, sortOrder
 */
export function parseCSVMenu(buffer: Buffer): ExtractedMenuItem[] {
    const records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });

    const parseBool = (val: any, defaultVal: boolean) => {
        if (!val) return defaultVal;
        const s = String(val).toLowerCase().trim();
        if (s === 'yes' || s === 'true' || s === '1' || s === 'y') return true;
        if (s === 'no' || s === 'false' || s === '0' || s === 'n') return false;
        return defaultVal;
    };

    return records.map((r: any) => ({
        name: r.name || r.item || 'Unknown Item',
        price: parseFloat(r.price) || 0,
        category: r.category || 'General',
        desc: r.description || r.desc || '',
        isAvailable: parseBool(r.isAvailable, true),
        isActive: parseBool(r.isActive, true),
        dietaryTag: r.dietaryTag ? r.dietaryTag.toUpperCase() : null,
        sortOrder: parseInt(r.sortOrder) || 0,
    }));
}
