import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

// Run with Codex's primary runtime. Cells, styles and drawings are authored
// through artifact-tool; ZIP metadata below supplies native Excel pagination.
const output = process.argv[2] ?? `${process.cwd()}/front-desk-template.xlsx`;
const workbook = Workbook.create();
const sheet = workbook.worksheets.add('Front desk');
sheet.showGridLines = false;
const all = sheet.getRange('A1:N25');
all.format.font = { name: 'Arial', size: 8.25, color: '#111111' };
all.format.fill = '#FFFFFF';
all.format.verticalAlignment = 'center';
const widths = [20, ...[25,43,47,100,85,57,150,36,60,88,88,70].map(n => n / 849 * 958), 20];
widths.forEach((w, i) => { sheet.getRangeByIndexes(0,i,25,1).format.columnWidthPx = w; });
const heights = [18,16,30,20,16,16,16,22,60,...Array(12).fill(38),14,32,20,18];
heights.forEach((h, i) => { sheet.getRangeByIndexes(i,0,1,14).format.rowHeightPx = h; });
function merged(address, text, style = {}) {
  const range = sheet.getRange(address); range.merge(); range.values = [[text]];
  Object.assign(range.format, style);
}
merged('B2:M2', 'Q4 · FILL THE SCHEDULE', { font: { name: 'Arial', size: 7.5, bold: true, color: '#53406E' } });
merged('B3:M3', 'Operative Treatment Scheduled Before Leaving', { font: { name: 'Arial', size: 17.25, bold: true } });
merged('B4:M4', '__OFFICE_NAME__ · __TALLY_LABEL__');
[
  '1. One row per completed visit. Use a fresh sheet code for each new page.',
  '2. Never write patient names, initials, chart numbers, appointment details, or amounts.',
  '3. Credit to earns the handoff points. Booked by is the front-desk cross-check.',
  '4. Use the app or this sheet once per action. Copy the app code if both were used.',
].forEach((text, i) => merged(`B${i+5}:J${i+5}`, text));
merged('K5:M6', '__SHEET_CODE__', { horizontalAlignment: 'right', font: { name: 'Courier New', size: 18.75, bold: true } });
merged('K7:M8', 'Page 1 of 1', { horizontalAlignment: 'right', font: { name: 'Arial', size: 7.5 } });
const headers = ['#','Date','Time\nAM / PM','Credit to\nteam member','Booked by\noptional','Booked\nbefore\nleaving','Actual prepayment\nnot card on file','Staff\ninit.','App code\nif any','Handoff\nverified\nManager only','Prepayment\nverified\nManager only','Date\nverified\nManager only'];
sheet.getRange('B9:M9').values = [headers];
sheet.getRange('B9:M21').format.borders = { preset: 'all', style: 'thin', color: '#888888' };
sheet.getRange('B9:M9').format = { fill: '#F7F5F9', wrapText: true, horizontalAlignment: 'center', verticalAlignment: 'center', font: { name: 'Arial', size: 8.25, bold: true } };
sheet.getRange('K9:M21').format.fill = '#E7E4EB';
sheet.getRange('B10:B21').format.fill = '#F8F8F8';
sheet.getRange('B10:B21').format.horizontalAlignment = 'center';
sheet.getRange('B10:B21').format.font.bold = true;
sheet.getRange('B10:M21').values = Array.from({length:12}, (_,i) => [i+1,'','','','','□ Yes','□ None  □ Yes\nDate ____ Time ____','','','□ Initials ____','□ Initials ____','']);
sheet.getRange('B10:M21').format.font.size = 7.5;
sheet.getRange('H10:H21').format.wrapText = true;
sheet.getRange('C10:C21').setNumberFormat('m/d');
sheet.getRange('D10:D21').setNumberFormat('h:mm AM/PM');
sheet.getRange('M10:M21').setNumberFormat('m/d');
merged('B23:M23', 'MANAGER ONLY: Handoff = 2 points after checking the schedule. Actual prepayment = +2 after checking payment. Verify separately. Empty verification boxes award no points.', { wrapText: true, font: {name:'Arial',size:8} });
merged('B24:M24', '□ Scheduling report checked     □ Sheet complete, ready to scan');
merged('B25:M25', 'Reprinting this code copies the same page. Register a new page with “Print blank sheet” in Purple Envelope.', {font:{name:'Arial',size:6.75,color:'#444444'}});
// Four identical registration squares keep Excel and website printouts readable.
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
for (const [row,col,dx,dy] of [[0,0,10,10],[0,13,2,10],[24,0,10,0],[24,13,2,0]]) {
  sheet.images.add({dataUrl:png,anchor:{from:{row,col,colOffsetPx:dx,rowOffsetPx:dy},extent:{widthPx:8,heightPx:8}}});
}
workbook.recalculate();
await fs.mkdir(new URL('.', `file://${output}`).pathname, {recursive:true});
await (await SpreadsheetFile.exportXlsx(workbook)).save(output);
const pagination = spawnSync('python3', ['-c', `
import sys, zipfile, xml.etree.ElementTree as E
p=sys.argv[1]; ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'; E.register_namespace('',ns)
with zipfile.ZipFile(p) as z: parts={n:z.read(n) for n in z.namelist()}
s=E.fromstring(parts['xl/worksheets/sheet1.xml'])
for tag in ['pageMargins','pageSetup','printOptions']:
  old=s.find('{'+ns+'}'+tag)
  if old is not None: s.remove(old)
# SpreadsheetML order: printOptions, pageMargins, pageSetup precede drawings.
pos=next((i for i,node in enumerate(s) if node.tag.split('}')[-1] in ['drawing','legacyDrawing','extLst']),len(s))
for tag,attrs in [('printOptions',{'gridLines':'0','headings':'0'}),('pageMargins',{'left':'.3','right':'.3','top':'.3','bottom':'.3','header':'0','footer':'0'}),('pageSetup',{'paperSize':'1','orientation':'landscape','fitToWidth':'1','fitToHeight':'1'})]:
  s.insert(pos,E.Element('{'+ns+'}'+tag,attrs)); pos+=1
props=s.find('{'+ns+'}sheetPr')
if props is None: props=E.Element('{'+ns+'}sheetPr'); s.insert(0,props)
setup=props.find('{'+ns+'}pageSetUpPr')
if setup is None: setup=E.SubElement(props,'{'+ns+'}pageSetUpPr')
setup.set('fitToPage','1')
parts['xl/worksheets/sheet1.xml']=E.tostring(s,encoding='utf-8',xml_declaration=True)
w=E.fromstring(parts['xl/workbook.xml']); names=w.find('{'+ns+'}definedNames')
if names is None:
  names=E.Element('{'+ns+'}definedNames'); index=next((i for i,n in enumerate(w) if n.tag.split('}')[-1] in ['calcPr','extLst']),len(w)); w.insert(index,names)
E.SubElement(names,'{'+ns+'}definedName',{'name':'_xlnm.Print_Area','localSheetId':'0'}).text="'Front desk'!$A$1:$N$25"
parts['xl/workbook.xml']=E.tostring(w,encoding='utf-8',xml_declaration=True)
with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:
  for n,b in parts.items(): z.writestr(n,b)
`, output], {encoding:'utf8'});
if (pagination.status !== 0) throw new Error(pagination.stderr);
sheet.getRange('B4').values = [['Harelick Dental Associates LLC · Tally ending Friday October 9, 2026 · 12:00 noon Eastern']];
sheet.getRange('K5').values = [['S-1009-A']];
const preview = await workbook.render({sheetName:'Front desk',range:'A1:N25',scale:1.5,format:'png'});
await fs.writeFile(output.replace('.xlsx','.png'),new Uint8Array(await preview.arrayBuffer()));
console.log((await workbook.inspect({kind:'region',sheetId:sheet.name,range:'B9:M11',maxChars:1500,tableMaxRows:3,tableMaxCols:12})).ndjson);
console.log(`Created ${output}`);
