"""Approved Figma frontend browser QA, with explicitly MOCKED private API responses.

The mock isolates visual/interaction testing only. It is NOT evidence of a
real Google OAuth login, provider inference, Neon write, Tavus call or Twilio.
"""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
from urllib.parse import urlparse
import json, threading, os

ROOT=Path(__file__).resolve().parents[1]/"public"
OUT=Path(os.environ.get("XTREME_V3_SCREENSHOTS","artifacts/xtreme-v3"))
OUT.mkdir(parents=True,exist_ok=True)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

server=ThreadingHTTPServer(("127.0.0.1",0),lambda *a,**k: Quiet(*a,directory=str(ROOT),**k))
thread=threading.Thread(target=server.serve_forever,daemon=True)
thread.start()
base=f"http://127.0.0.1:{server.server_port}/xtreme-v3/index.html"
results=[]

def fake_private_api(route, signed_in=True):
    path=urlparse(route.request.url).path
    if not signed_in:
        return route.fulfill(status=401,content_type="application/json",
                             body=json.dumps({"error":"Please sign in."}))
    account={"user":{"id":"11111111-1111-4111-8111-111111111111",
                     "email":"qa@example.test","role":"member"},
             "data":{"profile":{"name":"QA Owner"}},"versions":{"profile":1}}
    work={"userId":account["user"]["id"],"version":1,
          "jobs":[{"id":"job1","name":"Authenticated saved work","client":"","location":"",
                   "stage":"lead","dueDate":"","notes":"Saved source data","links":[]}],
          "results":[],"briefing":{}}
    responses={
        "/api/account":account,
        "/api/work-hub":work,
        "/api/assistant/status":{"chat":{"ready":True,"toolsEnabled":False}},
        "/api/assistant/chat":{"messages":[{"id":"reply-1","role":"assistant",
                                           "content":"Stored account-specific reply"}],"pending":False},
        "/api/assistant/voice/status":{"ready":False,"reason":"No verified voice provider"},
        "/api/connections/google/status":{"connected":False}
    }
    response=responses.get(path)
    if response is None:
        return route.fulfill(status=404,content_type="application/json",
                             body=json.dumps({"error":"Mock route unavailable."}))
    return route.fulfill(status=200,content_type="application/json",body=json.dumps(response))

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        for width,height in [(320,800),(390,844),(430,932),(768,1024)]:
            context=browser.new_context(viewport={"width":width,"height":height},
                                        device_scale_factor=1,reduced_motion="reduce")
            page=context.new_page()
            errors=[]
            page.on("pageerror",lambda e:errors.append(str(e)))
            page.route("**/api/**",lambda r: fake_private_api(r,True))
            response=page.goto(base,wait_until="networkidle")
            assert response and response.ok, f"HTTP error at {width}"
            page.locator("#connection-status[data-status='ready']").wait_for()
            assert page.locator(".nav-btn").count()==4
            assert page.locator(".action-tile").count()==6
            assert page.locator(".action-tile svg").count()==6
            assert page.locator(".brand-copy strong").inner_text()=="XTREME AVATAR"
            assert "XPS INTELLIGENCE" in page.locator(".brand-copy small").inner_text()
            assert "Welcome" in page.locator("h1.page-title").inner_text()
            assert page.locator(".card.gold.hero-card").count()==1
            assert "Authenticated saved work" in page.locator("#view").inner_text()
            assert "PRIVATE DESIGN PREVIEW" not in page.locator("body").inner_text()
            for asset in ["brushed-grain.svg","silver-light.svg"]:
                check=page.request.get(f"http://127.0.0.1:{server.server_port}/xtreme-v3/assets/{asset}")
                assert check.ok, f"Missing asset: {asset}"
            bounds=page.evaluate("""() => ({
              doc:document.documentElement.scrollWidth,
              window:window.innerWidth,
              card:document.querySelector('.hero-card').getBoundingClientRect().toJSON(),
              nav:document.querySelector('.bottom-nav').getBoundingClientRect().toJSON()
            })""")
            assert bounds["doc"] <= width+2, f"Horizontal overflow {width}: {bounds}"
            assert bounds["card"]["width"]>0 and bounds["nav"]["height"]>40
            page.screenshot(path=str(OUT/f"home-{width}.png"),full_page=True)
            page.locator('button[data-go="video"]').first.click()
            assert page.locator("#app").get_attribute("data-page")=="video"
            assert page.locator(".video-stage").count()==1
            assert page.locator(".video-stage img").count()==1
            assert page.locator(".bottom-nav").is_hidden()
            assert "requires a verified" in page.locator(".video-stage").inner_text()
            if width==390:page.screenshot(path=str(OUT/"video-390.png"),full_page=True)
            page.locator('.video-top button[data-go="home"]').click()
            page.locator('.bottom-nav button[data-go="more"]').click()
            page.locator('button[data-go="customize"]').first.click()
            page.locator('button[data-skin="blue"]').click()
            assert page.locator("#app").get_attribute("data-skin")=="blue"
            page.locator('button[data-skin="aluminum"]').click()
            assert page.locator("#app").get_attribute("data-skin")=="aluminum"
            page.locator('.bottom-nav button[data-go="home"]').click()
            page.locator('.hero-card[data-go="chat"]').click()
            assert page.locator('#app').get_attribute('data-page')=='chat'
            assert "Stored account-specific reply" in page.locator('#view').inner_text()
            assert not errors, f"Browser errors at {width}: {errors}"
            results.append({"viewport":f"{width}x{height}","overflow":bounds["doc"]-width,
                            "nav":4,"icons":6,"hero":True,"metal_assets":True,
                            "video_stage":True,"skins":True,"mocked_auth_ui":True,
                            "js_errors":0})
            context.close()

        guest=browser.new_context(viewport={"width":390,"height":844})
        page=guest.new_page()
        guest_errors=[]
        page.on("pageerror",lambda e:guest_errors.append(str(e)))
        page.route("**/api/**",lambda r: fake_private_api(r,False))
        page.goto(base,wait_until="networkidle")
        page.locator("#connection-status[data-status='signed-out']").wait_for()
        assert page.get_by_text("Continue with Google").count()>=1
        assert "Authenticated saved work" not in page.locator("body").inner_text()
        assert not guest_errors, guest_errors
        page.screenshot(path=str(OUT/"signed-out-390.png"),full_page=True)
        guest.close()
        browser.close()
finally:
    server.shutdown()
(OUT/"qa-results.json").write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
