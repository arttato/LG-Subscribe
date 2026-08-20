import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const xlsxPath = path.join(ROOT, 'xlsx', 'Promotion Aug_01-31 Aug 2026_Master_Update_13.08.2026 (3).xlsx');
const wb = XLSX.readFile(xlsxPath);

// Master price map: model -> { "yearsY_type|term": {years, type, term, price} }
const allPrices = {};

function addPrice(model, years, type, term, price) {
  model = String(model || '').trim();
  if (!model || !/^[A-Z]{2}/.test(model)) return;
  if (typeof price !== 'number' || price < 50) return;
  type = String(type || '').trim();
  if (!/Visit|Self|Warranty|No/i.test(type)) return;
  
  const key = years + 'Y_' + type + '|' + term;
  if (!allPrices[model]) allPrices[model] = {};
  if (!allPrices[model][key]) {
    allPrices[model][key] = { years, type: 'Y_' + type, term, price };
  }
}

// Sheet 1: RAW_Common - col F=actual, col K=years, col L=type, col M=term, col N=price
{
  const ws = wb.Sheets['2608_RAW_Common (3)'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    addPrice(row[5], row[10], row[11], row[12], row[13]);
  }
}

// Sheet 2: RAW_New PTO - col E=actual, col J=years, col K=type, col L=term, col M=price
{
  const ws = wb.Sheets['2608_RAW_New PTO'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    addPrice(row[4], row[9], row[10], row[11], row[12]);
  }
}

// Sheet 3: Water Purifier - col C=model, col J=Visit price (5Y 7Y always 6M)
{
  const ws = wb.Sheets['Price Aug_Water Purifier'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let headerRow = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    if (String(data[i][2] || '').includes('Model')) { headerRow = i; break; }
  }
  if (headerRow >= 0) {
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];
      const model = String(row[2] || '').trim();
      const visitPrice = row[9]; // col J = Visit 5Y 7Y price
      const selfPrice = row[17]; // col R = Self price
      if (model && typeof visitPrice === 'number' && visitPrice > 50) {
        addPrice(model, 7, 'Visit', 6, visitPrice);
      }
      if (model && typeof selfPrice === 'number' && selfPrice > 50) {
        addPrice(model, 7, 'Self', 6, selfPrice);
      }
    }
  }
}

// Sheet 4: REF, WM, Styler,DW,MWO - col D=model, col K=term, col L=price
{
  const ws = wb.Sheets['REF, WM, Styler,DW,MWO'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const model = String(row[3] || '').trim();
    const term = String(row[10] || '').trim();
    const price = row[11];
    if (model && typeof price === 'number' && price > 50 && /^\d+M$/.test(term)) {
      addPrice(model, 5, 'Visit', parseInt(term), price);
    }
  }
}

// Sheet 5: VCC, AP, Dehumidifier - col D=model, col I=term, col J=price
{
  const ws = wb.Sheets['VCC, AP, Dehumidifier'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const model = String(row[3] || '').trim();
    const term = String(row[8] || '').trim();
    const price = row[9];
    if (model && typeof price === 'number' && price > 50 && /^\d+M$/.test(term)) {
      addPrice(model, 5, 'Visit', parseInt(term), price);
    }
  }
}

// Sheet 6: RAC, SAC - col D=model, col K=term, col L=price
{
  const ws = wb.Sheets['RAC, SAC'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const model = String(row[3] || '').trim();
    const term = String(row[11] || '').trim();
    const price = row[12];
    if (model && typeof price === 'number' && price > 50 && /^\d+M$/.test(term)) {
      addPrice(model, 5, 'Visit', parseInt(term), price);
    }
  }
}

console.log('Total Excel models:', Object.keys(allPrices).length);

// Now update products.json
const prodPath = path.join(ROOT, 'src', 'data', 'products.json');
const prodData = JSON.parse(fs.readFileSync(prodPath, 'utf8'));

let updated = 0;
let noMatch = 0;
const changes = [];

for (const p of prodData.products) {
  const excelPols = allPrices[p.code];
  if (!excelPols) { noMatch++; continue; }
  
  for (const pol of p.policies) {
    if (/^2Y/.test(pol.policy)) continue;
    const key = pol.policy + '|' + pol.term;
    const excelPol = excelPols[key];
    if (excelPol && excelPol.price !== pol.price) {
      changes.push({ code: p.code, policy: pol.policy, term: pol.term, old: pol.price, new: excelPol.price });
      pol.price = excelPol.price;
      updated++;
    }
  }
}

fs.writeFileSync(prodPath, JSON.stringify(prodData, null, 2));

console.log('\nPrice updates:', updated);
console.log('No match:', noMatch);
if (changes.length > 0) {
  console.log('\nChanges:');
  for (const c of changes) {
    console.log('  ' + c.code + ': ' + c.policy + ' term=' + c.term + ' ' + c.old + ' → ' + c.new);
  }
}
