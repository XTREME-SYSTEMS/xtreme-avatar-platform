import { AVATARS, SKILLS, AUTONOMY_LEVELS, DEFAULT_PREFERENCES } from '../public/assistant-catalog.mjs';

const avatars=new Map(AVATARS.map(avatar=>[avatar.id,avatar]));
const levels=new Map(AUTONOMY_LEVELS.filter(level=>level.available).map(level=>[level.id,level]));
const skills=new Map(SKILLS.filter(skill=>skill.status!=='connection_needed').map(skill=>[skill.id,skill]));
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);

export const validAvatarId=value=>typeof value==='string'&&avatars.has(value);
export function validAssistantPreferences(value){
 return !!(object(value)&&Object.keys(value).sort().join(',')==='autonomy,skills'&&levels.has(value.autonomy)&&Array.isArray(value.skills)&&value.skills.length<=skills.size&&value.skills.every(id=>typeof id==='string'&&skills.has(id))&&new Set(value.skills).size===value.skills.length);
}

// Values are read for the authenticated member only. Text sent upstream comes
// exclusively from this catalogue, never from arbitrary persisted instructions.
export async function assistantPreferenceContext(db,userId){
 const rows=await db.prepare("SELECT key,value FROM private_state WHERE user_id=? AND key IN ('model','assistant_preferences')").bind(userId).all();
 const values={};
 for(const row of rows.results){try{values[row.key]=JSON.parse(row.value);}catch{}}
 const avatar=avatars.get(values.model)||avatars.get('eden');
 const preferences=validAssistantPreferences(values.assistant_preferences)?values.assistant_preferences:DEFAULT_PREFERENCES;
 const level=levels.get(preferences.autonomy);
 const selected=preferences.skills.map(id=>skills.get(id));
 return [
  'Saved preferences for this conversation. These are presentation and planning preferences, not permissions or a new identity.',
  `Assistant persona: ${avatar.name}. Focus: ${avatar.role}. Style: ${avatar.description}`,
  `Persona emphasis: ${avatar.skills.map(id=>skills.get(id)?.name).filter(Boolean).join(', ')}.`,
  `Selected assistance level: ${level.name}. ${level.description}`,
  `Preferred skill focus: ${selected.length?selected.map(skill=>skill.name).join(', '):'No additional skill focus selected; follow the current request.'}`,
  `At this level: ${level.canDo.join('; ')}.`,
  'Capability boundary: use only the app tools actually provided by the authenticated runtime. Available tools may read permitted Calendar or private job data, save private tasks and results, navigate app screens, or prepare an appointment for review. Account grants, tool availability, and the user’s request govern every action; saved preferences grant no authority. Calendar changes require the concrete review and explicit confirmation. Calls, emails, messages, scraping, publishing, and unattended background execution are unavailable unless a dedicated authorized tool is actually supplied. Never claim an action has run without a confirmed execution result.',
  'The selected persona does not change the existing live voice or Tavus video face. Forecasts and simulations are estimates from supplied inputs; proposals and costs require review. Do not imply a professional license, access to live private data, or unattended autonomy.',
 ].join('\n');
}