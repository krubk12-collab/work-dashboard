/**
 * Dashboard Calendar API — อ่าน Google Calendar สดๆ คืน JSON ให้ dashboard (CORS เปิดอัตโนมัติ)
 * ⚠️ ก่อนใช้: เปิด editor แล้วกด Run ฟังก์ชัน authorize() 1 ครั้ง เพื่ออนุญาตสิทธิ์ปฏิทิน
 *    จากนั้น Deploy ให้ "Who has access" = Anyone
 */
var TZ='Asia/Bangkok';
var DAYS_AHEAD=75;
// ปฏิทินที่จะดึง (id + ประเภท)
var CALS=[
  {id:'krubk12@nonedu2.go.th',kind:'work'},
  {id:'th.th#holiday@group.v.calendar.google.com',kind:'holiday'},
  {id:'c_69ee25a38ac3679aa4e059ec04b90d186c7fedc772d7a1ef0df309698f1668a5@group.calendar.google.com',kind:'work'}
];

function doGet(e){
  var out={ok:true,events:[],updatedAt:Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd HH:mm')};
  try{
    var now=new Date();
    var end=new Date(now.getTime()+1000*60*60*24*DAYS_AHEAD);
    CALS.forEach(function(c){
      var cal=CalendarApp.getCalendarById(c.id);
      if(!cal) return;
      cal.getEvents(now,end).forEach(function(ev){
        var allDay=ev.isAllDayEvent();
        var start=allDay?ev.getAllDayStartDate():ev.getStartTime();
        out.events.push({
          date:Utilities.formatDate(start,TZ,'yyyy-MM-dd'),
          all_day:allDay,
          time:allDay?'':Utilities.formatDate(ev.getStartTime(),TZ,'HH:mm'),
          title:ev.getTitle(),
          kind:c.kind,
          link:''
        });
      });
    });
    out.events.sort(function(a,b){return (a.date+(a.time||'')).localeCompare(b.date+(b.time||''));});
  }catch(err){ out.ok=false; out.error=String(err); }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

// กด Run ฟังก์ชันนี้ 1 ครั้งใน editor เพื่ออนุญาตสิทธิ์ (จะเด้งหน้าขออนุญาต)
function authorize(){
  var n=CalendarApp.getCalendarById('krubk12@nonedu2.go.th').getEvents(new Date(),new Date(Date.now()+86400000)).length;
  Logger.log('OK authorized — events today-ish: '+n);
}
