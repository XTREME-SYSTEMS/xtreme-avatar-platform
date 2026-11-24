// Conservative, deterministic conversion. Dictation never submits a form.
const small={zero:0,oh:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
const scales={thousand:1000,million:1000000,billion:1000000000};
function spokenInteger(text){
 const words=text.split(/\s+/).filter(word=>word!=='and');
 if(!words.length)return null;
 if(words.every(word=>Object.hasOwn(small,word)&&small[word]<10))return words.map(word=>small[word]).join('');
 const under100=part=>{if(part.length===1){if(/^\d{1,2}$/.test(part[0]))return Number(part[0]);return Object.hasOwn(small,part[0])?small[part[0]]:null;}if(part.length===2&&small[part[0]]>=20&&small[part[0]]%10===0&&small[part[1]]>0&&small[part[1]]<10)return small[part[0]]+small[part[1]];return null;};
 const groupValue=part=>{if(part.length===1&&/^\d{1,3}$/.test(part[0]))return Number(part[0]);if(part[1]==='hundred'&&small[part[0]]>0&&small[part[0]]<10){const tail=part.length===2?0:under100(part.slice(2));return tail===null?null:small[part[0]]*100+tail;}return under100(part);};
 let sum=0,group=[],lastScale=Infinity;
 for(const word of words){
  if(Object.hasOwn(scales,word)){const number=groupValue(group);if(number===null||number===0||scales[word]>=lastScale)return null;lastScale=scales[word];sum+=number*lastScale;group=[];}else group.push(word);
 }
 const tail=group.length?groupValue(group):0;return tail===null?null:String(sum+tail);
}
export function spokenNumber(raw){
 let text=String(raw).trim().toLowerCase().replace(/[.!?]$/,'').replace(/^(minus|negative)\s+/,'-').replace(/\bdollars?\b/g,'').replace(/[$£€%]/g,'').trim();
 if(/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(text))return text.replaceAll(',','');
 const negative=text.startsWith('-');if(negative)text=text.slice(1).trim();
 const parts=text.replaceAll('-',' ').split(/\s+(?:point|decimal)\s+/);if(parts.length>2)return null;
 const integer=/^\d+$/.test(parts[0])?parts[0]:spokenInteger(parts[0]);if(integer===null)return null;
 let fraction='';if(parts.length===2){const words=parts[1].split(/\s+/);for(const word of words){if(/^\d+$/.test(word))fraction+=word;else if(Object.hasOwn(small,word)&&small[word]<10)fraction+=small[word];else return null;}if(!fraction)return null;}
 return (negative?'-':'')+integer+(fraction?'.'+fraction:'');
}
export function spokenPhone(raw){
 const words=String(raw).toLowerCase().trim().replace(/\bplus\b/g,'+').replace(/\bstar\b/g,'*').replace(/\b(hash|pound)\b/g,'#').replace(/[().,\-]/g,' ').split(/\s+/);
 let value='';for(const word of words){if(/^[+\d*#]+$/.test(word))value+=word;else if(Object.hasOwn(small,word)&&small[word]<10)value+=small[word];else return null;}
 return /^\+?[\d*#]+$/.test(value)?value:null;
}
const pad=n=>String(n).padStart(2,'0');
function validDate(y,m,d){const date=new Date(Number(y),Number(m)-1,Number(d),12);return date.getFullYear()===Number(y)&&date.getMonth()===Number(m)-1&&date.getDate()===Number(d)?`${y}-${pad(m)}-${pad(d)}`:null;}
export function spokenDate(raw,now=new Date()){
 const text=String(raw).trim().toLowerCase().replace(/[.!?]$/,'');
 if(text==='today'||text==='tomorrow'){const day=new Date(now);day.setDate(day.getDate()+(text==='tomorrow'?1:0));return `${day.getFullYear()}-${pad(day.getMonth()+1)}-${pad(day.getDate())}`;}
 let match=text.match(/^(\d{4})[- /](\d{1,2})[- /](\d{1,2})$/);if(match)return validDate(match[1],match[2],match[3]);
 match=text.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})$/);if(!match)return null;
 const month=['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(match[1])+1;
 return month?validDate(match[3],month,match[2]):null;
}
function spokenTime(raw){let match=String(raw).trim().toLowerCase().replace(/\./g,'').match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);if(!match)return null;let hour=Number(match[1]),minute=Number(match[2]||0);if(minute>59||hour>23||(match[3]&&(hour<1||hour>12)))return null;if(match[3])hour=hour%12+(match[3]==='pm'?12:0);return `${pad(hour)}:${pad(minute)}`;}
const normalized=text=>String(text).trim().toLowerCase().replace(/[.!?]$/,'').replace(/\s+/g,' ');
export function convertDictation(raw,{type='text',options=[],now}={}){
 const text=String(raw).trim();if(!text)return {error:'No words were captured. Try again.'};
 let value=text;
 if(type==='number'||type==='range'){value=spokenNumber(text);if(value===null)return {error:'Say a single number, such as two hundred fifty or 12 point five.'};}
 if(type==='tel'){value=spokenPhone(text);if(value===null)return {error:'Say each phone digit separately, including the country code.'};}
 if(type==='date'){value=spokenDate(text,now);if(value===null)return {error:'Say a date with a year, such as November 7 2026, or say today or tomorrow.'};}
 if(type==='time'){value=spokenTime(text);if(value===null)return {error:'Say a time such as 10:30 AM or 14:30.'};}
 if(type==='datetime-local')return {error:'Use the date and time picker, or your device’s voice control for this field.'};
 if(type==='email'||type==='url'){
  value=text.replace(/\s+(at|at sign)\s+/gi,'@').replace(/\s+dot\s+/gi,'.').replace(/\s+(dash|hyphen)\s+/gi,'-').replace(/\s+underscore\s+/gi,'_').replace(/\s+/g,'').replace(/[.!?]$/,'');
  if(type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return {error:'Say the address clearly, using at and dot, then review it.'};
  if(type==='url'){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error();}catch{return {error:'Say a complete web address including https, then review it.'};}}
 }
 if(type==='select'){
  const matches=options.filter(option=>!option.disabled&&(normalized(option.label)===normalized(text)||normalized(option.value)===normalized(text)));
  if(matches.length!==1)return {error:'Say one of the choices exactly: '+options.filter(o=>!o.disabled).slice(0,6).map(o=>o.label).join(', ')+'.'};
  value=matches[0].value;
 }
 return {value};
}
export function mergeDictation(original,spoken,{start,end,maxLength=-1}={}){
 const a=Number.isInteger(start)?Math.max(0,Math.min(start,original.length)):original.length,b=Number.isInteger(end)?Math.max(a,Math.min(end,original.length)):a;
 const before=original.slice(0,a),after=original.slice(b);
 const next=before+(before&&!/\s$/.test(before)&&!/^\s|^[.,!?;:]/.test(spoken)?' ':'')+spoken+(after&&!/^\s|^[.,!?;:]/.test(after)?' ':'')+after;
 if(maxLength>=0&&next.length>maxLength)return {error:'That entry exceeds this field’s length limit. Shorten the text and try again.'};
 return {value:next};
}
