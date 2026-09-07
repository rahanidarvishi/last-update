"use strict";

function pdfDateFa(d){ return d && d.jy ? J.toPersianDigits(J.jalaliStrOf(d.jy,d.jm,d.jd)) : '—'; }
function pdfDateEn(d){
  if(!d || !d.jy) return '—';
  var g = J.toGregorian(d.jy, d.jm, d.jd);
  var pad = function(n){ return n<10?'0'+n:''+n; };
  return g.gy+'-'+pad(g.gm)+'-'+pad(g.gd);
}
function pdfRoute(o,d){ return (o||'—')+'  ◀  '+(d||'—'); }

function pdfHeaderHtml(logo, titleFa, titleEn, voucherNumber, dateObj){
  var logoImg = (logo && logo.logoDataUrl) ? '<img src="'+escapeHtml(logo.logoDataUrl)+'" style="max-height:56px;max-width:180px;">' : '<div style="font-weight:800;font-size:16px;">آژانس مجلل درویشی</div>';
  return '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #154F41;padding-bottom:14px;margin-bottom:18px;">'+
    '<div>'+logoImg+(logo&&logo.agencyNameEn?('<div style="font-size:11px;color:#666;margin-top:4px;">'+escapeHtml(logo.agencyNameEn)+'</div>'):'')+'</div>'+
    '<div style="text-align:left;">'+
      '<div style="font-size:18px;font-weight:800;color:#154F41;">'+titleFa+' / '+titleEn+'</div>'+
      '<div style="font-size:12px;color:#555;margin-top:4px;">شماره واچر / Voucher No: <b>'+escapeHtml(voucherNumber)+'</b></div>'+
      '<div style="font-size:12px;color:#555;">تاریخ صدور / Issue Date: '+pdfDateFa(dateObj)+' ('+pdfDateEn(dateObj)+')</div>'+
    '</div>'+
  '</div>';
}

function pdfSectionTitle(fa, en){
  return '<div style="background:#F5EACB;color:#96762A;font-weight:700;padding:8px 12px;border-radius:6px;margin:16px 0 10px;font-size:13px;">'+fa+' / '+en+'</div>';
}
function pdfRow(labelFa, labelEn, value){
  return '<tr><td style="padding:5px 8px;color:#666;font-size:12px;white-space:nowrap;">'+labelFa+' / '+labelEn+'</td>'+
    '<td style="padding:5px 8px;font-weight:700;font-size:13px;">'+value+'</td></tr>';
}

