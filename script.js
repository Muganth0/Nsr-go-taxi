const PHONE = '917010123465';
const rates = window.NSRFareEngine.rates;
let tripType = 'oneway';
let lastRoute = null; // {key, km, minutes, live}
let lastFare = {distance:0, distanceForFare:0, total:0, mode:'oneway', live:false, minutes:null};

const $ = id => document.getElementById(id);
const toast = msg => { const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500); };
function openWhatsApp(text){ window.open('https://wa.me/'+PHONE+'?text='+encodeURIComponent(text),'_blank'); }
function vehicleName(v){ return v==='crysta' ? 'Innova Crysta' : v==='tempo' ? 'Tempo Traveller' : v.charAt(0).toUpperCase()+v.slice(1); }
function currentVehicle(){ return $('vehicleSelect').value; }

function setLiveBadge(state){
  const b=$('liveBadge'); if(!b) return;
  b.classList.remove('is-live','is-estimate','is-checking');
  if(state==='live'){ b.classList.add('is-live'); b.innerHTML='<i></i>Live'; }
  else if(state==='checking'){ b.classList.add('is-checking'); b.innerHTML='<i></i>Checking…'; }
  else { b.classList.add('is-estimate'); b.innerHTML='<i></i>Estimate'; }
}

function haversineKm(lat1,lon1,lat2,lon2){
  const R=6371, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// Free geocoding via OpenStreetMap Nominatim (no API key required)
async function geocodePlace(q){
  const raw = q.trim();
  if(!raw) throw new Error('empty place');

  // Do not force Tamil Nadu: the service covers South India.
  const query = /india/i.test(raw) ? raw : raw + ', India';
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=3&countrycodes=in&addressdetails=1&q=' + encodeURIComponent(query);
  const res = await fetch(url, {
    headers:{
      'Accept':'application/json',
      'Accept-Language':'en'
    }
  });
  if(!res.ok) throw new Error('geocode failed');
  const data = await res.json();
  if(!data.length) throw new Error('place not found');

  // Prefer an exact-looking city/town/village result.
  const best = data.find(x => x.type==='city' || x.type==='town' || x.type==='village' || x.type==='municipality') || data[0];
  return {lat:parseFloat(best.lat), lon:parseFloat(best.lon), label:best.display_name};
}

// Free driving-route distance via OSRM's public demo routing server (no API key required)
async function fetchRoadRoute(from,to){
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('routing failed');
  const data = await res.json();
  if(data.code !== 'Ok' || !data.routes || !data.routes.length) throw new Error('no route');
  return {km: Math.round(data.routes[0].distance/1000), minutes: Math.round(data.routes[0].duration/60)};
}

async function computeRoute(pickup, destination){
  const key = (pickup+'|'+destination).toLowerCase().trim();
  if(lastRoute && lastRoute.key === key) return lastRoute;

  setLiveBadge('checking');
  let from, to;
  try{
    [from, to] = await Promise.all([geocodePlace(pickup), geocodePlace(destination)]);
  }catch(err){
    lastRoute = null;
    setLiveBadge('estimate');
    throw new Error('We could not locate one of the places. Please enter a city, airport or landmark.');
  }

  try{
    const r = await fetchRoadRoute(from,to);
    if(!Number.isFinite(r.km) || r.km <= 0) throw new Error('invalid route');
    lastRoute = {key, km:r.km, minutes:r.minutes, live:true, from:from.label, to:to.label};
    setLiveBadge('live');
    return lastRoute;
  }catch(err){
    // A straight-line fallback is explicitly labelled approximate.
    // Never invent a fixed distance: the estimate must come from the
    // geocoded pickup/destination coordinates.
    const straight = haversineKm(from.lat,from.lon,to.lat,to.lon);
    if(!Number.isFinite(straight) || straight <= 0) throw new Error('Unable to determine a safe fallback distance.');
    const km = Math.max(1, Math.round(straight * 1.25));
    lastRoute = {key, km, minutes:null, live:false, from:from.label, to:to.label};
    setLiveBadge('estimate');
    return lastRoute;
  }
}

function computeFare(route){
  return window.NSRFareEngine.calculate({
    vehicle: currentVehicle(),
    tripType,
    distanceKm: route && route.km,
    live: route && route.live,
    minutes: route && route.minutes,
    hilly: $('hillySurcharge').checked,
    luggage: $('luggageSurcharge').checked,
    duration: $('localDuration') ? $('localDuration').value : ''
  });
}

function renderFareResult(f){
  lastFare = f;
  $('fareTotal').textContent = f.quoteOnly ? 'Quote on request' : '₹'+f.total.toLocaleString('en-IN');
  const hrs = f.minutes ? (Math.round(((f.mode==='roundtrip'?f.minutes*2:f.minutes)/60)*10)/10) : null;
  $('fareDistance').textContent = f.quoteOnly
    ? (f.service==='local' ? 'Local package: '+(f.duration || 'Duration to confirm') : (f.distanceForFare ? f.distanceForFare+' km' : 'Distance to confirm'))
    : f.distanceForFare+' km'+(hrs ? ' · ~'+hrs+' hr' : '')+(f.live?'':' (approx.)');
  $('fareVehicle').textContent = vehicleName(currentVehicle());
  $('fareRate').textContent = f.quoteOnly ? 'Custom pricing' : '₹'+f.rate+'/km';
  $('fareBata').textContent = f.quoteOnly ? 'To be confirmed' : 'Driver Bata ₹'+f.driverBata.toLocaleString('en-IN');

  const resultNote = $('fareResult').querySelector('p');
  if(resultNote){
    resultNote.innerHTML =
      f.quoteOnly
        ? 'This service requires a custom quote. NSR GO TAXI will confirm the package, vehicle availability and final fare on WhatsApp.'
        : 'Distance ₹'+f.distanceCharge.toLocaleString('en-IN')+
          ' + Driver Bata ₹'+f.driverBata.toLocaleString('en-IN')+
          (f.hilly ? ' + Hilly ₹500' : '')+
          (f.luggage ? ' + Luggage ₹300' : '')+
          '. '+(f.live ? 'Road distance is live.' : 'Road distance is an approximate fallback.')+
          ' Final fare is confirmed by NSR GO TAXI.';
  }

  $('fareResult').classList.remove('hidden');
  $('fareWhatsapp').href = '#';
  $('fareWhatsapp').onclick = (e)=>{
    e.preventDefault();
    if(!requireTollParkingAcknowledgement()) return;
    openWhatsApp(buildMessage('Fare Request'));
  };
}

function requireTollParkingAcknowledgement(){
  const ack = $('tollParkingAck');
  if(!ack || !ack.checked){
    toast('Please acknowledge that toll and parking charges are extra.');
    if(ack) ack.focus();
    return false;
  }
  return true;
}

function buildMessage(title='Booking Request'){
  const p=$('pickup').value||'Not specified', d=$('destination').value||'Not specified', date=$('date').value||'Not specified', time=$('time').value||'Not specified', pass=$('passengers').value||'Not specified', v=vehicleName(currentVehicle());
  const returnDate = $('returnDate') && $('returnDate').value ? $('returnDate').value : 'Not specified';
  const duration = $('localDuration') ? $('localDuration').value : 'Not specified';
  const distanceLine = lastFare.distanceForFare ? lastFare.distanceForFare+' km'+(lastFare.live?' (live)':' (approx.)') : 'To be confirmed';
  const extras=[]; if($('hillySurcharge').checked) extras.push('Hilly area (+₹500)'); if($('luggageSurcharge').checked) extras.push('Extra luggage (+₹300)');
  return `NSR GO TAXI - ${title}\n\nTrip: ${tripType.toUpperCase()}\nPickup: ${p}\nDestination: ${d}\nDate: ${date}\nReturn Date: ${returnDate}\nTime: ${time}\nPassengers: ${pass}\nVehicle: ${v}\nLocal Package Duration: ${tripType==='local'?duration:'Not applicable'}\nDistance: ${distanceLine}\nExtras: ${extras.length?extras.join(', '):'None'}\nEstimated Fare: ${lastFare.quoteOnly?'Quote on request':lastFare.total?'₹'+lastFare.total.toLocaleString('en-IN'):'To be calculated'}
Fare Basis: ${lastFare.quoteOnly?'Custom quote to be confirmed':lastFare.distanceForFare ? lastFare.distanceForFare+' km × ₹'+lastFare.rate+'/km + Driver Bata ₹'+lastFare.driverBata : 'To be calculated'}
Extras: ${lastFare.total ? ((lastFare.hilly?'Hilly ₹500; ':'')+(lastFare.luggage?'Luggage ₹300':'')||'None') : 'To be confirmed'}

Toll & Parking: Excluded from estimated fare; payable separately by customer.

Customer acknowledgement: I understand that toll and parking charges are extra and payable separately.

Please confirm availability and final fare.`;
}

async function renderFare(){
  const pickup=$('pickup').value.trim(), dest=$('destination').value.trim();
  if(!pickup||!dest){ toast('Enter pickup and destination first.'); return; }
  if(!$('date').value || !$('time').value){ toast('Select your travel date and pickup time.'); return; }
  if(tripType==='roundtrip' && $('returnDate') && (!$('returnDate').value || $('returnDate').value < $('date').value)){ toast('Select a return date on or after the pickup date.'); return; }
  if(tripType==='local' && $('localDuration') && !$('localDuration').value){ toast('Select your local rental duration.'); return; }
  const btn=$('fareSubmitBtn'); const original=btn.innerHTML;
  btn.disabled=true; btn.innerHTML='CHECKING LIVE DISTANCE…';
  try{
    const route = tripType==='local' ? {km:0,minutes:null,live:false} : await computeRoute(pickup,dest);
    renderFareResult(computeFare(route));
  } catch(err){
    $('fareResult').classList.add('hidden');
    toast(err.message || 'Unable to calculate the route. Please try again.');
  } finally {
    btn.disabled=false; btn.innerHTML=original;
  }
}

function selectVehicle(v){
  $('vehicleSelect').value=v;
  $('book').scrollIntoView({behavior:'smooth',block:'center'});
  if(lastRoute && !$('fareResult').classList.contains('hidden')) renderFareResult(computeFare(lastRoute));
}

function updateServiceFields(){
  const returnWrap=$('returnDateWrap'), localWrap=$('localDurationWrap');
  if(returnWrap) returnWrap.classList.toggle('hidden', tripType!=='roundtrip');
  if(localWrap) localWrap.classList.toggle('hidden', tripType!=='local');
}
document.querySelectorAll('.booking-tabs button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.booking-tabs button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); tripType=b.dataset.trip; updateServiceFields(); toast(b.textContent.trim()+' selected');
  if(lastRoute && !$('fareResult').classList.contains('hidden')) renderFareResult(computeFare(lastRoute));
  else if(tripType==='local' && !$('fareResult').classList.contains('hidden')) renderFareResult(computeFare({km:0,live:false}));
}));
updateServiceFields();

