const PHONE = '917010123465';
const rates = {
  sedan:{oneway:15,roundtrip:14,bata:400},
  suv:{oneway:20,roundtrip:19,bata:400},
  innova:{oneway:21,roundtrip:20,bata:400},
  crysta:{oneway:25,roundtrip:24,bata:400}
};
let tripType = 'oneway';
let lastRoute = null; // {key, km, minutes, live}
let lastFare = {distance:0, distanceForFare:0, total:0, mode:'oneway', live:false, minutes:null};

const $ = id => document.getElementById(id);
const toast = msg => { const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500); };
function openWhatsApp(text){ window.open('https://wa.me/'+PHONE+'?text='+encodeURIComponent(text),'_blank'); }
function vehicleName(v){ return v==='crysta' ? 'Innova Crysta' : v.charAt(0).toUpperCase()+v.slice(1); }
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
  const service = tripType;
  const isRoundTrip = service === 'roundtrip';
  const v = currentVehicle();
  const r = rates[v] || rates.sedan;

  // Airport, Local Rental and Outstation currently use the published vehicle
  // one-way kilometre rate unless Round Trip is selected. No hidden multiplier.
  const mode = isRoundTrip ? 'roundtrip' : 'oneway';
  const baseKm = Math.max(1, Number(route.km) || 0);
  const distanceForFare = isRoundTrip ? baseKm * 2 : baseKm;
  const rate = Number(r[mode]);
  const driverBata = 400;
  const hilly = $('hillySurcharge').checked ? 500 : 0;
  const luggage = $('luggageSurcharge').checked ? 300 : 0;

  const distanceCharge = Math.round(distanceForFare * rate);
  const total = distanceCharge + driverBata + hilly + luggage;

  return {
    distance: baseKm,
    distanceForFare,
    total,
    mode,
    service,
    rate,
    distanceCharge,
    driverBata,
    hilly,
    luggage,
    live: !!route.live,
    minutes: route.minutes
  };
}

function renderFareResult(f){
  lastFare = f;
  $('fareTotal').textContent = '₹'+f.total.toLocaleString('en-IN');
  const hrs = f.minutes ? (Math.round(((f.mode==='roundtrip'?f.minutes*2:f.minutes)/60)*10)/10) : null;
  $('fareDistance').textContent = f.distanceForFare+' km'+(hrs ? ' · ~'+hrs+' hr' : '')+(f.live?'':' (approx.)');
  $('fareVehicle').textContent = vehicleName(currentVehicle());
  $('fareRate').textContent = '₹'+f.rate+'/km'; $('fareBata').textContent = 'Driver Bata ₹'+f.driverBata.toLocaleString('en-IN');

  const resultNote = $('fareResult').querySelector('p');
  if(resultNote){
    resultNote.innerHTML =
      'Distance ₹'+f.distanceCharge.toLocaleString('en-IN')+
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
  const distanceLine = lastFare.distanceForFare ? lastFare.distanceForFare+' km'+(lastFare.live?' (live)':' (approx.)') : 'To be confirmed';
  const extras=[]; if($('hillySurcharge').checked) extras.push('Hilly area (+₹500)'); if($('luggageSurcharge').checked) extras.push('Extra luggage (+₹300)');
  return `NSR GO TAXI - ${title}\n\nTrip: ${tripType.toUpperCase()}\nPickup: ${p}\nDestination: ${d}\nDate: ${date}\nTime: ${time}\nPassengers: ${pass}\nVehicle: ${v}\nDistance: ${distanceLine}\nExtras: ${extras.length?extras.join(', '):'None'}\nEstimated Fare: ${lastFare.total?'₹'+lastFare.total.toLocaleString('en-IN'):'To be calculated'}
Fare Basis: ${lastFare.distanceForFare ? lastFare.distanceForFare+' km × ₹'+lastFare.rate+'/km + Driver Bata ₹'+lastFare.driverBata : 'To be calculated'}
Extras: ${lastFare.total ? ((lastFare.hilly?'Hilly ₹500; ':'')+(lastFare.luggage?'Luggage ₹300':'')||'None') : 'To be calculated'}

Toll & Parking: Excluded from estimated fare; payable separately by customer.

Customer acknowledgement: I understand that toll and parking charges are extra and payable separately.

Please confirm availability and final fare.`;
}

async function renderFare(){
  const pickup=$('pickup').value.trim(), dest=$('destination').value.trim();
  if(!pickup||!dest){ toast('Enter pickup and destination first.'); return; }
  const btn=$('fareSubmitBtn'); const original=btn.innerHTML;
  btn.disabled=true; btn.innerHTML='CHECKING LIVE DISTANCE…';
  try{
    const route = await computeRoute(pickup,dest);
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

document.querySelectorAll('.booking-tabs button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.booking-tabs button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); tripType=b.dataset.trip; toast(b.textContent.trim()+' selected');
  if(lastRoute && !$('fareResult').classList.contains('hidden')) renderFareResult(computeFare(lastRoute));
}));

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
  $('bookingSummary').textContent = `${$('pickup').value} → ${$('destination').value} | ${$('date').value} ${$('time').value} | ${$('fareVehicle').textContent} | Estimated ₹${lastFare.total.toLocaleString('en-IN')}`;
  $('bookingModal').classList.remove('hidden');
});
$('closeModal').addEventListener('click', ()=>$('bookingModal').classList.add('hidden'));
$('sendBooking').addEventListener('click', ()=>{
  const name=$('customerName').value.trim(), mobile=$('customerMobile').value.trim();
  if(!name||!mobile){ toast('Enter your name and mobile number.'); return; }
  openWhatsApp(buildMessage('BOOKING REQUEST')+`\nCustomer Name: ${name}\nCustomer Mobile: ${mobile}`);
  $('bookingModal').classList.add('hidden'); toast('Opening WhatsApp…');
});

$('enquiryForm').addEventListener('submit', e=>{
  e.preventDefault();
  const name=$('enquiryName').value.trim(), mobile=$('enquiryMobile').value.trim(), msg=$('enquiryMessage').value.trim();
  openWhatsApp(`NSR GO TAXI - QUICK ENQUIRY\n\nName: ${name}\nMobile: ${mobile}\nMessage: ${msg||'I need a taxi booking.'}`);
  toast('Opening WhatsApp…');
});

const today = new Date();
$('date').min = today.toISOString().slice(0,10);
$('date').value = today.toISOString().slice(0,10);


/* Mobile navigation */
const menuButton = document.querySelector('.menu');
const header = document.querySelector('.header');
const mobileNavLinks = document.querySelectorAll('.header nav a');

if(menuButton && header){
  menuButton.addEventListener('click', ()=>{
    const open = header.classList.toggle('nav-open');
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.textContent = open ? '✕' : '☰';
  });

  mobileNavLinks.forEach(link=>{
    link.addEventListener('click', ()=>{
      header.classList.remove('nav-open');
      menuButton.setAttribute('aria-expanded','false');
      menuButton.textContent = '☰';
    });
  });
}