function buildVoucherHtml(booking, logo){
  var html = '<div style="width:780px;padding:28px;background:#fff;font-family:Vazirmatn,Tahoma,Arial,sans-serif;color:#1B2230;direction:rtl;">';
  html += pdfHeaderHtml(logo, 'واچر رزرو', 'Reservation Voucher', booking.voucherNumber, booking);

  html += '<table style="width:100%;border-collapse:collapse;">'+
    pdfRow('آژانس','Agency', escapeHtml(booking.agency))+
    pdfRow('کانتر','Counter', escapeHtml(booking.counter))+
  '</table>';

  if(booking.hotel){
    html += pdfSectionTitle('اقامتگاه','Hotel');
    html += '<table style="width:100%;border-collapse:collapse;">'+
      pdfRow('هتل','Hotel', escapeHtml(booking.hotel.hotelName))+
      pdfRow('نوع اتاق','Room Type', escapeHtml(booking.hotel.roomTypeName))+
      pdfRow('تعداد اتاق','Rooms', J.toPersianDigits(booking.hotel.qty))+
      pdfRow('ورود','Check-in', pdfDateFa(booking.hotel.checkIn)+' ('+pdfDateEn(booking.hotel.checkIn)+')')+
      pdfRow('خروج','Check-out', pdfDateFa(booking.hotel.checkOut)+' ('+pdfDateEn(booking.hotel.checkOut)+')')+
      pdfRow('تعداد شب','Nights', J.toPersianDigits(booking.hotel.nights.length))+
    '</table>';
  }

  if(booking.services && booking.services.length){
    html += pdfSectionTitle('خدمات','Services');
    html += '<table style="width:100%;border-collapse:collapse;">';
    booking.services.forEach(function(s){
      html += pdfRow(escapeHtml(s.serviceName), '', pdfDateFa(s.from)+' — '+pdfDateFa(s.to)+' ('+J.toPersianDigits(s.qty)+'x)');
    });
    html += '</table>';
  }

  [{leg:booking.flightOut, faLbl:'پرواز رفت', enLbl:'Outbound Flight'}, {leg:booking.flightIn, faLbl:'پرواز برگشت', enLbl:'Return Flight'}].forEach(function(x){
    if(!x.leg) return;
    html += pdfSectionTitle(x.faLbl, x.enLbl);
    html += '<table style="width:100%;border-collapse:collapse;">'+
      pdfRow('مسیر','Route', pdfRoute(x.leg.origin, x.leg.destination))+
      pdfRow('تاریخ','Date', pdfDateFa({jy:x.leg.departJy,jm:x.leg.departJm,jd:x.leg.departJd})+' ('+pdfDateEn({jy:x.leg.departJy,jm:x.leg.departJm,jd:x.leg.departJd})+')')+
      (x.leg.departTime ? pdfRow('ساعت حرکت','Departure Time', escapeHtml(x.leg.departTime)) : '')+
      (x.leg.arriveTime ? pdfRow('ساعت رسیدن','Arrival Time', escapeHtml(x.leg.arriveTime)) : '')+
      (x.leg.airline ? pdfRow('ایرلاین','Airline', escapeHtml(x.leg.airline)) : '')+
      (x.leg.flightNumber ? pdfRow('شماره پرواز','Flight No.', escapeHtml(x.leg.flightNumber)) : '')+
      pdfRow('کلاس','Class', x.leg.allocations.map(function(a){return escapeHtml(a.name);}).join('، '))+
    '</table>';
  });

  html += pdfSectionTitle('مسافران','Passengers');
  html += '<table style="width:100%;border-collapse:collapse;font-size:11.5px;">'+
    '<thead><tr style="background:#154F41;color:#fff;">'+
      '<th style="padding:6px;">#</th><th style="padding:6px;">نام / Name</th><th style="padding:6px;">شماره پاسپورت<br>Passport No.</th>'+
      '<th style="padding:6px;">تاریخ تولد<br>Birth Date</th><th style="padding:6px;">انقضای پاسپورت<br>Passport Expiry</th>'+
    '</tr></thead><tbody>';
  booking.passengers.forEach(function(p, i){
    html += '<tr style="background:'+(i%2?'#FAF7EF':'#fff')+';">'+
      '<td style="padding:6px;text-align:center;">'+J.toPersianDigits(i+1)+'</td>'+
      '<td style="padding:6px;">'+escapeHtml(p.lastNameFa+' '+p.firstNameFa)+'<br><span style="color:#666;">'+escapeHtml((p.firstNameEn||'')+' '+(p.lastNameEn||''))+'</span></td>'+
      '<td style="padding:6px;text-align:center;">'+escapeHtml(p.passportNumber)+'</td>'+
      '<td style="padding:6px;text-align:center;">'+pdfDateFa(p.birthDate)+'<br>('+pdfDateEn(p.birthDate)+')</td>'+
      '<td style="padding:6px;text-align:center;">'+pdfDateFa(p.passportExpiry)+'<br>('+pdfDateEn(p.passportExpiry)+')</td>'+
    '</tr>';
  });
  html += '</tbody></table>';

  html += '<div style="margin-top:20px;background:#E1F0EA;border-radius:8px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;">'+
    '<span style="font-weight:700;color:#154F41;">مبلغ کل تور / Total Tour Price</span>'+
    '<span style="font-weight:800;font-size:16px;color:#154F41;">'+J.toPersianDigits(Number(Math.round(booking.pricing.sellingTotalRial)).toLocaleString('en-US'))+' ریال / IRR</span>'+
  '</div>';

  html += '<div style="margin-top:16px;font-size:10.5px;color:#888;text-align:center;">این واچر توسط سیستم مدیریت رزرواسیون و تامین خارجی آژانس مجلل درویشی صادر شده است.</div>';
  html += '</div>';
  return html;
}