['vehicleSelect','hillySurcharge','luggageSurcharge'].forEach(id=>{
  $(id).addEventListener('change',()=>{
    if(lastRoute && !$('fareResult').classList.contains('hidden')) renderFareResult(computeFare(lastRoute));
  });
});

$('fareForm').addEventListener('submit', e=>{ e.preventDefault(); renderFare(); });

$('locationBtn').addEventListener('click', ()=>{
  if(!navigator.geolocation){ toast('Location is not supported by this browser.'); return; }
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude:lat, longitude:lon} = pos.coords;
    $('pickup').value = 'Current location';
    toast('Detecting your address…');
    try{
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if(data && data.display_name){ $('pickup').value = data.display_name; toast('Current location detected.'); }
      else { toast('Current location selected.'); }
    }catch(e){ toast('Current location selected.'); }
  }, ()=>toast('Location permission was not available.'));
});

$('bookRequest').addEventListener('click', ()=>{
  if(!requireTollParkingAcknowledgement()) return;
  if(!lastFare || (lastFare.total==null && !lastFare.quoteOnly)){ toast('Calculate the fare or request a quote first.'); return; }
  $('bookingSummary').textContent = `${$('pickup').value} → ${$('destination').value} | ${$('date').value} ${$('time').value} | ${$('fareVehicle').textContent} | ${lastFare.quoteOnly?'Quote on request':'Estimated ₹'+lastFare.total.toLocaleString('en-IN')}`;
  $('bookingModal').classList.remove('hidden');
});
$('closeModal').addEventListener('click', ()=>$('bookingModal').classList.add('hidden'));
$('sendBooking').addEventListener('click', ()=>{
  const name=$('customerName').value.trim(), mobile=$('customerMobile').value.trim();
  const digits=mobile.replace(/\\D/g,'');
  if(!name||!(digits.length===10 || (digits.length===12 && digits.startsWith('91')))){ toast('Enter a valid 10-digit Indian mobile number.'); return; }
  openWhatsApp(buildMessage('BOOKING REQUEST')+`\nCustomer Name: ${name}\nCustomer Mobile: ${mobile}`);
  $('bookingModal').classList.add('hidden'); toast('Opening WhatsApp…');
});

