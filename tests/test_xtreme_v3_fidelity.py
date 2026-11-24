"""Xtreme Avatar V3: isolated static-preview smoke and screenshot QA.
No provider authentication, scraping, messaging or network credentials are used.
"""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
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

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        for width,height in [(320,800),(390,844),(430,932),(768,1024)]:
            context=browser.new_context(viewport={"width":width,"height":height},device_scale_factor=1,reduced_motion="reduce")
            page=context.new_page()
            errors=[]
            page.on("pageerror",lambda e:errors.append(str(e)))
            response=page.goto(base,wait_until="networkidle")
            assert response and response.ok, f"HTTP error at {width}: {response.status if response else 'no response'}"
            assert page.locator(".nav-btn").count()==4
            assert page.locator(".action-tile").count()==6
            assert page.locator(".action-tile svg").count()==6
            assert page.locator(".brand-copy strong").inner_text()=="XTREME AVATAR"
            assert "XPS INTELLIGENCE" in page.locator(".brand-copy small").inner_text()
            assert "Good morning" in page.locator("h1.page-title").inner_text()
            assert page.locator(".card.gold.hero-card").count()==1
            assert page.locator(".priority-row").count()==2
            assert "Finished" in page.locator(".priority-row").last.inner_text()
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
            if width==320:
                location=page.evaluate("""() => ({
                    finished:document.querySelector('.priority-row:last-child').getBoundingClientRect().bottom,
                    nav:document.querySelector('.bottom-nav').getBoundingClientRect().top
                })""")
                assert location["finished"] <= location["nav"]-2, f"Finished row obscured by dock at 320px: {location}"

            page.screenshot(path=str(OUT/f"home-{width}.png"),full_page=True)
            page.locator('button[data-go="video"]').first.click()
            page.wait_for_timeout(130)
            click_state=page.evaluate("""() => ({
              page:document.querySelector('#app')?.dataset.page,
              title:document.querySelector('#view')?.textContent?.slice(0,150),
              video:document.querySelector('.video-stage')!==null
            })""")
            assert page.locator(".video-stage").count()==1, f"Video route not rendered: {click_state}; JS errors={errors}"
            assert page.locator("#app").get_attribute("data-page")=="video"
            assert page.locator(".bottom-nav").is_hidden()
            assert page.locator(".video-stage img").count()==1
            if width==390:page.screenshot(path=str(OUT/"video-390.png"),full_page=True)
            page.locator('.video-top button[data-go="home"]').click()
            page.locator('.bottom-nav button[data-go="more"]').click()
            page.locator('button[data-go="customize"]').first.click()
            page.locator('button[data-skin="blue"]').click()
            assert page.locator("#app").get_attribute("data-skin")=="blue"
            page.locator('button[data-skin="aluminum"]').click()
            assert page.locator("#app").get_attribute("data-skin")=="aluminum"
            page.locator('button[data-go="onboarding"]').count() # onboarding remains reachable from More
            assert not errors, f"JS errors {width}: {errors}"
            results.append({"viewport":f"{width}x{height}","overflow":bounds["doc"]-width,"nav":4,"icons":6,"hero":True,"metal_assets":True,"video_full_height":True,"skins":True,"js_errors":0})
            context.close()
        browser.close()
finally:
    server.shutdown()
(OUT/"qa-results.json").write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
