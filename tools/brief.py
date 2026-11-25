"""
Бриф-режимы: печатают 5–10 строк вместо сотен.

Зачем: полный вывод аудита и отчёта — это 60+ строк каждый раз, а в контекст
нужны только числа и провалы. Полные данные остаются в файлах.

Использование:
    python tools/brief.py audit      # аудит: итог + провалы (нет = ок)
    python tools/brief.py report     # дневной отчёт: сервер/игроки/пожелания
    python tools/brief.py status     # health + метрики шардов
    python tools/brief.py all        # всё по 2 строки
"""
import io
import contextlib
import json
import os
import runpy
import ssl
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable


def run_quiet(script):
    """Выполнить скрипт, поймав его вывод; вернуть (текст, код)."""
    path = os.path.join(ROOT, "deploy-host", script)
    buf = io.StringIO()
    code = 0
    old_argv = sys.argv[:]
    sys.argv = [path]
    try:
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            runpy.run_path(path, run_name="__main__")
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else 0
    except Exception as e:  # noqa: BLE001
        code = 1
        buf.write("\nОШИБКА: %s" % e)
    finally:
        sys.argv = old_argv
    return buf.getvalue(), code


def audit_brief():
    text, code = run_quiet("audit_all.py")
    lines = [l for l in text.splitlines() if l.strip()]
    bad = [l for l in lines if l.startswith("FAIL")]
    total = next((l for l in lines if "проверок:" in l), "")
    print("АУДИТ:", "ok" if not bad and code == 0 else "ЕСТЬ ПРОБЛЕМЫ")
    if total:
        print(" ", total.strip())
    for b in bad[:6]:
        print(" ", b.strip()[:120])
    return 0 if not bad and code == 0 else 1


def report_brief():
    text, code = run_quiet("daily_report.py")
    lines = [l.strip().lstrip("-").strip() for l in text.splitlines() if l.strip()]
    want = ("статус:", "всего", "средний капитал", "сохранено")
    for l in lines:
        if l.startswith(want):
            print("ОТЧЁТ:", l[:150])
    if code != 0:
        print("ОТЧЁТ: ошибка", code)


def status_brief():
    tok = ""
    try:
        with open(os.path.join(ROOT, "reports", "_token.txt"), encoding="utf-8") as f:
            tok = f.read().strip()
    except Exception:
        pass
    ctx = ssl.create_default_context()

    def get(url):
        req = urllib.request.Request(url, headers={"X-Auth-Token": tok})
        with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
            return json.loads(r.read().decode())

    try:
        h = get("https://warbattleuniverse.com/api/health")
        m = get("https://warbattleuniverse.com/api.php?action=shard_metrics")
        print("СТАТУС:", h.get("ok"), "| PHP", get("https://warbattleuniverse.com/api/status").get("php"),
              "| онлайн", m.get("total_online"),
              "| тик", m["tick_ms"]["total"], "мс",
              "| состояние", m["docs"]["kb"], "КБ")
    except Exception as e:  # noqa: BLE001
        print("СТАТУС: ошибка —", str(e)[:120])


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "audit"
    if what == "audit":
        sys.exit(audit_brief())
    if what == "report":
        report_brief()
    elif what == "status":
        status_brief()
    elif what == "all":
        audit_brief()
        report_brief()
        status_brief()
    else:
        print("режимы: audit | report | status | all")
