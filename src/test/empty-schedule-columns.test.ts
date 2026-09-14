import { expect,it } from 'vitest';
import { isEmptyBlueGridColumn, isNotesOnlyColumn } from '@/lib/schedule-reader/appointment-regions';
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