function buildTicketHtml(booking, logo){
  var html = '<div style="width:780px;padding:28px;background:#fff;font-family:Vazirmatn,Tahoma,Arial,sans-serif;color:#1B2230;direction:rtl;">';
  html += pdfHeaderHtml(logo, 'بلیت مسافر', 'Passenger Ticket', booking.voucherNumber, booking);

  [{leg:booking.flightOut, faLbl:'پرواز رفت', enLbl:'Outbound'}, {leg:booking.flightIn, faLbl:'پرواز برگشت', enLbl:'Return'}].forEach(function(x){
    if(!x.leg) return;
    html += '<div style="border:2px dashed #C6A24D;border-radius:10px;padding:16px;margin-bottom:16px;">'+
      '<div style="font-weight:800;color:#96762A;margin-bottom:10px;">'+x.faLbl+' / '+x.enLbl+'</div>'+
      '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;">'+
        '<div><div style="font-size:11px;color:#666;">مسیر / Route</div><div style="font-weight:700;font-size:15px;">'+pdfRoute(x.leg.origin,x.leg.destination)+'</div></div>'+
        '<div><div style="font-size:11px;color:#666;">تاریخ / Date</div><div style="font-weight:700;">'+pdfDateFa({jy:x.leg.departJy,jm:x.leg.departJm,jd:x.leg.departJd})+' ('+pdfDateEn({jy:x.leg.departJy,jm:x.leg.departJm,jd:x.leg.departJd})+')</div></div>'+
        '<div><div style="font-size:11px;color:#666;">حرکت / Departure</div><div style="font-weight:700;">'+escapeHtml(x.leg.departTime||'—')+'</div></div>'+
        '<div><div style="font-size:11px;color:#666;">رسیدن / Arrival</div><div style="font-weight:700;">'+escapeHtml(x.leg.arriveTime||'—')+'</div></div>'+
        (x.leg.airline?('<div><div style="font-size:11px;color:#666;">ایرلاین / Airline</div><div style="font-weight:700;">'+escapeHtml(x.leg.airline)+'</div></div>'):'')+
        (x.leg.flightNumber?('<div><div style="font-size:11px;color:#666;">شماره پرواز / Flight No.</div><div style="font-weight:700;">'+escapeHtml(x.leg.flightNumber)+'</div></div>'):'')+
        '<div><div style="font-size:11px;color:#666;">کلاس / Class</div><div style="font-weight:700;">'+x.leg.allocations.map(function(a){return escapeHtml(a.name);}).join('، ')+'</div></div>'+
      '</div>'+
    '</div>';
  });

  html += pdfSectionTitle('مسافران','Passengers');
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">'+
    '<thead><tr style="background:#154F41;color:#fff;"><th style="padding:6px;">#</th><th style="padding:6px;">نام / Name</th><th style="padding:6px;">پاسپورت / Passport</th></tr></thead><tbody>';
  booking.passengers.forEach(function(p, i){
    html += '<tr style="background:'+(i%2?'#FAF7EF':'#fff')+';">'+
      '<td style="padding:6px;text-align:center;">'+J.toPersianDigits(i+1)+'</td>'+
      '<td style="padding:6px;">'+escapeHtml(p.lastNameFa+' '+p.firstNameFa)+' / '+escapeHtml((p.firstNameEn||'')+' '+(p.lastNameEn||''))+'</td>'+
      '<td style="padding:6px;text-align:center;">'+escapeHtml(p.passportNumber)+'</td>'+
    '</tr>';
  });
  html += '</tbody></table>';
  html += '<div style="margin-top:16px;font-size:10.5px;color:#888;text-align:center;">این بلیت توسط سیستم مدیریت رزرواسیون و تامین خارجی آژانس مجلل درویشی صادر شده است — لطفاً همراه داشته باشید.</div>';
  html += '</div>';
  return html;
}

// Renders the given HTML off-screen, snapshots it, and downloads a PDF —
// runs entirely in the person's own browser (correct Persian shaping comes
// free from the browser's own text engine), same technique already used for
// the Excel/PDF report exports elsewhere in this app.
async function htmlToPdfDownload(html, filename){
  var container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-10000px';
  container.style.left = '-10000px';
  container.innerHTML = html;
  document.body.appendChild(container);
  try{
    var canvas = await html2canvas(container.firstChild, { scale: 2, backgroundColor: '#ffffff' });
    var imgData = canvas.toDataURL('image/png');
    var jsPDF = window.jspdf.jsPDF;
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    var pageWidth = pdf.internal.pageSize.getWidth();
    var pageHeight = pdf.internal.pageSize.getHeight();
    var imgWidth = pageWidth - 40;
    var imgHeight = canvas.height * (imgWidth / canvas.width);
    var y = 20;
    if(imgHeight <= pageHeight - 40){
      pdf.addImage(imgData, 'PNG', 20, y, imgWidth, imgHeight);
    } else {
      // Long documents (many passengers) spill onto additional pages.
      var remainingHeight = imgHeight;
      var srcY = 0;
      var pageCanvasHeightPx = (pageHeight - 40) * (canvas.width / imgWidth);
      while(remainingHeight > 0){
        var sliceHeightPx = Math.min(pageCanvasHeightPx, canvas.height - srcY);
        var sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width; sliceCanvas.height = sliceHeightPx;
        sliceCanvas.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
        var sliceImg = sliceCanvas.toDataURL('image/png');
        var sliceHeightPt = sliceHeightPx * (imgWidth / canvas.width);
        pdf.addImage(sliceImg, 'PNG', 20, 20, imgWidth, sliceHeightPt);
        remainingHeight -= sliceHeightPt;
        srcY += sliceHeightPx;
        if(remainingHeight > 0) pdf.addPage();
      }
    }
    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}

async function downloadVoucherPdf(booking, logo){
  await htmlToPdfDownload(buildVoucherHtml(booking, logo), 'voucher-'+booking.voucherNumber+'.pdf');
}
async function downloadTicketPdf(booking, logo){
  await htmlToPdfDownload(buildTicketHtml(booking, logo), 'ticket-'+booking.voucherNumber+'.pdf');
}
