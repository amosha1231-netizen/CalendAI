"""Sets up external TestFlight testing with a public link for CalendAI.

Idempotent: creates (or reuses) an external beta group with a public link,
fills the beta test information from the App Store review contact details,
adds the chosen build to the group and submits it for Beta App Review.
Never prints contact details or credentials.
"""
import json, os, sys, time
import jwt, requests

APP_ID = os.environ.get("APP_ID", "6838830605")
BUILD_NUMBER = os.environ.get("BUILD_NUMBER", "").strip()
GROUP_NAME = os.environ.get("GROUP_NAME", "Public testers")
API = "https://api.appstoreconnect.apple.com"

key = open(os.environ["ASC_KEY_PATH"]).read()
def token():
    now = int(time.time())
    return jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 1100,
                       "aud": "appstoreconnect-v1"}, key, algorithm="ES256",
                      headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})

def call(method, path, body=None, ok=(200, 201, 204)):
    r = requests.request(method, API + path, json=body,
                         headers={"Authorization": "Bearer " + token()})
    if r.status_code not in ok:
        print(f"!! {method} {path} -> {r.status_code}: {r.text[:1500]}")
        return None
    return r.json() if r.text else {}

def step(msg): print("\n== " + msg)

step("App")
app = call("GET", f"/v1/apps/{APP_ID}")["data"]
print(app["attributes"]["name"], app["attributes"]["bundleId"])

step("Builds")
builds = call("GET", f"/v1/builds?filter[app]={APP_ID}&sort=-uploadedDate&limit=10&include=preReleaseVersion,buildBetaDetail")
for b in builds["data"]:
    a = b["attributes"]
    print(f'build {a["version"]} state={a["processingState"]} expired={a["expired"]} encryption={a.get("usesNonExemptEncryption")} uploaded={a["uploadedDate"]}')
valid = [b for b in builds["data"] if b["attributes"]["processingState"] == "VALID" and not b["attributes"]["expired"]]
build = next((b for b in valid if b["attributes"]["version"] == BUILD_NUMBER), None) if BUILD_NUMBER else (valid[0] if valid else None)
if not build:
    sys.exit("No valid build found")
print("Using build", build["attributes"]["version"], build["id"])
if build["attributes"].get("usesNonExemptEncryption") is None:
    call("PATCH", f"/v1/builds/{build['id']}", {"data": {"type": "builds", "id": build["id"],
         "attributes": {"usesNonExemptEncryption": False}}})
    print("Set export compliance: no non-exempt encryption")

step("Contact details from App Store review info")
contact = {}
vers = call("GET", f"/v1/apps/{APP_ID}/appStoreVersions?limit=5&include=appStoreReviewDetail")
for inc in (vers or {}).get("included", []):
    if inc["type"] == "appStoreReviewDetails":
        a = inc["attributes"]
        for k in ("contactFirstName", "contactLastName", "contactPhone", "contactEmail"):
            if a.get(k): contact.setdefault(k, a[k])
print("contact fields found:", sorted(contact))

step("Beta app review detail")
brd = call("GET", f"/v1/apps/{APP_ID}/betaAppReviewDetail")["data"]
print("current fields set:", sorted(k for k, v in brd["attributes"].items() if v not in (None, "")),
      "demoAccountRequired=", brd["attributes"].get("demoAccountRequired"))
attrs = {k: v for k, v in contact.items() if not brd["attributes"].get(k)}
if brd["attributes"].get("demoAccountRequired") is None:
    attrs["demoAccountRequired"] = False
if not brd["attributes"].get("notes"):
    attrs["notes"] = ("CalendAI is an AI calendar and scheduling app. The app can be tried without an account "
                      "(guest mode), or by signing in with Apple or Google. Hebrew and English are supported.")
if attrs:
    call("PATCH", f"/v1/betaAppReviewDetails/{brd['id']}",
         {"data": {"type": "betaAppReviewDetails", "id": brd["id"], "attributes": attrs}})
    print("updated:", sorted(attrs))

