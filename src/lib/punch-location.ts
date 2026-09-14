/** One foreground reading at a clock action; never prevents a punch. */
export function getPunchLocation(): Promise<{lat:number;lng:number;accuracy:number} | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), 8500);
    navigator.geolocation.getCurrentPosition(position => {
      clearTimeout(timer);
      resolve({lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy});
    }, () => { clearTimeout(timer); resolve(null); }, {enableHighAccuracy:true,maximumAge:0,timeout:8000});
  });
}

