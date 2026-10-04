// Store estimate: dispatch today or next business day, transit two business days.
// This is a store policy estimate, not a carrier quotation.
function dayKey(d:Date) {return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function holiday(d:Date) {
  const fixed=['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'];
  if(fixed.includes(dayKey(d).slice(5)))return true;
  const y=d.getFullYear(),a=y%19,b=Math.floor(y/100),c=y%100,e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-Math.floor(b/4)-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const easter=new Date(y,Math.floor((h+l-7*m+114)/31)-1,(h+l-7*m+114)%31+1,12);
  easter.setDate(easter.getDate()-2);return dayKey(d)===dayKey(easter);
}
export function addBusinessDays(date:Date, days:number) {
  const d=new Date(date); while(days>0){d.setDate(d.getDate()+1);if(d.getDay()!==0&&d.getDay()!==6&&!holiday(d))days--; } return d;
}
export function deliveryWindow(now=new Date()) {
  const local=new Date(now.toLocaleString('en-US',{timeZone:'America/Sao_Paulo'}));
  if(local.getDay()===0||local.getDay()===6||holiday(local)){const next=addBusinessDays(local,1);local.setTime(next.getTime());}
  const fmt=(d:Date)=>d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
  return `${fmt(addBusinessDays(local,2))} a ${fmt(addBusinessDays(local,3))}`;
}
