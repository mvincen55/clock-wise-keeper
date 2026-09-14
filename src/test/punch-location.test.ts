import {it,expect,vi,afterEach} from 'vitest';
import {getPunchLocation} from '@/lib/punch-location';
afterEach(()=>vi.restoreAllMocks());
it('returns a current GPS reading',async()=>{
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(success:any)=>success({coords:{latitude:41,longitude:-70,accuracy:8}})}});
 expect(await getPunchLocation()).toEqual({lat:41,lng:-70,accuracy:8});
});
it('does not prevent punching when permission is denied',async()=>{
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(_:any,error:any)=>error({code:1})}});
 expect(await getPunchLocation()).toBeNull();
});

