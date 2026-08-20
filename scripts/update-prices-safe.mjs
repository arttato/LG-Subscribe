import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wb = XLSX.readFile(path.join(ROOT, 'xlsx', 'Promotion Aug_01-31 Aug 2026_Master_Update_13.08.2026 (3).xlsx'));

// Build price map: fullCode -> { "policy|term": price }
const excelPrices = {};

function add(model, policy, term, price) {
  model = String(model || '').trim();
  if (!model || !/^[A-Z]{2}/.test(model)) return;
  if (typeof price !== 'number' || price < 50) return;
  if (!excelPrices[model]) excelPrices[model] = {};
  const key = policy + '|' + term;
  if (!excelPrices[model][key]) excelPrices[model][key] = price;
}

// 1) RAW_Common — col F=model, col K=years, col L=type, col M=term, col N=price
{
  const data = XLSX.utils.sheet_to_json(wb.Sheets['2608_RAW_Common (3)'], { header: 1, defval: '' });
  for (let i = 3; i < data.length; i++) {
    const r = data[i];
    const model = String(r[5] || '').trim();
    const yr = r[10], type = String(r[11] || '').trim(), term = r[12], price = r[13];
    if (/Visit|Self/i.test(type) && typeof price === 'number' && price > 50) {
      add(model, yr + 'Y_' + type, term, price);
    }
  }
}

// 2) RAW_New PTO — col E=model, col J=years, col K=type, col L=term, col M=price
{
  const data = XLSX.utils.sheet_to_json(wb.Sheets['2608_RAW_New PTO'], { header: 1, defval: '' });
  for (let i = 3; i < data.length; i++) {
    const r = data[i];
    const model = String(r[4] || '').trim();
    const yr = r[9], type = String(r[10] || '').trim(), term = r[11], price = r[12];
    if (/Visit|Self/i.test(type) && typeof price === 'number' && price > 50) {
      add(model, yr + 'Y_' + type, term, price);
    }
  }
}

// 3) Water Purifier — col C=model, col I=term, col J=Visit, col R=Self (7Y only)
{
  const data = XLSX.utils.sheet_to_json(wb.Sheets['Price Aug_Water Purifier'], { header: 1, defval: '' });
  let hdr = -1;
  for (let i = 0; i < 10; i++) { if (String(data[i][2]||'').includes('Model')) { hdr = i; break; } }
  if (hdr >= 0) {
    for (let i = hdr + 1; i < data.length; i++) {
      const r = data[i];
      const model = String(r[2] || '').trim();
      const term = parseInt(String(r[8] || '6').replace('M', '')) || 6;
      const visit = r[9], self = r[17];
      if (model && typeof visit === 'number' && visit > 50) add(model, '7Y_Visit', term, visit);
      if (model && typeof self === 'number' && self > 50) add(model, '7Y_Self', term, self);
    }
  }
}

// 4) TV, MNT, AV — col B=model, col H=monthly fee (5Y only)
{
  const data = XLSX.utils.sheet_to_json(wb.Sheets['TV, MNT, AV'], { header: 1, defval: '' });
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const model = String(r[1] || '').trim();
    const price = r[7];
    if (model && /^[A-Z0-9]/.test(model) && typeof price === 'number' && price > 50) {
      add(model, '5Y', '', price);
    }
  }
}

// 5) RAC, SAC — col D=model, col L=term, col M=price
{
  const data = XLSX.utils.sheet_to_json(wb.Sheets['RAC, SAC'], { header: 1, defval: '' });
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const model = String(r[3] || '').trim();
    const term = parseInt(String(r[11] || '').replace('M', '')) || 6;
    const price = r[12];
    if (model && typeof price === 'number' && price > 50) add(model, '5Y_Visit', term, price);
  }
}

// 6) VCC, AP, Dehumidifier — col D=model, col I=term, col J=price
{
  const data = XLSX.utils.sheet_to_json(wb.Sheets['VCC, AP, Dehumidifier'], { header: 1, defval: '' });
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const model = String(r[3] || '').trim();
    const term = parseInt(String(r[8] || '').replace('M', '')) || 12;
    const price = r[9];
    if (model && typeof price === 'number' && price > 50) add(model, '5Y_Visit', term, price);
  }
}

// 7) REF, WM, Styler — col D=model, col K=term, col L=price
{
  const data = XLSX.utils.sheet_to_json(wb.Sheets['REF, WM, Styler,DW,MWO'], { header: 1, defval: '' });
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const model = String(r[3] || '').trim();
    const term = parseInt(String(r[10] || '').replace('M', '')) || 12;
    const price = r[11];
    if (model && typeof price === 'number' && price > 50) add(model, '5Y_Visit', term, price);
  }
}

console.log('Excel prices:', Object.keys(excelPrices).length, 'models');

// Update products.json — ONLY exact code matches
const prodPath = path.join(ROOT, 'src', 'data', 'products.json');
const prodData = JSON.parse(fs.readFileSync(prodPath, 'utf8'));

let updated = 0, unchanged = 0, noMatch = 0;
const changes = [];

for (const p of prodData.products) {
  const excelPols = excelPrices[p.code]; // EXACT match only
  if (!excelPols) { noMatch++; continue; }
  
  for (const pol of p.policies) {
    if (/^2Y/.test(pol.policy)) continue;
    const key = pol.policy + '|' + pol.term;
    if (excelPols[key] !== undefined && excelPols[key] !== pol.price) {
      changes.push({ code: p.code, policy: pol.policy, term: pol.term, old: pol.price, new: excelPols[key] });
      pol.price = excelPols[key];
      updated++;
    } else {
      unchanged++;
    }
  }
}

fs.writeFileSync(prodPath, JSON.stringify(prodData, null, 2));

console.log('\nPrice updates:', updated);
console.log('Unchanged:', unchanged);
console.log('No match:', noMatch);
if (changes.length > 0) {
  console.log('\nChanges:');
  for (const c of changes) {
    console.log('  ' + c.code + ': ' + c.policy + ' term=' + c.term + ' ' + c.old + ' → ' + c.new);
  }
}
