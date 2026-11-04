import io, json, os, sqlite3
root = r"D:/Users/a.bulatov/Documents/deepseek-harness/default-workspace/galaktika"

def build():
    con = sqlite3.connect(root + "/db/galaktika.db")
    con.row_factory = sqlite3.Row
    bodies = [dict(r) for r in con.execute("""SELECT id,name,object_class AS class,
        orbit_a_au AS a, orbit_e AS e, orbit_i_deg AS i, orbit_om_deg AS om, orbit_w_deg AS w,
        orbit_m0_deg AS m0, orbit_period_days AS P, radius_km, color, type_id AS type, role, parent_id AS parent,
        texture, tint, size_px, rot_h, moon_r_px, legacy_planet,
        system_id AS system FROM body ORDER BY object_class, orbit_a_au""")]
    ships = [dict(r) for r in con.execute("SELECT id,name,accel_km_s2 AS accel,vmax_c,hp,cargo_t AS cargo,role FROM ship_class")]
    agents = [dict(r) for r in con.execute("SELECT id,system_id AS system,class_id AS class,role,count,home_id AS home FROM agent")]
    systems = [dict(r) for r in con.execute("SELECT id,name,type_id AS type,time_scale,px_per_au FROM system")]
    try:
        attractions = [dict(r) for r in con.execute("SELECT id,name,kind,body_id AS body,description,mechanic,source FROM attraction")]
    except Exception:
        attractions = []
    try:
        stations = [dict(r) for r in con.execute("SELECT id,name,role,system_id AS system,body_id AS body,description FROM station_type")]
        zones = [dict(r) for r in con.execute("SELECT id,station_id AS station,name,kind,level,description FROM station_zone")]
    except Exception:
        stations, zones = [], []
    cat = {"bodies": bodies, "ships": ships, "agents": agents, "systems": systems,
           "stations": stations, "zones": zones, "attractions": attractions}
    out = root + "/src/galaktika.Web/wwwroot/js/catalog.js"
    # компактно и без пустых полей: бюджет каталога ≤ 20 КБ
    def slim(o):
        if isinstance(o, dict):
            return {k: slim(v) for k, v in o.items() if v not in (None, "", [])}
        if isinstance(o, list):
            return [slim(v) for v in o]
        return o
    body = json.dumps(slim(cat), ensure_ascii=False, separators=(",", ":"))
    io.open(out, "w", encoding="utf-8").write("// СГЕНЕРИРОВАНО из db/galaktika.db — не править руками\nwindow.CATALOG = " + body + ";\n")
    print("каталог:", len(bodies), "тел,", len(systems), "систем,", len(agents), "агентов,",
          len(stations), "станций,", len(zones), "зон")
    # сколько тел по системам
    for s in systems:
        n = sum(1 for b in bodies if b.get("system") == s["id"])
        print("  ", s["id"], ":", n, "тел")
    con.close()

if __name__ == "__main__":
    build()