step("Beta app localization (test information)")
locs = call("GET", f"/v1/apps/{APP_ID}/betaAppLocalizations")["data"]
desc = ("CalendAI is a smart AI calendar: type or say what you need and it becomes events, tasks and reminders. "
        "Share a booking link to find a time with friends, and get a wake-up alarm matched to tomorrow's first event.")
loc_attrs = {"description": desc, "marketingUrl": "https://www.calendai.org",
             "privacyPolicyUrl": "https://www.calendai.org/privacy"}
if contact.get("contactEmail"): loc_attrs["feedbackEmail"] = contact["contactEmail"]
en = next((l for l in locs if l["attributes"]["locale"].startswith("en")), None)
print("locales:", [l["attributes"]["locale"] for l in locs])
if en:
    upd = {k: v for k, v in loc_attrs.items() if not en["attributes"].get(k)}
    if upd:
        call("PATCH", f"/v1/betaAppLocalizations/{en['id']}", {"data": {"type": "betaAppLocalizations", "id": en["id"], "attributes": upd}})
        print("updated en:", sorted(upd))
else:
    call("POST", "/v1/betaAppLocalizations", {"data": {"type": "betaAppLocalizations",
         "attributes": dict(loc_attrs, locale="en-US"),
         "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}}}})
    print("created en-US")

step("What to test")
bbl = call("GET", f"/v1/builds/{build['id']}/betaBuildLocalizations")["data"]
if not bbl:
    call("POST", "/v1/betaBuildLocalizations", {"data": {"type": "betaBuildLocalizations",
         "attributes": {"locale": "en-US", "whatsNew": "Try creating events by typing or speaking, the week view, "
                        "task circles, and sharing a meeting link with a friend. Send feedback from TestFlight."},
         "relationships": {"build": {"data": {"type": "builds", "id": build["id"]}}}}})
    print("created what-to-test")
else:
    print("already has", [l["attributes"]["locale"] for l in bbl])

step("External group")
groups = call("GET", f"/v1/apps/{APP_ID}/betaGroups?limit=50")["data"]
for g in groups:
    a = g["attributes"]
    print(f'group "{a["name"]}" internal={a["isInternalGroup"]} publicLinkEnabled={a.get("publicLinkEnabled")}')
group = next((g for g in groups if not g["attributes"]["isInternalGroup"] and g["attributes"]["name"] == GROUP_NAME), None)
if not group:
    res = call("POST", "/v1/betaGroups", {"data": {"type": "betaGroups",
               "attributes": {"name": GROUP_NAME, "publicLinkEnabled": True, "publicLinkLimitEnabled": False,
                              "feedbackEnabled": True},
               "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}}}})
    group = res["data"] if res else None
    print("created group")
if not group: sys.exit("Could not create group")
if not group["attributes"].get("publicLinkEnabled"):
    res = call("PATCH", f"/v1/betaGroups/{group['id']}", {"data": {"type": "betaGroups", "id": group["id"],
               "attributes": {"publicLinkEnabled": True, "publicLinkLimitEnabled": False}}})
    if res: group = res["data"]

step("Add build to group")
call("POST", f"/v1/betaGroups/{group['id']}/relationships/builds",
     {"data": [{"type": "builds", "id": build["id"]}]}, ok=(200, 201, 204, 409))

step("Submit for Beta App Review")
sub = call("POST", "/v1/betaAppReviewSubmissions", {"data": {"type": "betaAppReviewSubmissions",
           "relationships": {"build": {"data": {"type": "builds", "id": build["id"]}}}}}, ok=(201, 409, 422))
state = call("GET", f"/v1/builds/{build['id']}/betaAppReviewSubmission")
print("review state:", (state or {}).get("data", {}).get("attributes", {}).get("betaReviewState") if state else None)
detail = call("GET", f"/v1/builds/{build['id']}/buildBetaDetail")
if detail: print("build beta detail:", detail["data"]["attributes"])

step("Result")
g = call("GET", f"/v1/betaGroups/{group['id']}")["data"]["attributes"]
print("PUBLIC LINK:", g.get("publicLink"))
print("publicLinkEnabled:", g.get("publicLinkEnabled"))
