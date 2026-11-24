import { HOME_HTML } from "../home-html";
export const dynamic="force-dynamic";
export function GET(){return new Response(HOME_HTML,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"private, no-store","x-content-type-options":"nosniff"}})}
