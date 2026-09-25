import { expect,it } from 'vitest';
import { isEmptyBlueGridColumn, isNotesOnlyColumn, isOpenSlotCell, openSlotKind } from '@/lib/schedule-reader/appointment-regions';
import { reduceRow } from '@/lib/schedule-reader/metrics-builder';
it('omits only blank blue grid, preserving faint grid lines but keeping hold or arrival content',()=>{
 const width=100,height=100,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(y%10===0?[230,230,230,255]:[135,172,205,255],(y*width+x)*4);
 const image={width,height,data}, col={xStart:0,xEnd:1};
 expect(isEmptyBlueGridColumn(image,col)).toBe(true);
 data.set([128,128,128,255],(50*width+50)*4);
 expect(isEmptyBlueGridColumn(image,col)).toBe(false);
 data.set([135,172,205,255],(50*width+50)*4);
 data.set([0,0,0,255],(2*width+50)*4);
 expect(isEmptyBlueGridColumn(image,col)).toBe(false);
 expect(isNotesOnlyColumn([{text:'HOLD',confidence:99,bbox:{x0:10,x1:40,y0:10,y1:20}}],[{x0:0,x1:100,y0:0,y1:30}],col,width)).toBe(false);
 // A completed visit plus its parallel blocked hold does not double the appointment time.
 expect(reduceRow(['completed','blocked'])).toEqual({category:'scheduled',scheduledColumns:1});
});


it('reads a pale-tinted empty slot as open, but never omits a tinted lane or assumes neutral gray is open',()=>{
 const width=100,height=100,data=new Uint8ClampedArray(width*height*4);
 // Dentrix paints an unbooked slot inside the provider's hours pale green (223,238,225); grid lines stay white.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(y%10===0?[230,230,230,255]:y<50?[223,238,225,255]:[133,173,214,255],(y*width+x)*4);
 const image={width,height,data}, col={xStart:0,xEnd:1};
 expect(isOpenSlotCell(image,col,0,.5)).toBe(true);
 expect(isOpenSlotCell(image,col,.5,1)).toBe(true);
 expect(isEmptyBlueGridColumn(image,col,0,.5)).toBe(false); // a tinted lane is a provider with nothing booked
 expect(isEmptyBlueGridColumn(image,col,.5,1)).toBe(true);
 // A neutral light gray is how some software shades unavailable time: not open, stays for review.
 for(let y=0;y<50;y++)for(let x=0;x<width;x++)data.set([215,215,215,255],(y*width+x)*4);
 expect(isOpenSlotCell(image,col,0,.5)).toBe(false);
 // Anything drawn on a tinted slot keeps it out of open time.
 for(let y=0;y<50;y++)for(let x=0;x<width;x++)data.set([223,238,225,255],(y*width+x)*4);
 data.set([0,0,0,255],(25*width+50)*4);
 expect(isOpenSlotCell(image,col,0,.5)).toBe(false);
});

it('ignores the grid\'s own lines in a cell, in any gray, but never a neutral fill or a stray mark',()=>{
 const width=100,height=100,data=new Uint8ClampedArray(width*height*4);
 // Dentrix: a (192) line every thirteenth row, an hour line as a white row over a dark gray one; pale above, blue below.
 const line=(y:number)=>y%13===0?[192,192,192]:y===26?[255,255,255]:y===27?[128,128,128]:null;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set([...(line(y)??(y<50?[223,238,225]:[133,173,214])),255],(y*width+x)*4);
 const image={width,height,data}, col={xStart:0,xEnd:1};
 expect(openSlotKind(image,col,.13,.26)).toBe('tint');
 expect(openSlotKind(image,col,.2,.33)).toBe('tint'); // the hour line's pair inside the cell
 expect(openSlotKind(image,col,.6,.73)).toBe('blue');
 expect(openSlotKind(image,col,.4,.6)).toBeNull(); // half pale, half blue: neither
 expect(isEmptyBlueGridColumn(image,col,.5,1)).toBe(true);
 // A box's dark border, or a colored outline, running the cell's width is a line too.
 for(let x=0;x<width;x++){data.set([0,0,0,255],(14*width+x)*4);data.set([220,40,40,255],(15*width+x)*4);}
 expect(openSlotKind(image,col,.13,.26)).toBe('tint');
 // A single dark pixel in a pale cell is something drawn on it.
 data.set([100,100,100,255],(20*width+50)*4);
 expect(openSlotKind(image,col,.13,.26)).toBeNull();
 // A neutral fill is not a line.
 for(let y=60;y<73;y++)for(let x=0;x<width;x++)data.set([215,215,215,255],(y*width+x)*4);
 expect(openSlotKind(image,col,.6,.73)).toBeNull();
});

it('a column of one-line note bars is notes only whatever the bars say; a tall reserve note is not',()=>{
 const width=1000;
 const word=(text:string,x:number,y:number,h=10):{text:string;confidence:number;bbox:{x0:number;x1:number;y0:number;y1:number}}=>({text,confidence:90,bbox:{x0:x,x1:x+text.length*6,y0:y,y1:y+h}});
 const grid=[word('General',300,150),word('HY16',300,164),word('EP,',300,136),word('ProphyAd',330,136)];
 const bars=[{x0:800,x1:990,y0:520,y1:534},{x0:800,x1:990,y0:706,y1:720}];
 const barWords=[word('Aware',805,522),word('Early',845,522),word('<--',805,708),word('CAN',830,708),word('NOT',855,708),word('COME',880,708),word('IN',915,708),word('EARLIER',935,708)];
 const col={xStart:.79,xEnd:1};
 expect(isNotesOnlyColumn([...grid,...barWords],bars,col,width)).toBe(true);
 // The same words in a three-row box reserve time and keep the column clinical.
 const tall=[{x0:800,x1:990,y0:520,y1:560}];
 expect(isNotesOnlyColumn([...grid,word('Aware',805,522),word('Early',845,522)],tall,col,width)).toBe(false);
 // A bar that prints as an appointment is still an appointment.
 expect(isNotesOnlyColumn([...grid,word('PostOp',805,522)],[bars[0]],col,width)).toBe(false);
});
