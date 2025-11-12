from flask import Flask, render_template, jsonify, request, session
import json, os, random

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")

# ---------- โหลดคำคม ----------
# ฐานข้อมูลใหม่รองรับโครงสร้าง:
# { "หมวด": [ { en, th, author, year, work, info, ref }, ... ] }
with open("quotes.json", "r", encoding="utf-8") as f:
    raw = json.load(f)

if isinstance(raw, list):
    QUOTES = {"ทั้งหมด": raw}
else:
    QUOTES = raw

CATEGORIES = list(QUOTES.keys())

# ---------- กันซ้ำจนกว่าจะครบในแต่ละหมวด ----------
def _get_used_map():
    used_map = session.get("used_map")
    if not isinstance(used_map, dict):
        used_map = {}
    return used_map

def _save_used_map(used_map):
    session["used_map"] = used_map

def _pick_index_without_repeat(cat: str) -> int:
    items = QUOTES[cat]
    n = len(items)
    if n == 0:
        raise ValueError("No quotes in category")

    used_map = _get_used_map()
    used = used_map.get(cat, [])

    if len(used) >= n:
        used = []

    available = [i for i in range(n) if i not in used] or list(range(n))
    idx = random.choice(available)

    last_idx_map = session.get("last_idx_map", {})
    last_idx = last_idx_map.get(cat)
    if len(available) > 1 and idx == last_idx:
        others = [i for i in available if i != last_idx]
        if others:
            idx = random.choice(others)

    used.append(idx)
    used_map[cat] = used
    _save_used_map(used_map)

    last_idx_map[cat] = idx
    session["last_idx_map"] = last_idx_map
    return idx

# ---------- Routes ----------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/categories")
def api_categories():
    return jsonify(CATEGORIES)

@app.route("/api/random")
def api_random():
    cat = request.args.get("cat") or CATEGORIES[0]
    if cat not in QUOTES:
        return jsonify({"error": "invalid category"}), 400
    try:
        idx = _pick_index_without_repeat(cat)
    except ValueError:
        return jsonify({"error": "no quotes"}), 500

    item = QUOTES[cat][idx]
    # เติมค่าเริ่มต้นป้องกันคีย์หาย
    data = {
        "en": item.get("en", ""),
        "th": item.get("th", ""),
        "author": item.get("author", ""),
        "year": item.get("year", ""),
        "work": item.get("work", ""),
        "info": item.get("info", ""),
        "ref": item.get("ref", ""),
        "category": cat,
        "index": idx
    }
    return jsonify(data)

if __name__ == "__main__":
    app.run(debug=True)