$('enquiryForm').addEventListener('submit', e=>{
  e.preventDefault();
  const name=$('enquiryName').value.trim(), mobile=$('enquiryMobile').value.trim(), msg=$('enquiryMessage').value.trim();
  openWhatsApp(`NSR GO TAXI - QUICK ENQUIRY\n\nName: ${name}\nMobile: ${mobile}\nMessage: ${msg||'I need a taxi booking.'}`);
  toast('Opening WhatsApp…');
});

function localDateValue(date){
  const year=date.getFullYear(), month=String(date.getMonth()+1).padStart(2,'0'), day=String(date.getDate()).padStart(2,'0');
  return year+'-'+month+'-'+day;
}
const today = new Date();
$('date').min = localDateValue(today);
$('date').value = localDateValue(today);
if($('returnDate')) $('returnDate').min = localDateValue(today);
if($('pickup')) $('pickup').addEventListener('input', invalidateFare);
if($('destination')) $('destination').addEventListener('input', invalidateFare);
function invalidateFare(){
  lastRoute=null;
  lastFare={distance:0,distanceForFare:0,total:0,mode:tripType,live:false,minutes:null,quoteOnly:false};
  if($('fareResult')) $('fareResult').classList.add('hidden');
}
if($('returnDate')) $('date').addEventListener('change',()=>{$('returnDate').min=$('date').value; if($('returnDate').value && $('returnDate').value < $('date').value) $('returnDate').value=$('date').value;});


/* Mobile navigation */
const menuButton = document.querySelector('.menu');
const header = document.querySelector('.header');
const mobileNavLinks = document.querySelectorAll('.header nav a');

if(menuButton && header){
  menuButton.addEventListener('click', ()=>{
    const open = header.classList.toggle('nav-open');
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menuButton.textContent = open ? '✕' : '☰';
  });

  mobileNavLinks.forEach(link=>{
    link.addEventListener('click', ()=>{
      header.classList.remove('nav-open');
      menuButton.setAttribute('aria-expanded','false');
      menuButton.setAttribute('aria-label','Open menu');
      menuButton.textContent = '☰';
    });
  });
}
