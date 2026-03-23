import { parse } from 'csv-parse/sync';

export interface ExtractedMenuItem {
    name: string;
    price: number;
    category: string;
    desc?: string;
}

/**
 * Parses OCR text into a list of menu items.
 * Look for patterns like "Item Name .... $10.00" or "Item Name 10"
 */
export function parseOCRText(text: string): ExtractedMenuItem[] {
    const lines = text.split('\n');
    const items: ExtractedMenuItem[] = [];
    
    // Regex to find price at the end of a line (handles $, decimal, or just numbers)
    // Matches: "Burger 10.99", "Pasta $15", "Pizza 12"
    const priceRegex = /([0-9]+(?:[.,][0-9]{2})?)\s*$/;

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length < 3) return;

        const match = trimmed.match(priceRegex);
        if (match) {
            const priceStr = match[1].replace(',', '.');
            const price = parseFloat(priceStr);
            const name = trimmed.replace(match[0], '').trim().replace(/[._-]{2,}/g, ''); // Remove trailing price and dots/dashes
            
            if (name && !isNaN(price)) {
                items.push({
                    name,
                    price,
                    category: 'Uncategorized', // Default category for OCR
                });
            }
        }
    });

    return items;
}

/**
 * Parses CSV buffer into a list of menu items.
 * Expected columns: name, price, category, description
 */
export function parseCSVMenu(buffer: Buffer): ExtractedMenuItem[] {
    const records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });

    return records.map((r: any) => ({
        name: r.name || r.item || 'Unknown Item',
        price: parseFloat(r.price) || 0,
        category: r.category || 'General',
        desc: r.description || r.desc || '',
    }));
}
